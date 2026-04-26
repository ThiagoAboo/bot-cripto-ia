$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-ComposeInvocation {
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        try {
            & docker compose version *> $null
            if ($LASTEXITCODE -eq 0) {
                return @('docker', 'compose')
            }
        } catch {
        }
    }

    if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
        return @('docker-compose')
    }

    throw 'Docker Compose nao foi encontrado. Instale o Docker Desktop ou disponibilize docker-compose no PATH.'
}

$composeInvocation = Get-ComposeInvocation

function Invoke-Compose {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    if ($composeInvocation[0] -eq 'docker') {
        & docker compose @Arguments
    } else {
        & docker-compose @Arguments
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao executar: $($composeInvocation -join ' ') $($Arguments -join ' ')"
    }
}

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

function Ensure-File {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Content
    )

    if (Test-Path $Path) {
        Write-Info "$Path ja existe"
        return
    }

    $Content | Out-File -FilePath $Path -Encoding utf8
    Write-Ok "$Path criado"
}

function Wait-ForPostgres {
    param([int]$TimeoutSeconds = 90)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    do {
        $status = ''

        try {
            $status = (& docker inspect --format '{{.State.Health.Status}}' bot-crypto-postgres 2>$null)
        } catch {
            $status = ''
        }

        if ($status -eq 'healthy') {
            Write-Ok 'PostgreSQL pronto'
            return
        }

        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)

    throw 'Timeout aguardando o healthcheck do PostgreSQL.'
}

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ' BOT CRIPTO IA - INIT' -ForegroundColor Cyan
Write-Host ' Inicializacao alinhada ao docker-compose atual' -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ''

Write-Step '1/7' 'Parando containers existentes'
Invoke-Compose -Arguments @('down', '-v')
Write-Ok 'Containers removidos'

Write-Step '2/7' 'Garantindo arquivos de ambiente'
Ensure-File -Path 'backend\.env.production' -Content @"
# Server
PORT=3001
NODE_ENV=production

# Database
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/botcrypto?schema=public

# JWT
JWT_SECRET=prod-secret-key-change-this-to-a-secure-value
JWT_EXPIRES_IN=24h

# CORS
CORS_ORIGIN=http://localhost

# Logging
LOG_LEVEL=info
TRACE_ENABLED=true
TRACE_RETENTION_DAYS=7
LOG_RETENTION_DAYS=90

# Bot runtime
BOT_WORKER_AUTOSTART=false
BOT_RUNTIME_EXPECT_EXTERNAL_SERVICE=true
BOT_RUNTIME_SHARED_SECRET=change-this-shared-secret
BOT_RUNTIME_BACKEND_BASE_URL=http://backend:3001
"@
Ensure-File -Path 'frontend\.env.production' -Content @"
VITE_API_URL=/api
VITE_WS_URL=http://localhost
"@

Write-Step '3/7' 'Buildando imagens da aplicacao'
Invoke-Compose -Arguments @('build', 'backend', 'bots', 'frontend')
Write-Ok 'Imagens atualizadas'

Write-Step '4/7' 'Subindo PostgreSQL'
Invoke-Compose -Arguments @('up', '-d', 'postgres')
Wait-ForPostgres

Write-Step '5/7' 'Aplicando migrations do Prisma'
Invoke-Compose -Arguments @('run', '--rm', 'backend', 'npm', 'run', 'prisma:deploy')
Write-Ok 'Migrations aplicadas'

Write-Step '6/7' 'Executando seed do banco'
Invoke-Compose -Arguments @('run', '--rm', 'backend', 'npm', 'run', 'seed')
Write-Ok 'Seed concluido'

Write-Step '7/7' 'Subindo backend, bots, frontend e adminer'
Invoke-Compose -Arguments @('up', '-d', 'backend', 'bots', 'frontend', 'adminer')
Write-Ok 'Servicos iniciados'

Start-Sleep -Seconds 5

Write-Host ''
Write-Host 'STATUS DOS CONTAINERS' -ForegroundColor Cyan
Invoke-Compose -Arguments @('ps')

Write-Host ''
Write-Host 'ACESSOS' -ForegroundColor Cyan
Write-Host '  Frontend:          http://localhost' -ForegroundColor Yellow
Write-Host '  Backend direto:    http://localhost:3001' -ForegroundColor Yellow
Write-Host '  Backend via proxy: http://localhost/api' -ForegroundColor Yellow
Write-Host '  Adminer:           http://localhost:8080' -ForegroundColor Yellow

Write-Host ''
Write-Host 'CREDENCIAIS PADRAO' -ForegroundColor Cyan
Write-Host '  Email: admin@botcrypto.com' -ForegroundColor Yellow
Write-Host '  Senha: admin123' -ForegroundColor Yellow

Write-Host ''
Write-Host 'COMANDOS UTEIS' -ForegroundColor Cyan
Write-Host '  Ver logs:   docker compose logs -f' -ForegroundColor Gray
Write-Host '  Parar tudo: docker compose down' -ForegroundColor Gray

Write-Host ''
Write-Host 'Inicializacao concluida.' -ForegroundColor Green
