$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

param(
    [ValidateSet('quick', 'thorough')]
    [string]$TrainingPreset = 'quick',
    [ValidateSet('exchange', 'synthetic')]
    [string]$TrainingDataSource = 'exchange',
    [ValidateSet('exchange', 'synthetic')]
    [string]$TrainingFallbackDataSource = 'synthetic',
    [int]$TrainingLookbackDays = 120,
    [int]$MaxPairsPerTraining = 4,
    [int]$SessionTimeoutMinutes = 25,
    [double]$PaperInitialCapital = 10000,
    [string]$PaperCurrency = 'USDT',
    [switch]$SkipTraining
)

$rootDir = $PSScriptRoot
$backendBaseUrl = 'http://localhost:3001'
$reportPath = Join-Path $rootDir 'bootstrap-operacional-report.json'

function Write-Step {
    param([string]$Index, [string]$Message)
    Write-Host "[$Index] $Message" -ForegroundColor Yellow
}

function Write-Ok {
    param([string]$Message)
    Write-Host "      OK $Message" -ForegroundColor Green
}

function Write-Info {
    param([string]$Message)
    Write-Host "      - $Message" -ForegroundColor DarkGray
}

function Write-WarnLine {
    param([string]$Message)
    Write-Host "      ! $Message" -ForegroundColor DarkYellow
}

function Test-PathInsideRoot {
    param([string]$Path)

    $resolvedRoot = [System.IO.Path]::GetFullPath($rootDir)
    $resolvedPath = [System.IO.Path]::GetFullPath($Path)

    return $resolvedPath.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)
}

function Clear-ManagedDirectory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DirectoryPath,
        [string[]]$PreserveNames = @()
    )

    if (-not (Test-Path $DirectoryPath)) {
        return
    }

    if (-not (Test-PathInsideRoot -Path $DirectoryPath)) {
        throw "Diretorio fora da raiz do projeto: $DirectoryPath"
    }

    Get-ChildItem -LiteralPath $DirectoryPath -Force | Where-Object {
        $PreserveNames -notcontains $_.Name
    } | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force
    }
}

function Wait-ForBackendReady {
    param([int]$TimeoutSeconds = 180)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    do {
        try {
            $response = Invoke-RestMethod -Method Get -Uri "$backendBaseUrl/health/ready" -TimeoutSec 15
            if ($null -ne $response) {
                Write-Ok 'Backend respondeu em /health/ready'
                return
            }
        } catch {
        }

        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)

    throw 'Timeout aguardando backend responder em /health/ready.'
}

function Invoke-BackendRequest {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('GET', 'POST', 'PUT', 'DELETE')]
        [string]$Method,
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [object]$Body,
        [string]$Token,
        [switch]$ReturnRaw
    )

    $uri = "$backendBaseUrl$Path"
    $headers = @{}
    if ($Token) {
        $headers.Authorization = "Bearer $Token"
    }

    $requestParams = @{
        Method = $Method
        Uri = $uri
        Headers = $headers
        TimeoutSec = 60
    }

    if ($PSBoundParameters.ContainsKey('Body')) {
        $requestParams.ContentType = 'application/json'
        $requestParams.Body = ($Body | ConvertTo-Json -Depth 12)
    }

    $response = Invoke-RestMethod @requestParams

    if ($ReturnRaw) {
        return $response
    }

    if ($null -ne $response.success -and -not $response.success) {
        throw ($response.error ?? "Falha ao executar $Method $Path")
    }

    if ($null -ne $response.data) {
        return $response.data
    }

    return $response
}

