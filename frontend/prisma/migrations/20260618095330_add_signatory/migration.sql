-- CreateTable
CREATE TABLE "Signatory" (
    "id" TEXT NOT NULL,
    "campusId" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "signatureKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Signatory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Signatory_signatureKey_key" ON "Signatory"("signatureKey");

-- CreateIndex
CREATE INDEX "Signatory_campusId_idx" ON "Signatory"("campusId");

-- AddForeignKey
ALTER TABLE "Signatory" ADD CONSTRAINT "Signatory_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
