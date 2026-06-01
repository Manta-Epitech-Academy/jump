-- Append-only ledger of OTP login attempts. Replaces the in-memory Map in
-- `$lib/server/auth/rateLimiter` so horizontally-scaled SvelteKit pods share
-- one budget per email and a pod restart cannot reset an attacker's count.
-- One row per attempt, queried by (bucket, email, createdAt > cutoff).

-- CreateTable
CREATE TABLE "OtpAttempt" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: serves the limiter's hot query
-- (WHERE bucket = ? AND email = ? AND createdAt > ?).
CREATE INDEX "OtpAttempt_bucket_email_createdAt_idx" ON "OtpAttempt"("bucket", "email", "createdAt");

-- CreateIndex: serves the cleanup sweep's (WHERE createdAt < cutoff) without
-- having to bucket-scan.
CREATE INDEX "OtpAttempt_createdAt_idx" ON "OtpAttempt"("createdAt");
