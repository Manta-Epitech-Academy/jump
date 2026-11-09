-- CreateTable
CREATE TABLE "AdminDigest_Run" (
    "id" TEXT NOT NULL,
    "weekOf" DATE NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "recipients" INTEGER NOT NULL,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "includedAdoption" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AdminDigest_Run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminDigest_Run_weekOf_key" ON "AdminDigest_Run"("weekOf");
