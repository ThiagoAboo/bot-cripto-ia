param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$rootDir = $PSScriptRoot

function Write-Step {
    param([string]$Message)
    Write-Host "==> $Message" -ForegroundColor Yellow
}

function Write-Ok {
    param([string]$Message)
    Write-Host "    OK $Message" -ForegroundColor Green
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

Write-Step 'Encerrando bootstrap operacional remanescente'
$bootstrapProcesses = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -like '*bootstrap_operacional.ps1*' -and $_.ProcessId -ne $PID
}
foreach ($process in $bootstrapProcesses) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}
Write-Ok 'Processos de bootstrap encerrados'

Write-Step 'Parando containers e removendo volume do banco'
docker compose down -v --remove-orphans
Write-Ok 'Containers derrubados e volume do Postgres removido'

Write-Step 'Limpando artefatos de treino, upload e checkpoints'
Clear-ManagedDirectory -DirectoryPath (Join-Path $rootDir 'backend/storage/models')
Clear-ManagedDirectory -DirectoryPath (Join-Path $rootDir 'backend/storage/uploads')
Clear-ManagedDirectory -DirectoryPath (Join-Path $rootDir 'backend/storage/checkpoints') -PreserveNames @('.gitkeep')
Write-Ok 'Storage operacional limpo'

Write-Step 'Removendo relatorios locais de bootstrap'
$reportPath = Join-Path $rootDir 'bootstrap-operacional-report.json'
if (Test-Path $reportPath) {
    Remove-Item -LiteralPath $reportPath -Force
}
Write-Ok 'Relatorios transitórios removidos'

Write-Host ''
Write-Host 'RESET TOTAL CONCLUIDO' -ForegroundColor Cyan
Write-Host "Projeto zerado em: $rootDir" -ForegroundColor Yellow
Write-Host 'Proximo passo sugerido:' -ForegroundColor Cyan
Write-Host '  .\bootstrap_operacional.ps1 -TrainingPreset thorough' -ForegroundColor Yellow
