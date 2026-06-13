-- Rename the staff verdict note column to the role-neutral domain naming.
-- The "interviewer" was always just the Interview's staff member (dev or
-- pedago), so the field now reads as the verdict note it holds. RENAME (not
-- drop/add) keeps the existing notes.
ALTER TABLE "Interview" RENAME COLUMN "interviewerNote" TO "verdictNote";
