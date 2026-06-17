-- Lean rebuild of the orientation-interview feature.
-- The previous (calendar-sync) version was always gated and never shipped, so
-- its Interview/OutlookCalendarSync rows are discarded: emptying the table lets
-- the InterviewStatus / InterviewRecommendation enums be recast cleanly.
DELETE FROM "Interview";

-- CreateEnum
CREATE TYPE "DiscoveryChannel" AS ENUM ('site_1e1s', 'entourage', 'google', 'epitech', 'autre');

-- CreateEnum
CREATE TYPE "InterviewMotivation" AS ENUM ('passion', 'metier', 'curiosite', 'cadre_stage');

-- CreateEnum
CREATE TYPE "Specialty" AS ENUM ('maths', 'nsi', 'physique_chimie', 'svt', 'ses', 'sciences_ingenieur', 'autre', 'indecis');

-- CreateEnum
CREATE TYPE "OrientationTalkFrequency" AS ENUM ('souvent', 'un_peu', 'pas_du_tout');

-- CreateEnum
CREATE TYPE "PassionateTeacherAnswer" AS ENUM ('oui', 'pas_sur');

-- CreateEnum
CREATE TYPE "TechProjection" AS ENUM ('dev', 'cyber', 'ia_data', 'jeux_video', 'design', 'reseaux_systemes', 'pas_idee', 'hors_tech');

-- CreateEnum
CREATE TYPE "OtherJobDomain" AS ENUM ('sante', 'commerce_gestion', 'arts_design', 'sport', 'autre');

-- CreateEnum
CREATE TYPE "InfoSource" AS ENUM ('tiktok', 'instagram', 'youtube', 'google', 'ia_chatgpt', 'parcoursup_onisep', 'entourage', 'lycee', 'autre');

-- CreateEnum
CREATE TYPE "WeekDomain" AS ENUM ('cyber', 'dev', 'devops', 'product_design', 'ia');

-- CreateEnum
CREATE TYPE "WantsMoreAnswer" AS ENUM ('oui', 'peut_etre', 'pas_maintenant');

-- CreateEnum
CREATE TYPE "SatisfactionContent" AS ENUM ('trop_facile', 'bon_niveau', 'trop_dense');

-- CreateEnum
CREATE TYPE "NextYearEvent" AS ENUM ('coding_club', 'camp', 'journee_decouverte', 'jpo', 'conference');

-- AlterEnum
BEGIN;
CREATE TYPE "InterviewStatus_new" AS ENUM ('in_progress', 'done');
ALTER TABLE "Interview" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Interview" ALTER COLUMN "status" TYPE "InterviewStatus_new" USING ("status"::text::"InterviewStatus_new");
ALTER TYPE "InterviewStatus" RENAME TO "InterviewStatus_old";
ALTER TYPE "InterviewStatus_new" RENAME TO "InterviewStatus";
DROP TYPE "InterviewStatus_old";
ALTER TABLE "Interview" ALTER COLUMN "status" SET DEFAULT 'in_progress';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "InterviewRecommendation_new" AS ENUM ('tres_compatible', 'bon_profil', 'indecis', 'pas_interesse');
ALTER TABLE "Interview" ALTER COLUMN "recommendation" TYPE "InterviewRecommendation_new" USING ("recommendation"::text::"InterviewRecommendation_new");
ALTER TYPE "InterviewRecommendation" RENAME TO "InterviewRecommendation_old";
ALTER TYPE "InterviewRecommendation_new" RENAME TO "InterviewRecommendation";
DROP TYPE "InterviewRecommendation_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "Interview" DROP CONSTRAINT "Interview_participationId_fkey";

-- DropForeignKey
ALTER TABLE "OutlookCalendarSync" DROP CONSTRAINT "OutlookCalendarSync_interviewId_fkey";

-- DropForeignKey
ALTER TABLE "OutlookCalendarSync" DROP CONSTRAINT "OutlookCalendarSync_userId_fkey";

-- AlterTable
ALTER TABLE "Interview" DROP COLUMN "date",
DROP COLUMN "discoveryReason",
DROP COLUMN "globalNote",
DROP COLUMN "interests",
DROP COLUMN "nextEventInterest",
DROP COLUMN "platforms",
DROP COLUMN "satisfaction",
ADD COLUMN     "conductedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "discoveryChannel" "DiscoveryChannel",
ADD COLUMN     "infoSources" "InfoSource"[] DEFAULT ARRAY[]::"InfoSource"[],
ADD COLUMN     "interviewerNote" TEXT,
ADD COLUMN     "nextYearEvents" "NextYearEvent"[] DEFAULT ARRAY[]::"NextYearEvent"[],
ADD COLUMN     "oneSentence" TEXT,
ADD COLUMN     "orientationTalkAtSchool" "OrientationTalkFrequency",
ADD COLUMN     "passionateTeacher" "PassionateTeacherAnswer",
ADD COLUMN     "satisfactionContent" "SatisfactionContent",
ADD COLUMN     "satisfactionStars" INTEGER,
ADD COLUMN     "teacherName" TEXT,
ADD COLUMN     "teacherSubject" TEXT,
ADD COLUMN     "techProjection" "TechProjection",
ADD COLUMN     "wantsMore" "WantsMoreAnswer",
ADD COLUMN     "weekFavorite" "WeekDomain",
ALTER COLUMN "participationId" SET NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'in_progress',
DROP COLUMN "motivation",
ADD COLUMN     "motivation" "InterviewMotivation",
DROP COLUMN "specialties",
ADD COLUMN     "specialties" "Specialty"[] DEFAULT ARRAY[]::"Specialty"[],
DROP COLUMN "otherJobs",
ADD COLUMN     "otherJobs" "OtherJobDomain"[] DEFAULT ARRAY[]::"OtherJobDomain"[];

-- DropTable
DROP TABLE "OutlookCalendarSync";

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "Participation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

