-- CreateTable
CREATE TABLE "AuthIdentityRepair" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "toUserId" TEXT,
    "fromUserId" TEXT,
    "fromEmail" TEXT,
    "toEmail" TEXT,
    "resolvedBy" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthIdentityRepair_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthIdentityRepair_talentId_idx" ON "AuthIdentityRepair"("talentId");

-- CreateIndex
CREATE INDEX "AuthIdentityRepair_resolvedAt_idx" ON "AuthIdentityRepair"("resolvedAt");
