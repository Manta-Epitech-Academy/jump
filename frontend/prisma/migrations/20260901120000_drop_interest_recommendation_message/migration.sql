-- Retire the "Recommandations" fiche section (issue #303): the feature is
-- deprecated wholesale, to be redesigned later at a different scope, so no
-- successor reads this column and no backfill is owed.
--
-- Warnings: `Interest.recommendationMessage` is dropped, taking its 9 seeded
-- values with it. No backfill: those values fed exactly one reader
-- (`deriveTalentRecommendations`, removed in this same change), which is gone.

ALTER TABLE "Interest" DROP COLUMN "recommendationMessage";
