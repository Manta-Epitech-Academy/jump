-- The supervisor code of a CTFd instance (#459), shown on the catalogue cards
-- of the subjects it serves, beside the link to its `/supervisor/join`.
--
-- No backfill is owed: the codes live in each instance, and Jump never held
-- one. Each is brought over by running again the declaration call the
-- instance's `/admin/workshop/jump` page prints, which now carries it.

-- AlterTable
ALTER TABLE "Workshop_Instance" ADD COLUMN     "supervisorCode" TEXT;
