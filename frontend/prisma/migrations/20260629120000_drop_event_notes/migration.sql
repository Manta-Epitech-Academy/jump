-- Drop the free-text Event.notes field: it was write-only from the admin event
-- wizard and only surfaced as "Notes pédago" in the pedago space. The feature is
-- unused and removed entirely (see EventConfigWizard / pedago event pages).
ALTER TABLE "Event" DROP COLUMN "notes";
