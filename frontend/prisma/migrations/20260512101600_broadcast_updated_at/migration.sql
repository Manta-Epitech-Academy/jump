-- AlterTable: add updatedAt, backfilling existing rows with createdAt so the
-- column can be NOT NULL without a permanent default.
ALTER TABLE "Broadcast" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "Broadcast" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "Broadcast" ALTER COLUMN "updatedAt" SET NOT NULL;
