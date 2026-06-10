-- CreateEnum
CREATE TYPE "PresenceSlot" AS ENUM ('morning', 'afternoon');

-- CreateEnum
CREATE TYPE "PresenceStatus" AS ENUM ('present', 'late', 'absent', 'excused');

-- CreateEnum
CREATE TYPE "PresenceSource" AS ENUM ('qr', 'manual', 'system');

-- CreateTable
CREATE TABLE "EventPresence" (
    "id" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "slot" "PresenceSlot" NOT NULL,
    "status" "PresenceStatus" NOT NULL,
    "note" TEXT,
    "source" "PresenceSource" NOT NULL DEFAULT 'manual',
    "markedById" TEXT,
    "markedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventPresence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventPresenceClosure" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "slot" "PresenceSlot" NOT NULL,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventPresenceClosure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventPresence_eventId_day_slot_idx" ON "EventPresence"("eventId", "day", "slot");

-- CreateIndex
CREATE INDEX "EventPresence_markedById_idx" ON "EventPresence"("markedById");

-- CreateIndex
CREATE UNIQUE INDEX "EventPresence_talentId_eventId_day_slot_key" ON "EventPresence"("talentId", "eventId", "day", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "EventPresenceClosure_eventId_day_slot_key" ON "EventPresenceClosure"("eventId", "day", "slot");

-- AddForeignKey
ALTER TABLE "EventPresence" ADD CONSTRAINT "EventPresence_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPresence" ADD CONSTRAINT "EventPresence_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPresence" ADD CONSTRAINT "EventPresence_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPresenceClosure" ADD CONSTRAINT "EventPresenceClosure_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPresenceClosure" ADD CONSTRAINT "EventPresenceClosure_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
