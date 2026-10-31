-- An interest is archived rather than deleted (write_interest): no longer
-- offered at onboarding, kept by the talents who picked it.
ALTER TABLE "Interest" ADD COLUMN "archivedAt" TIMESTAMP(3);
