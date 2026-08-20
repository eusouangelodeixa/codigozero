/**
 * Operações de CONTEÚDO de curso (módulos, aulas, vídeo R2), compartilhadas
 * entre o admin (`/api/admin/members`) e o coprodutor (`/api/coproducer`).
 *
 * A camada de rota é fina: resolve autorização (admin = tudo; coprodutor = só o
 * curso que ele coproduz) e traduz `ContentError` em HTTP. TODA a lógica de
 * negócio vive aqui — uma fonte única, sem duplicação.
 */
import { PrismaClient } from '@prisma/client';
import * as r2 from './r2.service';

const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

/** Erro de domínio com status HTTP — a rota converte em res.status(...).json. */
export class ContentError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ContentError';
  }
}

// ── Resolução de curso (para o guard de propriedade do coprodutor) ───────────

export async function courseIdOfModule(moduleId: string): Promise<string | null> {
  const m = await prisma.module.findUnique({ where: { id: moduleId }, select: { courseId: true } });
  return m?.courseId ?? null;
}
export async function courseIdOfLesson(lessonId: string): Promise<string | null> {
  const l = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { module: { select: { courseId: true } } } });
  return l?.module.courseId ?? null;
}

// ── Curso (leitura para o editor) ────────────────────────────────────────────

export async function getCourseForEditor(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      modules: {
        orderBy: { sortOrder: 'asc' },
        include: { lessons: { orderBy: { sortOrder: 'asc' } } },
      },
    },
  });
  if (!course) throw new ContentError(404, 'Curso não encontrado');
  return course;
}

// ── Módulos ──────────────────────────────────────────────────────────────────

