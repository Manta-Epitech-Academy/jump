-- CreateTable
CREATE TABLE "StaffInvitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "staffRole" "StaffRole" NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffInvitation_email_key" ON "StaffInvitation"("email");

-- CreateIndex
CREATE INDEX "StaffInvitation_campusId_idx" ON "StaffInvitation"("campusId");

-- AddForeignKey
ALTER TABLE "StaffInvitation" ADD CONSTRAINT "StaffInvitation_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffInvitation" ADD CONSTRAINT "StaffInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "bauth_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
