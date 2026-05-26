-- DropIndex
DROP INDEX "bauth_verification_identifier_key";

-- CreateIndex
CREATE INDEX "bauth_verification_identifier_idx" ON "bauth_verification"("identifier");
