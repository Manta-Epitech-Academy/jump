-- A campus can now put forward an invitation that has no day (« les ateliers
-- de la tech, toute l'année »): a null day is shown as no day and never
-- retires the highlight. Until now the day was required, so such an invitation
-- was written with an invented one, which the talent home printed.
--
-- No backfill: nothing in a stored row says whether its day is real or
-- invented. The invented ones are rewritten with a null day over
-- write_talent_home_highlight once this is deployed.

-- AlterTable
ALTER TABLE "TalentHome_Highlight" ALTER COLUMN "date" DROP NOT NULL;
