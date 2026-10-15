-- A persona icon may now be given as an address, by the admin API's whole-form
-- write. No backfill: every icon stored until now was uploaded, and has none.

-- AlterTable
ALTER TABLE "Feedback_Form" ADD COLUMN     "personaIconSourceUrl" TEXT;
