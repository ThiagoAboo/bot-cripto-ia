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

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$rootDir = $PSScriptRoot
$backendBaseUrl = 'http://localhost:3001'
$reportPath = Join-Path $rootDir 'bootstrap-operacional-report.json'
$script:BackendAdminEmail = 'admin@botcrypto.com'
$script:BackendAdminPassword = 'admin123'
$script:BackendAuthToken = $null

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

function Get-ValueOrDefault {
    param(
        [object]$Value,
        [object]$DefaultValue
    )

    if ($null -ne $Value) {
        return $Value
    }

    return $DefaultValue
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
    param(
        [int]$TimeoutSeconds = 180,
        [switch]$Quiet
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    do {
        try {
            $response = Invoke-RestMethod -Method Get -Uri "$backendBaseUrl/health/ready" -TimeoutSec 15 -DisableKeepAlive
            if ($null -ne $response) {
                if (-not $Quiet) {
                    Write-Ok 'Backend respondeu em /health/ready'
                }
                return
            }
        } catch {
        }

        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)

    throw 'Timeout aguardando backend responder em /health/ready.'
}

function Test-IsTransientBackendError {
    param([System.Exception]$Exception)

    if ($null -eq $Exception) {
        return $false
    }

    $message = $Exception.Message
    if (-not $message) {
        return $false
    }

    return $message -like '*A conexão subjacente estava fechada*' `
        -or $message -like '*A conexão foi fechada de modo inesperado*' `
        -or $message -like '*The underlying connection was closed*' `
        -or $message -like '*Unable to connect to the remote server*' `
        -or $message -like '*Não é possível conectar ao servidor remoto*' `
        -or $message -like '*O tempo limite da operação foi atingido*' `
        -or $message -like '*The operation has timed out*'
}

function Test-IsUnauthorizedBackendError {
    param([System.Exception]$Exception)

    if ($null -eq $Exception) {
        return $false
    }

    $message = $Exception.Message
    if (-not $message) {
        return $false
    }

    return $message -like '*(401)*' `
        -or $message -like '*401*' `
        -or $message -like '*Token invalido ou expirado*' `
        -or $message -like '*Token invÃ¡lido ou expirado*' `
        -or $message -like '*Token inválido ou expirado*' `
        -or $message -like '*Nao Autorizado*' `
        -or $message -like '*NÃ£o Autorizado*' `
        -or $message -like '*Não Autorizado*' `
        -or $message -like '*Unauthorized*'
}

function Invoke-BackendLogin {
    $loginResponse = Invoke-RestMethod -Method POST -Uri "$backendBaseUrl/api/auth/login" -TimeoutSec 60 -DisableKeepAlive -ContentType 'application/json' -Body (@{
        email = $script:BackendAdminEmail
        password = $script:BackendAdminPassword
    } | ConvertTo-Json -Depth 4)

    $token = [string]$loginResponse.token
    if (-not $token) {
        throw 'Token de autenticacao nao retornado pelo backend.'
    }

    $script:BackendAuthToken = $token
    return $token
}

function Test-IsTransientBackendError {
    param([System.Exception]$Exception)

    if ($null -eq $Exception) {
        return $false
    }

    $message = $Exception.Message
    if (-not $message) {
        return $false
    }

    $normalizedMessage = $message.ToLowerInvariant()

    return $normalizedMessage -like '*conex*subjac*fechad*' `
        -or $normalizedMessage -like '*fechada de modo inesperado*' `
        -or $normalizedMessage -like '*the underlying connection was closed*' `
        -or $normalizedMessage -like '*unable to connect to the remote server*' `
        -or $normalizedMessage -like '*nao e possivel conectar ao servidor remoto*' `
        -or $normalizedMessage -like '*não é possível conectar ao servidor remoto*' `
        -or $normalizedMessage -like '*o tempo limite da operacao foi atingido*' `
        -or $normalizedMessage -like '*o tempo limite da operação foi atingido*' `
        -or $normalizedMessage -like '*the operation has timed out*' `
        -or $normalizedMessage -like '*a solicitacao foi anulada*' `
        -or $normalizedMessage -like '*a solicitação foi anulada*' `
        -or $normalizedMessage -like '*the request was aborted*'
}

function Test-IsUnauthorizedBackendError {
    param([System.Exception]$Exception)

    if ($null -eq $Exception) {
        return $false
    }

    $message = $Exception.Message
    if (-not $message) {
        return $false
    }

    $normalizedMessage = $message.ToLowerInvariant()

    return $normalizedMessage -like '*(401)*' `
        -or $normalizedMessage -like '*401*' `
        -or $normalizedMessage -like '*token*invalid*expirad*' `
        -or $normalizedMessage -like '*token*inválid*expirad*' `
        -or $normalizedMessage -like '*nao autorizado*' `
        -or $normalizedMessage -like '*não autorizado*' `
        -or $normalizedMessage -like '*unauthorized*'
}

function Test-IsConflictBackendError {
    param([System.Exception]$Exception)

    if ($null -eq $Exception) {
        return $false
    }

    $message = $Exception.Message
    if (-not $message) {
        return $false
    }

    $normalizedMessage = $message.ToLowerInvariant()

    return $normalizedMessage -like '*(409)*' `
        -or $normalizedMessage -like '*409*' `
        -or $normalizedMessage -like '*conflit*'
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
        [int]$TimeoutSec = 60,
        [int]$RetryCount = 3,
        [switch]$ReturnRaw
    )

    $uri = "$backendBaseUrl$Path"
    $effectiveToken = if ($script:BackendAuthToken) { [string]$script:BackendAuthToken } else { [string]$Token }
    $headers = @{}
    if ($effectiveToken) {
        $headers.Authorization = "Bearer $effectiveToken"
    }

    $requestParams = @{
        Method = $Method
        Uri = $uri
        Headers = $headers
        TimeoutSec = $TimeoutSec
        DisableKeepAlive = $true
    }

    if ($PSBoundParameters.ContainsKey('Body')) {
        $requestParams.ContentType = 'application/json'
        $requestParams.Body = ($Body | ConvertTo-Json -Depth 12)
    }

    $response = $null
    $lastError = $null

    for ($attempt = 1; $attempt -le [Math]::Max(1, $RetryCount); $attempt++) {
        try {
            $response = Invoke-RestMethod @requestParams
            $lastError = $null
            break
        } catch {
            $lastError = $_.Exception

            if ($attempt -lt $RetryCount -and $effectiveToken -and (Test-IsUnauthorizedBackendError -Exception $lastError)) {
                Write-WarnLine "Token administrativo recusado em $Method $Path. Renovando sessao e tentando novamente."
                $effectiveToken = Invoke-BackendLogin
                $requestParams.Headers.Authorization = "Bearer $effectiveToken"
                continue
            }

            if ($attempt -ge $RetryCount -or -not (Test-IsTransientBackendError -Exception $lastError)) {
                throw
            }

            Write-WarnLine "Falha transitória em $Method $Path (tentativa $attempt/$RetryCount): $($lastError.Message)"
            Start-Sleep -Seconds ([Math]::Min(5 * $attempt, 15))

            try {
                Wait-ForBackendReady -TimeoutSeconds 90 -Quiet
            } catch {
            }
        }
    }

    if ($null -eq $response -and $null -ne $lastError) {
        throw $lastError
    }

    if ($ReturnRaw) {
        return $response
    }

    if ($null -ne $response.success -and -not $response.success) {
        $errorMessage = Get-ValueOrDefault -Value $response.error -DefaultValue "Falha ao executar $Method $Path"
        throw $errorMessage
    }

    if ($null -ne $response.data) {
        return $response.data
    }

    return $response
}

function Get-ActiveTrainingSessionForBot {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BotId,
        [Parameter(Mandatory = $true)]
        [string]$Token
    )

    $sessions = @((Invoke-BackendRequest -Method GET -Path "/api/training/sessions?botId=$BotId" -Token $Token))
    return $sessions | Where-Object { $_.status -in @('pending', 'running', 'paused') } | Select-Object -First 1
}

function Wait-TrainingSessionTerminalState {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SessionId,
        [Parameter(Mandatory = $true)]
        [string]$Token,
        [int]$TimeoutSeconds = 90
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    do {
        try {
            $session = Invoke-BackendRequest -Method GET -Path "/api/training/sessions/$SessionId" -Token $Token
            if ($session.status -in @('completed', 'failed', 'cancelled', 'error')) {
                return $session
            }
        } catch {
        }

        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)

    return $null
}

function Get-TrainingSessionById {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SessionId,
        [Parameter(Mandatory = $true)]
        [string]$Token
    )

    return Invoke-BackendRequest -Method GET -Path "/api/training/sessions/$SessionId" -Token $Token
}

function Get-TrainingSessionsForBot {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BotId,
        [Parameter(Mandatory = $true)]
        [string]$Token
    )

    return @((Invoke-BackendRequest -Method GET -Path "/api/training/sessions?botId=$BotId" -Token $Token))
}

function Get-ActiveTrainingSessionForBot {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BotId,
        [Parameter(Mandatory = $true)]
        [string]$Token
    )

    $sessions = @(Get-TrainingSessionsForBot -BotId $BotId -Token $Token)
    return $sessions | Where-Object { $_.status -in @('pending', 'running', 'paused') } | Select-Object -First 1
}

function Find-TrainingSessionByModelVersion {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BotId,
        [Parameter(Mandatory = $true)]
        [string]$ModelVersion,
        [Parameter(Mandatory = $true)]
        [string]$Token,
        [string[]]$AllowedStatuses = @()
    )

    $sessions = @(Get-TrainingSessionsForBot -BotId $BotId -Token $Token)
    $matchingSessions = @(
        $sessions | Where-Object {
            $config = Get-ValueOrDefault -Value $_.config -DefaultValue @{}
            $sessionModelVersion = [string](Get-ValueOrDefault -Value $config.modelVersion -DefaultValue '')
            $statusMatches = $AllowedStatuses.Count -eq 0 -or $AllowedStatuses -contains $_.status

            $sessionModelVersion -eq $ModelVersion -and $statusMatches
        }
    )

    return $matchingSessions | Select-Object -First 1
}

function Wait-TrainingSessionRegistration {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BotId,
        [Parameter(Mandatory = $true)]
        [string]$ModelVersion,
        [Parameter(Mandatory = $true)]
        [string]$Token,
        [int]$TimeoutSeconds = 90
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    do {
        try {
            $session = Find-TrainingSessionByModelVersion -BotId $BotId -ModelVersion $ModelVersion -Token $Token
            if ($null -ne $session) {
                return $session
            }
        } catch {
        }

        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)

    return $null
}

function Cancel-TrainingSessionBestEffort {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SessionId,
        [Parameter(Mandatory = $true)]
        [string]$Token
    )

    try {
        Invoke-BackendRequest -Method POST -Path "/api/training/sessions/$SessionId/cancel" -Body @{} -Token $Token -TimeoutSec 30 | Out-Null
        $terminalSession = Wait-TrainingSessionTerminalState -SessionId $SessionId -Token $Token -TimeoutSeconds 90
        if ($null -ne $terminalSession) {
            Write-WarnLine "Sessao $SessionId encerrada em status $($terminalSession.status) apos cancelamento."
        } else {
            Write-WarnLine "Cancelamento solicitado para a sessao $SessionId, mas sem confirmacao terminal dentro do prazo."
        }
    } catch {
        Write-WarnLine "Nao foi possivel cancelar a sessao $SessionId automaticamente: $($_.Exception.Message)"
    }
}

function Resolve-SaveableTrainingResult {
    param(
        [Parameter(Mandatory = $true)]
        [object[]]$Results,
        [Parameter(Mandatory = $true)]
        [string]$Token
    )

    $preferredResult = @(Select-BestTrainingResult -Results $Results)[0]
    if ($null -eq $preferredResult) {
        return $null
    }

    $remainingResults = @($Results | Where-Object { $_.session.id -ne $preferredResult.session.id })
    $candidates = @($preferredResult) + $remainingResults

    foreach ($candidate in $candidates) {
        $latestSession = Get-TrainingSessionById -SessionId $candidate.session.id -Token $Token
        if ($latestSession.status -eq 'completed') {
            $candidate.session = $latestSession
            return $candidate
        }

        Write-WarnLine "Sessao $($candidate.session.id) nao esta apta para save (status atual: $($latestSession.status)). Tentando proximo candidato concluido."
    }

    return $null
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

function Test-IsScalperBot {
    param([pscustomobject]$Bot)

    $parts = @()
    if ($null -ne $Bot.strategyType) {
        $parts += [string]$Bot.strategyType
    }
    if ($null -ne $Bot.template -and $null -ne $Bot.template.specialization) {
        $parts += [string]$Bot.template.specialization
    }
    if ($null -ne $Bot.template -and $null -ne $Bot.template.indicatorType) {
        $parts += [string]$Bot.template.indicatorType
    }

    $fingerprint = ($parts -join ' ').ToLowerInvariant()
    return $fingerprint.Contains('scalp')
}

function Test-IsOrchestratorBot {
    param([pscustomobject]$Bot)

    if ($null -eq $Bot -or $null -eq $Bot.effectiveParameters) {
        return $false
    }

    $role = [string]$Bot.effectiveParameters.botRole
    return $role.Trim().ToLowerInvariant() -eq 'orchestrator'
}

function Test-IsAnalysisOnlyBot {
    param([pscustomobject]$Bot)

    if ($null -eq $Bot -or $null -eq $Bot.effectiveParameters) {
        return $false
    }

    return ($Bot.effectiveParameters.analysisOnly -eq $true) -and -not (Test-IsOrchestratorBot -Bot $Bot)
}

function Get-AggressiveBotParameters {
    param([pscustomobject]$Bot)

    $timeframe = if ($null -ne $Bot.effectiveParameters -and $null -ne $Bot.effectiveParameters.timeframe -and [string]$Bot.effectiveParameters.timeframe) {
        [string]$Bot.effectiveParameters.timeframe
    } elseif (Test-IsScalperBot -Bot $Bot) {
        '1m'
    } else {
        '1h'
    }

    if (Test-IsOrchestratorBot -Bot $Bot) {
        return @{
            timeframe = '5m'
            strategyProfile = 'aggressive'
            useAdvancedSettings = $false
            useGlobalAllowedPairs = $true
            allowedPairs = @()
            minConfidence = 50
            maxPairsToAnalyze = 12
            maxExecutableOpportunitiesPerCycle = 1
            stopLossPercent = 1.6
            takeProfitPercent = 2.6
            circuitBreakerDailyLossPercent = 2.5
            circuitBreakerCooldownMinutes = 12
            maxConsecutiveLosses = 5
            maxPositionSize = 220
            maxExposurePerCoin = 0.24
            maxTotalExposure = 0.42
            maxConcurrentTrades = 2
            minCorrelationThreshold = 0.88
            atrPeriod = 14
            targetAtrPercent = 0.008
            minAtrPositionFactor = 0.16
        }
    }

    if (Test-IsScalperBot -Bot $Bot) {
        return @{
            timeframe = $timeframe
            strategyProfile = 'aggressive'
            useAdvancedSettings = $false
            useGlobalAllowedPairs = $true
            allowedPairs = @()
            minConfidence = 52
            maxPairsToAnalyze = 10
            maxExecutableOpportunitiesPerCycle = 2
            minVolume = 100000
            maxSpreadPercent = 0.1
            microMomentumThresholdPercent = 0.02
            orderImbalanceThreshold = 0.52
            stopLossPercent = 0.7
            takeProfitPercent = 0.9
            circuitBreakerDailyLossPercent = 2
            circuitBreakerCooldownMinutes = 10
            maxConsecutiveLosses = 5
            maxPositionSize = 180
            maxExposurePerCoin = 0.22
            maxTotalExposure = 0.38
            maxConcurrentTrades = 2
            minCorrelationThreshold = 0.9
            atrPeriod = 14
            targetAtrPercent = 0.007
            minAtrPositionFactor = 0.18
        }
    }

    return @{
        timeframe = $timeframe
        strategyProfile = 'aggressive'
        useAdvancedSettings = $false
        useGlobalAllowedPairs = $true
        allowedPairs = @()
        minConfidence = 60
        maxPairsToAnalyze = 16
        maxExecutableOpportunitiesPerCycle = 2
        stopLossPercent = 4
        takeProfitPercent = 8
        circuitBreakerDailyLossPercent = 8
        circuitBreakerCooldownMinutes = 30
        maxConsecutiveLosses = 5
        maxPositionSize = 650
        maxExposurePerCoin = 0.28
        maxTotalExposure = 0.9
        maxConcurrentTrades = 6
        minCorrelationThreshold = 0.82
        atrPeriod = 14
        targetAtrPercent = 0.03
        minAtrPositionFactor = 0.3
    }
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
            @{ Expression = { [double](Get-ValueOrDefault -Value $_.backtest.totalProfit -DefaultValue 0) }; Descending = $true }, `
            @{ Expression = { [double](Get-ValueOrDefault -Value $_.backtest.winRate -DefaultValue 0) }; Descending = $true }, `
            @{ Expression = { [double](Get-ValueOrDefault -Value $_.backtest.maxDrawdown -DefaultValue 0) }; Descending = $false }, `
            @{ Expression = { [double](Get-ValueOrDefault -Value $_.backtest.profitFactor -DefaultValue 0) }; Descending = $true } |
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
    $modelVersion = 'bootstrap-' + $Candidate.architecture + '-' + $DataSource + '-' + (Get-Date -Format 'yyyyMMddHHmmssfff')

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
    $session = $null

    try {
        $session = Invoke-BackendRequest -Method POST -Path '/api/training/sessions' -Body $payload -Token $Token
    } catch {
        $activeSession = Get-ActiveTrainingSessionForBot -BotId $Bot.id -Token $Token
        if ($_.Exception.Message -like '*409*' -or $_.Exception.Message -like '*Conflito*') {
            if ($null -ne $activeSession) {
                throw "Ja existe treinamento ativo para $($Bot.name): sessao $($activeSession.id) em status $($activeSession.status)"
            }
        }

        throw
    }

    try {
        $completedSession = Wait-TrainingSessionCompletion -SessionId $session.id -Token $Token -TimeoutMinutes $SessionTimeoutMinutes

        if ($completedSession.status -ne 'completed') {
            throw "Sessao $($session.id) terminou em status $($completedSession.status)"
        }

        $backtest = Invoke-BackendRequest -Method POST -Path "/api/training/sessions/$($session.id)/test" -Body @{} -Token $Token -TimeoutSec 180

        return [pscustomobject]@{
            candidate = $Candidate.label
            architecture = $Candidate.architecture
            dataSource = $DataSource
            session = $completedSession
            backtest = $backtest
        }
    } catch {
        if ($null -ne $session -and $_.Exception.Message -like '*Timeout aguardando a sessao*') {
            Cancel-TrainingSessionBestEffort -SessionId $session.id -Token $Token
        }

        throw
    }
}

function Wait-TrainingSessionCompletion {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SessionId,
        [Parameter(Mandatory = $true)]
        [string]$Token,
        [int]$TimeoutMinutes = 25,
        [string]$BotId,
        [string]$ModelVersion
    )

    $deadline = (Get-Date).AddMinutes($TimeoutMinutes)

    do {
        $session = $null

        try {
            $session = Invoke-BackendRequest -Method GET -Path "/api/training/sessions/$SessionId" -Token $Token
        } catch {
            $canRecoverByLookup = $PSBoundParameters.ContainsKey('BotId') -and $PSBoundParameters.ContainsKey('ModelVersion')

            if (-not $canRecoverByLookup) {
                throw
            }

            Write-WarnLine "Falha ao consultar a sessao ${SessionId}: $($_.Exception.Message). Tentando reencontrar a sessao pelo modelVersion."

            try {
                $session = Find-TrainingSessionByModelVersion -BotId $BotId -ModelVersion $ModelVersion -Token $Token
            } catch {
                $session = $null
            }

            if ($null -eq $session) {
                Start-Sleep -Seconds 5
                continue
            }
        }

        Write-Info "Sessao $($session.id) em status $($session.status)"

        if ($session.status -in @('completed', 'failed', 'cancelled', 'error')) {
            return $session
        }

        Start-Sleep -Seconds 5
    } while ((Get-Date) -lt $deadline)

    throw "Timeout aguardando a sessao $SessionId concluir."
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
    $modelVersion = 'bootstrap-' + $Candidate.architecture + '-' + $DataSource + '-' + (Get-Date -Format 'yyyyMMddHHmmssfff')

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
    $session = $null

    try {
        $session = Invoke-BackendRequest -Method POST -Path '/api/training/sessions' -Body $payload -Token $Token
    } catch {
        $recoveredSession = Wait-TrainingSessionRegistration -BotId $Bot.id -ModelVersion $modelVersion -Token $Token -TimeoutSeconds 60
        if ($null -ne $recoveredSession) {
            $session = $recoveredSession
            Write-WarnLine "A criacao do treino perdeu a conexao, mas a sessao $($session.id) foi recuperada para $($Bot.name)."
        } else {
            $activeSession = Get-ActiveTrainingSessionForBot -BotId $Bot.id -Token $Token
            if (Test-IsConflictBackendError -Exception $_.Exception) {
                if ($null -ne $activeSession) {
                    throw "Ja existe treinamento ativo para $($Bot.name): sessao $($activeSession.id) em status $($activeSession.status)"
                }
            }

            throw
        }
    }

    try {
        $completedSession = Wait-TrainingSessionCompletion -SessionId $session.id -Token $Token -TimeoutMinutes $SessionTimeoutMinutes -BotId $Bot.id -ModelVersion $modelVersion

        if ($completedSession.status -ne 'completed') {
            throw "Sessao $($session.id) terminou em status $($completedSession.status)"
        }

        $backtest = Invoke-BackendRequest -Method POST -Path "/api/training/sessions/$($session.id)/test" -Body @{} -Token $Token -TimeoutSec 180

        return [pscustomobject]@{
            candidate = $Candidate.label
            architecture = $Candidate.architecture
            dataSource = $DataSource
            session = $completedSession
            backtest = $backtest
        }
    } catch {
        if ($null -ne $session -and $_.Exception.Message -like '*Timeout aguardando a sessao*') {
            Cancel-TrainingSessionBestEffort -SessionId $session.id -Token $Token
        }

        throw
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
$token = Invoke-BackendLogin
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
    $botDetail = Invoke-BackendRequest -Method GET -Path "/api/dashboard/bots/$($bot.id)" -Token $token
    $aggressiveParameters = Get-AggressiveBotParameters -Bot $botDetail
    Invoke-BackendRequest -Method PUT -Path "/api/dashboard/bots/$($bot.id)" -Body @{
        executionMode = 'paper'
        status = 'online'
        isPaused = $false
        parameters = $aggressiveParameters
    } -Token $token | Out-Null
    Write-Info "$($bot.name) alinhado para paper/online com perfil agressivo"
}
Write-Ok 'Frota principal alinhada com perfil agressivo'

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

        if (Test-IsOrchestratorBot -Bot $botDetail) {
            $botSummary.selectedModel = [ordered]@{
                sessionId = $null
                architecture = 'adaptive_meta_policy'
                dataSource = 'online_learning'
                modelUrl = $null
                governanceRole = 'orchestrator'
                autoPromoted = $false
                totalProfit = $null
                winRate = $null
                maxDrawdown = $null
                profitFactor = $null
            }
            Write-Info "Treino tradicional pulado para $($botDetail.name); o aprendizado acontece online pelo orquestrador adaptativo"
        } else {

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

            $activeTrainingSession = Get-ActiveTrainingSessionForBot -BotId $botDetail.id -Token $token
            if ($null -ne $activeTrainingSession) {
                Write-WarnLine "Sessao ativa remanescente para $($botDetail.name): $($activeTrainingSession.id) em status $($activeTrainingSession.status). Solicitando cancelamento antes do encerramento do bootstrap."
                Cancel-TrainingSessionBestEffort -SessionId $activeTrainingSession.id -Token $token
            }

            if ($successfulAttempts.Count -gt 0) {
                $saveableResult = Resolve-SaveableTrainingResult -Results $successfulAttempts -Token $token

                if ($null -ne $saveableResult) {
                    $saved = Invoke-BackendRequest -Method POST -Path "/api/training/sessions/$($saveableResult.session.id)/save" -Body @{} -Token $token
                    $botSummary.selectedModel = [ordered]@{
                        sessionId = $saveableResult.session.id
                        architecture = $saveableResult.architecture
                        dataSource = $saveableResult.dataSource
                        modelUrl = $saved.modelUrl
                        governanceRole = $saved.governanceRole
                        autoPromoted = $saved.autoPromoted
                        totalProfit = $saveableResult.backtest.totalProfit
                        winRate = $saveableResult.backtest.winRate
                        maxDrawdown = $saveableResult.backtest.maxDrawdown
                        profitFactor = $saveableResult.backtest.profitFactor
                    }
                    Write-Ok ("Melhor candidato salvo para {0}: {1} via {2}" -f $botDetail.name, $saveableResult.architecture, $saveableResult.dataSource)
                } else {
                    Write-WarnLine "Os candidatos concluidos de $($botDetail.name) nao estavam mais aptos para save ao final da rodada. Mantendo champion atual."
                }
            } else {
                Write-WarnLine "Nenhum treino concluido para $($botDetail.name); o bot permanece com o champion bootstrap do seed."
            }
        }

        if (-not (Test-IsAnalysisOnlyBot -Bot $botDetail)) {
            try {
                Invoke-BackendRequest -Method POST -Path "/api/dashboard/bots/$($botDetail.id)/run" -Body @{} -Token $token -TimeoutSec 180 | Out-Null
                Write-Info "Ciclo manual disparado para $($botDetail.name) ao final do bootstrap"
            } catch {
                Write-WarnLine "Ciclo manual de $($botDetail.name) nao concluiu dentro do bootstrap: $($_.Exception.Message)"
            }
        } else {
            Write-Info "Ciclo manual individual pulado para $($botDetail.name); o especialista sera acionado pelo orquestrador"
        }

        $bootstrapSummary.bots += $botSummary
    }
} else {
    Write-Step '6/6' 'Treino inicial pulado por parametro'
    Write-Info 'Os bots permanecem com os champions bootstrap sem nova rodada de treino.'
}

Write-Step '6/6' 'Verificando sessoes de treino remanescentes'
foreach ($bot in $bots) {
    $activeTrainingSession = Get-ActiveTrainingSessionForBot -BotId $bot.id -Token $token
    if ($null -eq $activeTrainingSession) {
        continue
    }

    Write-WarnLine "Sessao ativa remanescente apos bootstrap para $($bot.name): $($activeTrainingSession.id) em status $($activeTrainingSession.status). Cancelando para liberar a fila operacional."
    Cancel-TrainingSessionBestEffort -SessionId $activeTrainingSession.id -Token $token
}
Write-Ok 'Fila de treino verificada antes do encerramento'

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
