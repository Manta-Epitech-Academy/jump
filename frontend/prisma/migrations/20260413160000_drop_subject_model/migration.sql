-- DropForeignKey
ALTER TABLE "ParticipationSubject" DROP CONSTRAINT "ParticipationSubject_participationId_fkey";

-- DropForeignKey
ALTER TABLE "ParticipationSubject" DROP CONSTRAINT "ParticipationSubject_subjectId_fkey";

-- DropForeignKey
ALTER TABLE "StepsProgress" DROP CONSTRAINT "StepsProgress_subjectId_fkey";

-- DropForeignKey
ALTER TABLE "Subject" DROP CONSTRAINT "Subject_campusId_fkey";

-- DropForeignKey
ALTER TABLE "SubjectTheme" DROP CONSTRAINT "SubjectTheme_subjectId_fkey";

-- DropForeignKey
ALTER TABLE "SubjectTheme" DROP CONSTRAINT "SubjectTheme_themeId_fkey";

-- DropIndex
DROP INDEX "StepsProgress_studentProfileId_subjectId_eventId_key";

-- AlterTable
ALTER TABLE "StepsProgress" DROP COLUMN "subjectId";

-- DropTable
DROP TABLE "ParticipationSubject";

-- DropTable
DROP TABLE "Subject";

-- DropTable
DROP TABLE "SubjectTheme";
