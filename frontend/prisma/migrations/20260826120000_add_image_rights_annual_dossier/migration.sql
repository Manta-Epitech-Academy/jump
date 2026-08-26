-- Le droit à l'image devient annuel et son texte versionné, sur le même modèle
-- que le règlement intérieur (migrations 20260821000000 et 20260821010000).
--
-- Aucune perte de données : cette migration n'ajoute que des colonnes, et
-- `Talent.imageRights*` reste en place comme projection. `Talent.imageRightsFilePath`
-- passe LEGACY et se droppera avec `Talent.rulesFilePath`, une fois les clés
-- pré-annuelles balayées du bucket : les deux chemins d'effacement le lisent
-- encore pour ne pas laisser orphelin le PDF d'un mineur nommé.

-- AlterTable: la décision du responsable légal pour l'année, à côté de sa
-- co-signature du règlement, qui est déjà sur cette ligne.
ALTER TABLE "Onboarding_Record"
  ADD COLUMN "imageRightsDecision"     "ImageRightsDecision",
  ADD COLUMN "imageRightsDecidedAt"    TIMESTAMP(3),
  ADD COLUMN "imageRightsSignerPrenom" TEXT,
  ADD COLUMN "imageRightsSignerNom"    TEXT,
  ADD COLUMN "imageRightsRelationship" TEXT,
  ADD COLUMN "imageRightsSignedCity"   TEXT,
  ADD COLUMN "imageRightsVersion"      TEXT,
  ADD COLUMN "imageRightsFilePath"     TEXT;

-- AlterTable: le registre dit désormais sous quelle formulation et pour quelle
-- année chaque décision a été prise. Ajoutées nullables, remplies plus bas,
-- `schoolYear` passant NOT NULL ensuite.
ALTER TABLE "ImageRightsDecisionRecord"
  ADD COLUMN "schoolYear" TEXT,
  ADD COLUMN "version"    TEXT;

-- Data Backfill: épingler chaque décision existante au texte qu'on lui a
-- réellement montré.
--
-- Codé en dur à '2025-2026', et surtout PAS dérivé de la date : la clé nomme le
-- TEXTE en vigueur, et un seul texte l'a été pour toutes les décisions prises
-- jusqu'ici, quelle que soit l'année où elles ont été prises. La formulation
-- générique 2026-2027 arrive dans cette même release, donc sans cette ligne le
-- premier changement d'avis ou la première correction staff réécrirait le corps
-- d'un document déjà signé. Même argument et même forme qu'en
-- 20260821000000_add_reglement_version.
--
-- Sans clause WHERE : toute ligne présente au moment où cette migration tourne
-- est par construction antérieure au nouveau texte.
UPDATE "ImageRightsDecisionRecord" SET "version" = '2025-2026';

