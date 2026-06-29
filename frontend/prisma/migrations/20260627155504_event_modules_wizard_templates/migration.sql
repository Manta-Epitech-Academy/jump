-- AlterTable
ALTER TABLE "EventConfig_Module" ADD COLUMN     "settings" JSONB;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "configuredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EventConfig_Template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "forEventType" TEXT,
    "feedbackFormId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventConfig_Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventConfig_TemplateModule" (
    "templateId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "settings" JSONB,

    CONSTRAINT "EventConfig_TemplateModule_pkey" PRIMARY KEY ("templateId","moduleKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventConfig_Template_name_key" ON "EventConfig_Template"("name");

-- CreateIndex
CREATE INDEX "EventConfig_Template_forEventType_idx" ON "EventConfig_Template"("forEventType");

-- CreateIndex
CREATE INDEX "EventConfig_Template_feedbackFormId_idx" ON "EventConfig_Template"("feedbackFormId");

-- AddForeignKey
ALTER TABLE "EventConfig_Template" ADD CONSTRAINT "EventConfig_Template_feedbackFormId_fkey" FOREIGN KEY ("feedbackFormId") REFERENCES "Feedback_Form"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventConfig_Template" ADD CONSTRAINT "EventConfig_Template_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventConfig_TemplateModule" ADD CONSTRAINT "EventConfig_TemplateModule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EventConfig_Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
