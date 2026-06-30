-- Rename the feature flag key in CampusFeatureFlag rows.
UPDATE "CampusFeatureFlag"
SET "flagKey" = 'news_feed'
WHERE "flagKey" = 'staff_welcome_page';
