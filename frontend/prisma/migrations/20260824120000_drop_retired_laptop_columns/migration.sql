/*
  Warnings:

  - You are about to drop the column `hasLaptop` on the `Talent` table. All the data in the column will be lost.
  - You are about to drop the column `bringPc` on the `Participation` table. All the data in the column will be lost.

*/
-- No backfill: neither column carries anything a reader could want, checked
-- against a production snapshot before dropping.
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

-- AlterTable
ALTER TABLE "Participation" DROP COLUMN "bringPc";

-- AlterTable
ALTER TABLE "Talent" DROP COLUMN "hasLaptop";
