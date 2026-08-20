-- Status da transcodificação MP4 → HLS (fila ffmpeg no backend). Aditivo e
-- idempotente (IF NOT EXISTS) para sobreviver a colunas já criadas fora do
-- histórico (evita P3009).

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "transcodeStatus" TEXT,
ADD COLUMN IF NOT EXISTS "transcodeError" TEXT;
