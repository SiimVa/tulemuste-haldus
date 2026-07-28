-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Competition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "date" DATETIME,
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
    "defaultFixedRankingPoints" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "Competition_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Competition" ("createdAt", "date", "defaultFixedRankingPoints", "defaultHilinemineIntervalMinutes", "defaultHilinemineMaxPenalty", "defaultHilinemineMode", "defaultHilineminePenaltyPerInterval", "defaultKPMaxValue", "defaultNotPassed", "defaultPKMaxValue", "defaultPassedNotDone", "defaultVarustusPenaltyPerItem", "defaultVastutegevusPenaltyPerLife", "id", "location", "name", "organizerId", "scoringMode", "status", "updatedAt") SELECT "createdAt", "date", "defaultFixedRankingPoints", "defaultHilinemineIntervalMinutes", "defaultHilinemineMaxPenalty", "defaultHilinemineMode", "defaultHilineminePenaltyPerInterval", "defaultKPMaxValue", "defaultNotPassed", "defaultPKMaxValue", "defaultPassedNotDone", "defaultVarustusPenaltyPerItem", "defaultVastutegevusPenaltyPerLife", "id", "location", "name", "organizerId", "scoringMode", "status", "updatedAt" FROM "Competition";
DROP TABLE "Competition";
ALTER TABLE "new_Competition" RENAME TO "Competition";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
