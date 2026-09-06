CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status" INTEGER,
    "actorUserId" TEXT,
    "actorTokenId" TEXT,
    "fingerprint" TEXT,
    "targetIds" JSONB NOT NULL DEFAULT '{}',
    "durationMs" INTEGER,
    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SecurityEvent_createdAt_id_idx" ON "SecurityEvent"("createdAt", "id");
CREATE INDEX "SecurityEvent_outcome_createdAt_idx" ON "SecurityEvent"("outcome", "createdAt");
CREATE INDEX "SecurityEvent_actorUserId_createdAt_idx" ON "SecurityEvent"("actorUserId", "createdAt");

CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");
