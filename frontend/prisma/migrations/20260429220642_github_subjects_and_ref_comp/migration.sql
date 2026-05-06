-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "subjectVersionId" TEXT;

-- AlterTable
ALTER TABLE "ActivityTemplate" ADD COLUMN     "subjectId" TEXT,
ADD COLUMN     "subjectVersionId" TEXT;

-- CreateTable
CREATE TABLE "RefCompSnapshot" (
    "id" TEXT NOT NULL,
    "commitSha" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RefCompSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competence" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "desc" TEXT NOT NULL,

    CONSTRAINT "Competence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "competenceId" TEXT NOT NULL,
    "numericId" INTEGER NOT NULL,
    "shortName" TEXT NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillLevel" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "desc" TEXT NOT NULL,

    CONSTRAINT "SkillLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Observable" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "skillLevelId" TEXT NOT NULL,
    "projectSlug" TEXT NOT NULL,
    "externalId" INTEGER NOT NULL,
    "desc" TEXT NOT NULL,

    CONSTRAINT "Observable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectVersion" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "repoCommitSha" TEXT NOT NULL,
    "refCompSnapshotId" TEXT NOT NULL,
    "metadataJson" JSONB NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedById" TEXT NOT NULL,

    CONSTRAINT "SubjectVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "subjectVersionId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "rawMd" TEXT NOT NULL,
    "renderedHtml" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "subjectVersionId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "anchor" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectObservable" (
    "id" TEXT NOT NULL,
    "subjectVersionId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "observableId" TEXT NOT NULL,

    CONSTRAINT "SubjectObservable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectQuiz" (
    "id" TEXT NOT NULL,
    "subjectVersionId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "fqn" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "expectedCount" INTEGER,
    "level" TEXT NOT NULL,
    "externalIndex" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "canonicalAnswer" JSONB,

    CONSTRAINT "SubjectQuiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentObservableState" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "observableId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "observedById" TEXT,
    "observedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TalentObservableState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentCompetenceState" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "skillLevelId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "certifiedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalentCompetenceState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentQuizAttempt" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "submitted" JSONB NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TalentQuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefCompSnapshot_commitSha_key" ON "RefCompSnapshot"("commitSha");

-- CreateIndex
CREATE INDEX "RefCompSnapshot_isCurrent_idx" ON "RefCompSnapshot"("isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "Competence_snapshotId_domain_key" ON "Competence"("snapshotId", "domain");

-- CreateIndex
CREATE INDEX "Skill_snapshotId_idx" ON "Skill"("snapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_snapshotId_competenceId_numericId_key" ON "Skill"("snapshotId", "competenceId", "numericId");

-- CreateIndex
CREATE INDEX "SkillLevel_snapshotId_idx" ON "SkillLevel"("snapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillLevel_snapshotId_skillId_level_key" ON "SkillLevel"("snapshotId", "skillId", "level");

-- CreateIndex
CREATE INDEX "Observable_snapshotId_idx" ON "Observable"("snapshotId");

-- CreateIndex
CREATE INDEX "Observable_projectSlug_idx" ON "Observable"("projectSlug");

-- CreateIndex
CREATE UNIQUE INDEX "Observable_snapshotId_projectSlug_externalId_key" ON "Observable"("snapshotId", "projectSlug", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_repoUrl_key" ON "Subject"("repoUrl");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_slug_key" ON "Subject"("slug");

-- CreateIndex
CREATE INDEX "SubjectVersion_subjectId_idx" ON "SubjectVersion"("subjectId");

-- CreateIndex
CREATE INDEX "SubjectVersion_refCompSnapshotId_idx" ON "SubjectVersion"("refCompSnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectVersion_subjectId_repoCommitSha_key" ON "SubjectVersion"("subjectId", "repoCommitSha");

-- CreateIndex
CREATE INDEX "Document_subjectVersionId_idx" ON "Document"("subjectVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_subjectVersionId_path_key" ON "Document"("subjectVersionId", "path");

-- CreateIndex
CREATE INDEX "Section_subjectVersionId_idx" ON "Section"("subjectVersionId");

-- CreateIndex
CREATE INDEX "Section_documentId_idx" ON "Section"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "Section_subjectVersionId_documentId_anchor_key" ON "Section"("subjectVersionId", "documentId", "anchor");

-- CreateIndex
CREATE INDEX "SubjectObservable_subjectVersionId_idx" ON "SubjectObservable"("subjectVersionId");

-- CreateIndex
CREATE INDEX "SubjectObservable_observableId_idx" ON "SubjectObservable"("observableId");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectObservable_sectionId_observableId_key" ON "SubjectObservable"("sectionId", "observableId");

-- CreateIndex
CREATE INDEX "SubjectQuiz_subjectVersionId_idx" ON "SubjectQuiz"("subjectVersionId");

-- CreateIndex
CREATE INDEX "SubjectQuiz_documentId_idx" ON "SubjectQuiz"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectQuiz_subjectVersionId_fqn_key" ON "SubjectQuiz"("subjectVersionId", "fqn");

-- CreateIndex
CREATE INDEX "TalentObservableState_talentId_idx" ON "TalentObservableState"("talentId");

-- CreateIndex
CREATE INDEX "TalentObservableState_eventId_idx" ON "TalentObservableState"("eventId");

-- CreateIndex
CREATE INDEX "TalentObservableState_observableId_idx" ON "TalentObservableState"("observableId");

-- CreateIndex
CREATE INDEX "TalentObservableState_state_idx" ON "TalentObservableState"("state");

-- CreateIndex
CREATE UNIQUE INDEX "TalentObservableState_talentId_eventId_observableId_key" ON "TalentObservableState"("talentId", "eventId", "observableId");

-- CreateIndex
CREATE INDEX "TalentCompetenceState_talentId_idx" ON "TalentCompetenceState"("talentId");

-- CreateIndex
CREATE INDEX "TalentCompetenceState_skillLevelId_idx" ON "TalentCompetenceState"("skillLevelId");

-- CreateIndex
CREATE UNIQUE INDEX "TalentCompetenceState_talentId_skillLevelId_key" ON "TalentCompetenceState"("talentId", "skillLevelId");

-- CreateIndex
CREATE INDEX "TalentQuizAttempt_talentId_idx" ON "TalentQuizAttempt"("talentId");

-- CreateIndex
CREATE INDEX "TalentQuizAttempt_quizId_idx" ON "TalentQuizAttempt"("quizId");

-- CreateIndex
CREATE INDEX "TalentQuizAttempt_eventId_idx" ON "TalentQuizAttempt"("eventId");

-- CreateIndex
CREATE INDEX "Activity_subjectVersionId_idx" ON "Activity"("subjectVersionId");

-- CreateIndex
CREATE INDEX "ActivityTemplate_subjectId_idx" ON "ActivityTemplate"("subjectId");

-- CreateIndex
CREATE INDEX "ActivityTemplate_subjectVersionId_idx" ON "ActivityTemplate"("subjectVersionId");

-- AddForeignKey
ALTER TABLE "ActivityTemplate" ADD CONSTRAINT "ActivityTemplate_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityTemplate" ADD CONSTRAINT "ActivityTemplate_subjectVersionId_fkey" FOREIGN KEY ("subjectVersionId") REFERENCES "SubjectVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_subjectVersionId_fkey" FOREIGN KEY ("subjectVersionId") REFERENCES "SubjectVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competence" ADD CONSTRAINT "Competence_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "RefCompSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "RefCompSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "Competence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillLevel" ADD CONSTRAINT "SkillLevel_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "RefCompSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillLevel" ADD CONSTRAINT "SkillLevel_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observable" ADD CONSTRAINT "Observable_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "RefCompSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observable" ADD CONSTRAINT "Observable_skillLevelId_fkey" FOREIGN KEY ("skillLevelId") REFERENCES "SkillLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectVersion" ADD CONSTRAINT "SubjectVersion_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectVersion" ADD CONSTRAINT "SubjectVersion_refCompSnapshotId_fkey" FOREIGN KEY ("refCompSnapshotId") REFERENCES "RefCompSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectVersion" ADD CONSTRAINT "SubjectVersion_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_subjectVersionId_fkey" FOREIGN KEY ("subjectVersionId") REFERENCES "SubjectVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_subjectVersionId_fkey" FOREIGN KEY ("subjectVersionId") REFERENCES "SubjectVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectObservable" ADD CONSTRAINT "SubjectObservable_subjectVersionId_fkey" FOREIGN KEY ("subjectVersionId") REFERENCES "SubjectVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectObservable" ADD CONSTRAINT "SubjectObservable_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectObservable" ADD CONSTRAINT "SubjectObservable_observableId_fkey" FOREIGN KEY ("observableId") REFERENCES "Observable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectQuiz" ADD CONSTRAINT "SubjectQuiz_subjectVersionId_fkey" FOREIGN KEY ("subjectVersionId") REFERENCES "SubjectVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectQuiz" ADD CONSTRAINT "SubjectQuiz_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentObservableState" ADD CONSTRAINT "TalentObservableState_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentObservableState" ADD CONSTRAINT "TalentObservableState_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentObservableState" ADD CONSTRAINT "TalentObservableState_observableId_fkey" FOREIGN KEY ("observableId") REFERENCES "Observable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentObservableState" ADD CONSTRAINT "TalentObservableState_observedById_fkey" FOREIGN KEY ("observedById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentCompetenceState" ADD CONSTRAINT "TalentCompetenceState_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentCompetenceState" ADD CONSTRAINT "TalentCompetenceState_skillLevelId_fkey" FOREIGN KEY ("skillLevelId") REFERENCES "SkillLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentQuizAttempt" ADD CONSTRAINT "TalentQuizAttempt_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentQuizAttempt" ADD CONSTRAINT "TalentQuizAttempt_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "SubjectQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentQuizAttempt" ADD CONSTRAINT "TalentQuizAttempt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
