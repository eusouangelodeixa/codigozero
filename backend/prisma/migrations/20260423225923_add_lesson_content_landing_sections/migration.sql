-- AlterTable
ALTER TABLE "LandingConfig" ADD COLUMN     "sections" JSONB,
ADD COLUMN     "vslEmbedHtml" TEXT;

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "content" TEXT,
ADD COLUMN     "materials" JSONB;
