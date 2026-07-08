-- ── Domain cleanup: data reassignment + backfill ──────────────────────────
-- This block must stay BEFORE any DROP TABLE / ALTER TYPE below: it rewrites
-- the rows still referencing the retired enum values and tables, so the enum
-- recreations + drops don't fail on existing data.

-- 1. Retire the peda/manta staff roles -> dev (all staff run as dev now).
UPDATE "StaffProfile"    SET "staffRole" = 'dev' WHERE "staffRole" IN ('peda', 'manta');
UPDATE "StaffInvitation" SET "staffRole" = 'dev' WHERE "staffRole" IN ('peda', 'manta');

-- 2. Remove broadcasts that targeted the retired peda/manta audiences (they
--    reached nobody). Null out any retargeting link first, then delete
--    (BroadcastRecipient rows cascade on the Broadcast delete).
UPDATE "Broadcast" SET "sourceBroadcastId" = NULL
  WHERE "sourceBroadcastId" IN (SELECT "id" FROM "Broadcast" WHERE "audience" IN ('peda', 'manta'));
DELETE FROM "Broadcast" WHERE "audience" IN ('peda', 'manta');

-- 3. Drop the legacy activity_presence XP grants (event-presence XP is retired)
--    and refresh the cached Talent.xp projection.
DELETE FROM "XpGrant" WHERE "source" = 'activity_presence';
UPDATE "Talent" t SET "xp" = COALESCE(
  (SELECT SUM(g."amount") FROM "XpGrant" g WHERE g."talentId" = t."id"), 0);

-- 4. Backfill Talent.eventsCount from EventPresence (distinct attended events);
--    the projection previously had no runtime writer and sat at 0.
UPDATE "Talent" t SET "eventsCount" = COALESCE(
  (SELECT COUNT(DISTINCT ep."eventId") FROM "EventPresence" ep
   WHERE ep."talentId" = t."id" AND ep."status" IN ('present', 'late')), 0);
-- ──────────────────────────────────────────────────────────────────────────
-- AlterEnum
BEGIN;
CREATE TYPE "BroadcastAudience_new" AS ENUM ('talent', 'parent', 'dev', 'superdev');
ALTER TABLE "Broadcast" ALTER COLUMN "audience" TYPE "BroadcastAudience_new" USING ("audience"::text::"BroadcastAudience_new");
ALTER TYPE "BroadcastAudience" RENAME TO "BroadcastAudience_old";
ALTER TYPE "BroadcastAudience_new" RENAME TO "BroadcastAudience";
DROP TYPE "public"."BroadcastAudience_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "StaffRole_new" AS ENUM ('admin', 'superdev', 'dev');
ALTER TABLE "StaffProfile" ALTER COLUMN "staffRole" TYPE "StaffRole_new" USING ("staffRole"::text::"StaffRole_new");
ALTER TABLE "StaffInvitation" ALTER COLUMN "staffRole" TYPE "StaffRole_new" USING ("staffRole"::text::"StaffRole_new");
ALTER TYPE "StaffRole" RENAME TO "StaffRole_old";
ALTER TYPE "StaffRole_new" RENAME TO "StaffRole";
DROP TYPE "public"."StaffRole_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "XpGrantSource_new" AS ENUM ('onboarding', 'onboarding_early_bird', 'minigame', 'minigame_rank', 'reward', 'admin_adjustment');
ALTER TABLE "XpGrant" ALTER COLUMN "source" TYPE "XpGrantSource_new" USING ("source"::text::"XpGrantSource_new");
ALTER TYPE "XpGrantSource" RENAME TO "XpGrantSource_old";
ALTER TYPE "XpGrantSource_new" RENAME TO "XpGrantSource";
DROP TYPE "public"."XpGrantSource_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "Activity" DROP CONSTRAINT "Activity_subjectVersionId_fkey";

-- DropForeignKey
ALTER TABLE "ActivityTemplate" DROP CONSTRAINT "ActivityTemplate_campusId_fkey";

-- DropForeignKey
ALTER TABLE "ActivityTemplate" DROP CONSTRAINT "ActivityTemplate_subjectId_fkey";

-- DropForeignKey
ALTER TABLE "ActivityTemplate" DROP CONSTRAINT "ActivityTemplate_subjectVersionId_fkey";

