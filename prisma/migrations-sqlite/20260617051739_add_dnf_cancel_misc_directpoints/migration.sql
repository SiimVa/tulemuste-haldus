-- AlterTable
ALTER TABLE "Team" ADD COLUMN "dnfFromElementOrder" INTEGER;
ALTER TABLE "Team" ADD COLUMN "dnfReason" TEXT;

-- CreateTable
CREATE TABLE "MiscEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "elementId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "points" REAL NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MiscEntry_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "ScoringElement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MiscEntry_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    CONSTRAINT "ScoringElement_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ScoringElement" ("code", "competitionId", "config", "createdAt", "id", "maxValue", "name", "order", "type") SELECT "code", "competitionId", "config", "createdAt", "id", "maxValue", "name", "order", "type" FROM "ScoringElement";
DROP TABLE "ScoringElement";
ALTER TABLE "new_ScoringElement" RENAME TO "ScoringElement";
CREATE UNIQUE INDEX "ScoringElement_competitionId_code_key" ON "ScoringElement"("competitionId", "code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
