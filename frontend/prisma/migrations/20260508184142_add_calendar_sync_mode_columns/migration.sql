-- AlterTable
ALTER TABLE "OutlookCalendarSync" ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "sequence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "syncKind" TEXT NOT NULL DEFAULT 'graph';