-- DropForeignKey
ALTER TABLE "ActivityTemplateTheme" DROP CONSTRAINT "ActivityTemplateTheme_activityTemplateId_fkey";

-- DropForeignKey
ALTER TABLE "ActivityTemplateTheme" DROP CONSTRAINT "ActivityTemplateTheme_themeId_fkey";

-- DropForeignKey
ALTER TABLE "Competence" DROP CONSTRAINT "Competence_snapshotId_fkey";

-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_subjectVersionId_fkey";

-- DropForeignKey
ALTER TABLE "EventManta" DROP CONSTRAINT "EventManta_eventId_fkey";

-- DropForeignKey
ALTER TABLE "EventManta" DROP CONSTRAINT "EventManta_staffProfileId_fkey";

-- DropForeignKey
ALTER TABLE "Observable" DROP CONSTRAINT "Observable_snapshotId_fkey";

-- DropForeignKey
ALTER TABLE "ParticipationActivity" DROP CONSTRAINT "ParticipationActivity_activityId_fkey";

-- DropForeignKey
ALTER TABLE "ParticipationActivity" DROP CONSTRAINT "ParticipationActivity_participationId_fkey";

-- DropForeignKey
ALTER TABLE "ParticipationActivity" DROP CONSTRAINT "ParticipationActivity_verdictAuthorId_fkey";

-- DropForeignKey
ALTER TABLE "PlanningTemplateDay" DROP CONSTRAINT "PlanningTemplateDay_planningTemplateId_fkey";

-- DropForeignKey
ALTER TABLE "PlanningTemplateSlot" DROP CONSTRAINT "PlanningTemplateSlot_activityTemplateId_fkey";

-- DropForeignKey
ALTER TABLE "PlanningTemplateSlot" DROP CONSTRAINT "PlanningTemplateSlot_planningTemplateDayId_fkey";

-- DropForeignKey
ALTER TABLE "PortfolioItem" DROP CONSTRAINT "PortfolioItem_activityId_fkey";

-- DropForeignKey
ALTER TABLE "PortfolioItem" DROP CONSTRAINT "PortfolioItem_eventId_fkey";

-- DropForeignKey
ALTER TABLE "PortfolioItem" DROP CONSTRAINT "PortfolioItem_talentId_fkey";

-- DropForeignKey
ALTER TABLE "Section" DROP CONSTRAINT "Section_documentId_fkey";

-- DropForeignKey
ALTER TABLE "Section" DROP CONSTRAINT "Section_subjectVersionId_fkey";

-- DropForeignKey
ALTER TABLE "Skill" DROP CONSTRAINT "Skill_competenceId_fkey";

-- DropForeignKey
ALTER TABLE "Skill" DROP CONSTRAINT "Skill_snapshotId_fkey";

-- DropForeignKey
ALTER TABLE "SkillLevel" DROP CONSTRAINT "SkillLevel_skillId_fkey";

-- DropForeignKey
ALTER TABLE "SkillLevel" DROP CONSTRAINT "SkillLevel_snapshotId_fkey";

-- DropForeignKey
ALTER TABLE "StepsProgress" DROP CONSTRAINT "StepsProgress_activityId_fkey";

-- DropForeignKey
ALTER TABLE "StepsProgress" DROP CONSTRAINT "StepsProgress_eventId_fkey";

-- DropForeignKey
ALTER TABLE "StepsProgress" DROP CONSTRAINT "StepsProgress_talentId_fkey";

-- DropForeignKey
ALTER TABLE "SubjectObservable" DROP CONSTRAINT "SubjectObservable_observableId_fkey";

-- DropForeignKey
ALTER TABLE "SubjectObservable" DROP CONSTRAINT "SubjectObservable_sectionId_fkey";

-- DropForeignKey
ALTER TABLE "SubjectObservable" DROP CONSTRAINT "SubjectObservable_skillLevelId_fkey";

-- DropForeignKey
ALTER TABLE "SubjectObservable" DROP CONSTRAINT "SubjectObservable_subjectVersionId_fkey";

-- DropForeignKey
ALTER TABLE "SubjectQuiz" DROP CONSTRAINT "SubjectQuiz_documentId_fkey";

-- DropForeignKey
ALTER TABLE "SubjectQuiz" DROP CONSTRAINT "SubjectQuiz_subjectVersionId_fkey";

-- DropForeignKey
ALTER TABLE "SubjectVersion" DROP CONSTRAINT "SubjectVersion_importedById_fkey";

