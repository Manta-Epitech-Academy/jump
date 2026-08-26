/*
  Warnings:

  - You are about to drop the `Interview` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `interviewDocsExportedAt` on the `StaffProfile` table.
  - You are about to drop the `InterviewReset` table. If the table is not empty, all the data it contains will be lost.

*/
-- Two of those three warnings are Prisma reading a rename as a drop, and the third
-- is preceded by a backfill. Checked against the production snapshot of 2026-07-10
-- before writing this: 1412 interviews over 15 events, 1397 of them finalised, 3
-- reset-audit rows, and no orphan participation. Every one of the 52 distinct
-- questionnaire values present in the data resolves to an option seeded below, and
-- the 4 verdict values map onto the new enum, so the backfill needs no fallback
-- branch. Nothing is dropped here that is not first carried across.
--
--   * `InterviewReset` is RENAMED to `Closing_ResetEvent`, constraints and index
--     included, so its 3 rows stay where they are.
--   * `StaffProfile.interviewDocsExportedAt` is RENAMED, not re-created, so each
--     admin keeps their export high-water mark.
--   * `Interview` is converted row by row into `Closing_Record` + `Closing_Answer`
--     (+ `Closing_AnswerOption`) below, and only then dropped.
--
-- The closing questionnaire stops being columns and becomes rows, in two layers.
--
-- A BANK (`Closing_Question` + `Closing_Option`) holds every question that exists,
-- once. A COMPOSITION (`Closing_Template` + section + question rows) says which of
-- them a given event's closings ask, in what order, and with what wording. The two
-- are separate because the same question is asked at a stage and at a Coding Club:
-- one row asked by both is what lets a distribution span them, where four copies of
-- a question could never legitimately be added up.
--
-- This is the one place the family departs from `Feedback_*`, where a question
-- belongs to a single form. A feedback form is authored per form in talent-facing
-- wording; closing questions are one institutional vocabulary composed by one team.
--
-- Everything below the seed is authored at runtime over the admin API from here on.
-- The seed exists to carry today's grid across, not to be the catalogue.

-- CreateEnum
CREATE TYPE "ClosingStatus" AS ENUM ('in_progress', 'done');

-- CreateEnum
CREATE TYPE "ClosingRecommendation" AS ENUM ('tres_compatible', 'bon_profil', 'indecis', 'pas_interesse');

-- CreateEnum
CREATE TYPE "Closing_QuestionKind" AS ENUM ('single', 'multi', 'rating', 'text');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "closingTemplateId" TEXT;

-- AlterTable
ALTER TABLE "EventConfig_Template" ADD COLUMN     "closingTemplateId" TEXT;

-- RenameColumn: a high-water mark per admin, so re-creating it would silently
-- re-offer every closing already archived as "since your last export".
ALTER TABLE "StaffProfile" RENAME COLUMN "interviewDocsExportedAt" TO "closingDocsExportedAt";

-- RenameTable: the reset-audit ledger is unchanged in shape. Its constraints and
-- index are renamed with it so a later introspection does not read the old names
-- as drift.
ALTER TABLE "InterviewReset" RENAME TO "Closing_ResetEvent";
ALTER TABLE "Closing_ResetEvent" RENAME CONSTRAINT "InterviewReset_pkey" TO "Closing_ResetEvent_pkey";
ALTER TABLE "Closing_ResetEvent" RENAME CONSTRAINT "InterviewReset_talentId_fkey" TO "Closing_ResetEvent_talentId_fkey";
ALTER TABLE "Closing_ResetEvent" RENAME CONSTRAINT "InterviewReset_resetByStaffId_fkey" TO "Closing_ResetEvent_resetByStaffId_fkey";
ALTER INDEX "InterviewReset_talentId_createdAt_idx" RENAME TO "Closing_ResetEvent_talentId_createdAt_idx";

