-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Competition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "date" DATETIME,
    "endDate" DATETIME,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SETUP',
    "organizerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "scoringMode" TEXT NOT NULL DEFAULT 'PENALTY',
    "defaultKPMaxValue" REAL NOT NULL DEFAULT 30,
    "defaultNotPassed" REAL NOT NULL DEFAULT 40,
    "defaultPassedNotDone" REAL NOT NULL DEFAULT 35,
    "defaultPKMaxValue" REAL NOT NULL DEFAULT 15,
    "defaultVastutegevusPenaltyPerLife" REAL NOT NULL DEFAULT 5,
    "defaultVarustusPenaltyPerItem" REAL NOT NULL DEFAULT 5,
    "defaultHilinemineMode" TEXT NOT NULL DEFAULT 'ONE_TIME',
    "defaultHilinemineIntervalMinutes" INTEGER NOT NULL DEFAULT 1,
    "defaultHilineminePenaltyPerInterval" REAL NOT NULL DEFAULT 1,
    "defaultHilinemineMaxPenalty" REAL NOT NULL DEFAULT 30,
    "defaultCalcType" TEXT NOT NULL DEFAULT 'RELATIVE_RANKING',
    "defaultHigherIsBetter" BOOLEAN NOT NULL DEFAULT false,
    "defaultRankingMinPoints" REAL NOT NULL DEFAULT 0,
    "defaultFixedRankingPoints" TEXT NOT NULL DEFAULT '[]',
    "athletePointsMode" TEXT NOT NULL DEFAULT 'HIDDEN',
    "athletePointsRanges" TEXT NOT NULL DEFAULT '[]',
    "athleteShowTotal" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Competition_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Competition" ("createdAt", "date", "defaultCalcType", "defaultFixedRankingPoints", "defaultHigherIsBetter", "defaultHilinemineIntervalMinutes", "defaultHilinemineMaxPenalty", "defaultHilinemineMode", "defaultHilineminePenaltyPerInterval", "defaultKPMaxValue", "defaultNotPassed", "defaultPKMaxValue", "defaultPassedNotDone", "defaultRankingMinPoints", "defaultVarustusPenaltyPerItem", "defaultVastutegevusPenaltyPerLife", "endDate", "id", "location", "name", "organizerId", "scoringMode", "status", "updatedAt") SELECT "createdAt", "date", "defaultCalcType", "defaultFixedRankingPoints", "defaultHigherIsBetter", "defaultHilinemineIntervalMinutes", "defaultHilinemineMaxPenalty", "defaultHilinemineMode", "defaultHilineminePenaltyPerInterval", "defaultKPMaxValue", "defaultNotPassed", "defaultPKMaxValue", "defaultPassedNotDone", "defaultRankingMinPoints", "defaultVarustusPenaltyPerItem", "defaultVastutegevusPenaltyPerLife", "endDate", "id", "location", "name", "organizerId", "scoringMode", "status", "updatedAt" FROM "Competition";
DROP TABLE "Competition";
ALTER TABLE "new_Competition" RENAME TO "Competition";
CREATE TABLE "new_ScoringElement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CHECKPOINT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "maxValue" REAL,
    "config" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "directPointsEntry" BOOLEAN NOT NULL DEFAULT false,
    "revealPointsToAthletes" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ScoringElement_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ScoringElement" ("code", "competitionId", "config", "createdAt", "directPointsEntry", "id", "isCancelled", "maxValue", "name", "order", "type") SELECT "code", "competitionId", "config", "createdAt", "directPointsEntry", "id", "isCancelled", "maxValue", "name", "order", "type" FROM "ScoringElement";
DROP TABLE "ScoringElement";
ALTER TABLE "new_ScoringElement" RENAME TO "ScoringElement";
CREATE UNIQUE INDEX "ScoringElement_competitionId_code_key" ON "ScoringElement"("competitionId", "code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
