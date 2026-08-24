-- Certificates become data: a design is a row, and an event points at one.
--
-- Until now Jump could issue exactly one document, with its wording written into
-- `templates/stage-diploma.html`, and the only per-event control was a boolean
-- sub-option in `EventConfig_Module.settings` that turned that one document on or
-- off. A Coding Club could therefore issue nothing.
--
-- The boolean is retired here rather than kept beside the new column: "does this
-- event issue a certificate" and "which one" are the same question, and a null
-- `diplomaTemplateId` answers both. The two seeded rows carry the existing design
-- verbatim, split into the CSS the shell emits once and the markup it repeats per
-- page, so the internship certificate keeps rendering exactly as it did.

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "diplomaTemplateId" TEXT;

-- AlterTable
ALTER TABLE "EventConfig_Template" ADD COLUMN     "diplomaTemplateId" TEXT;

-- CreateTable
CREATE TABLE "Diploma_Template" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "styleCss" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "pageWidthPx" INTEGER NOT NULL,
    "pageHeightPx" INTEGER NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Diploma_Template_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Diploma_Template_code_key" ON "Diploma_Template"("code");

-- CreateIndex
CREATE INDEX "Event_diplomaTemplateId_idx" ON "Event"("diplomaTemplateId");

-- CreateIndex
CREATE INDEX "EventConfig_Template_diplomaTemplateId_idx" ON "EventConfig_Template"("diplomaTemplateId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_diplomaTemplateId_fkey" FOREIGN KEY ("diplomaTemplateId") REFERENCES "Diploma_Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventConfig_Template" ADD CONSTRAINT "EventConfig_Template_diplomaTemplateId_fkey" FOREIGN KEY ("diplomaTemplateId") REFERENCES "Diploma_Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diploma_Template" ADD CONSTRAINT "Diploma_Template_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diploma_Template" ADD CONSTRAINT "Diploma_Template_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The two certificates that exist today. Ids are readable rather than generated:
-- the backfill below points at one of them, and a reader should be able to tell
-- which. `code` is the natural key the write operations quote; it is never renamed.
--
-- Both share one design. They differ by their heading and by one sentence, which
-- is the whole reason this is data: a third certificate is now an INSERT, and the
-- Coding Club one below is the first document Jump can issue that nobody had to
-- deploy code for. Its French wording is a proposal pending Edouard's validation.
INSERT INTO "Diploma_Template" ("id", "code", "label", "styleCss", "bodyHtml", "pageWidthPx", "pageHeightPx", "updatedAt")
VALUES
  (
    'dpl_stage',
    'stage',
    'Certificat de stage',
    $css$html,
body {
  background-color: #ffffff;
  font-family: 'IBM Plex Sans', sans-serif;
  color: #0f172a;
}
.page {
  background-color: #ffffff;
}
/* Thin full border framing the whole page. */
.frame {
  position: absolute;
  top: 24px;
  right: 24px;
  bottom: 24px;
  left: 24px;
  border: 2px solid #013afb;
}
.content {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 48px 96px 40px;
}
.header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
}
/* The logo (an SVG) and every signature image are declared ONCE here as
   background images and referenced by class on each page. Inlining them
   per page would duplicate tens of KB across 200 pages and blow up the
   HTML Puppeteer has to parse (the slow path that timed out). */
.logo {
  width: 200px;
  height: 42px;
  background-image: var(--epitech-logo);
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}
.institute {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #64748b;
  margin: 0;
}
.title {
  font-family: 'Anton', sans-serif;
  font-size: 46px;
  text-transform: uppercase;
  color: #0f172a;
  letter-spacing: 0.04em;
  margin: 18px 0 4px;
  text-align: center;
}
.title-line {
  height: 5px;
  width: 110px;
  border-radius: 9999px;
  background-color: #00ff97;
  margin: 0 auto;
}
.body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 22px;
}
.attribution {
  font-size: 18px;
  font-weight: 300;
  color: #475569;
  margin: 0;
}
.student-name {
  font-family: 'Anton', sans-serif;
  font-size: 44px;
  text-transform: uppercase;
  color: #013afb;
  margin: 0;
  line-height: 1.05;
}
.desc {
  max-width: 880px;
  font-size: 16px;
  line-height: 1.6;
  color: #475569;
  margin: 0;
}
.desc strong {
  color: #0f172a;
  font-weight: 600;
}
.signatures {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px 24px;
  margin-top: 8px;
}
.sig-block {
  flex: 1 1 30%;
  min-width: 150px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.sig-img {
  width: 160px;
  height: 56px;
  margin-bottom: 4px;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center bottom;
}
.sig-line {
  width: 100%;
  max-width: 180px;
  border-top: 1px solid #cbd5e1;
  padding-top: 6px;
}
.sig-name {
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}
.sig-role {
  font-size: 12px;
  color: #64748b;
  margin: 2px 0 0;
}
.footer {
  border-top: 1px solid #e2e8f0;
  padding-top: 16px;
  margin-top: 28px;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  font-size: 11px;
  color: #94a3b8;
}
.footer .place {
  font-style: italic;
}
    $css$,
    $body$<div class="frame"></div>
<div class="content">
  <div class="header">
    <div class="logo"></div>
    <p class="institute">European Institute of Information Technology</p>
  </div>

  <h1 class="title">Certificat de stage</h1>
  <div class="title-line"></div>

  <div class="body">
    <h2 class="student-name">{prenom} {nom}</h2>
    <p class="attribution">se voit, ce jour, attribuer ce certificat</p>
    <p class="desc" style="font-style: italic">
      Ce stage d'observation de deux semaines, réalisé du {dateDebut} au {dateFin}, a permis à l'élève de
      découvrir l'univers des métiers de l'informatique et de l'innovation
      technologique au sein d'Epitech {ville}. L'élève a pu
      s'immerger dans un environnement dynamique, rencontrer des
      professionnels et appréhender les compétences clés du domaine de la
      tech.
    </p>

    <div class="signatures">
      {signatures}</div>
  </div>

  <div class="footer">
    <span>Association à but non lucratif (loi 1901)</span>
    <span class="place">
      Fait à {ville}, le {dateDuJour}
    </span>
  </div>
</div>$body$,
    1123,
    794,
    CURRENT_TIMESTAMP
  ),
  (
    'dpl_coding_club',
    'coding-club',
    'Certificat de participation',
    $css$html,
body {
  background-color: #ffffff;
  font-family: 'IBM Plex Sans', sans-serif;
  color: #0f172a;
}
.page {
  background-color: #ffffff;
}
/* Thin full border framing the whole page. */
.frame {
  position: absolute;
  top: 24px;
  right: 24px;
  bottom: 24px;
  left: 24px;
  border: 2px solid #013afb;
}
.content {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 48px 96px 40px;
}
.header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
}
/* The logo (an SVG) and every signature image are declared ONCE here as
   background images and referenced by class on each page. Inlining them
   per page would duplicate tens of KB across 200 pages and blow up the
   HTML Puppeteer has to parse (the slow path that timed out). */
