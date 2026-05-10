-- CreateTable
CREATE TABLE "OutlookCalendarSync" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "outlookEventId" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutlookCalendarSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutlookCalendarSync_userId_idx" ON "OutlookCalendarSync"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OutlookCalendarSync_interviewId_userId_key" ON "OutlookCalendarSync"("interviewId", "userId");

-- AddForeignKey
ALTER TABLE "OutlookCalendarSync" ADD CONSTRAINT "OutlookCalendarSync_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutlookCalendarSync" ADD CONSTRAINT "OutlookCalendarSync_userId_fkey" FOREIGN KEY ("userId") REFERENCES "bauth_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
