-- The free-text "Influenceurs & Médias suivis" field on the interview grid
-- was judged "non pertinent" by the admissions team that uses the grid
-- daily. Outcome data is now captured via the structured `recommendation`
-- enum, plus the existing `globalNote` for free-form notes.
ALTER TABLE "Interview" DROP COLUMN "influencers";
