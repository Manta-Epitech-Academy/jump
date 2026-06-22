-- Drop note categories. The original feature request (multiple authored,
-- timestamped notes) never asked for pedago/admin typing; it was over-built, so
-- the column and its enum type are removed.
ALTER TABLE "Note_TalentNote" DROP COLUMN "category";
DROP TYPE "Note_TalentNoteCategory";
