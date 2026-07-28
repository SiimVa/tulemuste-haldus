-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ORGANIZER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "elementId" TEXT,
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "AccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SETUP',
    "organizerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "scoringMode" TEXT NOT NULL DEFAULT 'PENALTY',
    "defaultKPMaxValue" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "defaultNotPassed" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "defaultPassedNotDone" DOUBLE PRECISION NOT NULL DEFAULT 35,
    "defaultPKMaxValue" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "defaultVastutegevusPenaltyPerLife" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "defaultVarustusPenaltyPerItem" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "defaultHilinemineMode" TEXT NOT NULL DEFAULT 'ONE_TIME',
    "defaultHilinemineIntervalMinutes" INTEGER NOT NULL DEFAULT 1,
    "defaultHilineminePenaltyPerInterval" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "defaultHilinemineMaxPenalty" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "defaultCalcType" TEXT NOT NULL DEFAULT 'RELATIVE_RANKING',
    "defaultHigherIsBetter" BOOLEAN NOT NULL DEFAULT false,
    "defaultRankingMinPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defaultFixedRankingPoints" TEXT NOT NULL DEFAULT '[]',
    "athletePointsMode" TEXT NOT NULL DEFAULT 'HIDDEN',
    "athletePointsRanges" TEXT NOT NULL DEFAULT '[]',
    "athleteShowTotal" BOOLEAN NOT NULL DEFAULT false,
    "athleteShowRank" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringElement" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CHECKPOINT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "maxValue" DOUBLE PRECISION,
    "config" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "directPointsEntry" BOOLEAN NOT NULL DEFAULT false,
    "revealPointsToAthletes" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ScoringElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldDefinition" (
    "id" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "sectionId" TEXT,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isResultField" BOOLEAN NOT NULL DEFAULT false,
    "rankingPriority" INTEGER,
    "formula" TEXT,
    "meta" TEXT,
    "validation" TEXT,

    CONSTRAINT "FieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalcMethod" (
    "id" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "params" TEXT NOT NULL DEFAULT '{}',
    "customFormula" TEXT,

    CONSTRAINT "CalcMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElementException" (
    "id" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "penalty" DOUBLE PRECISION NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ElementException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "class" TEXT,
    "isHorsDeCompetition" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dnfFromElementOrder" INTEGER,
    "dnfReason" TEXT,
    "hcFromElementOrder" INTEGER,
    "dqFromElementOrder" INTEGER,
    "dnsFlag" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'COMPETITOR',

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Result" (
    "id" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "values" TEXT NOT NULL DEFAULT '{}',
    "exceptionLabel" TEXT,
    "exceptionPenalty" DOUBLE PRECISION,
    "enteredByUserId" TEXT,
    "enteredByTokenId" TEXT,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComputedScore" (
    "id" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "penaltyPoints" DOUBLE PRECISION NOT NULL,
    "rankInElement" INTEGER,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComputedScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualPenalty" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "points" DOUBLE PRECISION NOT NULL,
    "enteredById" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualPenalty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiscEntry" (
    "id" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "points" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "reason" TEXT,
    "abandonElementId" TEXT,
    "abandonTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiscEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElementSection" (
    "id" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "maxValue" DOUBLE PRECISION,

    CONSTRAINT "ElementSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectionCalcMethod" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "params" TEXT NOT NULL DEFAULT '{}',
    "customFormula" TEXT,

    CONSTRAINT "SectionCalcMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionMember" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AccessToken_token_key" ON "AccessToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringElement_competitionId_code_key" ON "ScoringElement"("competitionId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CalcMethod_elementId_key" ON "CalcMethod"("elementId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_competitionId_code_key" ON "Team"("competitionId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Result_elementId_teamId_key" ON "Result"("elementId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "ComputedScore_elementId_teamId_key" ON "ComputedScore"("elementId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "SectionCalcMethod_sectionId_key" ON "SectionCalcMethod"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionMember_competitionId_userId_key" ON "CompetitionMember"("competitionId", "userId");

-- AddForeignKey
ALTER TABLE "AccessToken" ADD CONSTRAINT "AccessToken_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessToken" ADD CONSTRAINT "AccessToken_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "ScoringElement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessToken" ADD CONSTRAINT "AccessToken_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringElement" ADD CONSTRAINT "ScoringElement_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldDefinition" ADD CONSTRAINT "FieldDefinition_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "ScoringElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldDefinition" ADD CONSTRAINT "FieldDefinition_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ElementSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalcMethod" ADD CONSTRAINT "CalcMethod_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "ScoringElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElementException" ADD CONSTRAINT "ElementException_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "ScoringElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "ScoringElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_enteredByUserId_fkey" FOREIGN KEY ("enteredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_enteredByTokenId_fkey" FOREIGN KEY ("enteredByTokenId") REFERENCES "AccessToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComputedScore" ADD CONSTRAINT "ComputedScore_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "ScoringElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComputedScore" ADD CONSTRAINT "ComputedScore_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPenalty" ADD CONSTRAINT "ManualPenalty_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPenalty" ADD CONSTRAINT "ManualPenalty_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscEntry" ADD CONSTRAINT "MiscEntry_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "ScoringElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiscEntry" ADD CONSTRAINT "MiscEntry_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElementSection" ADD CONSTRAINT "ElementSection_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "ScoringElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionCalcMethod" ADD CONSTRAINT "SectionCalcMethod_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ElementSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionMember" ADD CONSTRAINT "CompetitionMember_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionMember" ADD CONSTRAINT "CompetitionMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
