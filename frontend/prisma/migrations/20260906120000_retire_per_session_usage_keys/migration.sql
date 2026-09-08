-- Retire the three per-session usage keys.
--
-- `dev_session`, `admin_session` and `talent_session` are now `dev_connection`,
-- `admin_connection` and `talent_connection`, and they no longer mean the same
-- thing: a row was one per BetterAuth login, it is now one per person, per
-- space, per UTC day.
--
-- /!\ Warnings: this deletes every row carrying one of the three retired keys,
-- from the raw table and from the monthly cube. The data loss is intended and
-- no backfill is owed, for two reasons. One row per login cannot be converted
-- into rows per day: the information does not exist, a fortnight-long session
-- says nothing about which days inside it somebody came. And a converted row
-- would be worse than none, because it would sit in the cube under a key whose
-- definition now promises days and be quoted as such by `stats_feature_usage`
-- and by the weekly digest.
--
-- Checked rather than assumed, against the branches rather than a snapshot:
-- neither `origin/main` nor `origin/staging` carries `usage/record.ts` or the
-- `20260828120000_add_usage_feature_use` migration, so production and
-- preproduction hold no such row and this is a no-op there. What it does clean
-- is `jump-dev` and every local database, which have been serving the recorder
-- since 2026-08-28. That cleanup is required, not cosmetic:
-- `scripts/seed/assert/stringCatalogues.ts` declares `Usage_FeatureUse.feature`
-- with `ownedBy: EVERY_ROW`, so `bun run seed --check` scans the whole table and
-- would refuse a value the catalogue no longer declares.
--
-- The cube half matters longer than it looks. `usage/rollup.ts` only recomputes
-- a month that still has raw rows, so a cube row under a dead key outlives the
-- twelve-month raw retention with nothing to ever remove it.
DELETE FROM "Usage_FeatureUse"
WHERE "feature" IN ('dev_session', 'admin_session', 'talent_session');

DELETE FROM "Usage_FeatureMonthly"
WHERE "feature" IN ('dev_session', 'admin_session', 'talent_session');
