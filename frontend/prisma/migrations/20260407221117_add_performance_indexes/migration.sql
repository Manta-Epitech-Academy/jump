-- CreateIndex
CREATE INDEX "Participation_eventId_idx" ON "Participation"("eventId");

-- CreateIndex
CREATE INDEX "Participation_campusId_idx" ON "Participation"("campusId");

-- CreateIndex
CREATE INDEX "PortfolioItem_studentProfileId_idx" ON "PortfolioItem"("studentProfileId");

-- CreateIndex
CREATE INDEX "StepsProgress_eventId_idx" ON "StepsProgress"("eventId");
