-- AlterTable
-- htmlSlice holds the per-H1 rendered HTML chunk a talent sees as one "step".
-- Computed at import time; null for H2/H3 sections, which exist only for
-- observable wiring.
ALTER TABLE "Section" ADD COLUMN "htmlSlice" TEXT;