function Get-TrainingCandidates {
    param([string]$Preset)

    $common = @{
        hiddenLayers = 2
        neuronsPerLayer = @(64, 32)
        dropoutRate = 0.2
        activation = 'relu'
        batchSize = 32
        epochs = 60
        learningRate = 0.001
        optimizer = 'adam'
        lossFunction = 'mse'
        validationSplit = 20
        sequenceLength = 48
        forecastHorizonCandles = 5
        buyThresholdPercent = 0.3
        sellThresholdPercent = -0.3
        walkForwardFolds = 5
        nEstimators = 200
        maxDepth = 10
        randomState = 42
        earlyStopping = @{
            enabled = $true
            patience = 8
        }
    }

    $quick = @(
        @{
            architecture = 'random_forest'
            label = 'Random Forest bootstrap'
            hyperparameters = $common
        }
    )

    if ($Preset -eq 'quick') {
        return $quick
    }

    $xgboost = @{
        hiddenLayers = 2
        neuronsPerLayer = @(64, 32)
        dropoutRate = 0.15
        activation = 'relu'
        batchSize = 32
        epochs = 75
        learningRate = 0.0008
        optimizer = 'adam'
        lossFunction = 'mse'
        validationSplit = 20
        sequenceLength = 48
        forecastHorizonCandles = 5
        buyThresholdPercent = 0.3
        sellThresholdPercent = -0.3
        walkForwardFolds = 5
        nEstimators = 300
        maxDepth = 8
        randomState = 42
        earlyStopping = @{
            enabled = $true
            patience = 10
        }
    }

    return @(
        $quick[0]
        @{
            architecture = 'xgboost'
            label = 'XGBoost bootstrap'
            hyperparameters = $xgboost
        }
    )
}

function Wait-TrainingSessionCompletion {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SessionId,
        [Parameter(Mandatory = $true)]
        [string]$Token,
        [int]$TimeoutMinutes = 25
    )

    $deadline = (Get-Date).AddMinutes($TimeoutMinutes)

    do {
        $session = Invoke-BackendRequest -Method GET -Path "/api/training/sessions/$SessionId" -Token $Token
        Write-Info "Sessao $SessionId em status $($session.status)"

        if ($session.status -in @('completed', 'failed', 'cancelled', 'error')) {
            return $session
        }

        Start-Sleep -Seconds 5
    } while ((Get-Date) -lt $deadline)

    throw "Timeout aguardando a sessao $SessionId concluir."
}

function Select-BestTrainingResult {
    param([object[]]$Results)

    return $Results |
        Sort-Object `
            @{ Expression = { [double]($_.backtest.totalProfit ?? 0) }; Descending = $true }, `
            @{ Expression = { [double]($_.backtest.winRate ?? 0) }; Descending = $true }, `
            @{ Expression = { [double]($_.backtest.maxDrawdown ?? 0) }; Descending = $false }, `
            @{ Expression = { [double]($_.backtest.profitFactor ?? 0) }; Descending = $true } |
        Select-Object -First 1
}

function Start-TrainingAttempt {
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Bot,
        [Parameter(Mandatory = $true)]
        [hashtable]$Candidate,
        [Parameter(Mandatory = $true)]
        [string]$DataSource,
        [Parameter(Mandatory = $true)]
        [string]$Token
    )

    $startDate = (Get-Date).AddDays(-1 * [Math]::Abs($TrainingLookbackDays)).ToString('yyyy-MM-dd')
    $endDate = (Get-Date).ToString('yyyy-MM-dd')
    $pairList = @($Bot.effectiveAllowedPairs)
    if ($pairList.Count -eq 0) {
        $pairList = @('BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT')
    }
    $includedPairs = $pairList | Select-Object -First ([Math]::Max(1, $MaxPairsPerTraining))
    $strategyId = if ($Bot.templateId) { $Bot.templateId } elseif ($Bot.strategyId) { $Bot.strategyId } else { throw "Bot $($Bot.name) sem strategyId/templateId" }
    $modelVersion = 'bootstrap-' + $Candidate.architecture + '-' + (Get-Date -Format 'yyyyMMddHHmmss')

    $payload = @{
        botId = $Bot.id
        strategyId = $strategyId
        architecture = $Candidate.architecture
        modelVersion = $modelVersion
        dataSource = $DataSource
        trainingPeriod = @{
            startDate = $startDate
            endDate = $endDate
        }
        includedPairs = @($includedPairs)
        indicators = @('SMA_7', 'SMA_14', 'EMA_7', 'RSI', 'MACD', 'BB_upper', 'BB_lower')
        timeframe = if ($Bot.effectiveParameters.timeframe) { $Bot.effectiveParameters.timeframe } else { '1h' }
        hyperparameters = $Candidate.hyperparameters
    }

    Write-Info "Criando treino $($Candidate.architecture) para $($Bot.name) com $DataSource em $($payload.timeframe)"
    $session = Invoke-BackendRequest -Method POST -Path '/api/training/sessions' -Body $payload -Token $Token
    $completedSession = Wait-TrainingSessionCompletion -SessionId $session.id -Token $Token -TimeoutMinutes $SessionTimeoutMinutes

    if ($completedSession.status -ne 'completed') {
        throw "Sessao $($session.id) terminou em status $($completedSession.status)"
    }

    $backtest = Invoke-BackendRequest -Method POST -Path "/api/training/sessions/$($session.id)/test" -Body @{} -Token $Token

    return [pscustomobject]@{
        candidate = $Candidate.label
        architecture = $Candidate.architecture
        dataSource = $DataSource
        session = $completedSession
        backtest = $backtest
    }
}

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ' BOT CRIPTO IA - BOOTSTRAP OPERACIONAL' -ForegroundColor Cyan
Write-Host ' Carga completa do zero com reset, seed e treino inicial' -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ''

