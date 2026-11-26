-- AlterTable
ALTER TABLE "MinigameAttempt" ADD COLUMN     "rankAtFinish" INTEGER;

-- The place each earlier run finished at, recovered from the bonus it was paid:
-- the podium's three amounts are distinct (`minigameRankBonus`, 2x, 1x and half
-- of MINIGAME_XP_REWARD, which has been 50 since the bonus shipped), so a first
-- place counted by a badge (#448) includes the ones won before the place was
-- stored. Every honourable mention beyond the podium was paid the same amount,
-- so its place cannot be told and stays null, as does a run no bonus paid.
UPDATE "MinigameAttempt"
SET "rankAtFinish" = CASE "rankXpAwarded" WHEN 100 THEN 1 WHEN 50 THEN 2 WHEN 25 THEN 3 END
WHERE "rankXpAwarded" IN (100, 50, 25);

-- CreateTable
CREATE TABLE "Badge_Definition" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "shape" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "text" TEXT,
    "backgroundColor" TEXT NOT NULL,
    "ringColor" TEXT NOT NULL,
    "ringDashed" BOOLEAN NOT NULL DEFAULT false,
    "iconColor" TEXT NOT NULL,
    "counterKey" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "periodFrom" DATE,
    "periodTo" DATE,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Badge_Definition_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Badge_RuleEvent" (
    "badgeKey" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "Badge_RuleEvent_pkey" PRIMARY KEY ("badgeKey","eventId")
);

-- CreateTable
CREATE TABLE "Badge_RuleCategory" (
    "badgeKey" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,

    CONSTRAINT "Badge_RuleCategory_pkey" PRIMARY KEY ("badgeKey","categoryKey")
);

-- CreateTable
CREATE TABLE "Badge_RuleDomain" (
    "badgeKey" TEXT NOT NULL,
    "domainKey" TEXT NOT NULL,

    CONSTRAINT "Badge_RuleDomain_pkey" PRIMARY KEY ("badgeKey","domainKey")
);

-- CreateTable
CREATE TABLE "Badge_Award" (
    "talentId" TEXT NOT NULL,
    "badgeKey" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Badge_Award_pkey" PRIMARY KEY ("talentId","badgeKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "Badge_Definition_label_key" ON "Badge_Definition"("label");

-- CreateIndex
CREATE INDEX "Badge_RuleEvent_eventId_idx" ON "Badge_RuleEvent"("eventId");

-- CreateIndex
CREATE INDEX "Badge_RuleCategory_categoryKey_idx" ON "Badge_RuleCategory"("categoryKey");

-- CreateIndex
CREATE INDEX "Badge_RuleDomain_domainKey_idx" ON "Badge_RuleDomain"("domainKey");

-- CreateIndex
CREATE INDEX "Badge_Award_badgeKey_idx" ON "Badge_Award"("badgeKey");

-- AddForeignKey
ALTER TABLE "Badge_RuleEvent" ADD CONSTRAINT "Badge_RuleEvent_badgeKey_fkey" FOREIGN KEY ("badgeKey") REFERENCES "Badge_Definition"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Badge_RuleEvent" ADD CONSTRAINT "Badge_RuleEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Badge_RuleCategory" ADD CONSTRAINT "Badge_RuleCategory_badgeKey_fkey" FOREIGN KEY ("badgeKey") REFERENCES "Badge_Definition"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Badge_RuleCategory" ADD CONSTRAINT "Badge_RuleCategory_categoryKey_fkey" FOREIGN KEY ("categoryKey") REFERENCES "EventConfig_Category"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Badge_RuleDomain" ADD CONSTRAINT "Badge_RuleDomain_badgeKey_fkey" FOREIGN KEY ("badgeKey") REFERENCES "Badge_Definition"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Badge_RuleDomain" ADD CONSTRAINT "Badge_RuleDomain_domainKey_fkey" FOREIGN KEY ("domainKey") REFERENCES "Workshop_Domain"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Badge_Award" ADD CONSTRAINT "Badge_Award_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "Talent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Badge_Award" ADD CONSTRAINT "Badge_Award_badgeKey_fkey" FOREIGN KEY ("badgeKey") REFERENCES "Badge_Definition"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

