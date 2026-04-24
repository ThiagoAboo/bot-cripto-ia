-- CreateTable
CREATE TABLE "SocialSignalSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "configKey" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "symbol" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "mentions" INTEGER NOT NULL,
    "sentiment" TEXT NOT NULL,
    "sources" TEXT NOT NULL DEFAULT '[]',
    "references" TEXT NOT NULL DEFAULT '[]',
    "rank" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialSignalSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialSignalSnapshot_userId_generatedAt_idx" ON "SocialSignalSnapshot"("userId", "generatedAt");

-- CreateIndex
CREATE INDEX "SocialSignalSnapshot_userId_configKey_generatedAt_idx" ON "SocialSignalSnapshot"("userId", "configKey", "generatedAt");

-- CreateIndex
CREATE INDEX "SocialSignalSnapshot_userId_pair_generatedAt_idx" ON "SocialSignalSnapshot"("userId", "pair", "generatedAt");

-- AddForeignKey
ALTER TABLE "SocialSignalSnapshot" ADD CONSTRAINT "SocialSignalSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
