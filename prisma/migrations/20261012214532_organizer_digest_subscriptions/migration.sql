-- CreateTable
CREATE TABLE "OrganizerDigestSubscription" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "registration" BOOLEAN NOT NULL DEFAULT true,
    "mandate" BOOLEAN NOT NULL DEFAULT true,
    "interval" TEXT NOT NULL DEFAULT 'DAILY',
    "coveredUntil" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextSendAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizerDigestSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizerDigestSubscription_nextSendAt_idx" ON "OrganizerDigestSubscription"("nextSendAt");

-- CreateIndex
CREATE INDEX "OrganizerDigestSubscription_userId_idx" ON "OrganizerDigestSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizerDigestSubscription_competitionId_userId_key" ON "OrganizerDigestSubscription"("competitionId", "userId");

-- AddForeignKey
ALTER TABLE "OrganizerDigestSubscription" ADD CONSTRAINT "OrganizerDigestSubscription_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizerDigestSubscription" ADD CONSTRAINT "OrganizerDigestSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
