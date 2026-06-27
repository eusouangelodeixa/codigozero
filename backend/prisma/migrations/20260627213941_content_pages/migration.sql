-- AlterTable
ALTER TABLE "User" ADD COLUMN     "leadSource" TEXT,
ADD COLUMN     "newsletterWelcomeDueAt" TIMESTAMP(3),
ADD COLUMN     "newsletterWelcomeSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ContentPage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "theme" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "gateHeadline" TEXT,
    "gateSubtext" TEXT,
    "ctaText" TEXT,
    "ctaUrl" TEXT,
    "relatedPageIds" JSONB NOT NULL DEFAULT '[]',
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "ogImageUrl" TEXT,
    "headScripts" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "leadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentPage_slug_key" ON "ContentPage"("slug");

-- CreateIndex
CREATE INDEX "ContentPage_status_idx" ON "ContentPage"("status");

