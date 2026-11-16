-- An event's activity can be offered on one of its days, or one half-day of
-- it, instead of the whole event (#501): a stage de seconde gives some mornings
-- three subjects to choose from. Null keeps today's behaviour, so no existing
-- row changes.
ALTER TABLE "EventConfig_Workshop" ADD COLUMN "day" DATE,
ADD COLUMN "slot" "PresenceSlot";

-- A half-day is a half of a day: without the day it names no moment at all.
-- Hand-written, Prisma cannot express a CHECK.
ALTER TABLE "EventConfig_Workshop"
    ADD CONSTRAINT "EventConfig_Workshop_slot_needs_day"
    CHECK ("slot" IS NULL OR "day" IS NOT NULL);
