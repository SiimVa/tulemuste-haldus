ALTER TABLE "CompetitionSeries" ADD COLUMN "leaderboardAccessMode" TEXT NOT NULL DEFAULT 'PUBLIC';
ALTER TABLE "CompetitionSeries" ADD COLUMN "leaderboardTokenHash" TEXT;
CREATE UNIQUE INDEX "CompetitionSeries_leaderboardTokenHash_key" ON "CompetitionSeries"("leaderboardTokenHash");
