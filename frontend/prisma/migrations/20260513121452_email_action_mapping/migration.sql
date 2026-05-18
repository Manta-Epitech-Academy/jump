-- CreateTable
CREATE TABLE "EmailActionMapping" (
    "actionKey" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailActionMapping_pkey" PRIMARY KEY ("actionKey")
);

-- CreateIndex
CREATE INDEX "EmailActionMapping_templateId_idx" ON "EmailActionMapping"("templateId");

-- AddForeignKey
ALTER TABLE "EmailActionMapping" ADD CONSTRAINT "EmailActionMapping_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
