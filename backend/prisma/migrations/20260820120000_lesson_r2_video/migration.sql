-- Vídeo das aulas no Cloudflare R2 (bucket privado). Aditivo e não-quebrável:
-- o `videoUrl` (embed legado) segue existindo; estes campos passam a valer
-- quando storageProvider = 'r2'. Idempotente (IF NOT EXISTS) para sobreviver a
-- colunas já criadas fora do histórico (evita P3009).

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "videoKey" TEXT,
ADD COLUMN IF NOT EXISTS "videoSize" BIGINT,
ADD COLUMN IF NOT EXISTS "videoDuration" INTEGER,
ADD COLUMN IF NOT EXISTS "videoMimeType" TEXT,
ADD COLUMN IF NOT EXISTS "videoType" TEXT,
ADD COLUMN IF NOT EXISTS "storageProvider" TEXT NOT NULL DEFAULT 'embed',
ADD COLUMN IF NOT EXISTS "videoUploadedAt" TIMESTAMP(3);
