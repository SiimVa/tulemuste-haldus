-- CreateTable
CREATE TABLE "ElementSection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "elementId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "maxValue" REAL,
    CONSTRAINT "ElementSection_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "ScoringElement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SectionCalcMethod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sectionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "params" TEXT NOT NULL DEFAULT '{}',
    "customFormula" TEXT,
    CONSTRAINT "SectionCalcMethod_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ElementSection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FieldDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    CONSTRAINT "FieldDefinition_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "ScoringElement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FieldDefinition_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ElementSection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FieldDefinition" ("elementId", "formula", "id", "isResultField", "label", "meta", "name", "order", "rankingPriority", "type") SELECT "elementId", "formula", "id", "isResultField", "label", "meta", "name", "order", "rankingPriority", "type" FROM "FieldDefinition";
DROP TABLE "FieldDefinition";
ALTER TABLE "new_FieldDefinition" RENAME TO "FieldDefinition";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "SectionCalcMethod_sectionId_key" ON "SectionCalcMethod"("sectionId");
