-- CreateTable
CREATE TABLE "SyncError" (
    "id" TEXT NOT NULL,
    "errorType" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "attemptedExtId" TEXT NOT NULL,
    "existingExtId" TEXT,
    "talentName" TEXT NOT NULL,
    "eventExtId" TEXT,
    "message" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "lastOccurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncError_resolved_idx" ON "SyncError"("resolved");

-- CreateIndex
CREATE INDEX "SyncError_lastOccurredAt_idx" ON "SyncError"("lastOccurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "SyncError_email_attemptedExtId_key" ON "SyncError"("email", "attemptedExtId");
