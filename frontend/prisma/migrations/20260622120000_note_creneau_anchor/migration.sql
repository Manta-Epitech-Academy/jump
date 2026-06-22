-- AlterTable: anchor a note to the émargement créneau it was taken on. Nullable,
-- mirrors EventPresence's (day, slot) shape; only set for notes created from the
-- émargement dialog (fiche notes carry no event and no créneau).
ALTER TABLE "Note_TalentNote" ADD COLUMN     "presenceDay" DATE,
ADD COLUMN     "presenceSlot" "PresenceSlot";

-- Backfill the créneau for legacy émargement-origin notes (those carrying an
-- event). Fiche notes have no event and stay unanchored, so they no longer light a
-- trigger — that exclusion is the whole point of the anchor. The créneau is derived
-- from the note's createdAt read in its campus wall clock, with the same 13h
-- morning/afternoon split the app uses (see slotKeyOfInstant). createdAt is stored
-- UTC (timestamp without time zone), so it is pinned to UTC then shifted into the
-- campus zone before the date and hour are read.
UPDATE "Note_TalentNote" AS n
SET
  "presenceDay" = (n."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE c."timezone")::date,
  "presenceSlot" = CASE
    WHEN EXTRACT(HOUR FROM (n."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE c."timezone")) < 13
      THEN 'morning'::"PresenceSlot"
    ELSE 'afternoon'::"PresenceSlot"
  END
FROM "Event" e
JOIN "Campus" c ON c."id" = e."campusId"
WHERE n."eventId" = e."id";
