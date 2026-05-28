-- Image-rights signer name now mirrors the talent's identity model — split
-- into prénom + nom — so the signed PDF reads symmetrically (talent block
-- always shows full name; guardian block did too only by chance). The single
-- free-text field that came before couldn't enforce structure: parents who
-- typed only their surname produced "Le représentant légal ... Olivier" next
-- to "Maëlys Olivier" on the same page.

-- AlterTable: add the split columns alongside the legacy one.
ALTER TABLE "Talent" ADD COLUMN "imageRightsSignerPrenom" TEXT,
ADD COLUMN "imageRightsSignerNom" TEXT;

-- Backfill: best-effort split on the *last* space so multi-word first names
-- ("Marie Claire Dupont" → prénom "Marie Claire", nom "Dupont") survive. A
-- value with no space lands as `nom` only, matching the conservative
-- interpretation that a single-token entry is most often a surname (e.g.
-- "Olivier") rather than a given name; the form now refuses this on new
-- signatures anyway, so backfill is a one-time exercise on legacy rows.
UPDATE "Talent"
SET
  "imageRightsSignerNom" =
    CASE
      WHEN position(' ' IN trim("imageRightsSignerName")) = 0 THEN trim("imageRightsSignerName")
      ELSE substring(trim("imageRightsSignerName") FROM '([^ ]+)$')
    END,
  "imageRightsSignerPrenom" =
    CASE
      WHEN position(' ' IN trim("imageRightsSignerName")) = 0 THEN NULL
      ELSE regexp_replace(trim("imageRightsSignerName"), ' [^ ]+$', '')
    END
WHERE "imageRightsSignerName" IS NOT NULL;

-- DropColumn: the structured pair is now the source of truth.
ALTER TABLE "Talent" DROP COLUMN "imageRightsSignerName";
