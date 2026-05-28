-- AlterTable: ScrapeJob gains multi-city support (cities JSON array)
ALTER TABLE "ScrapeJob" ADD COLUMN "cities" JSONB;

-- AlterTable: ScrapedLead gains Google Maps enrichment fields + per-lead city
ALTER TABLE "ScrapedLead" ADD COLUMN "mapsUrl" TEXT;
ALTER TABLE "ScrapedLead" ADD COLUMN "placeId" TEXT;
ALTER TABLE "ScrapedLead" ADD COLUMN "rating" DOUBLE PRECISION;
ALTER TABLE "ScrapedLead" ADD COLUMN "reviewsCount" INTEGER;
ALTER TABLE "ScrapedLead" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "ScrapedLead" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "ScrapedLead" ADD COLUMN "city" TEXT;
