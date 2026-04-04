@echo off
REM ============================================================================
REM Script de criação da estrutura do projeto bot-cripto-ia
REM Execute este script na pasta raiz do projeto
REM ============================================================================

echo Criando estrutura de diretórios...

REM Criar pastas principais
mkdir src 2>nul
mkdir src\features 2>nul
mkdir src\shared 2>nul
mkdir src\app 2>nul
mkdir public 2>nul

REM Criar estrutura features
mkdir src\features\dashboard 2>nul
mkdir src\features\dashboard\components 2>nul
mkdir src\features\dashboard\hooks 2>nul
mkdir src\features\dashboard\services 2>nul
mkdir src\features\dashboard\types 2>nul

mkdir src\features\configurations 2>nul
mkdir src\features\configurations\components 2>nul
mkdir src\features\configurations\hooks 2>nul
mkdir src\features\configurations\services 2>nul
mkdir src\features\configurations\types 2>nul

mkdir src\features\training 2>nul
mkdir src\features\training\components 2>nul
mkdir src\features\training\hooks 2>nul
mkdir src\features\training\services 2>nul
mkdir src\features\training\types 2>nul

mkdir src\features\transactions 2>nul
mkdir src\features\transactions\components 2>nul
mkdir src\features\transactions\hooks 2>nul
mkdir src\features\transactions\services 2>nul
mkdir src\features\transactions\types 2>nul

mkdir src\features\logs 2>nul
mkdir src\features\logs\components 2>nul
mkdir src\features\logs\hooks 2>nul
mkdir src\features\logs\services 2>nul
mkdir src\features\logs\types 2>nul

REM Criar estrutura shared
mkdir src\shared\components 2>nul
mkdir src\shared\components\ui 2>nul
mkdir src\shared\components\layout 2>nul
mkdir src\shared\components\charts 2>nul

mkdir src\shared\hooks 2>nul
mkdir src\shared\services 2>nul
mkdir src\shared\utils 2>nul
mkdir src\shared\types 2>nul
mkdir src\shared\constants 2>nul

REM Criar estrutura app
mkdir src\app\store 2>nul
mkdir src\app\providers 2>nul

echo Estrutura de diretórios criada com sucesso!

REM Criar arquivos vazios (placeholders)
echo Criando arquivos placeholder...

REM Arquivos de configuração na raiz
type nul > package.json 2>nul
type nul > vite.config.ts 2>nul
type nul > tsconfig.json 2>nul
type nul > tsconfig.node.json 2>nul
type nul > tailwind.config.js 2>nul
type nul > postcss.config.js 2>nul
type nul > .gitignore 2>nul
type nul > index.html 2>nul

REM Arquivos principais do src
type nul > src\main.tsx 2>nul
type nul > src\vite-env.d.ts 2>nul
type nul > src\App.tsx 2>nul
type nul > src\routes.tsx 2>nul

REM Arquivos shared
type nul > src\shared\components\ui\Button.tsx 2>nul
type nul > src\shared\components\ui\Card.tsx 2>nul
type nul > src\shared\components\ui\Table.tsx 2>nul
type nul > src\shared\components\ui\Modal.tsx 2>nul
type nul > src\shared\components\ui\Toast.tsx 2>nul
type nul > src\shared\components\ui\Skeleton.tsx 2>nul
type nul > src\shared\components\layout\Header.tsx 2>nul
type nul > src\shared\components\layout\Sidebar.tsx 2>nul
type nul > src\shared\components\layout\Footer.tsx 2>nul
type nul > src\shared\components\charts\AreaChart.tsx 2>nul
type nul > src\shared\components\charts\CandlestickChart.tsx 2>nul

type nul > src\shared\hooks\useWebSocket.ts 2>nul
type nul > src\shared\hooks\usePolling.ts 2>nul
type nul > src\shared\hooks\useLocalStorage.ts 2>nul
type nul > src\shared\hooks\useDebounce.ts 2>nul

type nul > src\shared\services\api.client.ts 2>nul
type nul > src\shared\services\ws.client.ts 2>nul
type nul > src\shared\services\queryClient.ts 2>nul

type nul > src\shared\utils\formatters.ts 2>nul
type nul > src\shared\utils\validators.ts 2>nul
type nul > src\shared\utils\converters.ts 2>nul
type nul > src\shared\utils\constants.ts 2>nul

type nul > src\shared\types\global.types.ts 2>nul
type nul > src\shared\types\api.types.ts 2>nul

type nul > src\shared\constants\index.ts 2>nul