-- CreateTable
CREATE TABLE "Closing_Question" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "hint" TEXT,
    "kind" "Closing_QuestionKind" NOT NULL,
    "max" INTEGER,
    "maxLength" INTEGER,
    "placeholder" TEXT,
    "notePlaceholder" TEXT,
    "testimonial" BOOLEAN NOT NULL DEFAULT false,
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Closing_Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Closing_Option" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tone" TEXT,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Closing_Option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Closing_Template" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Closing_Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Closing_TemplateSection" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "synthesisPosition" INTEGER,
    "title" TEXT NOT NULL,

    CONSTRAINT "Closing_TemplateSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Closing_TemplateQuestion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "labelOverride" TEXT,
    "withNote" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Closing_TemplateQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Closing_Record" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "participationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" "ClosingStatus" NOT NULL DEFAULT 'in_progress',
    "conductedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recommendation" "ClosingRecommendation",
    "verdictNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Closing_Record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Closing_Answer" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "ratingValue" INTEGER,
    "freeText" TEXT,
    "note" TEXT,

    CONSTRAINT "Closing_Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Closing_AnswerOption" (
    "answerId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,

    CONSTRAINT "Closing_AnswerOption_pkey" PRIMARY KEY ("answerId","optionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Closing_Question_key_key" ON "Closing_Question"("key");

-- CreateIndex
CREATE INDEX "Closing_Question_retiredAt_idx" ON "Closing_Question"("retiredAt");

-- CreateIndex
CREATE INDEX "Closing_Option_questionId_position_idx" ON "Closing_Option"("questionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Closing_Option_questionId_value_key" ON "Closing_Option"("questionId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "Closing_Template_key_key" ON "Closing_Template"("key");

-- CreateIndex
CREATE INDEX "Closing_TemplateSection_templateId_position_idx" ON "Closing_TemplateSection"("templateId", "position");

-- CreateIndex
CREATE INDEX "Closing_TemplateQuestion_sectionId_position_idx" ON "Closing_TemplateQuestion"("sectionId", "position");

-- CreateIndex
CREATE INDEX "Closing_TemplateQuestion_questionId_idx" ON "Closing_TemplateQuestion"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "Closing_TemplateQuestion_templateId_questionId_key" ON "Closing_TemplateQuestion"("templateId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "Closing_Record_participationId_key" ON "Closing_Record"("participationId");

-- CreateIndex
CREATE INDEX "Closing_Record_talentId_idx" ON "Closing_Record"("talentId");

-- CreateIndex
CREATE INDEX "Closing_Record_staffId_idx" ON "Closing_Record"("staffId");

-- CreateIndex
CREATE INDEX "Closing_Record_campusId_idx" ON "Closing_Record"("campusId");

-- CreateIndex
CREATE INDEX "Closing_Record_templateId_idx" ON "Closing_Record"("templateId");

-- CreateIndex
CREATE INDEX "Closing_Record_conductedAt_idx" ON "Closing_Record"("conductedAt");

-- CreateIndex
CREATE INDEX "Closing_Answer_questionId_idx" ON "Closing_Answer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "Closing_Answer_recordId_questionId_key" ON "Closing_Answer"("recordId", "questionId");

-- CreateIndex
CREATE INDEX "Closing_AnswerOption_optionId_idx" ON "Closing_AnswerOption"("optionId");

-- CreateIndex
CREATE INDEX "Event_closingTemplateId_idx" ON "Event"("closingTemplateId");

-- CreateIndex
CREATE INDEX "EventConfig_Template_closingTemplateId_idx" ON "EventConfig_Template"("closingTemplateId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_closingTemplateId_fkey" FOREIGN KEY ("closingTemplateId") REFERENCES "Closing_Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventConfig_Template" ADD CONSTRAINT "EventConfig_Template_closingTemplateId_fkey" FOREIGN KEY ("closingTemplateId") REFERENCES "Closing_Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Closing_Option" ADD CONSTRAINT "Closing_Option_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Closing_Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Closing_TemplateSection" ADD CONSTRAINT "Closing_TemplateSection_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Closing_Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Closing_TemplateQuestion" ADD CONSTRAINT "Closing_TemplateQuestion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Closing_Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Closing_TemplateQuestion" ADD CONSTRAINT "Closing_TemplateQuestion_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Closing_TemplateSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Closing_TemplateQuestion" ADD CONSTRAINT "Closing_TemplateQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Closing_Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Closing_Record" ADD CONSTRAINT "Closing_Record_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Closing_Record" ADD CONSTRAINT "Closing_Record_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Closing_Record" ADD CONSTRAINT "Closing_Record_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Closing_Record" ADD CONSTRAINT "Closing_Record_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "Participation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Closing_Record" ADD CONSTRAINT "Closing_Record_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Closing_Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Closing_Answer" ADD CONSTRAINT "Closing_Answer_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Closing_Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Closing_Answer" ADD CONSTRAINT "Closing_Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Closing_Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Closing_AnswerOption" ADD CONSTRAINT "Closing_AnswerOption_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Closing_Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Closing_AnswerOption" ADD CONSTRAINT "Closing_AnswerOption_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Closing_Option"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data Seed: the question bank as it stands today, one row per question.
-- Ids are readable rather than generated, because the composition and the backfill
-- below both point at them and a reader should be able to tell which. `key` is the
-- natural key the write operations quote; it is never renamed, since a question
-- whose meaning changes is a new key rather than an edit to this one.
--
-- Three labels are deliberately NOT the wording the stage reads aloud. The bank
-- holds the canonical name a figure is quoted under ("Satisfaction globale"), and
-- the composition below overrides the prompt per grid ("Satisfaction globale du
-- stage"), which is what will let a Coding Club ask the same question in its own
-- words and still be comparable.

INSERT INTO "Closing_Question" ("id", "key", "label", "hint", "kind", "max", "maxLength", "placeholder", "notePlaceholder", "testimonial", "updatedAt")
VALUES
  ('clq_discovery_channel', 'discovery_channel', 'Comment as-tu connu cet événement ?', NULL, 'single'::"Closing_QuestionKind", NULL, NULL, NULL, 'Autre canal, ou une précision sur sa réponse…', false, CURRENT_TIMESTAMP),
  ('clq_motivation', 'motivation', 'Qu’est-ce qui te motive à te former dans la tech ?', NULL, 'single'::"Closing_QuestionKind", NULL, NULL, NULL, 'Ce qui ressort de sa motivation…', false, CURRENT_TIMESTAMP),
  ('clq_specialties', 'specialties', 'Spécialités envisagées (1re / terminale)', NULL, 'multi'::"Closing_QuestionKind", NULL, NULL, NULL, 'Autre spécialité, ou un détail…', false, CURRENT_TIMESTAMP),
  ('clq_orientation_talk', 'orientation_talk', 'On te parle d’orientation vers la tech dans ton lycée ?', NULL, 'single'::"Closing_QuestionKind", NULL, NULL, NULL, 'Ce qu’on lui dit, et par qui…', false, CURRENT_TIMESTAMP),
  ('clq_passionate_teacher', 'passionate_teacher', 'Dans ton lycée, un prof de maths ou de NSI qui organise plein de choses ?', 'Un prof passionné, qui aime monter des concours ou des challenges : on aimerait organiser des ateliers avec ton lycée.', 'single'::"Closing_QuestionKind", NULL, NULL, NULL, 'Nom du prof, matière, ce qu’il organise…', false, CURRENT_TIMESTAMP),
  ('clq_tech_projection', 'tech_projection', 'Vers quels métiers / domaines tu te projettes ?', NULL, 'multi'::"Closing_QuestionKind", NULL, NULL, NULL, 'Un métier précis, une nuance…', false, CURRENT_TIMESTAMP),
  ('clq_other_jobs', 'other_jobs', 'Quels autres métiers (hors tech) t’intéressent ?', NULL, 'multi'::"Closing_QuestionKind", NULL, NULL, NULL, 'Autre métier, ou une précision…', false, CURRENT_TIMESTAMP),
  ('clq_info_sources', 'info_sources', 'Où t’informes-tu sur ton orientation et les métiers ?', NULL, 'multi'::"Closing_QuestionKind", NULL, NULL, NULL, 'Autre source, un compte qu’il suit…', false, CURRENT_TIMESTAMP),
  ('clq_wants_more', 'wants_more', 'Ça t’a donné envie d’aller plus loin dans la tech ?', NULL, 'single'::"Closing_QuestionKind", NULL, NULL, NULL, 'Ce qui motive ou freine son envie…', false, CURRENT_TIMESTAMP),
  ('clq_satisfaction', 'satisfaction', 'Satisfaction globale', NULL, 'rating'::"Closing_QuestionKind", 5, NULL, NULL, 'Ce qui explique sa note…', false, CURRENT_TIMESTAMP),
  ('clq_one_sentence', 'one_sentence', 'L’événement en une phrase', 'Idéal pour un témoignage com.', 'text'::"Closing_QuestionKind", NULL, 2000, 'La phrase du stagiaire, mot pour mot…', NULL, true, CURRENT_TIMESTAMP),
  ('clq_next_year_events', 'next_year_events', 'L’an prochain, à quel type d’événement aimerais-tu participer ?', NULL, 'multi'::"Closing_QuestionKind", NULL, NULL, NULL, 'Un autre format, une envie précise…', false, CURRENT_TIMESTAMP);

-- The options each question offers. `tone` is set only on ordinal answers, where a
-- green/amber/red chip reads as valence; categorical options leave it null because
-- colour there would imply a ranking that is not real.
INSERT INTO "Closing_Option" ("id", "questionId", "position", "value", "label", "tone", "icon", "updatedAt")
VALUES
  ('clo_discovery_channel_site_1e1s', 'clq_discovery_channel', 0, 'site_1e1s', 'Site 1élève1stage', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_discovery_channel_entourage', 'clq_discovery_channel', 1, 'entourage', 'Mon entourage', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_discovery_channel_google', 'clq_discovery_channel', 2, 'google', 'Recherche Google', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_discovery_channel_epitech', 'clq_discovery_channel', 3, 'epitech', 'Par Epitech', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_discovery_channel_autre', 'clq_discovery_channel', 4, 'autre', 'Autre', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_motivation_passion', 'clq_motivation', 0, 'passion', 'J’adore la tech, c’est ma passion', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_motivation_metier', 'clq_motivation', 1, 'metier', 'Je veux en faire mon métier', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_motivation_curiosite', 'clq_motivation', 2, 'curiosite', 'Je suis curieux·se par nature', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_motivation_cadre_stage', 'clq_motivation', 3, 'cadre_stage', 'Juste dans le cadre du stage', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_specialties_maths', 'clq_specialties', 0, 'maths', 'Maths', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_specialties_nsi', 'clq_specialties', 1, 'nsi', 'NSI', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_specialties_physique_chimie', 'clq_specialties', 2, 'physique_chimie', 'Physique-Chimie', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_specialties_svt', 'clq_specialties', 3, 'svt', 'SVT', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_specialties_ses', 'clq_specialties', 4, 'ses', 'SES', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_specialties_sciences_ingenieur', 'clq_specialties', 5, 'sciences_ingenieur', 'Sciences de l’ingénieur', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_specialties_autre', 'clq_specialties', 6, 'autre', 'Autre', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_specialties_indecis', 'clq_specialties', 7, 'indecis', 'Pas encore décidé', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_orientation_talk_souvent', 'clq_orientation_talk', 0, 'souvent', 'Oui, souvent', 'positive', NULL, CURRENT_TIMESTAMP),
  ('clo_orientation_talk_un_peu', 'clq_orientation_talk', 1, 'un_peu', 'Un peu', 'neutral', NULL, CURRENT_TIMESTAMP),
  ('clo_orientation_talk_pas_du_tout', 'clq_orientation_talk', 2, 'pas_du_tout', 'Pas du tout', 'negative', NULL, CURRENT_TIMESTAMP),
  ('clo_passionate_teacher_oui', 'clq_passionate_teacher', 0, 'oui', 'Oui', 'positive', NULL, CURRENT_TIMESTAMP),
  ('clo_passionate_teacher_pas_sur', 'clq_passionate_teacher', 1, 'pas_sur', 'Je ne vois pas / pas sûr·e', 'neutral', NULL, CURRENT_TIMESTAMP),
  ('clo_tech_projection_dev', 'clq_tech_projection', 0, 'dev', 'Dev', NULL, 'dev', CURRENT_TIMESTAMP),
  ('clo_tech_projection_cyber', 'clq_tech_projection', 1, 'cyber', 'Cyber', NULL, 'cyber', CURRENT_TIMESTAMP),
  ('clo_tech_projection_ia_data', 'clq_tech_projection', 2, 'ia_data', 'IA / Data', NULL, 'ia', CURRENT_TIMESTAMP),
  ('clo_tech_projection_jeux_video', 'clq_tech_projection', 3, 'jeux_video', 'Jeux vidéo', NULL, 'jeux_video', CURRENT_TIMESTAMP),
  ('clo_tech_projection_design', 'clq_tech_projection', 4, 'design', 'Design', NULL, 'design', CURRENT_TIMESTAMP),
  ('clo_tech_projection_reseaux_systemes', 'clq_tech_projection', 5, 'reseaux_systemes', 'Réseaux / Systèmes', NULL, 'reseaux', CURRENT_TIMESTAMP),
  ('clo_tech_projection_pas_idee', 'clq_tech_projection', 6, 'pas_idee', 'Pas encore d’idée', NULL, 'pas_idee', CURRENT_TIMESTAMP),
  ('clo_tech_projection_hors_tech', 'clq_tech_projection', 7, 'hors_tech', 'Plutôt hors tech', NULL, 'hors_tech', CURRENT_TIMESTAMP),
  ('clo_other_jobs_sante', 'clq_other_jobs', 0, 'sante', 'Santé', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_other_jobs_commerce_gestion', 'clq_other_jobs', 1, 'commerce_gestion', 'Commerce / Gestion', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_other_jobs_arts_design', 'clq_other_jobs', 2, 'arts_design', 'Arts / Design', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_other_jobs_sport', 'clq_other_jobs', 3, 'sport', 'Sport', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_other_jobs_autre', 'clq_other_jobs', 4, 'autre', 'Autre', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_info_sources_tiktok', 'clq_info_sources', 0, 'tiktok', 'TikTok', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_info_sources_instagram', 'clq_info_sources', 1, 'instagram', 'Instagram', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_info_sources_youtube', 'clq_info_sources', 2, 'youtube', 'YouTube', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_info_sources_google', 'clq_info_sources', 3, 'google', 'Google', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_info_sources_ia_chatgpt', 'clq_info_sources', 4, 'ia_chatgpt', 'IA / ChatGPT', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_info_sources_parcoursup_onisep', 'clq_info_sources', 5, 'parcoursup_onisep', 'Parcoursup / ONISEP', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_info_sources_entourage', 'clq_info_sources', 6, 'entourage', 'Mon entourage', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_info_sources_lycee', 'clq_info_sources', 7, 'lycee', 'Mon lycée', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_info_sources_autre', 'clq_info_sources', 8, 'autre', 'Autre', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_wants_more_oui', 'clq_wants_more', 0, 'oui', 'Oui carrément', 'positive', NULL, CURRENT_TIMESTAMP),
  ('clo_wants_more_peut_etre', 'clq_wants_more', 1, 'peut_etre', 'Peut-être', 'neutral', NULL, CURRENT_TIMESTAMP),
  ('clo_wants_more_pas_maintenant', 'clq_wants_more', 2, 'pas_maintenant', 'Pas pour le moment', 'negative', NULL, CURRENT_TIMESTAMP),
  ('clo_next_year_events_coding_club', 'clq_next_year_events', 0, 'coding_club', 'Coding Club', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_next_year_events_camp', 'clq_next_year_events', 1, 'camp', 'Camp', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_next_year_events_journee_decouverte', 'clq_next_year_events', 2, 'journee_decouverte', 'Journée Découverte', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_next_year_events_jpo', 'clq_next_year_events', 3, 'jpo', 'JPO', NULL, NULL, CURRENT_TIMESTAMP),
  ('clo_next_year_events_conference', 'clq_next_year_events', 4, 'conference', 'Conférence', NULL, NULL, CURRENT_TIMESTAMP);

-- Data Seed: the one grid that exists today, composed over the bank above.
INSERT INTO "Closing_Template" ("id", "key", "label", "updatedAt")
VALUES ('clt_stage_seconde', 'stage_seconde', 'Entretien d''orientation - stage de seconde', CURRENT_TIMESTAMP);

INSERT INTO "Closing_TemplateSection" ("id", "templateId", "position", "synthesisPosition", "title")
VALUES
  ('cls_stage_motivation', 'clt_stage_seconde', 0, 1, 'Motivation'),
  ('cls_stage_lycee', 'clt_stage_seconde', 1, 3, 'Lycée'),
  ('cls_stage_orientation', 'clt_stage_seconde', 2, 2, 'Orientation'),
  ('cls_stage_retour', 'clt_stage_seconde', 3, 0, 'Retour sur le stage');

-- `withNote` is true wherever the interview offered a per-question note column,
-- which is every question but the testimonial. A shorter grid can offer none.
INSERT INTO "Closing_TemplateQuestion" ("id", "templateId", "sectionId", "questionId", "position", "labelOverride", "withNote")
VALUES
  ('cltq_stage_discovery_channel', 'clt_stage_seconde', 'cls_stage_motivation', 'clq_discovery_channel', 0, 'Comment as-tu connu ce stage ?', true),
  ('cltq_stage_motivation', 'clt_stage_seconde', 'cls_stage_motivation', 'clq_motivation', 1, NULL, true),
  ('cltq_stage_specialties', 'clt_stage_seconde', 'cls_stage_lycee', 'clq_specialties', 0, NULL, true),
  ('cltq_stage_orientation_talk', 'clt_stage_seconde', 'cls_stage_lycee', 'clq_orientation_talk', 1, NULL, true),
  ('cltq_stage_passionate_teacher', 'clt_stage_seconde', 'cls_stage_lycee', 'clq_passionate_teacher', 2, NULL, true),
  ('cltq_stage_tech_projection', 'clt_stage_seconde', 'cls_stage_orientation', 'clq_tech_projection', 0, NULL, true),
  ('cltq_stage_other_jobs', 'clt_stage_seconde', 'cls_stage_orientation', 'clq_other_jobs', 1, NULL, true),
  ('cltq_stage_info_sources', 'clt_stage_seconde', 'cls_stage_orientation', 'clq_info_sources', 2, NULL, true),
  ('cltq_stage_wants_more', 'clt_stage_seconde', 'cls_stage_retour', 'clq_wants_more', 0, NULL, true),
  ('cltq_stage_satisfaction', 'clt_stage_seconde', 'cls_stage_retour', 'clq_satisfaction', 1, 'Satisfaction globale du stage', true),
  ('cltq_stage_one_sentence', 'clt_stage_seconde', 'cls_stage_retour', 'clq_one_sentence', 2, 'Le stage en une phrase', false),
  ('cltq_stage_next_year_events', 'clt_stage_seconde', 'cls_stage_retour', 'clq_next_year_events', 3, NULL, true);

-- Data Backfill: every interview becomes a closing conducted with that grid.
-- `conductedAt` and `createdAt` are carried across unchanged: the first means
-- FINALISED (it is re-stamped at clôture) and the archive's ordering, its date
-- windowing and each admin's export high-water mark all read it.
INSERT INTO "Closing_Record" ("id", "talentId", "staffId", "campusId", "participationId", "templateId", "status", "conductedAt", "recommendation", "verdictNote", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  i."talentId", i."staffId", i."campusId", i."participationId",
  'clt_stage_seconde',
  i."status"::text::"ClosingStatus",
  i."conductedAt",
  i."recommendation"::text::"ClosingRecommendation",
  NULLIF(i."verdictNote", ''),
  i."createdAt",
  i."updatedAt"
FROM "Interview" i;

-- discovery_channel
INSERT INTO "Closing_Answer" ("id", "recordId", "questionId", "note")
SELECT gen_random_uuid()::text, r."id", 'clq_discovery_channel', NULLIF(i."discoveryChannelNote", '')
FROM "Interview" i
JOIN "Closing_Record" r ON r."participationId" = i."participationId"
WHERE i."discoveryChannel" IS NOT NULL OR NULLIF(i."discoveryChannelNote", '') IS NOT NULL;

INSERT INTO "Closing_AnswerOption" ("answerId", "optionId")
SELECT a."id", o."id"
FROM "Interview" i
JOIN "Closing_Record" r ON r."participationId" = i."participationId"
JOIN "Closing_Answer" a ON a."recordId" = r."id" AND a."questionId" = 'clq_discovery_channel'
JOIN "Closing_Option" o ON o."questionId" = 'clq_discovery_channel' AND o."value" = i."discoveryChannel"::text
WHERE i."discoveryChannel" IS NOT NULL;

-- motivation
INSERT INTO "Closing_Answer" ("id", "recordId", "questionId", "note")
SELECT gen_random_uuid()::text, r."id", 'clq_motivation', NULLIF(i."motivationNote", '')
FROM "Interview" i
JOIN "Closing_Record" r ON r."participationId" = i."participationId"
WHERE i."motivation" IS NOT NULL OR NULLIF(i."motivationNote", '') IS NOT NULL;

INSERT INTO "Closing_AnswerOption" ("answerId", "optionId")
SELECT a."id", o."id"
FROM "Interview" i
JOIN "Closing_Record" r ON r."participationId" = i."participationId"
JOIN "Closing_Answer" a ON a."recordId" = r."id" AND a."questionId" = 'clq_motivation'
JOIN "Closing_Option" o ON o."questionId" = 'clq_motivation' AND o."value" = i."motivation"::text
WHERE i."motivation" IS NOT NULL;

-- specialties
INSERT INTO "Closing_Answer" ("id", "recordId", "questionId", "note")
SELECT gen_random_uuid()::text, r."id", 'clq_specialties', NULLIF(i."specialtiesNote", '')
FROM "Interview" i
JOIN "Closing_Record" r ON r."participationId" = i."participationId"
WHERE COALESCE(array_length(i."specialties", 1), 0) > 0 OR NULLIF(i."specialtiesNote", '') IS NOT NULL;

INSERT INTO "Closing_AnswerOption" ("answerId", "optionId")
SELECT DISTINCT a."id", o."id"
FROM "Interview" i
JOIN "Closing_Record" r ON r."participationId" = i."participationId"
JOIN "Closing_Answer" a ON a."recordId" = r."id" AND a."questionId" = 'clq_specialties'
CROSS JOIN LATERAL unnest(i."specialties") AS picked
JOIN "Closing_Option" o ON o."questionId" = 'clq_specialties' AND o."value" = picked::text;

-- orientation_talk
INSERT INTO "Closing_Answer" ("id", "recordId", "questionId", "note")
SELECT gen_random_uuid()::text, r."id", 'clq_orientation_talk', NULLIF(i."orientationTalkNote", '')
FROM "Interview" i
JOIN "Closing_Record" r ON r."participationId" = i."participationId"
WHERE i."orientationTalkAtSchool" IS NOT NULL OR NULLIF(i."orientationTalkNote", '') IS NOT NULL;

INSERT INTO "Closing_AnswerOption" ("answerId", "optionId")
SELECT a."id", o."id"
FROM "Interview" i
JOIN "Closing_Record" r ON r."participationId" = i."participationId"
JOIN "Closing_Answer" a ON a."recordId" = r."id" AND a."questionId" = 'clq_orientation_talk'
JOIN "Closing_Option" o ON o."questionId" = 'clq_orientation_talk' AND o."value" = i."orientationTalkAtSchool"::text
WHERE i."orientationTalkAtSchool" IS NOT NULL;

-- passionate_teacher
INSERT INTO "Closing_Answer" ("id", "recordId", "questionId", "note")
SELECT gen_random_uuid()::text, r."id", 'clq_passionate_teacher', NULLIF(i."passionateTeacherNote", '')
FROM "Interview" i
JOIN "Closing_Record" r ON r."participationId" = i."participationId"
WHERE i."passionateTeacher" IS NOT NULL OR NULLIF(i."passionateTeacherNote", '') IS NOT NULL;

INSERT INTO "Closing_AnswerOption" ("answerId", "optionId")
SELECT a."id", o."id"
FROM "Interview" i
JOIN "Closing_Record" r ON r."participationId" = i."participationId"
JOIN "Closing_Answer" a ON a."recordId" = r."id" AND a."questionId" = 'clq_passionate_teacher'
JOIN "Closing_Option" o ON o."questionId" = 'clq_passionate_teacher' AND o."value" = i."passionateTeacher"::text
WHERE i."passionateTeacher" IS NOT NULL;

-- tech_projection
INSERT INTO "Closing_Answer" ("id", "recordId", "questionId", "note")
SELECT gen_random_uuid()::text, r."id", 'clq_tech_projection', NULLIF(i."techProjectionNote", '')
FROM "Interview" i
JOIN "Closing_Record" r ON r."participationId" = i."participationId"
WHERE COALESCE(array_length(i."techProjection", 1), 0) > 0 OR NULLIF(i."techProjectionNote", '') IS NOT NULL;

INSERT INTO "Closing_AnswerOption" ("answerId", "optionId")
SELECT DISTINCT a."id", o."id"
FROM "Interview" i
JOIN "Closing_Record" r ON r."participationId" = i."participationId"
JOIN "Closing_Answer" a ON a."recordId" = r."id" AND a."questionId" = 'clq_tech_projection'
CROSS JOIN LATERAL unnest(i."techProjection") AS picked
JOIN "Closing_Option" o ON o."questionId" = 'clq_tech_projection' AND o."value" = picked::text;

-- other_jobs
INSERT INTO "Closing_Answer" ("id", "recordId", "questionId", "note")
SELECT gen_random_uuid()::text, r."id", 'clq_other_jobs', NULLIF(i."otherJobsNote", '')
FROM "Interview" i
JOIN "Closing_Record" r ON r."participationId" = i."participationId"
WHERE COALESCE(array_length(i."otherJobs", 1), 0) > 0 OR NULLIF(i."otherJobsNote", '') IS NOT NULL;

INSERT INTO "Closing_AnswerOption" ("answerId", "optionId")
SELECT DISTINCT a."id", o."id"
FROM "Interview" i
JOIN "Closing_Record" r ON r."participationId" = i."participationId"
JOIN "Closing_Answer" a ON a."recordId" = r."id" AND a."questionId" = 'clq_other_jobs'
CROSS JOIN LATERAL unnest(i."otherJobs") AS picked
JOIN "Closing_Option" o ON o."questionId" = 'clq_other_jobs' AND o."value" = picked::text;

-- info_sources
INSERT INTO "Closing_Answer" ("id", "recordId", "questionId", "note")
SELECT gen_random_uuid()::text, r."id", 'clq_info_sources', NULLIF(i."infoSourcesNote", '')
FROM "Interview" i
JOIN "Closing_Record" r ON r."participationId" = i."participationId"
WHERE COALESCE(array_length(i."infoSources", 1), 0) > 0 OR NULLIF(i."infoSourcesNote", '') IS NOT NULL;

INSERT INTO "Closing_AnswerOption" ("answerId", "optionId")
SELECT DISTINCT a."id", o."id"
FROM "Interview" i
JOIN "Closing_Record" r ON r."participationId" = i."participationId"
JOIN "Closing_Answer" a ON a."recordId" = r."id" AND a."questionId" = 'clq_info_sources'
CROSS JOIN LATERAL unnest(i."infoSources") AS picked
JOIN "Closing_Option" o ON o."questionId" = 'clq_info_sources' AND o."value" = picked::text;

-- wants_more
INSERT INTO "Closing_Answer" ("id", "recordId", "questionId", "note")
SELECT gen_random_uuid()::text, r."id", 'clq_wants_more', NULLIF(i."wantsMoreNote", '')
FROM "Interview" i
JOIN "Closing_Record" r ON r."participationId" = i."participationId"
WHERE i."wantsMore" IS NOT NULL OR NULLIF(i."wantsMoreNote", '') IS NOT NULL;

INSERT INTO "Closing_AnswerOption" ("answerId", "optionId")
SELECT a."id", o."id"
FROM "Interview" i
JOIN "Closing_Record" r ON r."participationId" = i."participationId"
JOIN "Closing_Answer" a ON a."recordId" = r."id" AND a."questionId" = 'clq_wants_more'
JOIN "Closing_Option" o ON o."questionId" = 'clq_wants_more' AND o."value" = i."wantsMore"::text
WHERE i."wantsMore" IS NOT NULL;

-- satisfaction
INSERT INTO "Closing_Answer" ("id", "recordId", "questionId", "ratingValue", "note")
SELECT gen_random_uuid()::text, r."id", 'clq_satisfaction', i."satisfactionStars", NULLIF(i."satisfactionNote", '')
FROM "Interview" i
JOIN "Closing_Record" r ON r."participationId" = i."participationId"
WHERE i."satisfactionStars" IS NOT NULL OR NULLIF(i."satisfactionNote", '') IS NOT NULL;

-- one_sentence: the student's own words, and the only answer this grid marks quotable.
INSERT INTO "Closing_Answer" ("id", "recordId", "questionId", "freeText")
SELECT gen_random_uuid()::text, r."id", 'clq_one_sentence', NULLIF(i."oneSentence", '')
FROM "Interview" i
JOIN "Closing_Record" r ON r."participationId" = i."participationId"
WHERE NULLIF(i."oneSentence", '') IS NOT NULL;

-- next_year_events
INSERT INTO "Closing_Answer" ("id", "recordId", "questionId", "note")
SELECT gen_random_uuid()::text, r."id", 'clq_next_year_events', NULLIF(i."nextYearEventsNote", '')
FROM "Interview" i
JOIN "Closing_Record" r ON r."participationId" = i."participationId"
WHERE COALESCE(array_length(i."nextYearEvents", 1), 0) > 0 OR NULLIF(i."nextYearEventsNote", '') IS NOT NULL;

INSERT INTO "Closing_AnswerOption" ("answerId", "optionId")
SELECT DISTINCT a."id", o."id"
FROM "Interview" i
JOIN "Closing_Record" r ON r."participationId" = i."participationId"
JOIN "Closing_Answer" a ON a."recordId" = r."id" AND a."questionId" = 'clq_next_year_events'
CROSS JOIN LATERAL unnest(i."nextYearEvents") AS picked
JOIN "Closing_Option" o ON o."questionId" = 'clq_next_year_events' AND o."value" = picked::text;

-- Data Backfill: every event that exposes the closings surface asks the one grid
-- that existed, since it was the only one there was. Runs before the module key is
-- renamed below, so it still matches on the old value.
UPDATE "Event" e
SET "closingTemplateId" = 'clt_stage_seconde'
WHERE EXISTS (
  SELECT 1 FROM "EventConfig_Module" m
  WHERE m."eventId" = e."id" AND m."moduleKey" = 'entretiens'
);

-- Same for the config presets, which carry the module set too. Without this a saved
-- preset would silently drop the grid on the way through.
UPDATE "EventConfig_Template" t
SET "closingTemplateId" = 'clt_stage_seconde'
WHERE EXISTS (
  SELECT 1 FROM "EventConfig_TemplateModule" m
  WHERE m."templateId" = t."id" AND m."moduleKey" = 'entretiens'
);

-- The module key and the route segment are one value in code (`segment:
-- EventModuleKey`), so the business rename of "entretiens" to "closings" moves the
-- stored key with it rather than leaving the database speaking a retired word.
UPDATE "EventConfig_Module" SET "moduleKey" = 'closings' WHERE "moduleKey" = 'entretiens';
UPDATE "EventConfig_TemplateModule" SET "moduleKey" = 'closings' WHERE "moduleKey" = 'entretiens';

-- Everything the interview held now lives in the tables above.
-- DropForeignKey
ALTER TABLE "Interview" DROP CONSTRAINT "Interview_campusId_fkey";

-- DropForeignKey
ALTER TABLE "Interview" DROP CONSTRAINT "Interview_participationId_fkey";

-- DropForeignKey
ALTER TABLE "Interview" DROP CONSTRAINT "Interview_staffId_fkey";

-- DropForeignKey
ALTER TABLE "Interview" DROP CONSTRAINT "Interview_talentId_fkey";

-- DropTable
DROP TABLE "Interview";

-- DropEnum
DROP TYPE "DiscoveryChannel";

-- DropEnum
DROP TYPE "InfoSource";

-- DropEnum
DROP TYPE "InterviewMotivation";

-- DropEnum
DROP TYPE "InterviewRecommendation";

-- DropEnum
DROP TYPE "InterviewStatus";

-- DropEnum
DROP TYPE "NextYearEvent";

-- DropEnum
DROP TYPE "OrientationTalkFrequency";

-- DropEnum
DROP TYPE "OtherJobDomain";

-- DropEnum
DROP TYPE "PassionateTeacherAnswer";

-- DropEnum
DROP TYPE "Specialty";

-- DropEnum
DROP TYPE "TechProjection";

-- DropEnum
DROP TYPE "WantsMoreAnswer";
