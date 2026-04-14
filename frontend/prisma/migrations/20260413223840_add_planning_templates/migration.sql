-- CreateTable
CREATE TABLE "PlanningTemplate" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "nbDays" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanningTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanningTemplateDay" (
    "id" TEXT NOT NULL,
    "planningTemplateId" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanningTemplateDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanningTemplateSlot" (
    "id" TEXT NOT NULL,
    "planningTemplateDayId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "label" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanningTemplateSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanningTemplateSlotItem" (
    "id" TEXT NOT NULL,
    "planningTemplateSlotId" TEXT NOT NULL,
    "activityTemplateId" TEXT,
    "nom" TEXT,
    "description" TEXT,
    "activityType" "ActivityType" NOT NULL DEFAULT 'orga',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanningTemplateSlotItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanningTemplate_nom_key" ON "PlanningTemplate"("nom");

-- CreateIndex
CREATE INDEX "PlanningTemplateDay_planningTemplateId_idx" ON "PlanningTemplateDay"("planningTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanningTemplateDay_planningTemplateId_dayIndex_key" ON "PlanningTemplateDay"("planningTemplateId", "dayIndex");

-- CreateIndex
CREATE INDEX "PlanningTemplateSlot_planningTemplateDayId_idx" ON "PlanningTemplateSlot"("planningTemplateDayId");

-- CreateIndex
CREATE INDEX "PlanningTemplateSlotItem_planningTemplateSlotId_idx" ON "PlanningTemplateSlotItem"("planningTemplateSlotId");

-- CreateIndex
CREATE INDEX "PlanningTemplateSlotItem_activityTemplateId_idx" ON "PlanningTemplateSlotItem"("activityTemplateId");

-- AddForeignKey
ALTER TABLE "PlanningTemplateDay" ADD CONSTRAINT "PlanningTemplateDay_planningTemplateId_fkey" FOREIGN KEY ("planningTemplateId") REFERENCES "PlanningTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningTemplateSlot" ADD CONSTRAINT "PlanningTemplateSlot_planningTemplateDayId_fkey" FOREIGN KEY ("planningTemplateDayId") REFERENCES "PlanningTemplateDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningTemplateSlotItem" ADD CONSTRAINT "PlanningTemplateSlotItem_planningTemplateSlotId_fkey" FOREIGN KEY ("planningTemplateSlotId") REFERENCES "PlanningTemplateSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningTemplateSlotItem" ADD CONSTRAINT "PlanningTemplateSlotItem_activityTemplateId_fkey" FOREIGN KEY ("activityTemplateId") REFERENCES "ActivityTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