.logo {
  width: 200px;
  height: 42px;
  background-image: var(--epitech-logo);
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}
.institute {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #64748b;
  margin: 0;
}
.title {
  font-family: 'Anton', sans-serif;
  font-size: 46px;
  text-transform: uppercase;
  color: #0f172a;
  letter-spacing: 0.04em;
  margin: 18px 0 4px;
  text-align: center;
}
.title-line {
  height: 5px;
  width: 110px;
  border-radius: 9999px;
  background-color: #00ff97;
  margin: 0 auto;
}
.body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 22px;
}
.attribution {
  font-size: 18px;
  font-weight: 300;
  color: #475569;
  margin: 0;
}
.student-name {
  font-family: 'Anton', sans-serif;
  font-size: 44px;
  text-transform: uppercase;
  color: #013afb;
  margin: 0;
  line-height: 1.05;
}
.desc {
  max-width: 880px;
  font-size: 16px;
  line-height: 1.6;
  color: #475569;
  margin: 0;
}
.desc strong {
  color: #0f172a;
  font-weight: 600;
}
.signatures {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px 24px;
  margin-top: 8px;
}
.sig-block {
  flex: 1 1 30%;
  min-width: 150px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.sig-img {
  width: 160px;
  height: 56px;
  margin-bottom: 4px;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center bottom;
}
.sig-line {
  width: 100%;
  max-width: 180px;
  border-top: 1px solid #cbd5e1;
  padding-top: 6px;
}
.sig-name {
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}
.sig-role {
  font-size: 12px;
  color: #64748b;
  margin: 2px 0 0;
}
.footer {
  border-top: 1px solid #e2e8f0;
  padding-top: 16px;
  margin-top: 28px;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  font-size: 11px;
  color: #94a3b8;
}
.footer .place {
  font-style: italic;
}
    $css$,
    $body$<div class="frame"></div>
<div class="content">
  <div class="header">
    <div class="logo"></div>
    <p class="institute">European Institute of Information Technology</p>
  </div>

  <h1 class="title">Certificat de participation</h1>
  <div class="title-line"></div>

  <div class="body">
    <h2 class="student-name">{prenom} {nom}</h2>
    <p class="attribution">se voit, ce jour, attribuer ce certificat</p>
    <p class="desc" style="font-style: italic">
      Cette journée au Coding Club, réalisée le {dateDebut}, a permis à
      l'élève de découvrir la programmation et l'univers des métiers de la tech
      au sein d'Epitech {ville}. L'élève a pu s'initier au code, échanger avec
      des professionnels et se projeter dans les compétences clés du domaine.
    </p>

    <div class="signatures">
      {signatures}</div>
  </div>

  <div class="footer">
    <span>Association à but non lucratif (loi 1901)</span>
    <span class="place">
      Fait à {ville}, le {dateDuJour}
    </span>
  </div>
</div>$body$,
    1123,
    794,
    CURRENT_TIMESTAMP
  );

-- Every event that had the retired sub-option on was issuing the internship
-- certificate, because it was the only one that existed.
UPDATE "Event" e
SET "diplomaTemplateId" = 'dpl_stage'
WHERE EXISTS (
  SELECT 1 FROM "EventConfig_Module" m
  WHERE m."eventId" = e."id"
    AND m."moduleKey" = 'inscrits'
    AND (m."settings" ->> 'diplomas') = 'true'
);

-- Same for the config presets, which carry the module settings too. Without this
-- a saved preset would silently drop the choice on the way through.
UPDATE "EventConfig_Template" t
SET "diplomaTemplateId" = 'dpl_stage'
WHERE EXISTS (
  SELECT 1 FROM "EventConfig_TemplateModule" m
  WHERE m."templateId" = t."id"
    AND m."moduleKey" = 'inscrits'
    AND (m."settings" ->> 'diplomas') = 'true'
);

-- Drop the retired key from both settings bags. Not needed for correctness (the
-- per-module Zod schema strips unknown keys on read), but a stored setting that
-- nothing honours is a lie to the next person who reads the row.
UPDATE "EventConfig_Module"
SET "settings" = "settings" - 'diplomas'
WHERE "settings" IS NOT NULL;

UPDATE "EventConfig_TemplateModule"
SET "settings" = "settings" - 'diplomas'
WHERE "settings" IS NOT NULL;
