-- CreateTable
CREATE TABLE "CompetitionSeries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionSeriesCompetition" (
    "seriesId" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CompetitionSeriesCompetition_pkey" PRIMARY KEY ("seriesId","competitionId")
);

-- CreateIndex
CREATE INDEX "CompetitionSeriesCompetition_competitionId_idx" ON "CompetitionSeriesCompetition"("competitionId");

-- AddForeignKey
ALTER TABLE "CompetitionSeriesCompetition" ADD CONSTRAINT "CompetitionSeriesCompetition_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "CompetitionSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionSeriesCompetition" ADD CONSTRAINT "CompetitionSeriesCompetition_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

