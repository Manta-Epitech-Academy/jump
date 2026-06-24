/*
  Warnings:

  - You are about to drop the `FeedbackSubmission` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "Feedback_FormStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "Feedback_QuestionType" AS ENUM ('single', 'multiple', 'scale', 'text', 'textarea', 'gate');

-- CreateEnum
CREATE TYPE "Feedback_InputKind" AS ENUM ('email', 'tel', 'name', 'text');

-- CreateEnum
CREATE TYPE "Feedback_OptionKind" AS ENUM ('choice', 'extra', 'skip');

-- CreateEnum
CREATE TYPE "Feedback_SubmissionSource" AS ENUM ('authenticated', 'public');

-- DropForeignKey
ALTER TABLE "FeedbackSubmission" DROP CONSTRAINT "FeedbackSubmission_eventId_fkey";

-- DropForeignKey
ALTER TABLE "FeedbackSubmission" DROP CONSTRAINT "FeedbackSubmission_talentId_fkey";

-- DropTable
DROP TABLE "FeedbackSubmission";

-- CreateTable
CREATE TABLE "Feedback_Form" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "intro" TEXT NOT NULL,
    "personaName" TEXT,
    "status" "Feedback_FormStatus" NOT NULL DEFAULT 'draft',
    "allowsAuthenticatedAccess" BOOLEAN NOT NULL DEFAULT true,
    "allowsPublicAccess" BOOLEAN NOT NULL DEFAULT false,
    "dashboardNudge" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_Form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback_Section" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "intro" TEXT,

    CONSTRAINT "Feedback_Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback_Question" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "sectionId" TEXT,
    "key" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "type" "Feedback_QuestionType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "identity" BOOLEAN NOT NULL DEFAULT false,
    "inputKind" "Feedback_InputKind",
    "minSelections" INTEGER,
    "maxSelections" INTEGER,
    "skipsIdentity" BOOLEAN NOT NULL DEFAULT false,
    "placeholder" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback_QuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "Feedback_OptionKind" NOT NULL DEFAULT 'choice',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_QuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback_Submission" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "source" "Feedback_SubmissionSource" NOT NULL,
    "talentId" TEXT,
    "eventId" TEXT,
    "matchedAt" TIMESTAMP(3),
    "respondentEmail" TEXT,
    "respondentFirstName" TEXT,
    "respondentLastName" TEXT,
    "respondentPhone" TEXT,
    "respondentCivility" TEXT,
    "respondentCampusLabel" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback_Answer" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "freeText" TEXT,

    CONSTRAINT "Feedback_Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback_AnswerOption" (
    "answerId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,

    CONSTRAINT "Feedback_AnswerOption_pkey" PRIMARY KEY ("answerId","optionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_Form_slug_key" ON "Feedback_Form"("slug");

-- CreateIndex
CREATE INDEX "Feedback_Form_status_idx" ON "Feedback_Form"("status");

-- CreateIndex
CREATE INDEX "Feedback_Section_formId_position_idx" ON "Feedback_Section"("formId", "position");

-- CreateIndex
CREATE INDEX "Feedback_Question_formId_position_idx" ON "Feedback_Question"("formId", "position");

-- CreateIndex
CREATE INDEX "Feedback_Question_sectionId_idx" ON "Feedback_Question"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_Question_formId_key_key" ON "Feedback_Question"("formId", "key");

-- CreateIndex
CREATE INDEX "Feedback_QuestionOption_questionId_position_idx" ON "Feedback_QuestionOption"("questionId", "position");

-- CreateIndex
CREATE INDEX "Feedback_Submission_eventId_idx" ON "Feedback_Submission"("eventId");

-- CreateIndex
CREATE INDEX "Feedback_Submission_formId_source_idx" ON "Feedback_Submission"("formId", "source");

-- CreateIndex
CREATE INDEX "Feedback_Submission_talentId_idx" ON "Feedback_Submission"("talentId");

-- CreateIndex
CREATE INDEX "Feedback_Submission_respondentEmail_idx" ON "Feedback_Submission"("respondentEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_Submission_formId_eventId_talentId_key" ON "Feedback_Submission"("formId", "eventId", "talentId");

-- CreateIndex
CREATE INDEX "Feedback_Answer_questionId_idx" ON "Feedback_Answer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_Answer_submissionId_questionId_key" ON "Feedback_Answer"("submissionId", "questionId");

-- CreateIndex
CREATE INDEX "Feedback_AnswerOption_optionId_idx" ON "Feedback_AnswerOption"("optionId");

-- AddForeignKey
ALTER TABLE "Feedback_Form" ADD CONSTRAINT "Feedback_Form_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback_Form" ADD CONSTRAINT "Feedback_Form_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback_Section" ADD CONSTRAINT "Feedback_Section_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Feedback_Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback_Question" ADD CONSTRAINT "Feedback_Question_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Feedback_Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback_Question" ADD CONSTRAINT "Feedback_Question_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Feedback_Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback_QuestionOption" ADD CONSTRAINT "Feedback_QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Feedback_Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback_Submission" ADD CONSTRAINT "Feedback_Submission_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Feedback_Form"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback_Submission" ADD CONSTRAINT "Feedback_Submission_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback_Submission" ADD CONSTRAINT "Feedback_Submission_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback_Answer" ADD CONSTRAINT "Feedback_Answer_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Feedback_Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback_Answer" ADD CONSTRAINT "Feedback_Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Feedback_Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback_AnswerOption" ADD CONSTRAINT "Feedback_AnswerOption_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Feedback_Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback_AnswerOption" ADD CONSTRAINT "Feedback_AnswerOption_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Feedback_QuestionOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
