-- Retire the legacy single `Talent.note` column. The backfill is folded into the
-- same migration that drops it, so the data move and the drop are one atomic step
-- (no separate script / runbook entry): copy each non-empty note into
-- Note_TalentNote as one author-less row per talent, created at the talent's
-- `updatedAt` (the best proxy for when the note was written — the single column
-- kept no timestamp of its own), then drop the column.
--
-- `eventId` is anchored to the talent's stage de seconde participation. Every
-- onboarded talent currently exists *for* the stage (one stage_seconde event per
-- campus, exactly one stage participation per talent), so the stage IS the note's
-- context — anchoring records the context they actually have rather than
-- inventing one. LEFT JOIN so a talent with no stage participation still gets a
-- NULL-anchored (general) note instead of being dropped.
--
-- `id` is generated here as `ntn_legacy_<talentId>` because the model's
-- `@default(cuid())` is applied app-side, not by the DB — and it makes one note
-- per talent, so the copy is naturally idempotent. `authorId` / `editedById` stay
-- NULL. On a fresh database the SELECT matches nothing; on a deploy it carries the
-- existing notes over before the column disappears.
INSERT INTO "Note_TalentNote" ("id", "talentId", "body", "eventId", "createdAt", "updatedAt")
SELECT
  'ntn_legacy_' || t."id",
  t."id",
  t."note",
  stage."eventId",
  t."updatedAt",
  t."updatedAt"
FROM "Talent" t
LEFT JOIN LATERAL (
  SELECT p."eventId"
  FROM "Participation" p
  JOIN "Event" e ON e."id" = p."eventId" AND e."eventType" = 'stage_seconde'
  WHERE p."talentId" = t."id"
  ORDER BY e."date" DESC
  LIMIT 1
) stage ON true
WHERE t."note" IS NOT NULL AND btrim(t."note") <> '';

ALTER TABLE "Talent" DROP COLUMN "note";
