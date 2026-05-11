-- CreateEnum
CREATE TYPE "MinigameScoring" AS ENUM ('score', 'chrono');

-- CreateEnum
CREATE TYPE "MinigameAttemptStatus" AS ENUM ('pending', 'done', 'invalid');

-- CreateTable
CREATE TABLE "MinigameConfig" (
    "game" TEXT NOT NULL,
    "levelCount" INTEGER NOT NULL DEFAULT 0,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "scoringType" "MinigameScoring" NOT NULL DEFAULT 'score',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MinigameConfig_pkey" PRIMARY KEY ("game")
);

-- CreateTable
CREATE TABLE "MinigamePublication" (
    "id" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "forcedById" TEXT,

    CONSTRAINT "MinigamePublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MinigameAttempt" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" "MinigameAttemptStatus" NOT NULL DEFAULT 'pending',
    "score" INTEGER,
    "chrono" INTEGER,
    "valid" BOOLEAN,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "jti" TEXT NOT NULL,

    CONSTRAINT "MinigameAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventMinigameSettings" (
    "eventId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventMinigameSettings_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE INDEX "MinigamePublication_publishedAt_idx" ON "MinigamePublication"("publishedAt");

-- CreateIndex
CREATE INDEX "MinigamePublication_game_idx" ON "MinigamePublication"("game");

-- CreateIndex
CREATE UNIQUE INDEX "MinigameAttempt_jti_key" ON "MinigameAttempt"("jti");

-- CreateIndex
CREATE INDEX "MinigameAttempt_eventId_publicationId_idx" ON "MinigameAttempt"("eventId", "publicationId");

-- CreateIndex
CREATE INDEX "MinigameAttempt_publicationId_idx" ON "MinigameAttempt"("publicationId");

-- CreateIndex
CREATE UNIQUE INDEX "MinigameAttempt_talentId_publicationId_key" ON "MinigameAttempt"("talentId", "publicationId");

-- AddForeignKey
ALTER TABLE "MinigamePublication" ADD CONSTRAINT "MinigamePublication_game_fkey" FOREIGN KEY ("game") REFERENCES "MinigameConfig"("game") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinigameAttempt" ADD CONSTRAINT "MinigameAttempt_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinigameAttempt" ADD CONSTRAINT "MinigameAttempt_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "MinigamePublication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinigameAttempt" ADD CONSTRAINT "MinigameAttempt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventMinigameSettings" ADD CONSTRAINT "EventMinigameSettings_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
