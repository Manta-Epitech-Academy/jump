-- CreateIndex
CREATE INDEX "Event_campusId_idx" ON "Event"("campusId");

-- CreateIndex
CREATE INDEX "Participation_studentProfileId_idx" ON "Participation"("studentProfileId");

-- CreateIndex
CREATE INDEX "PortfolioItem_eventId_idx" ON "PortfolioItem"("eventId");

-- CreateIndex
CREATE INDEX "StaffProfile_campusId_idx" ON "StaffProfile"("campusId");

-- CreateIndex
CREATE INDEX "StepsProgress_studentProfileId_idx" ON "StepsProgress"("studentProfileId");

-- CreateIndex
CREATE INDEX "StepsProgress_activityId_idx" ON "StepsProgress"("activityId");

-- CreateIndex
CREATE INDEX "StudentProfile_campusId_idx" ON "StudentProfile"("campusId");