-- DropForeignKey
ALTER TABLE "SubjectVersion" DROP CONSTRAINT "SubjectVersion_refCompSnapshotId_fkey";

-- DropForeignKey
ALTER TABLE "SubjectVersion" DROP CONSTRAINT "SubjectVersion_subjectId_fkey";

-- DropForeignKey
ALTER TABLE "TalentCompetenceState" DROP CONSTRAINT "TalentCompetenceState_skillLevelId_fkey";

-- DropForeignKey
ALTER TABLE "TalentCompetenceState" DROP CONSTRAINT "TalentCompetenceState_talentId_fkey";

-- DropForeignKey
ALTER TABLE "TalentObservableState" DROP CONSTRAINT "TalentObservableState_eventId_fkey";

-- DropForeignKey
ALTER TABLE "TalentObservableState" DROP CONSTRAINT "TalentObservableState_observableId_fkey";

-- DropForeignKey
ALTER TABLE "TalentObservableState" DROP CONSTRAINT "TalentObservableState_observedById_fkey";

-- DropForeignKey
ALTER TABLE "TalentObservableState" DROP CONSTRAINT "TalentObservableState_sourceSectionId_fkey";

-- DropForeignKey
ALTER TABLE "TalentObservableState" DROP CONSTRAINT "TalentObservableState_talentId_fkey";

-- DropForeignKey
ALTER TABLE "TalentQuizAttempt" DROP CONSTRAINT "TalentQuizAttempt_eventId_fkey";

-- DropForeignKey
ALTER TABLE "TalentQuizAttempt" DROP CONSTRAINT "TalentQuizAttempt_quizId_fkey";

-- DropForeignKey
ALTER TABLE "TalentQuizAttempt" DROP CONSTRAINT "TalentQuizAttempt_talentId_fkey";

-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_authorId_fkey";

-- DropForeignKey
ALTER TABLE "TicketMessage" DROP CONSTRAINT "TicketMessage_authorId_fkey";

-- DropForeignKey
ALTER TABLE "TicketMessage" DROP CONSTRAINT "TicketMessage_ticketId_fkey";

-- DropIndex
DROP INDEX "Activity_subjectVersionId_idx";

-- AlterTable
ALTER TABLE "Activity" DROP COLUMN "contentStructure",
DROP COLUMN "isDynamic",
DROP COLUMN "subjectVersionId";

-- AlterTable
ALTER TABLE "Participation" DROP COLUMN "camperFeedback",
DROP COLUMN "camperRating",
DROP COLUMN "delay",
DROP COLUMN "isPresent";

-- DropTable
DROP TABLE "ActivityTemplate";

-- DropTable
DROP TABLE "ActivityTemplateTheme";

-- DropTable
DROP TABLE "Competence";

-- DropTable
DROP TABLE "Document";

-- DropTable
DROP TABLE "EventManta";

-- DropTable
DROP TABLE "Observable";

-- DropTable
DROP TABLE "ParticipationActivity";

-- DropTable
DROP TABLE "PlanningTemplate";

-- DropTable
DROP TABLE "PlanningTemplateDay";

-- DropTable
DROP TABLE "PlanningTemplateSlot";

-- DropTable
DROP TABLE "PortfolioItem";

-- DropTable
DROP TABLE "RefCompSnapshot";

-- DropTable
DROP TABLE "Section";

-- DropTable
DROP TABLE "Skill";

-- DropTable
DROP TABLE "SkillLevel";

-- DropTable
DROP TABLE "StepsProgress";

-- DropTable
DROP TABLE "Subject";

-- DropTable
DROP TABLE "SubjectObservable";

-- DropTable
DROP TABLE "SubjectQuiz";

-- DropTable
DROP TABLE "SubjectVersion";

-- DropTable
DROP TABLE "TalentCompetenceState";

-- DropTable
DROP TABLE "TalentObservableState";

-- DropTable
DROP TABLE "TalentQuizAttempt";

-- DropTable
DROP TABLE "Ticket";

-- DropTable
DROP TABLE "TicketMessage";

-- DropEnum
DROP TYPE "ParticipationContextTag";

-- DropEnum
DROP TYPE "ParticipationVerdict";

-- DropEnum
DROP TYPE "StepStatus";

-- DropEnum
DROP TYPE "UnlockSource";

