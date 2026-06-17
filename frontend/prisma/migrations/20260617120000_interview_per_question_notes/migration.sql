-- Per-question free-text notes on the orientation interview.
-- The four "Autre" precision columns become always-on note columns (renamed, so
-- existing precisions are preserved), the passionate-teacher name/subject pair is
-- folded into a single note, and the remaining questions gain a note column.

-- Rename the four "Autre" precision columns to the new always-on note columns.
ALTER TABLE "Interview" RENAME COLUMN "discoveryChannelOther" TO "discoveryChannelNote";
ALTER TABLE "Interview" RENAME COLUMN "specialtiesOther" TO "specialtiesNote";
ALTER TABLE "Interview" RENAME COLUMN "otherJobsOther" TO "otherJobsNote";
ALTER TABLE "Interview" RENAME COLUMN "infoSourcesOther" TO "infoSourcesNote";

-- Fold the passionate-teacher name + subject reveal into one free-text note,
-- carrying any existing values across (", "-joined, NULLs skipped) before drop.
ALTER TABLE "Interview" ADD COLUMN "passionateTeacherNote" TEXT;
UPDATE "Interview"
SET "passionateTeacherNote" =
  NULLIF(trim(both ', ' FROM concat_ws(', ', "teacherName", "teacherSubject")), '')
WHERE "teacherName" IS NOT NULL OR "teacherSubject" IS NOT NULL;
ALTER TABLE "Interview" DROP COLUMN "teacherName";
ALTER TABLE "Interview" DROP COLUMN "teacherSubject";

-- New note columns for the questions that previously had no free-text input.
ALTER TABLE "Interview" ADD COLUMN "motivationNote" TEXT;
ALTER TABLE "Interview" ADD COLUMN "orientationTalkNote" TEXT;
ALTER TABLE "Interview" ADD COLUMN "techProjectionNote" TEXT;
ALTER TABLE "Interview" ADD COLUMN "wantsMoreNote" TEXT;
ALTER TABLE "Interview" ADD COLUMN "satisfactionNote" TEXT;
ALTER TABLE "Interview" ADD COLUMN "nextYearEventsNote" TEXT;
