-- Replace the feedback gate/identity machinery with a single Feedback_IdentityField
-- enum on Feedback_Question. Order matters: backfill before dropping `identity`,
-- delete gate/skip rows before recreating the enums (Postgres can't drop an enum
-- value while a row still uses it), and drop the `kind` default before retyping it.

-- New identity-field enum (1:1 with the Feedback_Submission.respondent* columns).
CREATE TYPE "Feedback_IdentityField" AS ENUM ('email', 'phone', 'firstName', 'lastName', 'civility', 'campus');

-- New nullable column (null = a normal content question).
ALTER TABLE "Feedback_Question" ADD COLUMN "identityField" "Feedback_IdentityField";

-- Backfill from existing identity rows, keyed by the canonical question key.
-- Identity rows with a non-canonical key (never routed anywhere) stay null and
-- become plain content questions.
UPDATE "Feedback_Question" SET "identityField" =
  CASE "key"
    WHEN 'mail'      THEN 'email'::"Feedback_IdentityField"
    WHEN 'telephone' THEN 'phone'::"Feedback_IdentityField"
    WHEN 'prenom'    THEN 'firstName'::"Feedback_IdentityField"
    WHEN 'nom'       THEN 'lastName'::"Feedback_IdentityField"
    WHEN 'civilite'  THEN 'civility'::"Feedback_IdentityField"
    WHEN 'campus'    THEN 'campus'::"Feedback_IdentityField"
  END
WHERE "identity" = true;

-- Remove rows using the soon-to-be-dropped enum values. Gate questions and skip
-- options never carry Feedback_Answer / Feedback_AnswerOption rows, so the
-- ON DELETE RESTRICT foreign keys never fire.
DELETE FROM "Feedback_QuestionOption" WHERE "kind" = 'skip';
DELETE FROM "Feedback_Question" WHERE "type" = 'gate';

-- Drop the dead boolean columns.
ALTER TABLE "Feedback_Question" DROP COLUMN "identity";
ALTER TABLE "Feedback_Question" DROP COLUMN "skipsIdentity";

-- Swap Feedback_QuestionType to drop 'gate'.
ALTER TYPE "Feedback_QuestionType" RENAME TO "Feedback_QuestionType_old";
CREATE TYPE "Feedback_QuestionType" AS ENUM ('single', 'multiple', 'scale', 'text', 'textarea');
ALTER TABLE "Feedback_Question" ALTER COLUMN "type" TYPE "Feedback_QuestionType" USING ("type"::text::"Feedback_QuestionType");
DROP TYPE "Feedback_QuestionType_old";

-- Swap Feedback_OptionKind to drop 'skip'.
ALTER TABLE "Feedback_QuestionOption" ALTER COLUMN "kind" DROP DEFAULT;
ALTER TYPE "Feedback_OptionKind" RENAME TO "Feedback_OptionKind_old";
CREATE TYPE "Feedback_OptionKind" AS ENUM ('choice', 'extra');
ALTER TABLE "Feedback_QuestionOption" ALTER COLUMN "kind" TYPE "Feedback_OptionKind" USING ("kind"::text::"Feedback_OptionKind");
ALTER TABLE "Feedback_QuestionOption" ALTER COLUMN "kind" SET DEFAULT 'choice';
DROP TYPE "Feedback_OptionKind_old";
