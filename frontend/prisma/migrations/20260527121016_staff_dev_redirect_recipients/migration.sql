-- AlterTable
ALTER TABLE "StaffProfile" ADD COLUMN     "devRedirectEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "devRedirectPhones" TEXT[] DEFAULT ARRAY[]::TEXT[];
