-- AlterTable
ALTER TABLE "ScoringElement" ADD COLUMN "maxValue" REAL;

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
    "defaultPKMaxValue" REAL NOT NULL DEFAULT 30,
    "defaultNotPassed" REAL NOT NULL DEFAULT 40,
    "defaultPassedNotDone" REAL NOT NULL DEFAULT 35,
    CONSTRAINT "Competition_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Competition" ("createdAt", "date", "id", "location", "name", "organizerId", "status", "updatedAt") SELECT "createdAt", "date", "id", "location", "name", "organizerId", "status", "updatedAt" FROM "Competition";
DROP TABLE "Competition";
ALTER TABLE "new_Competition" RENAME TO "Competition";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
