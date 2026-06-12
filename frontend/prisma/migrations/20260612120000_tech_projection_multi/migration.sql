-- The "Vers quels métiers / domaines tu te projettes ?" answer becomes
-- multi-select: convert the scalar enum column to a Postgres enum array, folding
-- any existing single answer into a one-element array (NULL -> empty array) so no
-- recorded interview loses its projection.
ALTER TABLE "Interview"
  ALTER COLUMN "techProjection" TYPE "TechProjection"[]
    USING (
      CASE
        WHEN "techProjection" IS NULL THEN ARRAY[]::"TechProjection"[]
        ELSE ARRAY["techProjection"]
      END
    ),
  ALTER COLUMN "techProjection" SET DEFAULT ARRAY[]::"TechProjection"[];
