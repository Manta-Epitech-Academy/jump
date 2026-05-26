-- Minigame metadata now lives in the jump-games catalogue (GET /api/games),
-- read live by jump. MinigameConfig keeps only host-side rotation curation
-- (weight + enabled); the level count and scoring mode are no longer mirrored
-- here. Each MinigamePublication snapshots its display name + scoring mode at
-- publish time so historical leaderboards stay correct/renderable even if a
-- game is later renamed or removed from the catalogue.

-- 1. Add the snapshot columns as nullable, backfill, then enforce NOT NULL.
ALTER TABLE "MinigamePublication" ADD COLUMN "gameName" TEXT;
ALTER TABLE "MinigamePublication" ADD COLUMN "scoringType" "MinigameScoring";

-- Backfill from the existing config (must run before dropping its columns).
UPDATE "MinigamePublication" p
SET "scoringType" = c."scoringType",
    "gameName" = INITCAP(p."game")
FROM "MinigameConfig" c
WHERE p."game" = c."game";

-- Safety net for any publication whose game had no config row.
UPDATE "MinigamePublication"
SET "scoringType" = 'score'
WHERE "scoringType" IS NULL;
UPDATE "MinigamePublication"
SET "gameName" = INITCAP("game")
WHERE "gameName" IS NULL;

ALTER TABLE "MinigamePublication" ALTER COLUMN "gameName" SET NOT NULL;
ALTER TABLE "MinigamePublication" ALTER COLUMN "scoringType" SET NOT NULL;

-- 2. Publications are now self-contained facts: drop the FK to MinigameConfig
-- so a publication outlives any config/catalogue churn.
ALTER TABLE "MinigamePublication" DROP CONSTRAINT "MinigamePublication_game_fkey";

-- 3. Drop the columns now owned by the jump-games catalogue.
ALTER TABLE "MinigameConfig" DROP COLUMN "levelCount";
ALTER TABLE "MinigameConfig" DROP COLUMN "scoringType";
