ALTER TABLE "Trace"
ADD COLUMN "stage" TEXT,
ADD COLUMN "snapshot" TEXT;

CREATE INDEX "Trace_stage_idx" ON "Trace"("stage");
