-- Normalise legacy, manually-entered `Talent.niveau` values onto the canonical
-- catalogue in `src/lib/domain/niveau.ts` (which now matches the `ClassLevel`
-- enum emitted by jump-sf-worker). Only two legacy labels existed before this
-- change: "Terminale" and "Sup".
--
-- "Terminale" -> "terminale": same level, canonical lowercase casing.
-- "Sup"       -> "autre":     "Sup" was a generic post-bac catch-all; the new
--                             enum splits higher ed into bac_1..bac_5, so we
--                             map to "autre" rather than fabricate a year.
UPDATE "Talent" SET "niveau" = 'terminale' WHERE "niveau" = 'Terminale';
UPDATE "Talent" SET "niveau" = 'autre' WHERE "niveau" = 'Sup';
