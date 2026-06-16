-- CreateEnum
CREATE TYPE "ImageRightsDecisionSource" AS ENUM ('parent_portal', 'staff_correction');

-- CreateTable
CREATE TABLE "ImageRightsDecisionRecord" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "decision" "ImageRightsDecision" NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL,
    "signerPrenom" TEXT,
    "signerNom" TEXT,
    "relationship" TEXT,
    "city" TEXT,
    "source" "ImageRightsDecisionSource" NOT NULL DEFAULT 'parent_portal',
    "recordedByStaffId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImageRightsDecisionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImageRightsDecisionRecord_talentId_createdAt_idx" ON "ImageRightsDecisionRecord"("talentId", "createdAt");

-- AddForeignKey
ALTER TABLE "ImageRightsDecisionRecord" ADD CONSTRAINT "ImageRightsDecisionRecord_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageRightsDecisionRecord" ADD CONSTRAINT "ImageRightsDecisionRecord_recordedByStaffId_fkey" FOREIGN KEY ("recordedByStaffId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: seed one parent_portal fact per talent that already carries a
-- settled decision in the projection columns, so no current value is left
-- orphaned (a decision with an empty history reads like a bug). The record sits
-- at the decision's own timestamp so later appends order after it. relationship
-- and city were never persisted pre-ledger, so they stay null (honest gap, not
-- invented data); signer name is copied from the projection when present.
INSERT INTO "ImageRightsDecisionRecord" (
    "id", "talentId", "decision", "decidedAt",
    "signerPrenom", "signerNom", "source", "createdAt"
)
SELECT
    'imgr_backfill_' || "id",
    "id",
    "imageRightsDecision",
    "imageRightsDecidedAt",
    "imageRightsSignerPrenom",
    "imageRightsSignerNom",
    'parent_portal',
    "imageRightsDecidedAt"
FROM "Talent"
WHERE "imageRightsDecidedAt" IS NOT NULL
  AND "imageRightsDecision" IS NOT NULL;
