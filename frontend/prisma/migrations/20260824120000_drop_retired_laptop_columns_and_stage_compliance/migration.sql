/*
  Warnings:

  - You are about to drop the column `hasLaptop` on the `Talent` table. All the data in the column will be lost.
  - You are about to drop the column `bringPc` on the `Participation` table. All the data in the column will be lost.
  - You are about to drop the `StageCompliance` table. If the table is not empty, all the data it contains will be lost.

*/
-- No backfill: nothing dropped here carries anything a reader could want,
-- checked against a production snapshot before dropping.
--
-- `Participation.bringPc`: 0 rows out of 7 638 were ever set to true. The column
-- never left its default.
--
-- `Talent.hasLaptop`: true on exactly the 866 talents that have an
-- `equipmentValidatedAt`, and on no others, in both directions. It was written
-- by a blocking checkbox on the equipment step, so it recorded progression
-- through that step rather than an answer to a question - which is what
-- `equipmentValidatedAt` already records, with a date. Not one row ever said
-- "this talent has no laptop"; that case was handled by staff off-platform and
-- left no trace here.
--
-- The laptop requirement is now certified on the règlement step, next to the
-- clause it certifies (`rulesSchema.acceptedEquipment`).
--
-- `StageCompliance`: 1 row, `charteSigned` false. `charteSigned` was a staff
-- attestation of an offline règlement signature and no code path could ever set
-- it, so the table only ever held the default. It is dropped here rather than
-- later for the reason now written in AGENTS.md: the rolling-deploy window it
-- was being held back for exists whichever migration carries the drop, and a
-- follow-up PR crosses every environment in the same promotion anyway. With one
-- generic règlement signed once per school year, an attestation scoped to a
-- single participation would not come back in this shape: if the offline path is
-- wanted again it belongs to the talent or to their yearly dossier
-- (`domain/dossierCompliance.ts` states that).

-- AlterTable
ALTER TABLE "Participation" DROP COLUMN "bringPc";

-- AlterTable
ALTER TABLE "Talent" DROP COLUMN "hasLaptop";

-- DropForeignKey
ALTER TABLE "StageCompliance" DROP CONSTRAINT "StageCompliance_participationId_fkey";

-- DropTable
DROP TABLE "StageCompliance";