REM Arquivos app
type nul > src\app\store\ui.store.ts 2>nul
type nul > src\app\store\filters.store.ts 2>nul
type nul > src\app\providers\ThemeProvider.tsx 2>nul
type nul > src\app\providers\QueryProvider.tsx 2>nul
type nul > src\app\providers\WebSocketProvider.tsx 2>nul

REM Arquivos dashboard
type nul > src\features\dashboard\components\TotalBalanceCard.tsx 2>nul
type nul > src\features\dashboard\components\CurrencyBalanceCard.tsx 2>nul
type nul > src\features\dashboard\components\PerformanceChart.tsx 2>nul
type nul > src\features\dashboard\components\RecentTransactionsTable.tsx 2>nul
type nul > src\features\dashboard\components\BotsStatusList.tsx 2>nul
type nul > src\features\dashboard\hooks\useDashboardData.ts 2>nul
type nul > src\features\dashboard\hooks\usePerformanceData.ts 2>nul
type nul > src\features\dashboard\services\dashboard.service.ts 2>nul
type nul > src\features\dashboard\types\dashboard.types.ts 2>nul
type nul > src\features\dashboard\DashboardPage.tsx 2>nul

REM Arquivos configurations
type nul > src\features\configurations\components\ApiKeysCard.tsx 2>nul
type nul > src\features\configurations\components\RiskManagementCard.tsx 2>nul
type nul > src\features\configurations\components\AllowedPairsCard.tsx 2>nul
type nul > src\features\configurations\components\FeesCard.tsx 2>nul
type nul > src\features\configurations\components\AdvancedOptionsCard.tsx 2>nul
type nul > src\features\configurations\hooks\useConfigurations.ts 2>nul
type nul > src\features\configurations\services\configurations.service.ts 2>nul
type nul > src\features\configurations\types\configurations.types.ts 2>nul
type nul > src\features\configurations\ConfiguracoesPage.tsx 2>nul

REM Arquivos training
type nul > src\features\training\components\ModelSelector.tsx 2>nul
type nul > src\features\training\components\DatasetConfig.tsx 2>nul
type nul > src\features\training\components\HyperparametersForm.tsx 2>nul
type nul > src\features\training\components\TrainingControls.tsx 2>nul
type nul > src\features\training\components\MetricsChart.tsx 2>nul
type nul > src\features\training\components\TrainingLogTerminal.tsx 2>nul
type nul > src\features\training\hooks\useTrainingSession.ts 2>nul
type nul > src\features\training\hooks\useTrainingMetrics.ts 2>nul
type nul > src\features\training\services\training.service.ts 2>nul
type nul > src\features\training\types\training.types.ts 2>nul
type nul > src\features\training\TreinamentoPage.tsx 2>nul

REM Arquivos transactions
type nul > src\features\transactions\components\CurrencySelector.tsx 2>nul
type nul > src\features\transactions\components\PairChart.tsx 2>nul
type nul > src\features\transactions\components\AvailableBalance.tsx 2>nul
type nul > src\features\transactions\components\ManualOrderForm.tsx 2>nul
type nul > src\features\transactions\components\TransactionFilters.tsx 2>nul
type nul > src\features\transactions\components\TransactionsTable.tsx 2>nul
type nul > src\features\transactions\hooks\useExchangeRate.ts 2>nul
type nul > src\features\transactions\hooks\usePairChart.ts 2>nul
type nul > src\features\transactions\hooks\useTransactions.ts 2>nul
type nul > src\features\transactions\services\transactions.service.ts 2>nul
type nul > src\features\transactions\types\transactions.types.ts 2>nul
type nul > src\features\transactions\TransacoesPage.tsx 2>nul

REM Arquivos logs
type nul > src\features\logs\components\ModeSelector.tsx 2>nul
type nul > src\features\logs\components\LogFilters.tsx 2>nul
type nul > src\features\logs\components\LogTerminal.tsx 2>nul
type nul > src\features\logs\components\TraceTerminal.tsx 2>nul
type nul > src\features\logs\components\TraceGroup.tsx 2>nul
type nul > src\features\logs\hooks\useLogs.ts 2>nul
type nul > src\features\logs\hooks\useTraces.ts 2>nul
type nul > src\features\logs\services\logs.service.ts 2>nul
type nul > src\features\logs\types\logs.types.ts 2>nul
type nul > src\features\logs\LogsPage.tsx 2>nul

REM Arquivo db.json para mock
type nul > db.json 2>nul

echo Arquivos placeholder criados com sucesso!
echo.
echo Estrutura do projeto criada!
echo Agora execute: npm install
echo.
pause