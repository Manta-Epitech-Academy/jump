-- CreateTable
CREATE TABLE "Audit_ImpersonationEvent" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Audit_ImpersonationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Audit_ImpersonationEvent_adminUserId_startedAt_idx" ON "Audit_ImpersonationEvent"("adminUserId", "startedAt");

-- CreateIndex
CREATE INDEX "Audit_ImpersonationEvent_targetUserId_idx" ON "Audit_ImpersonationEvent"("targetUserId");
