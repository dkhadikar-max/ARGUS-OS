-- CreateEnum
CREATE TYPE "LeadPath" AS ENUM ('FREE', 'STARTER', 'PRO', 'ENTERPRISE');

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "path" "LeadPath" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_path_idx" ON "Lead"("path");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");
