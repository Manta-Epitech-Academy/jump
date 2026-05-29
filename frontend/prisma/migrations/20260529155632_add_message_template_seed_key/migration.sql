/*
  Warnings:

  - A unique constraint covering the columns `[seedKey]` on the table `MessageTemplate` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "MessageTemplate" ADD COLUMN     "seedKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_seedKey_key" ON "MessageTemplate"("seedKey");
