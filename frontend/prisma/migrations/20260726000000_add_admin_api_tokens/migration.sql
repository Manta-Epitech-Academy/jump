-- CreateEnum
CREATE TYPE "AdminApi_TokenTier" AS ENUM ('core', 'leadership');

-- CreateTable
CREATE TABLE "AdminApi_Token" (
    "id" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tier" "AdminApi_TokenTier" NOT NULL DEFAULT 'core',
    "writeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AdminApi_Token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminApi_Call" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "params" JSONB,
    "status" INTEGER NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminApi_Call_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminApi_Token_tokenHash_key" ON "AdminApi_Token"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminApi_Token_staffUserId_idx" ON "AdminApi_Token"("staffUserId");

-- CreateIndex
CREATE INDEX "AdminApi_Call_tokenId_createdAt_idx" ON "AdminApi_Call"("tokenId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminApi_Call_createdAt_idx" ON "AdminApi_Call"("createdAt");

-- AddForeignKey
ALTER TABLE "AdminApi_Token" ADD CONSTRAINT "AdminApi_Token_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "bauth_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminApi_Call" ADD CONSTRAINT "AdminApi_Call_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "AdminApi_Token"("id") ON DELETE SET NULL ON UPDATE CASCADE;