export async function createModule(courseId: string, input: { title?: string; description?: string; coverUrl?: string }) {
  const title = String(input.title || '').trim();
  if (!title) throw new ContentError(400, 'Informe o título');
  const last = await prisma.module.findFirst({ where: { courseId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
  return prisma.module.create({
    data: {
      courseId,
      title,
      description: input.description || null,
      coverUrl: input.coverUrl || null,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });
}

export async function updateModule(moduleId: string, input: Record<string, any>) {
  const data: Record<string, unknown> = {};
  if (typeof input.isFree === 'boolean') data.isFree = input.isFree;
  if (typeof input.title === 'string' && input.title.trim()) data.title = input.title.trim();
  if (input.description !== undefined) data.description = input.description || null;
  if (input.coverUrl !== undefined) data.coverUrl = input.coverUrl || null;
  if (Number.isInteger(input.sortOrder)) data.sortOrder = input.sortOrder;
  return prisma.module.update({ where: { id: moduleId }, data });
}

export async function deleteModule(moduleId: string) {
  await prisma.module.delete({ where: { id: moduleId } });
}

export async function reorderModules(courseId: string, ids: string[]) {
  if (!Array.isArray(ids) || !ids.length) throw new ContentError(400, 'ids é obrigatório');
  // Só reordena módulos que pertencem MESMO a este curso (evita mexer noutro).
  const owned = await prisma.module.findMany({ where: { courseId, id: { in: ids } }, select: { id: true } });
  const ownedSet = new Set(owned.map((m) => m.id));
  const clean = ids.filter((i) => ownedSet.has(i));
  await prisma.$transaction(clean.map((id, i) => prisma.module.update({ where: { id }, data: { sortOrder: i } })));
}

// ── Aulas ────────────────────────────────────────────────────────────────────

export async function createLesson(moduleId: string, input: Record<string, any>) {
  const title = String(input.title || '').trim();
  if (!title) throw new ContentError(400, 'Informe o título');

  const mod = await prisma.module.findUnique({
    where: { id: moduleId },
    include: { course: { select: { slug: true, status: true } } },
  });
  if (!mod) throw new ContentError(404, 'Módulo não encontrado');

  const last = await prisma.lesson.findFirst({ where: { moduleId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
  const lesson = await prisma.lesson.create({
    data: {
      moduleId,
      title,
      description: input.description || null,
      videoUrl: input.videoUrl || '',
      duration: Number.isInteger(input.duration) ? input.duration : null,
      thumbnailUrl: input.thumbnailUrl || null,
      content: input.content || null,
      materials: input.materials ?? undefined,
      tools: input.tools ?? undefined,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });

  // 🔔 Aula nova → push pros alunos (só quando o curso já está publicado).
  // Import dinâmico evita ciclo de dependência com routes/auth.routes.
  if (mod.course.status === 'published') {
    import('../routes/auth.routes')
      .then((m) =>
        m.sendPushBroadcast(
          { title: '🎓 Nova Aula Disponível!', body: `${lesson.title} — ${mod.title}`, url: `https://members.czero.sbs/${mod.course.slug}` },
          'system',
        ),
      )
      .catch(() => {});
  }
  return lesson;
}

export async function updateLesson(lessonId: string, input: Record<string, any>) {
  const data: Record<string, unknown> = {};
  if (typeof input.title === 'string' && input.title.trim()) data.title = input.title.trim();
  if (input.description !== undefined) data.description = input.description || null;
  if (input.videoUrl !== undefined) data.videoUrl = input.videoUrl || '';
  if (input.duration !== undefined) data.duration = Number.isInteger(input.duration) ? input.duration : null;
  if (input.thumbnailUrl !== undefined) data.thumbnailUrl = input.thumbnailUrl || null;
  if (input.content !== undefined) data.content = input.content || null;
  if (input.materials !== undefined) data.materials = input.materials;
  if (input.tools !== undefined) data.tools = input.tools;
  if (Number.isInteger(input.sortOrder)) data.sortOrder = input.sortOrder;
  if (typeof input.moduleId === 'string' && input.moduleId) {
    const target = await prisma.module.findUnique({ where: { id: input.moduleId }, select: { id: true } });
    if (!target) throw new ContentError(404, 'Módulo destino não encontrado');
    const last = await prisma.lesson.findFirst({ where: { moduleId: input.moduleId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    data.moduleId = input.moduleId;
    data.sortOrder = (last?.sortOrder ?? -1) + 1;
  }
  return prisma.lesson.update({ where: { id: lessonId }, data });
}

export async function deleteLesson(lessonId: string) {
  // Limpa o vídeo no R2 junto (evita objeto órfão no bucket).
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { storageProvider: true, module: { select: { courseId: true } } },
  });
  if (lesson?.storageProvider === 'r2' && r2.isR2Configured()) {
    try { await r2.deletePrefix(r2.lessonPrefix(lesson.module.courseId, lessonId)); } catch { /* best-effort */ }
  }
  await prisma.lesson.delete({ where: { id: lessonId } });
}

export async function reorderLessons(moduleId: string, ids: string[]) {
  if (!Array.isArray(ids) || !ids.length) throw new ContentError(400, 'ids é obrigatório');
  const owned = await prisma.lesson.findMany({ where: { moduleId, id: { in: ids } }, select: { id: true } });
  const ownedSet = new Set(owned.map((l) => l.id));
  const clean = ids.filter((i) => ownedSet.has(i));
  await prisma.$transaction(clean.map((id, i) => prisma.lesson.update({ where: { id }, data: { sortOrder: i } })));
}

// ── Vídeo no R2 ──────────────────────────────────────────────────────────────

const MAX_VIDEO_BYTES = 20 * 1024 * 1024 * 1024; // 20 GB
const ALLOWED_VIDEO_EXT = new Set(['mp4', 'mov', 'mkv', 'webm', 'm3u8']);
const ALLOWED_VIDEO_MIME = new Set([
  'video/mp4', 'video/quicktime', 'video/x-matroska', 'video/webm',
  'application/x-mpegurl', 'application/vnd.apple.mpegurl',
]);

/** Metadados de vídeo prontos pro JSON (BigInt → Number; 20 GB cabe em Number). */
export function serializeVideoMeta(l: {
  storageProvider: string;
  videoKey: string | null;
  videoSize: bigint | null;
  videoDuration: number | null;
  videoMimeType: string | null;
  videoType: string | null;
  videoUploadedAt: Date | null;
}) {
  return {
    hasVideo: l.storageProvider === 'r2' && !!l.videoKey,
    storageProvider: l.storageProvider,
    videoKey: l.videoKey,
    videoSize: l.videoSize == null ? null : Number(l.videoSize),
    videoDuration: l.videoDuration,
    videoMimeType: l.videoMimeType,
    videoType: l.videoType,
    videoUploadedAt: l.videoUploadedAt,
  };
}

function assertR2(): void {
  if (!r2.isR2Configured()) {
    throw new ContentError(503, 'Armazenamento de vídeo (R2) não está configurado no servidor. Defina as variáveis R2_* e reinicie o backend.');
  }
}

async function loadLessonWithCourse(lessonId: string) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, include: { module: { select: { courseId: true } } } });
  if (!lesson) throw new ContentError(404, 'Aula não encontrada');
  return lesson;
}

export async function initVideoUpload(lessonId: string, input: { filename?: string; size?: number; mimeType?: string }) {
  assertR2();
  const lesson = await loadLessonWithCourse(lessonId);
  const size = Number(input.size || 0);
  const mimeType = String(input.mimeType || '').toLowerCase().trim();
  const filename = String(input.filename || '').trim();

  if (!Number.isFinite(size) || size <= 0) throw new ContentError(400, 'Tamanho de arquivo inválido.');
  if (size > MAX_VIDEO_BYTES) throw new ContentError(400, 'Arquivo acima do limite de 20 GB. Comprima ou divida o vídeo.');

  const ext = r2.extFor(filename, mimeType);
  const extOk = ALLOWED_VIDEO_EXT.has(ext);
  const mimeOk = !mimeType || ALLOWED_VIDEO_MIME.has(mimeType) || mimeType.startsWith('video/');
  if (!extOk || !mimeOk) throw new ContentError(400, 'Formato não suportado. Use MP4, MOV, MKV, WEBM ou M3U8 (HLS).');

  const videoType = ext === 'm3u8' ? 'hls' : 'mp4';
  const key = r2.videoKeyFor(lesson.module.courseId, lessonId, ext);
  const contentType = mimeType || (videoType === 'hls' ? 'application/x-mpegurl' : 'video/mp4');
  const { uploadId } = await r2.createMultipart({ key, contentType });
  return { uploadId, key, videoType, partSize: 64 * 1024 * 1024, maxParts: 10000 };
}

/** Valida que a key pertence MESMO ao prefixo desta aula (não deixa assinar/gravar noutro caminho). */
async function assertKeyBelongsToLesson(lessonId: string, key: string): Promise<{ courseId: string }> {
  const lesson = await loadLessonWithCourse(lessonId);
  const prefix = r2.lessonPrefix(lesson.module.courseId, lessonId);
  if (!key || !key.startsWith(prefix)) throw new ContentError(400, 'Key inválida para esta aula.');
  return { courseId: lesson.module.courseId };
}

export async function signVideoPart(lessonId: string, input: { key?: string; uploadId?: string; partNumber?: number }) {
  assertR2();
  const key = String(input.key || '');
  const uploadId = String(input.uploadId || '');
  const partNumber = Number(input.partNumber || 0);
  await assertKeyBelongsToLesson(lessonId, key);
  if (!uploadId) throw new ContentError(400, 'uploadId ausente.');
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) throw new ContentError(400, 'partNumber inválido.');
  const url = await r2.signUploadPart({ key, uploadId, partNumber });
  return { url };
}

export async function completeVideoUpload(lessonId: string, input: Record<string, any>) {
  assertR2();
  const key = String(input.key || '');
  const uploadId = String(input.uploadId || '');
  const parts = Array.isArray(input.parts) ? input.parts : [];
  const duration = Number(input.duration);
  const mimeType = String(input.mimeType || '').trim() || null;
  const videoType = input.videoType === 'hls' ? 'hls' : 'mp4';
  const thumbnailUrl = input.thumbnailUrl ? String(input.thumbnailUrl) : null;

  await assertKeyBelongsToLesson(lessonId, key);
  if (!uploadId) throw new ContentError(400, 'uploadId ausente.');
  const normParts = parts
    .map((p: any) => ({ partNumber: Number(p?.partNumber), etag: String(p?.etag || '') }))
    .filter((p: any) => Number.isInteger(p.partNumber) && p.etag);
  if (!normParts.length) throw new ContentError(400, 'Nenhuma parte enviada.');

  await r2.completeMultipart({ key, uploadId, parts: normParts });

  const head = await r2.headObject(key);
  const size = head?.size ?? 0;

  // Substituição: apaga vídeo antigo com OUTRA extensão que tenha sobrado.
  try {
    const prefix = key.slice(0, key.lastIndexOf('/') + 1);
    const siblings = await r2.listPrefix(prefix);
    for (const s of siblings.filter((o) => o.key !== key && /\/video\.[a-z0-9]+$/i.test(o.key))) {
      await r2.deleteObject(s.key);
    }
  } catch (e) {
    console.warn('[CONTENT] limpeza de vídeo antigo falhou (ignorado):', (e as Error).message);
  }

  const existing = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { duration: true, thumbnailUrl: true } });
  const durationInt = Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null;
  const updated = await prisma.lesson.update({
    where: { id: lessonId },
    data: {
      videoKey: key,
      videoSize: BigInt(Math.max(0, Math.round(size))),
      videoDuration: durationInt,
      videoMimeType: mimeType,
      videoType,
      storageProvider: 'r2',
      videoUploadedAt: new Date(),
      ...(durationInt && !existing?.duration ? { duration: durationInt } : {}),
      ...(thumbnailUrl && !existing?.thumbnailUrl ? { thumbnailUrl } : {}),
    },
  });
  return serializeVideoMeta(updated);
}

export async function abortVideoUpload(lessonId: string, input: { key?: string; uploadId?: string }) {
  assertR2();
  const key = String(input.key || '');
  const uploadId = String(input.uploadId || '');
  const lesson = await loadLessonWithCourse(lessonId);
  const prefix = r2.lessonPrefix(lesson.module.courseId, lessonId);
  if (key.startsWith(prefix) && uploadId) await r2.abortMultipart({ key, uploadId });
  return { ok: true };
}

export async function getVideoMeta(lessonId: string) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) throw new ContentError(404, 'Aula não encontrada');
  let previewUrl: string | null = null;
  if (lesson.storageProvider === 'r2' && lesson.videoKey && r2.isR2Configured()) {
    try { previewUrl = (await r2.getSignedDownloadUrl(lesson.videoKey, { expiresIn: 300 })).url; }
    catch (e) { console.warn('[CONTENT] preview URL falhou:', (e as Error).message); }
  }
  return {
    video: serializeVideoMeta(lesson),
    previewUrl,
    legacyEmbed: lesson.storageProvider !== 'r2' ? lesson.videoUrl || null : null,
  };
}

export async function deleteVideo(lessonId: string) {
  const lesson = await loadLessonWithCourse(lessonId);
  if (lesson.storageProvider === 'r2' && r2.isR2Configured()) {
    await r2.deletePrefix(r2.lessonPrefix(lesson.module.courseId, lessonId));
  }
  const updated = await prisma.lesson.update({
    where: { id: lessonId },
    data: {
      videoKey: null, videoSize: null, videoDuration: null, videoMimeType: null,
      videoType: null, storageProvider: 'embed', videoUploadedAt: null,
    },
  });
  return serializeVideoMeta(updated);
}
