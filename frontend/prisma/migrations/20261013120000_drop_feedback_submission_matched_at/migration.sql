-- `Feedback_Submission.matchedAt` was meant to say when a public submission was
-- later linked to a Talent by e-mail. No code ever did that link, and none ever
-- read the column: it appears in the schema, in the migration that created the
-- table and nowhere else in the history.
--
-- Warnings: the column is dropped with no backfill, because it holds nothing to
-- keep. Checked against a preprod snapshot (2026-09-14): 943 submissions, none
-- with a `matchedAt`.

-- AlterTable
ALTER TABLE "Feedback_Submission" DROP COLUMN "matchedAt";
