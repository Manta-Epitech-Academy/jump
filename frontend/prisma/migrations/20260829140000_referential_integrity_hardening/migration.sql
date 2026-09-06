-- Hold the invariants the schema only claimed.
--
-- Three unrelated-looking changes, one theme: each is a rule stated in a comment
-- that the database did not enforce.
--
--   1. A campus move stranded the scoping keys. The event sync has an explicit
--      branch for Salesforce reassigning a campaign, and it updated `Event`
--      alone, leaving `Participation.campusId` and `Closing_Record.campusId` on
--      the old campus - the columns `db/scoped.ts` reads to cloister a campus's
--      data. Both now reference the PAIR `(Event.id, Event.campusId)`, so
--      Postgres carries the move down on ON UPDATE CASCADE. Verified against the
--      restored production snapshot before writing this: zero rows drifted, so
--      the fix is structural rather than a repair, and no backfill is owed.
--
--   2. Deleting a staff account was wrong in both directions. `Closing_Record`
--      and `AdminFile` cascaded, so a departure destroyed every closing that
--      person had conducted (all 83 conductors in the snapshot were exposed,
--      1694 records) and the files they had put in the shared library.
--      `Broadcast`, `MessageTemplate` and `CmsPage` defaulted to RESTRICT, so
--      anyone who had ever sent a campaign could not be deleted at all. All five
--      become nullable + SET NULL, which is what every other staff attribution
--      on these tables already did.
--
--   3. No CHECK constraint existed anywhere in this database. Two are added at
--      the bottom, both verified at zero violations against the same snapshot.
--
-- No data loss: every column here becomes MORE permissive (NOT NULL dropped),
-- and the one new index is the unique the composite foreign keys reference.

-- DropForeignKey
ALTER TABLE "AdminFile" DROP CONSTRAINT "AdminFile_uploadedById_fkey";

-- DropForeignKey
ALTER TABLE "Broadcast" DROP CONSTRAINT "Broadcast_createdById_fkey";

-- DropForeignKey
ALTER TABLE "Closing_Record" DROP CONSTRAINT "Closing_Record_campusId_fkey";

-- DropForeignKey
ALTER TABLE "Closing_Record" DROP CONSTRAINT "Closing_Record_eventId_fkey";

-- DropForeignKey
ALTER TABLE "Closing_Record" DROP CONSTRAINT "Closing_Record_staffId_fkey";

-- DropForeignKey
ALTER TABLE "CmsPage" DROP CONSTRAINT "CmsPage_updatedBy_fkey";

-- DropForeignKey
ALTER TABLE "MessageTemplate" DROP CONSTRAINT "MessageTemplate_createdById_fkey";

-- DropForeignKey
ALTER TABLE "Participation" DROP CONSTRAINT "Participation_eventId_fkey";

-- AlterTable
ALTER TABLE "AdminFile" ALTER COLUMN "uploadedById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Broadcast" ALTER COLUMN "createdById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Closing_Record" ALTER COLUMN "staffId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CmsPage" ALTER COLUMN "updatedBy" DROP NOT NULL;

-- AlterTable
ALTER TABLE "MessageTemplate" ALTER COLUMN "createdById" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Event_id_campusId_key" ON "Event"("id", "campusId");

-- AddForeignKey
ALTER TABLE "CmsPage" ADD CONSTRAINT "CmsPage_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "bauth_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participation" ADD CONSTRAINT "Participation_eventId_campusId_fkey" FOREIGN KEY ("eventId", "campusId") REFERENCES "Event"("id", "campusId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Closing_Record" ADD CONSTRAINT "Closing_Record_eventId_campusId_fkey" FOREIGN KEY ("eventId", "campusId") REFERENCES "Event"("id", "campusId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Closing_Record" ADD CONSTRAINT "Closing_Record_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Closing_Record" ADD CONSTRAINT "Closing_Record_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminFile" ADD CONSTRAINT "AdminFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "bauth_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "bauth_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- Invariants the database now holds itself.
--
-- Prisma cannot express a CHECK constraint, so these are hand-written and live
-- only here. `prisma migrate diff` does not read them either, which is why
-- `test:schema-drift` stays green with them in place.
-- ─────────────────────────────────────────────────────────────────────────────

-- "Never true on a leadership token (tier 2 is read-only by construction)"
-- says AdminApi_Token, and the construction was an `if` in adminApi/tokens.ts.
-- Nothing updates `tier` or `writeEnabled` after the mint, so there is no
-- intermediate state for this to trip over.
ALTER TABLE "AdminApi_Token"
  ADD CONSTRAINT "AdminApi_Token_leadership_is_read_only"
  CHECK (NOT ("writeEnabled" AND "tier" = 'leadership'));

-- The two actor regimes are asymmetric by design: staff identified, talents
-- pseudonymous. A row that mixed them - a staffProfileId under actorKind
-- 'talent' - would be a re-identification of a minor, which is the one thing
-- this table is built to make impossible. Structural rather than trusted to the
-- single recorder that writes it.
ALTER TABLE "Usage_FeatureUse"
  ADD CONSTRAINT "Usage_FeatureUse_actor_matches_kind"
  CHECK (
    ("actorKind" = 'staff'  AND "staffProfileId" IS NOT NULL AND "actorHash" IS NULL) OR
    ("actorKind" = 'talent' AND "staffProfileId" IS NULL     AND "actorHash" IS NOT NULL)
  );
