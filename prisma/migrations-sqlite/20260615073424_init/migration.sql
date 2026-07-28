-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ORGANIZER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AccessToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "elementId" TEXT,
    "teamId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    CONSTRAINT "AccessToken_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccessToken_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "ScoringElement" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AccessToken_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Competition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "date" DATETIME,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SETUP',
    "organizerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Competition_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScoringElement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CHECKPOINT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScoringElement_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FieldDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "elementId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isResultField" BOOLEAN NOT NULL DEFAULT false,
    "formula" TEXT,
    "meta" TEXT,
    CONSTRAINT "FieldDefinition_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "ScoringElement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CalcMethod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "elementId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "params" TEXT NOT NULL DEFAULT '{}',
    "customFormula" TEXT,
    CONSTRAINT "CalcMethod_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "ScoringElement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ElementException" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "elementId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "penalty" REAL NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ElementException_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "ScoringElement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "class" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Team_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'COMPETITOR',
    CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Result" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "elementId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "values" TEXT NOT NULL DEFAULT '{}',
    "exceptionLabel" TEXT,
    "exceptionPenalty" REAL,
    "enteredByUserId" TEXT,
    "enteredByTokenId" TEXT,
    "enteredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Result_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "ScoringElement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Result_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Result_enteredByUserId_fkey" FOREIGN KEY ("enteredByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Result_enteredByTokenId_fkey" FOREIGN KEY ("enteredByTokenId") REFERENCES "AccessToken" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ComputedScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "elementId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "penaltyPoints" REAL NOT NULL,
    "rankInElement" INTEGER,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComputedScore_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "ScoringElement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ComputedScore_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ManualPenalty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "points" REAL NOT NULL,
    "enteredById" TEXT NOT NULL,
    "enteredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManualPenalty_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ManualPenalty_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
