-- AlterTable
ALTER TABLE "User" ADD COLUMN     "fbc" TEXT,
ADD COLUMN     "fbp" TEXT,
ADD COLUMN     "landingUrl" TEXT;

-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN     "metaCapiToken" TEXT,
ADD COLUMN     "metaPixelId" TEXT,
ADD COLUMN     "metaTestEventCode" TEXT;