-- Data Backfill: rattacher chaque décision à son année scolaire.
--
-- L'année d'une décision est celle du DOSSIER contre lequel elle a été prise,
-- pas celle où tombe `decidedAt`, et l'ordre du COALESCE est ce qui le dit. Un
-- responsable légal qui décide le 10 août pour un enfant dont le dossier est
-- celui de 2025-2026 répond à la question de 2025-2026 : la classer en
-- 2026-2027 ferait redemander la décision par le portail parent à la seconde où
-- il vient de la donner. C'est la même règle que celle qui gouverne la
-- projection d'onboarding (le dossier le plus récent, jamais l'horloge).
--
-- Le repli sur `decidedAt` ne sert qu'aux talents sans dossier (voir plus bas :
-- il y en avait 2 sur 831 décidés dans le dump de production du 10/07/2026).
-- Le seuil du 31 juillet reprend `schoolYearOf` de src/lib/domain/schoolYear.ts.
-- Il est retranscrit plutôt que réutilisé parce que ceci tourne une fois, en
-- SQL, avant tout code applicatif : c'est une transcription ponctuelle, pas une
-- seconde implémentation vivante. Les colonnes sont des TIMESTAMP(3) en UTC,
-- d'où le double AT TIME ZONE pour les lire en heure murale de Paris.
WITH resolved AS (
  SELECT
    r."id" AS record_id,
    COALESCE(
      t."onboardingSchoolYear",
      y.start_year::text || '-' || (y.start_year + 1)::text
    ) AS school_year
  FROM "ImageRightsDecisionRecord" r
  JOIN "Talent" t ON t."id" = r."talentId"
  CROSS JOIN LATERAL (
    SELECT (r."decidedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris') AS paris
  ) p
  CROSS JOIN LATERAL (
    SELECT
      CASE
        WHEN p.paris >= make_timestamp(EXTRACT(YEAR FROM p.paris)::int, 7, 31, 0, 0, 0)
        THEN EXTRACT(YEAR FROM p.paris)::int
        ELSE EXTRACT(YEAR FROM p.paris)::int - 1
      END AS start_year
  ) y
)
UPDATE "ImageRightsDecisionRecord" r
SET "schoolYear" = resolved.school_year
FROM resolved
WHERE resolved.record_id = r."id";

ALTER TABLE "ImageRightsDecisionRecord" ALTER COLUMN "schoolYear" SET NOT NULL;

-- CreateIndex
CREATE INDEX "ImageRightsDecisionRecord_talentId_schoolYear_idx" ON "ImageRightsDecisionRecord"("talentId", "schoolYear");

-- Data Backfill: ouvrir un dossier aux talents qui ont une décision mais aucun
-- dossier du tout.
--
-- Le backfill de 20260821010000 n'a créé une ligne que pour un talent portant au
-- moins un horodatage d'onboarding, or une décision de droit à l'image n'en est
-- pas un : dans le dump de production du 10/07/2026, 2 talents sur les 831
-- décidés étaient dans ce cas. Sans cette ligne leur décision n'appartiendrait à
-- aucune année, la projection ne pourrait être tamponnée, et le portail parent
-- redemanderait indéfiniment une décision que leur responsable a déjà donnée.
--
-- L'année retenue est celle que le backfill ci-dessus vient de poser sur leur
-- décision la plus récente, donc celle dérivée de `decidedAt` : c'est le seul
-- fait daté que ces talents portent.
INSERT INTO "Onboarding_Record" ("id", "talentId", "schoolYear", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", latest."schoolYear", NOW(), NOW()
FROM "Talent" t
CROSS JOIN LATERAL (
  SELECT rec."schoolYear"
  FROM "ImageRightsDecisionRecord" rec
  WHERE rec."talentId" = t."id"
  ORDER BY rec."decidedAt" DESC, rec."createdAt" DESC
  LIMIT 1
) latest
WHERE t."imageRightsDecidedAt" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "Onboarding_Record" o WHERE o."talentId" = t."id"
  )
ON CONFLICT ("talentId", "schoolYear") DO NOTHING;

-- Tamponner la projection de ces talents-là, sur la ligne qu'on vient de leur
-- créer. Un tampon NULL laisserait leurs colonnes plates décrire une année que
-- personne ne peut nommer, et tout lecteur narré par année les lirait à vide.
UPDATE "Talent" t
SET "onboardingSchoolYear" = r."schoolYear"
FROM "Onboarding_Record" r
WHERE r."talentId" = t."id"
  AND t."onboardingSchoolYear" IS NULL;

-- Data Backfill: la décision descend sur le dossier qu'elle concerne.
--
-- `Talent.imageRights*` devient une projection de cette ligne, donc les deux
-- doivent partir d'accord. Prénom / nom du signataire et clé du PDF viennent des
-- colonnes plates ; qualité, ville et version viennent du registre, seul endroit
-- où elles aient jamais été stockées.
--
-- La clé du PDF est COPIÉE, jamais recalculée : elle porte le nom pré-annuel
-- `image-rights.pdf`, qui doit continuer de résoudre. Seule une régénération
-- écrira le nom millésimé, donc aucun objet n'a à bouger dans le bucket pour que
-- ceci soit correct. 717 talents sur les 831 décidés portaient une clé au
-- 10/07/2026 ; les 114 autres ont une décision sans PDF (job en échec ou
-- décision antérieure au pipeline) et gardent une clé NULL, ce qui est ce que
-- `/settings/documents` et l'archive staff savent déjà lire.
--
-- Qualité et ville ressortent NULL pour 813 des 831 dossiers, et c'est correct :
-- seules 18 lignes de registre les portent, les autres ayant elles-mêmes été
-- backfillées depuis la projection d'avant le registre, qui ne stockait que le
-- nom du signataire. Le générateur sait déjà les deux cas (`représentant légal`
-- par défaut, et « Fait le … » sans ville), donc une régénération de ces
-- documents rend exactement ce qu'elle rend aujourd'hui.
UPDATE "Onboarding_Record" o
SET
  "imageRightsDecision"     = t."imageRightsDecision",
  "imageRightsDecidedAt"    = t."imageRightsDecidedAt",
  "imageRightsSignerPrenom" = t."imageRightsSignerPrenom",
  "imageRightsSignerNom"    = t."imageRightsSignerNom",
  "imageRightsRelationship" = latest."relationship",
  "imageRightsSignedCity"   = latest."city",
  "imageRightsVersion"      = latest."version",
  "imageRightsFilePath"     = t."imageRightsFilePath",
  "updatedAt"               = NOW()
FROM "Talent" t
LEFT JOIN LATERAL (
  SELECT rec."relationship", rec."city", rec."version"
  FROM "ImageRightsDecisionRecord" rec
  WHERE rec."talentId" = t."id"
    AND rec."schoolYear" = t."onboardingSchoolYear"
  ORDER BY rec."decidedAt" DESC, rec."createdAt" DESC
  LIMIT 1
) latest ON TRUE
WHERE o."talentId" = t."id"
  AND o."schoolYear" = t."onboardingSchoolYear"
  AND t."imageRightsDecidedAt" IS NOT NULL;
