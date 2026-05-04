-- AlterTable
ALTER TABLE "TalentObservableState" ADD COLUMN "sourceSectionId" TEXT;

-- CreateIndex
CREATE INDEX "TalentObservableState_sourceSectionId_idx" ON "TalentObservableState"("sourceSectionId");

-- AddForeignKey
ALTER TABLE "TalentObservableState" ADD CONSTRAINT "TalentObservableState_sourceSectionId_fkey" FOREIGN KEY ("sourceSectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enforce a single "current" RefCompSnapshot at any time. Two concurrent
-- syncRefComp calls would otherwise both flip isCurrent=true and leave the
-- DB with no deterministic notion of "the current snapshot".
CREATE UNIQUE INDEX "RefCompSnapshot_isCurrent_singleton" ON "RefCompSnapshot"("isCurrent") WHERE "isCurrent" = true;
