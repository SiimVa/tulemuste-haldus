-- AlterTable
ALTER TABLE "CompetitionSeries" ADD COLUMN     "analysisAccessMode" TEXT NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN     "analysisTokenHash" TEXT,
ADD COLUMN     "dashboardConfig" TEXT NOT NULL DEFAULT '{}',
ADD COLUMN     "freezeAt" TIMESTAMP(3),
ADD COLUMN     "freezeSnapshot" JSONB,
ADD COLUMN     "freezeSnapshotAt" TIMESTAMP(3),
ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionSeries_analysisTokenHash_key" ON "CompetitionSeries"("analysisTokenHash");

