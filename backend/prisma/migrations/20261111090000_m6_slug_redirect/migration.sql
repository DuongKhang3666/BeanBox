-- CreateEnum
CREATE TYPE "SlugEntity" AS ENUM ('PRODUCT', 'CATEGORY');

-- CreateTable
CREATE TABLE "SlugRedirect" (
    "id" TEXT NOT NULL,
    "entity" "SlugEntity" NOT NULL,
    "fromSlug" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlugRedirect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlugRedirect_entity_targetId_idx" ON "SlugRedirect"("entity", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "SlugRedirect_entity_fromSlug_key" ON "SlugRedirect"("entity", "fromSlug");

-- CreateIndex
CREATE INDEX "Review_status_createdAt_idx" ON "Review"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_userId_productId_key" ON "Review"("userId", "productId");

