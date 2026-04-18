-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "preferences" TEXT NOT NULL DEFAULT '{}',
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Configuration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exchange" TEXT NOT NULL DEFAULT 'binance',
    "apiKey" TEXT NOT NULL DEFAULT '',
    "secretKey" TEXT NOT NULL DEFAULT '',
    "stopLossPercent" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "takeProfitPercent" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    "leverage" INTEGER NOT NULL DEFAULT 1,
    "maxTradeAmount" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "maxTradeAmountUnit" TEXT NOT NULL DEFAULT 'USDT',
    "allowedPairs" TEXT NOT NULL DEFAULT '[]',
    "useBnbForFees" BOOLEAN NOT NULL DEFAULT true,
    "discountUsdtPercent" DOUBLE PRECISION NOT NULL DEFAULT 0.075,
    "discountBnbPercent" DOUBLE PRECISION NOT NULL DEFAULT 0.075,
    "minBnbBalance" DOUBLE PRECISION NOT NULL DEFAULT 0.01,
    "reserveBnbForFeesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pairDiscovery" TEXT NOT NULL DEFAULT '{}',
    "mode" TEXT NOT NULL DEFAULT 'spot',
    "orderType" TEXT NOT NULL DEFAULT 'market',
    "slippagePercent" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "strategies" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Configuration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotTemplate" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "strategyType" TEXT NOT NULL,
    "indicatorType" TEXT,
    "specialization" TEXT,
    "description" TEXT,
    "defaultParameters" TEXT NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bot" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "strategyType" TEXT NOT NULL,
    "description" TEXT,
    "executionMode" TEXT NOT NULL DEFAULT 'paper',
    "isSystemManaged" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "currentPair" TEXT,
    "lastAnalysis" TIMESTAMP(3),
    "recommendedAction" TEXT,
    "confidence" DOUBLE PRECISION,
    "modelVersion" TEXT NOT NULL DEFAULT 'v1.0.0',
    "modelUrl" TEXT,
    "parameters" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pair" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "botId" TEXT,
    "type" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "requestedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "orderType" TEXT NOT NULL DEFAULT 'market',
    "price" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "fee" DOUBLE PRECISION NOT NULL,
    "feeCurrency" TEXT NOT NULL DEFAULT 'USDT',
    "feeRateApplied" DOUBLE PRECISION NOT NULL DEFAULT 0.001,
    "feeDiscountSource" TEXT,
    "status" TEXT NOT NULL,
    "externalOrderId" TEXT,
    "externalClientOrderId" TEXT,
    "externalStatus" TEXT,
    "syncedAt" TIMESTAMP(3),
    "profitBrl" DOUBLE PRECISION,
    "profitPercent" DOUBLE PRECISION,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Balance" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "available" DOUBLE PRECISION NOT NULL,
    "reserved" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalBrl" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "BalanceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingSession" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "config" TEXT NOT NULL DEFAULT '{}',
    "metrics" TEXT NOT NULL DEFAULT '[]',
    "bestEpoch" INTEGER,
    "bestValLoss" DOUBLE PRECISION,
    "modelUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotModelArtifact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "trainingSessionId" TEXT,
    "modelVersion" TEXT NOT NULL,
    "modelUrl" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "architecture" TEXT,
    "validationStrategy" TEXT,
    "forecastHorizonCandles" INTEGER,
    "governanceRole" TEXT NOT NULL DEFAULT 'challenger',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "evaluationSummary" TEXT NOT NULL DEFAULT '{}',
    "reproducibilitySummary" TEXT NOT NULL DEFAULT '{}',
    "promotedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotModelArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotDecision" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "executionMode" TEXT NOT NULL,
    "executionStatus" TEXT NOT NULL,
    "modelVersion" TEXT,
    "modelUrl" TEXT,
    "modelArchitecture" TEXT,
    "horizonCandles" INTEGER NOT NULL DEFAULT 5,
    "buyThresholdPercent" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "sellThresholdPercent" DOUBLE PRECISION NOT NULL DEFAULT -0.3,
    "decisionPrice" DOUBLE PRECISION NOT NULL,
    "requestedQuantity" DOUBLE PRECISION,
    "executedQuantity" DOUBLE PRECISION,
    "transactionId" TEXT,
    "slippagePercent" DOUBLE PRECISION,
    "simulatedLatencyMs" INTEGER,
    "simulatedFillPercent" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "evaluatedAt" TIMESTAMP(3),
    "evaluationStatus" TEXT NOT NULL DEFAULT 'pending',
    "evaluationPrice" DOUBLE PRECISION,
    "marketReturnPercent" DOUBLE PRECISION,
    "strategyReturnPercent" DOUBLE PRECISION,
    "realizedEdgePercent" DOUBLE PRECISION,
    "actualLabel" TEXT,
    "expectedLabel" TEXT,
    "isCorrect" BOOLEAN,

    CONSTRAINT "BotDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Log" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trace" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "parentTraceId" TEXT,
    "functionName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "durationMs" DOUBLE PRECISION NOT NULL,
    "botId" TEXT,
    "currentPair" TEXT,
    "recommendedAction" TEXT,
    "confidence" DOUBLE PRECISION,
    "errorFlag" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Trace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Configuration_userId_key" ON "Configuration"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BotTemplate_slug_key" ON "BotTemplate"("slug");

