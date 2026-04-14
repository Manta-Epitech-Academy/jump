-- AlterTable
ALTER TABLE "ParticipationActivity" ADD COLUMN     "delay" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isPresent" BOOLEAN NOT NULL DEFAULT false;
