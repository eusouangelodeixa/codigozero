-- Área de membros multi-curso: cria Course e liga os Modules existentes ao
-- curso legado "Código Zero" (uuid fixo) ANTES de endurecer o NOT NULL —
-- a tabela Module não está vazia em produção, e os Lesson IDs ficam
-- intocados para preservar TODO o LessonProgress dos alunos.

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "coverUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Course_slug_key" ON "Course"("slug");

-- AlterTable (courseId NULO primeiro — Module não está vazia em prod)
ALTER TABLE "Module" ADD COLUMN     "courseId" TEXT,
ADD COLUMN     "coverUrl" TEXT;

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "thumbnailUrl" TEXT;

-- AlterTable
ALTER TABLE "LessonProgress" ADD COLUMN     "lastViewedAt" TIMESTAMP(3),
ADD COLUMN     "rating" INTEGER;

-- Backfill: todo o conteúdo da Forja vira o curso #1 "Código Zero"
-- (published — os alunos continuam vendo tudo sem interrupção).
INSERT INTO "Course" ("id", "slug", "name", "status", "sortOrder", "updatedAt")
VALUES ('c0000000-0000-4000-8000-000000000001', 'codigo-zero', 'Código Zero', 'published', 0, CURRENT_TIMESTAMP);

UPDATE "Module" SET "courseId" = 'c0000000-0000-4000-8000-000000000001' WHERE "courseId" IS NULL;

-- Endurece agora que não há órfãos
ALTER TABLE "Module" ALTER COLUMN "courseId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Module_courseId_idx" ON "Module"("courseId");

-- CreateIndex
CREATE INDEX "LessonProgress_userId_lastViewedAt_idx" ON "LessonProgress"("userId", "lastViewedAt");

-- AddForeignKey
ALTER TABLE "Module" ADD CONSTRAINT "Module_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
