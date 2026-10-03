-- AlterTable
ALTER TABLE "Competition" ADD COLUMN     "dashboardConfig" TEXT NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "ScoringElement" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "mapX" DOUBLE PRECISION,
ADD COLUMN     "mapY" DOUBLE PRECISION,
ADD COLUMN     "mgrs" TEXT;

-- AlterTable
ALTER TABLE "ElementException" ADD COLUMN     "kind" TEXT;

-- CreateTable
CREATE TABLE "CompetitionMap" (
    "competitionId" TEXT NOT NULL,
    "image" BYTEA,
    "imageType" TEXT,
    "imageWidth" INTEGER,
    "imageHeight" INTEGER,
    "imageName" TEXT,
    "imageUpdatedAt" TIMESTAMP(3),
    "markers" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionMap_pkey" PRIMARY KEY ("competitionId")
);

-- CreateTable
CREATE TABLE "LeaderboardFreeze" (
    "competitionId" TEXT NOT NULL,
    "freezeAt" TIMESTAMP(3) NOT NULL,
    "snapshot" JSONB,
    "snapshotAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaderboardFreeze_pkey" PRIMARY KEY ("competitionId")
);

-- AddForeignKey
ALTER TABLE "CompetitionMap" ADD CONSTRAINT "CompetitionMap_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaderboardFreeze" ADD CONSTRAINT "LeaderboardFreeze_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

