-- CreateTable
CREATE TABLE "ParentToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParentToken_email_type_idx" ON "ParentToken"("email", "type");

-- CreateIndex
CREATE INDEX "ParentToken_value_type_idx" ON "ParentToken"("value", "type");

-- CreateIndex
CREATE INDEX "ParentToken_expiresAt_idx" ON "ParentToken"("expiresAt");
