-- The émargement note (absence motif) was dropped: attendance is just the
-- state (present/late/absent/excused), no free-text justification.
ALTER TABLE "EventPresence" DROP COLUMN "note";
