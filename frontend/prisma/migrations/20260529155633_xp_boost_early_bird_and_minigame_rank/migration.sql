-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "XpGrantSource" ADD VALUE 'onboarding_early_bird';
ALTER TYPE "XpGrantSource" ADD VALUE 'minigame_rank';

-- AlterTable
ALTER TABLE "MinigameAttempt" ADD COLUMN     "rankXpAwarded" INTEGER,
ADD COLUMN     "rankXpSeenAt" TIMESTAMP(3);