Write-Step '1/6' 'Limpando artefatos locais persistidos'
Clear-ManagedDirectory -DirectoryPath (Join-Path $rootDir 'backend\storage\checkpoints') -PreserveNames @('.gitkeep')
Clear-ManagedDirectory -DirectoryPath (Join-Path $rootDir 'backend\storage\uploads') -PreserveNames @('.gitkeep')
Clear-ManagedDirectory -DirectoryPath (Join-Path $rootDir 'backend\storage\models') -PreserveNames @('.gitkeep', 'model_bootstrap_bot1_bootstrap-e2e-v1.h5')
Write-Ok 'Storage operacional limpo com preservacao do template bootstrap'

Write-Step '2/6' 'Subindo stack base com init.ps1'
& (Join-Path $rootDir 'init.ps1')

Write-Step '3/6' 'Aguardando backend e autenticando'
Wait-ForBackendReady
$login = Invoke-BackendRequest -Method POST -Path '/api/auth/login' -Body @{
    email = 'admin@botcrypto.com'
    password = 'admin123'
} -ReturnRaw
$token = [string]$login.token
if (-not $token) {
    throw 'Token de autenticacao nao retornado pelo backend.'
}
Write-Ok 'Login administrativo concluido'

Write-Step '4/6' 'Resetando carteira paper para capital inicial limpo'
$resetResult = Invoke-BackendRequest -Method POST -Path '/api/configurations/reset' -Body @{
    scope = 'paper'
    paperBalance = @{
        currency = $PaperCurrency
        amount = $PaperInitialCapital
    }
} -Token $token
Write-Ok ("Paper reiniciado com {0} {1}" -f $resetResult.paperBalance.amount, $resetResult.paperBalance.currency)

Write-Step '5/6' 'Garantindo bots online em modo paper'
$bots = @((Invoke-BackendRequest -Method GET -Path '/api/dashboard/bots' -Token $token))
foreach ($bot in $bots) {
    Invoke-BackendRequest -Method PUT -Path "/api/dashboard/bots/$($bot.id)" -Body @{
        executionMode = 'paper'
        status = 'online'
        isPaused = $false
    } -Token $token | Out-Null
    Write-Info "$($bot.name) alinhado para paper/online"
}
Write-Ok 'Frota principal alinhada'

$bootstrapSummary = [ordered]@{
    generatedAt = (Get-Date).ToString('o')
    trainingPreset = $TrainingPreset
    trainingDataSource = $TrainingDataSource
    trainingFallbackDataSource = $TrainingFallbackDataSource
    trainingLookbackDays = $TrainingLookbackDays
    maxPairsPerTraining = $MaxPairsPerTraining
    paperInitialCapital = $PaperInitialCapital
    paperCurrency = $PaperCurrency
    bots = @()
}

