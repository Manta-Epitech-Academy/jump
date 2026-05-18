-- AlterTable
ALTER TABLE "BroadcastRecipient" ADD COLUMN     "lastTriedAt" TIMESTAMP(3),
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0;
