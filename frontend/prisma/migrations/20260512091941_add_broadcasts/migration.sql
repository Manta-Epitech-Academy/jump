-- CreateEnum
CREATE TYPE "BroadcastChannel" AS ENUM ('mail', 'sms');

-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('queued', 'sending', 'sent', 'partial_failed', 'failed');

-- CreateEnum
CREATE TYPE "BroadcastRecipientStatus" AS ENUM ('pending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "BroadcastAudience" AS ENUM ('talent', 'parent', 'dev', 'peda', 'manta', 'superdev');

-- CreateEnum
CREATE TYPE "BroadcastSourceFilter" AS ENUM ('opened', 'not_opened', 'all');

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "BroadcastChannel" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "BroadcastChannel" NOT NULL,
    "templateId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "audience" "BroadcastAudience" NOT NULL,
    "eventId" TEXT,
    "sourceBroadcastId" TEXT,
    "sourceFilter" "BroadcastSourceFilter",
    "filters" JSONB,
    "subjectSnapshot" TEXT,
    "bodySnapshot" TEXT NOT NULL,
    "status" "BroadcastStatus" NOT NULL DEFAULT 'queued',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastRecipient" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "talentId" TEXT,
    "staffUserId" TEXT,
    "parentOfTalentId" TEXT,
    "recipientEmail" TEXT,
    "recipientPhone" TEXT,
    "status" "BroadcastRecipientStatus" NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BroadcastRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageTemplate_channel_idx" ON "MessageTemplate"("channel");

-- CreateIndex
CREATE INDEX "Broadcast_campusId_idx" ON "Broadcast"("campusId");

-- CreateIndex
CREATE INDEX "Broadcast_eventId_idx" ON "Broadcast"("eventId");

-- CreateIndex
CREATE INDEX "Broadcast_sourceBroadcastId_idx" ON "Broadcast"("sourceBroadcastId");

-- CreateIndex
CREATE INDEX "Broadcast_createdAt_idx" ON "Broadcast"("createdAt");

-- CreateIndex
CREATE INDEX "Broadcast_status_idx" ON "Broadcast"("status");

-- CreateIndex
CREATE INDEX "BroadcastRecipient_broadcastId_idx" ON "BroadcastRecipient"("broadcastId");

-- CreateIndex
CREATE INDEX "BroadcastRecipient_talentId_idx" ON "BroadcastRecipient"("talentId");

-- CreateIndex
CREATE INDEX "BroadcastRecipient_parentOfTalentId_idx" ON "BroadcastRecipient"("parentOfTalentId");

-- CreateIndex
CREATE INDEX "BroadcastRecipient_staffUserId_idx" ON "BroadcastRecipient"("staffUserId");

-- CreateIndex
CREATE INDEX "BroadcastRecipient_openedAt_idx" ON "BroadcastRecipient"("openedAt");

-- CreateIndex
CREATE INDEX "BroadcastRecipient_status_idx" ON "BroadcastRecipient"("status");

-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "bauth_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_sourceBroadcastId_fkey" FOREIGN KEY ("sourceBroadcastId") REFERENCES "Broadcast"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "bauth_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "bauth_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_parentOfTalentId_fkey" FOREIGN KEY ("parentOfTalentId") REFERENCES "Talent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