if (-not $SkipTraining) {
    Write-Step '6/6' 'Executando treino inicial, backtest e salvamento do melhor candidato por bot'
    $candidates = @(Get-TrainingCandidates -Preset $TrainingPreset)

    foreach ($botListItem in $bots) {
        $botDetail = Invoke-BackendRequest -Method GET -Path "/api/dashboard/bots/$($botListItem.id)" -Token $token
        $botSummary = [ordered]@{
            id = $botDetail.id
            name = $botDetail.name
            selectedModel = $null
            attempts = @()
        }

        $successfulAttempts = @()

        foreach ($candidate in $candidates) {
            $sourcesToTry = @($TrainingDataSource)
            if ($TrainingFallbackDataSource -ne $TrainingDataSource) {
                $sourcesToTry += $TrainingFallbackDataSource
            }

            $attemptSucceeded = $false

            foreach ($source in $sourcesToTry) {
                try {
                    $attempt = Start-TrainingAttempt -Bot $botDetail -Candidate $candidate -DataSource $source -Token $token
                    $successfulAttempts += $attempt
                    $botSummary.attempts += [ordered]@{
                        candidate = $attempt.candidate
                        architecture = $attempt.architecture
                        dataSource = $attempt.dataSource
                        sessionId = $attempt.session.id
                        winRate = $attempt.backtest.winRate
                        totalProfit = $attempt.backtest.totalProfit
                        maxDrawdown = $attempt.backtest.maxDrawdown
                        profitFactor = $attempt.backtest.profitFactor
                        status = 'completed'
                    }
                    $attemptSucceeded = $true
                    Write-Ok ("Treino {0} de {1} concluido com winRate {2}%" -f $candidate.architecture, $botDetail.name, [Math]::Round([double]$attempt.backtest.winRate, 2))
                    break
                } catch {
                    $botSummary.attempts += [ordered]@{
                        candidate = $candidate.label
                        architecture = $candidate.architecture
                        dataSource = $source
                        status = 'failed'
                        error = $_.Exception.Message
                    }
                    Write-WarnLine ("Treino {0} de {1} falhou com {2}: {3}" -f $candidate.architecture, $botDetail.name, $source, $_.Exception.Message)
                }
            }

            if (-not $attemptSucceeded) {
                Write-WarnLine "Nenhuma origem de dados concluiu o candidato $($candidate.architecture) para $($botDetail.name)"
            }
        }

        if ($successfulAttempts.Count -gt 0) {
            $best = Select-BestTrainingResult -Results $successfulAttempts
            $saved = Invoke-BackendRequest -Method POST -Path "/api/training/sessions/$($best.session.id)/save" -Body @{} -Token $token
            $botSummary.selectedModel = [ordered]@{
                sessionId = $best.session.id
                architecture = $best.architecture
                dataSource = $best.dataSource
                modelUrl = $saved.modelUrl
                governanceRole = $saved.governanceRole
                autoPromoted = $saved.autoPromoted
                totalProfit = $best.backtest.totalProfit
                winRate = $best.backtest.winRate
                maxDrawdown = $best.backtest.maxDrawdown
                profitFactor = $best.backtest.profitFactor
            }
            Write-Ok ("Melhor candidato salvo para {0}: {1} via {2}" -f $botDetail.name, $best.architecture, $best.dataSource)
        } else {
            Write-WarnLine "Nenhum treino concluido para $($botDetail.name); o bot permanece com o champion bootstrap do seed."
        }

        Invoke-BackendRequest -Method POST -Path "/api/dashboard/bots/$($botDetail.id)/run" -Body @{} -Token $token | Out-Null
        Write-Info "Ciclo manual disparado para $($botDetail.name) ao final do bootstrap"

        $bootstrapSummary.bots += $botSummary
    }
} else {
    Write-Step '6/6' 'Treino inicial pulado por parametro'
    Write-Info 'Os bots permanecem com os champions bootstrap sem nova rodada de treino.'
}

$bootstrapSummary | ConvertTo-Json -Depth 12 | Out-File -FilePath $reportPath -Encoding utf8

Write-Host ''
Write-Host 'BOOTSTRAP CONCLUIDO' -ForegroundColor Cyan
Write-Host "  Frontend:       http://localhost" -ForegroundColor Yellow
Write-Host "  Backend:        http://localhost:3001" -ForegroundColor Yellow
Write-Host "  Adminer:        http://localhost:8080" -ForegroundColor Yellow
Write-Host "  Relatorio:      $reportPath" -ForegroundColor Yellow
Write-Host ''
Write-Host 'Credenciais padrao:' -ForegroundColor Cyan
Write-Host '  Email: admin@botcrypto.com' -ForegroundColor Yellow
Write-Host '  Senha: admin123' -ForegroundColor Yellow
Write-Host ''
