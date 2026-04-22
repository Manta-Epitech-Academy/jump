-- Collapse `TimeSlot { activities: Activity[] }` to 1:1, drop `TimeSlot.label`,
-- merge `PlanningTemplateSlotItem` fields onto `PlanningTemplateSlot` (drop Item table),
-- drop `PlanningTemplateSlot.label`, and enforce `Activity.timeSlotId` uniqueness.
--
-- Multi-activity slots are SPLIT (clone slot per extra activity) — zero data loss.
-- Zero-activity slots get a phantom `break` Activity preserving the old label as name.

-- ─── Step 1: Drop FKs from PlanningTemplateSlotItem (so we can read its rows after schema drift begins) ───

ALTER TABLE "PlanningTemplateSlotItem" DROP CONSTRAINT "PlanningTemplateSlotItem_activityTemplateId_fkey";
ALTER TABLE "PlanningTemplateSlotItem" DROP CONSTRAINT "PlanningTemplateSlotItem_planningTemplateSlotId_fkey";

-- ─── Step 2: Drop Activity.timeSlotId non-unique index (will become UNIQUE later) ───

DROP INDEX "Activity_timeSlotId_idx";

-- ─── Step 3: Add new columns to PlanningTemplateSlot (nullable / defaulted so existing rows are valid) ───

ALTER TABLE "PlanningTemplateSlot"
  ADD COLUMN "activityTemplateId" TEXT,
  ADD COLUMN "activityType" "ActivityType" NOT NULL DEFAULT 'orga',
  ADD COLUMN "description" TEXT,
  ADD COLUMN "nom" TEXT;

-- ─── Step 4: Data migration — PlanningTemplateSlot ───

-- 4a. Populate slot from its earliest item (DISTINCT ON keeps the first by createdAt).
UPDATE "PlanningTemplateSlot" s
SET
  "activityTemplateId" = first_item."activityTemplateId",
  "nom" = first_item."nom",
  "description" = first_item."description",
  "activityType" = first_item."activityType"
FROM (
  SELECT DISTINCT ON ("planningTemplateSlotId")
    "planningTemplateSlotId", "activityTemplateId", "nom", "description", "activityType"
  FROM "PlanningTemplateSlotItem"
  ORDER BY "planningTemplateSlotId", "createdAt" ASC
) AS first_item
WHERE s."id" = first_item."planningTemplateSlotId";

-- 4b. Slots with zero items → break activity with label as name.
UPDATE "PlanningTemplateSlot" s
SET
  "activityType" = 'break',
  "nom" = COALESCE(s."label", 'Pause')
WHERE NOT EXISTS (
  SELECT 1 FROM "PlanningTemplateSlotItem" i WHERE i."planningTemplateSlotId" = s."id"
);

-- 4c. Extra items (>1 per slot) → clone slot per extra.
-- Clones get sortOrder = original + rn (by item createdAt) so they sort stably
-- after the original slot at the same startTime.
INSERT INTO "PlanningTemplateSlot" (
  "id", "planningTemplateDayId", "startTime", "endTime", "sortOrder",
  "activityTemplateId", "activityType", "nom", "description",
  "createdAt", "updatedAt"
)
SELECT
  'c' || substr(md5(random()::text || clock_timestamp()::text || ranked."id"), 1, 24),
  ranked."planningTemplateDayId",
  ranked."startTime",
  ranked."endTime",
  ranked."sortOrder" + ranked."rn",
  ranked."activityTemplateId",
  ranked."activityType",
  ranked."nom",
  ranked."description",
  NOW(),
  NOW()
FROM (
  SELECT
    i."id",
    s."planningTemplateDayId",
    s."startTime",
    s."endTime",
    s."sortOrder",
    i."activityTemplateId",
    i."activityType",
    i."nom",
    i."description",
    ROW_NUMBER() OVER (
      PARTITION BY i."planningTemplateSlotId"
      ORDER BY i."createdAt" ASC, i."id" ASC
    ) - 1 AS "rn"
  FROM "PlanningTemplateSlotItem" i
  JOIN "PlanningTemplateSlot" s ON s."id" = i."planningTemplateSlotId"
) AS ranked
WHERE ranked."rn" >= 1;

-- ─── Step 5: Data migration — TimeSlot / Activity ───

-- 5a. Multi-activity slots → clone slot per extra activity, reassign activity.timeSlotId.
DO $$
DECLARE
  extra RECORD;
  new_slot_id TEXT;
BEGIN
  FOR extra IN
    WITH ranked AS (
      SELECT
        a."id" AS activity_id,
        a."timeSlotId" AS old_slot_id,
        ROW_NUMBER() OVER (PARTITION BY a."timeSlotId" ORDER BY a."createdAt" ASC) AS rn
      FROM "Activity" a
    )
    SELECT r.activity_id, s."planningId", s."startTime", s."endTime"
    FROM ranked r
    JOIN "TimeSlot" s ON s."id" = r.old_slot_id
    WHERE r.rn >= 2
  LOOP
    new_slot_id := 'c' || substr(md5(random()::text || clock_timestamp()::text || extra.activity_id), 1, 24);
    INSERT INTO "TimeSlot" ("id", "planningId", "startTime", "endTime", "createdAt", "updatedAt")
    VALUES (new_slot_id, extra."planningId", extra."startTime", extra."endTime", NOW(), NOW());
    UPDATE "Activity" SET "timeSlotId" = new_slot_id WHERE "id" = extra.activity_id;
  END LOOP;
END $$;

-- 5b. Zero-activity slots → phantom break activity, name derived from slot.label.
INSERT INTO "Activity" (
  "id", "nom", "activityType", "isDynamic", "timeSlotId", "createdAt", "updatedAt"
)
SELECT
  'c' || substr(md5(random()::text || clock_timestamp()::text || s."id"), 1, 24),
  COALESCE(s."label", 'Pause'),
  'break',
  false,
  s."id",
  NOW(),
  NOW()
FROM "TimeSlot" s
WHERE NOT EXISTS (
  SELECT 1 FROM "Activity" a WHERE a."timeSlotId" = s."id"
);

-- ─── Step 6: Drop old columns and table ───

ALTER TABLE "PlanningTemplateSlot" DROP COLUMN "label";
ALTER TABLE "TimeSlot" DROP COLUMN "label";
DROP TABLE "PlanningTemplateSlotItem";

-- ─── Step 7: Add unique constraint and new index ───

CREATE UNIQUE INDEX "Activity_timeSlotId_key" ON "Activity"("timeSlotId");
CREATE INDEX "PlanningTemplateSlot_activityTemplateId_idx" ON "PlanningTemplateSlot"("activityTemplateId");

-- ─── Step 8: Add new FK ───

ALTER TABLE "PlanningTemplateSlot"
  ADD CONSTRAINT "PlanningTemplateSlot_activityTemplateId_fkey"
  FOREIGN KEY ("activityTemplateId") REFERENCES "ActivityTemplate"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
