-- CreateTable
CREATE TABLE "RuntimeHeartbeat" (
    "id" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuntimeHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeHeartbeat_serviceName_instanceId_key" ON "RuntimeHeartbeat"("serviceName", "instanceId");

-- CreateIndex
CREATE INDEX "RuntimeHeartbeat_serviceName_heartbeatAt_idx" ON "RuntimeHeartbeat"("serviceName", "heartbeatAt");
