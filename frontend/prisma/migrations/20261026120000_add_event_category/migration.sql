-- Event categories (#438): an open list of event kinds, authored over the admin
-- API (`write_event_category`), carried by an event and, as a default, by a
-- configuration preset. Display and badge rules only: nothing branches on it.
--
-- No category ships here. The catalogue is the team's to author, so it starts
-- empty and every existing event and preset starts uncategorised, which is a
-- state every screen and operation handles as it handles a categorised one.
--
-- `color` is a `#rrggbb` the team picks, checked by the one write that sets it;
-- no CHECK, since that write already refuses with a message saying what to send.

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "categoryKey" TEXT;

-- AlterTable
ALTER TABLE "EventConfig_Template" ADD COLUMN     "categoryKey" TEXT;

-- CreateTable
CREATE TABLE "EventConfig_Category" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventConfig_Category_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventConfig_Category_label_key" ON "EventConfig_Category"("label");

-- CreateIndex
CREATE INDEX "Event_categoryKey_idx" ON "Event"("categoryKey");

-- CreateIndex
CREATE INDEX "EventConfig_Template_categoryKey_idx" ON "EventConfig_Template"("categoryKey");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_categoryKey_fkey" FOREIGN KEY ("categoryKey") REFERENCES "EventConfig_Category"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventConfig_Template" ADD CONSTRAINT "EventConfig_Template_categoryKey_fkey" FOREIGN KEY ("categoryKey") REFERENCES "EventConfig_Category"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
