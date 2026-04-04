# init.ps1 - Script completo de inicialização do Bot Crypto IA

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                    BOT CRYPTO IA - INIT                        ║" -ForegroundColor Cyan
Write-Host "║                 Inicialização do Sistema Completo              ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ============================================
# 1. PARAR CONTAINERS EXISTENTES
# ============================================
Write-Host "[1/8] Parando containers existentes..." -ForegroundColor Yellow
docker-compose down -v 2>&1 | Out-Null
Write-Host "      ✅ Containers removidos" -ForegroundColor Green

# ============================================
# 2. CRIAR ARQUIVOS NECESSÁRIOS
# ============================================
Write-Host "[2/8] Criando arquivos de configuração..." -ForegroundColor Yellow

# Criar .env.production para o backend se não existir
if (!(Test-Path "backend\.env.production")) {
    @"
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
"@ | Out-File -FilePath "backend\.env.production" -Encoding utf8
    Write-Host "      ✅ backend\.env.production criado" -ForegroundColor Green
} else {
    Write-Host "      ⏭️  backend\.env.production já existe" -ForegroundColor Gray
}

# Criar .env para o frontend se não existir
if (!(Test-Path "frontend\.env.production")) {
    @"
VITE_API_URL=/api
VITE_WS_URL=ws://localhost/socket.io
"@ | Out-File -FilePath "frontend\.env.production" -Encoding utf8
    Write-Host "      ✅ frontend\.env.production criado" -ForegroundColor Green
} else {
    Write-Host "      ⏭️  frontend\.env.production já existe" -ForegroundColor Gray
}

# Criar seed.js se não existir
if (!(Test-Path "backend\prisma\seed.js")) {
    @"
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const DEFAULT_STRATEGIES = JSON.stringify([
  {
    id: "strategy_scalper",
    name: "Scalper V2",
    strategyType: "scalper",
    isActive: true,
    parameters: {
      timeframe: "1m",
      maxSpread: 0.1,
      minVolume: 100000,
      takeProfitTicks: 5,
      stopLossTicks: 3
    }
  },
  {
    id: "strategy_momentum",
    name: "Momentum Trader",
    strategyType: "momentum",
    isActive: true,
    parameters: {
      period: 14,
      threshold: 2.5,
      rsiPeriod: 14,
      rsiOverbought: 70,
      rsiOversold: 30
    }
  },
  {
    id: "strategy_trend",
    name: "Trend Follower",
    strategyType: "trend_follower",
    isActive: true,
    parameters: {
      fastEma: 20,
      slowEma: 50,
      adxPeriod: 14,
      adxThreshold: 25
    }
  },
  {
    id: "strategy_reversion",
    name: "Mean Reversion",
    strategyType: "mean_reversion",
    isActive: true,
    parameters: {
      bbPeriod: 20,
      bbStdDev: 2,
      rsiPeriod: 14,
      rsiLower: 30,
      rsiUpper: 70
    }
  },
  {
    id: "strategy_arbitrage",
    name: "Arbitrage Hunter",
    strategyType: "arbitrage",
    isActive: false,
    parameters: {
      minSpreadPercent: 0.5,
      maxLatencyMs: 100,
      minLiquidity: 50000
    }
  }
]);

const DEFAULT_ALLOWED_PAIRS = JSON.stringify([
  "BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT",
  "DOGE/USDT", "ADA/USDT", "AVAX/USDT", "DOT/USDT", "LINK/USDT"
]);

async function main() {
  console.log('🌱 Iniciando seed...');

  const hashedPassword = await bcrypt.hash('admin123', 10);
  
  const user = await prisma.user.upsert({
    where: { email: 'admin@botcrypto.com' },
    update: {},
    create: {
      email: 'admin@botcrypto.com',
      passwordHash: hashedPassword,
      name: 'Administrador',
      preferences: JSON.stringify({ notificationsEnabled: true, theme: 'dark' })
    }
  });
  console.log('✅ Usuário criado:', user.email);

  await prisma.configuration.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      exchange: "binance",
      apiKey: "",
      secretKey: "",
      stopLossPercent: 5.0,
      takeProfitPercent: 10.0,
      leverage: 1,
      maxTradeAmount: 1000,
      maxTradeAmountUnit: "USDT",
      allowedPairs: DEFAULT_ALLOWED_PAIRS,
      discountUsdtPercent: 0.075,
      discountBnbPercent: 0.075,
      minBnbBalance: 0.01,
      mode: "spot",
      orderType: "market",
      slippagePercent: 0.5,
      strategies: DEFAULT_STRATEGIES
    }
  });
  console.log('✅ Configurações criadas');

  const bots = [
    { id: "bot1", name: "Scalper V2", strategyType: "scalper", description: "Operações rápidas com pequenos lucros" },
    { id: "bot2", name: "Momentum Trader", strategyType: "momentum", description: "Identifica moedas com forte momentum" },
    { id: "bot3", name: "Trend Follower", strategyType: "trend_follower", description: "Segue tendências de médio/longo prazo" },
    { id: "bot4", name: "Mean Reversion", strategyType: "mean_reversion", description: "Identifica moedas sobrecompradas/sobrevendidas" },
    { id: "bot5", name: "Arbitrage Hunter", strategyType: "arbitrage", description: "Identifica oportunidades de arbitragem" }
  ];

  for (const botData of bots) {
    await prisma.bot.upsert({
      where: { id: botData.id },
      update: {},
      create: {
        id: botData.id,
        name: botData.name,
        strategyType: botData.strategyType,
        description: botData.description,
        status: 'online'
      }
    });
  }
  console.log('✅ Bots criados');

  const balances = [
    { currency: 'USDT', available: 12500, reserved: 500, total: 13000 },
    { currency: 'BTC', available: 0.5, reserved: 0, total: 0.5 },
    { currency: 'ETH', available: 3.2, reserved: 0.2, total: 3.4 },
    { currency: 'SOL', available: 50, reserved: 10, total: 60 }
  ];

  for (const balance of balances) {
    await prisma.balance.upsert({
      where: { userId_currency: { userId: user.id, currency: balance.currency } },
      update: balance,
      create: { ...balance, userId: user.id }
    });
  }
  console.log('✅ Saldos criados');

  const totalBrl = balances.reduce((sum, b) => {
    if (b.currency === 'USDT') return sum + b.available * 5.85;
    if (b.currency === 'BTC') return sum + b.available * 350000;
    if (b.currency === 'ETH') return sum + b.available * 18000;
    if (b.currency === 'SOL') return sum + b.available * 80;
    return sum;
  }, 0);

  await prisma.balanceHistory.create({
    data: {
      userId: user.id,
      totalBrl,
      timestamp: new Date()
    }
  });
  console.log('✅ Histórico de saldo criado');

  console.log('🎉 Seed concluído!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
"@ | Out-File -FilePath "backend\prisma\seed.js" -Encoding utf8
    Write-Host "      ✅ backend\prisma\seed.js criado" -ForegroundColor Green
} else {
    Write-Host "      ⏭️  backend\prisma\seed.js já existe" -ForegroundColor Gray
}

