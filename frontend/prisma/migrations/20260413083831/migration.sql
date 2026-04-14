-- AlterTable
ALTER TABLE "bauth_account" RENAME CONSTRAINT "account_pkey" TO "bauth_account_pkey";

-- AlterTable
ALTER TABLE "bauth_session" RENAME CONSTRAINT "session_pkey" TO "bauth_session_pkey";

-- AlterTable
ALTER TABLE "bauth_user" RENAME CONSTRAINT "user_pkey" TO "bauth_user_pkey";

-- AlterTable
ALTER TABLE "bauth_verification" RENAME CONSTRAINT "verification_pkey" TO "bauth_verification_pkey";

-- RenameForeignKey
ALTER TABLE "bauth_account" RENAME CONSTRAINT "account_userId_fkey" TO "bauth_account_userId_fkey";

-- RenameForeignKey
ALTER TABLE "bauth_session" RENAME CONSTRAINT "session_userId_fkey" TO "bauth_session_userId_fkey";

-- RenameIndex
ALTER INDEX "session_token_key" RENAME TO "bauth_session_token_key";

-- RenameIndex
ALTER INDEX "user_email_key" RENAME TO "bauth_user_email_key";

-- RenameIndex
ALTER INDEX "verification_identifier_key" RENAME TO "bauth_verification_identifier_key";
