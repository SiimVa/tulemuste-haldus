ALTER TABLE "SecurityEvent" ADD COLUMN "recordCount" INTEGER;

CREATE TABLE "SecurityAlert" (
    "id" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "userId" TEXT,
    "fingerprint" TEXT,
    "targetIds" JSONB NOT NULL DEFAULT '{}',
    "eventCount" INTEGER NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "firstEventAt" TIMESTAMPTZ(3) NOT NULL,
    "lastEventAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolvedById" TEXT,
    CONSTRAINT "SecurityAlert_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SecurityAlert_resolvedAt_lastEventAt_idx" ON "SecurityAlert"("resolvedAt", "lastEventAt");
CREATE INDEX "SecurityAlert_lastEventAt_idx" ON "SecurityAlert"("lastEventAt");