-- CreateIndex
CREATE INDEX "Bot_userId_idx" ON "Bot"("userId");

-- CreateIndex
CREATE INDEX "Bot_templateId_idx" ON "Bot"("templateId");

-- CreateIndex
CREATE INDEX "Transaction_userId_externalOrderId_idx" ON "Transaction"("userId", "externalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Balance_userId_currency_key" ON "Balance"("userId", "currency");

-- CreateIndex
CREATE INDEX "BalanceHistory_userId_timestamp_idx" ON "BalanceHistory"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "BotModelArtifact_userId_botId_createdAt_idx" ON "BotModelArtifact"("userId", "botId", "createdAt");

-- CreateIndex
CREATE INDEX "BotModelArtifact_botId_isActive_idx" ON "BotModelArtifact"("botId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "BotModelArtifact_botId_modelUrl_key" ON "BotModelArtifact"("botId", "modelUrl");

-- CreateIndex
CREATE INDEX "BotDecision_userId_botId_createdAt_idx" ON "BotDecision"("userId", "botId", "createdAt");

-- CreateIndex
CREATE INDEX "BotDecision_userId_evaluationStatus_dueAt_idx" ON "BotDecision"("userId", "evaluationStatus", "dueAt");

-- CreateIndex
CREATE INDEX "Log_timestamp_idx" ON "Log"("timestamp");

-- CreateIndex
CREATE INDEX "Log_userId_idx" ON "Log"("userId");

-- CreateIndex
CREATE INDEX "Trace_traceId_idx" ON "Trace"("traceId");

-- CreateIndex
CREATE INDEX "Trace_timestamp_idx" ON "Trace"("timestamp");

-- CreateIndex
CREATE INDEX "Trace_userId_idx" ON "Trace"("userId");

-- AddForeignKey
ALTER TABLE "Configuration" ADD CONSTRAINT "Configuration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bot" ADD CONSTRAINT "Bot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bot" ADD CONSTRAINT "Bot_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BotTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Balance" ADD CONSTRAINT "Balance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceHistory" ADD CONSTRAINT "BalanceHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotModelArtifact" ADD CONSTRAINT "BotModelArtifact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotModelArtifact" ADD CONSTRAINT "BotModelArtifact_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotModelArtifact" ADD CONSTRAINT "BotModelArtifact_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotDecision" ADD CONSTRAINT "BotDecision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotDecision" ADD CONSTRAINT "BotDecision_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Log" ADD CONSTRAINT "Log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trace" ADD CONSTRAINT "Trace_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trace" ADD CONSTRAINT "Trace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