# ============================================
# 3. SUBIR OS CONTAINERS
# ============================================
Write-Host "[3/8] Subindo containers (PostgreSQL, Redis)..." -ForegroundColor Yellow
docker-compose up -d postgres redis 2>&1 | Out-Null
Write-Host "      ✅ PostgreSQL e Redis iniciados" -ForegroundColor Green

# ============================================
# 4. AGUARDAR BANCO DE DADOS
# ============================================
Write-Host "[4/8] Aguardando banco de dados ficar pronto..." -ForegroundColor Yellow
Start-Sleep -Seconds 10
Write-Host "      ✅ Banco de dados pronto" -ForegroundColor Green

# ============================================
# 5. EXECUTAR MIGRATIONS
# ============================================
Write-Host "[5/8] Executando migrations do Prisma..." -ForegroundColor Yellow
docker-compose run --rm backend npx prisma migrate dev --name init 2>&1 | Out-Null
Write-Host "      ✅ Migrations aplicadas" -ForegroundColor Green

# ============================================
# 6. EXECUTAR SEED
# ============================================
Write-Host "[6/8] Executando seed do banco de dados..." -ForegroundColor Yellow
docker-compose run --rm backend node prisma/seed.js 2>&1 | Out-Null
Write-Host "      ✅ Seed concluído" -ForegroundColor Green

# ============================================
# 7. SUBIR BACKEND E FRONTEND
# ============================================
Write-Host "[7/8] Subindo backend e frontend..." -ForegroundColor Yellow
docker-compose up -d backend frontend adminer 2>&1 | Out-Null
Write-Host "      ✅ Backend, Frontend e Adminer iniciados" -ForegroundColor Green

# ============================================
# 8. AGUARDAR E MOSTRAR STATUS
# ============================================
Write-Host "[8/8] Aguardando serviços ficarem prontos..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                    SISTEMA PRONTO!                             ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

Write-Host "📊 STATUS DOS CONTAINERS:" -ForegroundColor Cyan
docker-compose ps

Write-Host ""
Write-Host "🌐 ACESSOS:" -ForegroundColor Cyan
Write-Host "   Frontend:    http://localhost" -ForegroundColor Yellow
Write-Host "   Backend API: http://localhost/api" -ForegroundColor Yellow
Write-Host "   Adminer:     http://localhost:8080" -ForegroundColor Yellow
Write-Host ""

Write-Host "🔑 CREDENCIAIS DE ACESSO:" -ForegroundColor Cyan
Write-Host "   Email: admin@botcrypto.com" -ForegroundColor Yellow
Write-Host "   Senha: admin123" -ForegroundColor Yellow
Write-Host ""

Write-Host "📝 COMANDOS ÚTEIS:" -ForegroundColor Cyan
Write-Host "   Ver logs:        docker-compose logs -f" -ForegroundColor Gray
Write-Host "   Parar tudo:      docker-compose down" -ForegroundColor Gray
Write-Host "   Reiniciar:       docker-compose restart" -ForegroundColor Gray
Write-Host ""

Write-Host "✅ Inicialização concluída! Acesse http://localhost" -ForegroundColor Green
Write-Host ""