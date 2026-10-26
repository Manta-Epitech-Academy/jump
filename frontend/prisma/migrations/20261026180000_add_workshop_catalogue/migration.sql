-- Subject catalogue (#439): what the dev space's catalogue shows of an online
-- activity, a subject there, beside the tagline and pictures it already had:
-- its level (a closed list), its notions (a list of short labels) and its
-- domains, an open list authored over the admin API (`write_workshop_domain`)
-- that the domain badges will count by (#448).
--
-- No domain ships here, and no activity is filled in. The catalogue is the
-- team's to author, so it starts empty and every existing activity starts with
-- no level, no notion and no domain: the catalogue does not show it until it is
-- complete, and `config_workshops` says what it lacks.

-- CreateEnum
CREATE TYPE "WorkshopLevel" AS ENUM ('beginner', 'intermediate', 'expert', 'all_levels');

-- AlterTable
ALTER TABLE "Workshop_Activity" ADD COLUMN     "level" "WorkshopLevel",
ADD COLUMN     "notions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "Workshop_Domain" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workshop_Domain_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Workshop_ActivityDomain" (
    "activityId" TEXT NOT NULL,
    "domainKey" TEXT NOT NULL,

    CONSTRAINT "Workshop_ActivityDomain_pkey" PRIMARY KEY ("activityId","domainKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workshop_Domain_label_key" ON "Workshop_Domain"("label");

-- CreateIndex
CREATE INDEX "Workshop_ActivityDomain_domainKey_idx" ON "Workshop_ActivityDomain"("domainKey");

-- AddForeignKey
ALTER TABLE "Workshop_ActivityDomain" ADD CONSTRAINT "Workshop_ActivityDomain_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Workshop_Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workshop_ActivityDomain" ADD CONSTRAINT "Workshop_ActivityDomain_domainKey_fkey" FOREIGN KEY ("domainKey") REFERENCES "Workshop_Domain"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

