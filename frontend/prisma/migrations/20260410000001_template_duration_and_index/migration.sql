-- AlterTable
ALTER TABLE "ActivityTemplate" ADD COLUMN     "defaultDuration" INTEGER;

-- CreateIndex
CREATE INDEX "Activity_templateId_idx" ON "Activity"("templateId");
