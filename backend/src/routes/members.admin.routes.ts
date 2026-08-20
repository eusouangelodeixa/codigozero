import { isAllowedUpload } from '../lib/uploadGuards';
/**
 * Admin da área de membros multi-curso. Mounted em /api/admin/members.
 *
 * Cursos CRUD (o PATCH de curso recebe `config` — é o botão Salvar do editor
 * WYSIWYG), gestor de conteúdo (módulos/aulas com reorder transacional e
 * mover aula de módulo) e upload de mídia (uploads/courses, webp ≤1920 —
 * o bg da página de login é 1920x1080; o cap padrão de 1600 encolheria).
 * Substitui o CRUD antigo de módulos/aulas do admin.routes (removido na
 * fase de limpeza da Forja).
 */
import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { adminMiddleware } from '../middlewares/admin.middleware';
import { optimizeImage } from '../lib/image';
import { sendPushBroadcast } from './auth.routes';
import { newCourseWebhookToken } from './courseWebhook.routes';
import { env } from '../config/env';
import { bulkEnroll, parseBulkList } from '../services/bulkEnroll.service';
import * as r2 from '../services/r2.service';

const router = Router();
const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

const coursesMediaDir = path.join(__dirname, '..', '..', 'uploads', 'courses');
fs.mkdirSync(coursesMediaDir, { recursive: true });

const coursesUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, coursesMediaDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (isAllowedUpload(file.mimetype, { pdf: true })) cb(null, true);
    else cb(new Error('Apenas imagens ou PDF são permitidos'));
  },
});

router.use(authMiddleware);
router.use(adminMiddleware);

// Slugs que colidem com rotas fixas do app members (app/members/{login,sso}
// e a raiz de cursos do admin).
const RESERVED_SLUGS = new Set(['login', 'sso', 'cursos', 'api', 'uploads']);

function slugify(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function uniqueCourseSlug(base: string, ignoreId?: string): Promise<string> {
  let root = slugify(base) || 'curso';
  if (RESERVED_SLUGS.has(root)) root = `curso-${root}`;
  let candidate = root;
  let n = 1;
  while (true) {
    const existing = await prisma.course.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing || existing.id === ignoreId) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

// ── Upload ──────────────────────────────────────────────────────────────────

// POST /api/admin/members/upload — capas, posters, logos, bg de login, thumbs.
router.post('/upload', (req: AuthRequest, res: Response) => {
  coursesUpload.single('file')(req, res, async (err: any) => {
    if (err) return res.status(400).json({ error: err.message || 'Falha no upload' });
    if (!req.file) return res.status(400).json({ error: 'Arquivo ausente' });

    const isPdf = req.file.mimetype === 'application/pdf';
    let filename = req.file.filename;
    if (!isPdf) {
      const optimized = await optimizeImage(req.file.path, { maxDim: 1920, format: 'webp' });
      if (optimized) filename = optimized.filename;
    }
    // URL absoluta: members.czero.sbs é outra origem; /uploads é servido pelo
    // host do backend (app.czero.sbs) — mesmo racional do upload de conteúdo.
    const base = `${req.protocol}://${req.get('host')}`;
    return res.json({
      url: `${base}/uploads/courses/${filename}`,
      name: req.file.originalname,
      type: isPdf ? 'file' : 'image',
    });
  });
});

// ── Cursos ──────────────────────────────────────────────────────────────────

// GET /api/admin/members/courses — lista com contagens.
router.get('/courses', async (_req: AuthRequest, res: Response) => {
  try {
    const courses = await prisma.course.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { modules: { select: { id: true, lessons: { select: { id: true } } } } },
    });
    return res.json({
      courses: courses.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        coverUrl: c.coverUrl,
        status: c.status,
        sortOrder: c.sortOrder,
        moduleCount: c.modules.length,
        lessonCount: c.modules.reduce((a, m) => a + m.lessons.length, 0),
        updatedAt: c.updatedAt,
      })),
    });
  } catch (error) {
    console.error('[ADMIN-MEMBERS] list courses failed:', error);
    return res.status(500).json({ error: 'Erro ao listar cursos' });
  }
});

// POST /api/admin/members/courses { name }
router.post('/courses', async (req: AuthRequest, res: Response) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Informe o nome do curso' });
    const last = await prisma.course.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    const course = await prisma.course.create({
      data: { name, slug: await uniqueCourseSlug(name), sortOrder: (last?.sortOrder ?? -1) + 1 },
    });
    return res.json({ course });
  } catch (error) {
    console.error('[ADMIN-MEMBERS] create course failed:', error);
    return res.status(500).json({ error: 'Erro ao criar curso' });
  }
});

// GET /api/admin/members/courses/:id — curso completo (editor + gestor).
router.get('/courses/:id', async (req: AuthRequest, res: Response) => {
  try {
    const course = await prisma.course.findUnique({
      where: { id: String(req.params.id) },
      include: {
        modules: {
          orderBy: { sortOrder: 'asc' },
          include: { lessons: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    if (!course) return res.status(404).json({ error: 'Curso não encontrado' });
    return res.json({ course });
  } catch (error) {
    console.error('[ADMIN-MEMBERS] get course failed:', error);
    return res.status(500).json({ error: 'Erro ao carregar curso' });
  }
});

// PATCH /api/admin/members/courses/:id { name?, slug?, status?, sortOrder?, coverUrl?, config? }
router.patch('/courses/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { name, slug, status, sortOrder, coverUrl, config, accessType, includedInSubscription, productPid, includedTools, coproducerId, checkoutUrl } = req.body || {};
    const data: Record<string, unknown> = {};
    // Dois eixos independentes (ver schema): accessType = vendido à parte?
    // includedInSubscription = assinante entra de graça? Um curso pode ser os
    // dois ao mesmo tempo (híbrido).
    if (accessType === 'paid' || accessType === 'subscription') data.accessType = accessType;
    if (typeof includedInSubscription === 'boolean') data.includedInSubscription = includedInSubscription;
    if (productPid !== undefined) data.productPid = String(productPid || '').trim() || null;
    // Coprodutor associado (um por curso; '' / null desassocia). Validado
    // contra a tabela para não gravar id órfão.
    if (coproducerId !== undefined) {
      const cid = String(coproducerId || '').trim();
      if (cid) {
        const exists = await prisma.coproducerAccount.findUnique({ where: { id: cid }, select: { id: true } });
        if (!exists) return res.status(400).json({ error: 'Coprodutor não encontrado' });
        data.coproducerId = cid;
      } else {
        data.coproducerId = null;
      }
    }
    // Link público de compra — vira o CTA "Comprar" no cadeado do curso pago.
    if (checkoutUrl !== undefined) data.checkoutUrl = String(checkoutUrl || '').trim() || null;
    // null = tudo (não mexe nos cursos antigos); array = só o que estiver lá.
    if (includedTools !== undefined) {
      data.includedTools = Array.isArray(includedTools) ? includedTools.map(String) : null;
    }
    if (typeof name === 'string' && name.trim()) data.name = name.trim();
    if (typeof slug === 'string' && slug.trim()) data.slug = await uniqueCourseSlug(slug, id);
    if (status === 'draft' || status === 'published') data.status = status;
    if (Number.isInteger(sortOrder)) data.sortOrder = sortOrder;
    if (coverUrl !== undefined) data.coverUrl = coverUrl || null;
    if (config !== undefined) data.config = config;
    const course = await prisma.course.update({ where: { id }, data });
    return res.json({ course });
  } catch (error) {
    console.error('[ADMIN-MEMBERS] patch course failed:', error);
    return res.status(500).json({ error: 'Erro ao salvar curso' });
  }
});

// POST /api/admin/members/courses/:id/webhook-token — gera (ou roda) o token
// da rota de venda deste curso e devolve a URL pronta a colar na Lojou.
//
// Cada curso tem a SUA rota: o webhook principal não valida produto nenhum e
// trataria a compra do curso como assinatura completa da plataforma.
router.post('/courses/:id/webhook-token', async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const webhookToken = newCourseWebhookToken();
    const course = await prisma.course.update({
      where: { id },
      data: { webhookToken },
      select: { id: true, name: true, webhookToken: true, productPid: true },
    });
    const base = (env.FRONTEND_URL || 'https://app.czero.sbs').replace(/\/$/, '');
    return res.json({
      course,
      webhookUrl: `${base}/api/webhooks/course/${webhookToken}`,
    });
  } catch (error) {
    console.error('[ADMIN-MEMBERS] webhook token failed:', error);
    return res.status(500).json({ error: 'Erro ao gerar webhook do curso' });
  }
});

// ── Alunos do curso ────────────────────────────────────────────────────────
// "Aluno" aqui é quem tem direito EXPLÍCITO ao curso (CourseAccess) ou quem já
// mexeu nele (tem progresso). Assinante que vê o curso por estar incluído no
// plano não é listado um a um de propósito: seriam todos, e a lista deixaria de
// dizer alguma coisa — esse número aparece à parte, como "assinantes com
// acesso pelo plano".
router.get('/courses/:id/students', async (req: AuthRequest, res: Response) => {
  try {
    const courseId = String(req.params.id);
    const curso = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, accessType: true, modules: { select: { lessons: { select: { id: true } } } } },
    });
    if (!curso) return res.status(404).json({ error: 'Curso não encontrado' });

    const lessonIds = curso.modules.flatMap((m) => m.lessons.map((l) => l.id));
    const totalAulas = lessonIds.length;

    const [acessos, comProgresso] = await Promise.all([
      prisma.courseAccess.findMany({
        where: { courseId },
        select: {
          userId: true, source: true, expiresAt: true, createdAt: true,
          user: { select: { id: true, name: true, email: true, phone: true, subscriptionStatus: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      lessonIds.length
        ? prisma.lessonProgress.findMany({
            where: { lessonId: { in: lessonIds } },
            select: { userId: true },
            distinct: ['userId'],
          })
        : Promise.resolve([] as Array<{ userId: string }>),
    ]);

    const ids = new Set<string>([...acessos.map((a) => a.userId), ...comProgresso.map((p) => p.userId)]);
    const users = await prisma.user.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, name: true, email: true, phone: true, subscriptionStatus: true },
    });

    const progresso = lessonIds.length
      ? await prisma.lessonProgress.findMany({
          where: { lessonId: { in: lessonIds }, userId: { in: [...ids] } },
          select: { userId: true, completed: true, lastViewedAt: true },
        })
      : [];

    const porUser = new Map<string, { feitas: number; ultimo: Date | null }>();
    for (const p of progresso) {
      const cur = porUser.get(p.userId) || { feitas: 0, ultimo: null };
      if (p.completed) cur.feitas++;
      if (p.lastViewedAt && (!cur.ultimo || p.lastViewedAt > cur.ultimo)) cur.ultimo = p.lastViewedAt;
      porUser.set(p.userId, cur);
    }
    const acessoPorUser = new Map(acessos.map((a) => [a.userId, a]));

    const students = users.map((u) => {
      const prog = porUser.get(u.id) || { feitas: 0, ultimo: null };
      const acesso = acessoPorUser.get(u.id);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        subscriptionStatus: u.subscriptionStatus,
        lastAccess: prog.ultimo,
        completedLessons: prog.feitas,
        totalLessons: totalAulas,
        pct: totalAulas ? Math.round((prog.feitas / totalAulas) * 100) : 0,
        // Sem linha de CourseAccess, a pessoa só está aqui por ter progresso —
        // ou seja, entrou pelo plano, não por matrícula.
        access: acesso
          ? { source: acesso.source, expiresAt: acesso.expiresAt, lifetime: acesso.expiresAt === null, since: acesso.createdAt }
          : null,
      };
    });

    students.sort((a, b) => (b.lastAccess?.getTime() || 0) - (a.lastAccess?.getTime() || 0));

    const comAcesso = students.length;
    const mediaProgresso = comAcesso
      ? Math.round((students.reduce((s, x) => s + x.pct, 0) / comAcesso) * 100) / 100
      : 0;
    const concluiram = students.filter((s) => totalAulas > 0 && s.completedLessons >= totalAulas).length;

    const assinantesPlano =
      (curso.accessType || 'subscription') !== 'paid'
        ? await prisma.user.count({ where: { subscriptionStatus: { in: ['active', 'grace_period'] }, role: 'member' } })
        : 0;

    return res.json({
      students,
      metrics: {
        total: comAcesso,
        avgProgress: mediaProgresso,
        completionRate: comAcesso ? Math.round((concluiram / comAcesso) * 10000) / 100 : 0,
        subscribersWithPlanAccess: assinantesPlano,
      },
    });
  } catch (error) {
    console.error('[ADMIN-MEMBERS] students failed:', error);
    return res.status(500).json({ error: 'Erro ao carregar alunos' });
  }
});

// POST /api/admin/members/courses/:id/students — matricula UMA pessoa.
// Reaproveita a conta por e-mail; se não existir, cria e põe na fila de
// credenciais (a mesma da importação, e-mail primeiro).
router.post('/courses/:id/students', async (req: AuthRequest, res: Response) => {
  try {
    const courseId = String(req.params.id);
    const email = String(req.body?.email || '').trim().toLowerCase();
    const name = String(req.body?.name || '').trim();
    const phone = String(req.body?.phone || '').trim();
    const lifetime = req.body?.lifetime !== false;
    if (!email) return res.status(400).json({ error: 'E-mail é obrigatório.' });

    const curso = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
    if (!curso) return res.status(404).json({ error: 'Curso não encontrado' });

    const { entries } = parseBulkList([name, email, phone].filter(Boolean).join(','));
    const result = await bulkEnroll({
      entries,
      platformDays: 0, // matrícula avulsa não dá plataforma; só o curso
      courseId,
      courseExpiresAt: lifetime ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      grantedById: req.user!.id,
      batch: 'avulso',
    });
    return res.json(result);
  } catch (error) {
    console.error('[ADMIN-MEMBERS] add student failed:', error);
    return res.status(500).json({ error: 'Erro ao adicionar aluno' });
  }
});

// DELETE /api/admin/members/courses/:id/students/:userId — tira o direito.
// Não apaga progresso: se voltar, encontra tudo onde deixou.
router.delete('/courses/:id/students/:userId', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.courseAccess.deleteMany({
      where: { courseId: String(req.params.id), userId: String(req.params.userId) },
    });
    return res.json({ ok: true });
  } catch (error) {
    console.error('[ADMIN-MEMBERS] remove student failed:', error);
    return res.status(500).json({ error: 'Erro ao remover acesso' });
  }
});

// DELETE /api/admin/members/courses/:id — cascata em módulos/aulas/progresso.
router.delete('/courses/:id', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.course.delete({ where: { id: String(req.params.id) } });
    return res.json({ success: true });
  } catch (error) {
    console.error('[ADMIN-MEMBERS] delete course failed:', error);
    return res.status(500).json({ error: 'Erro ao excluir curso' });
  }
});

// ── Módulos ─────────────────────────────────────────────────────────────────

// POST /api/admin/members/courses/:id/modules { title, description?, coverUrl? }
router.post('/courses/:id/modules', async (req: AuthRequest, res: Response) => {
  try {
    const courseId = String(req.params.id);
    const { title, description, coverUrl } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Informe o título' });
    const last = await prisma.module.findFirst({
      where: { courseId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const mod = await prisma.module.create({
      data: {
        courseId,
        title: String(title).trim(),
        description: description || null,
        coverUrl: coverUrl || null,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    return res.json({ module: mod });
  } catch (error) {
    console.error('[ADMIN-MEMBERS] create module failed:', error);
    return res.status(500).json({ error: 'Erro ao criar módulo' });
  }
});

// PATCH /api/admin/members/modules/:id { title?, description?, coverUrl?, sortOrder? }
router.patch('/modules/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, coverUrl, sortOrder, isFree } = req.body || {};
    const data: Record<string, unknown> = {};
    if (typeof isFree === 'boolean') data.isFree = isFree;
    if (typeof title === 'string' && title.trim()) data.title = title.trim();
    if (description !== undefined) data.description = description || null;
    if (coverUrl !== undefined) data.coverUrl = coverUrl || null;
    if (Number.isInteger(sortOrder)) data.sortOrder = sortOrder;
    const mod = await prisma.module.update({ where: { id: String(req.params.id) }, data });
    return res.json({ module: mod });
  } catch (error) {
    console.error('[ADMIN-MEMBERS] patch module failed:', error);
    return res.status(500).json({ error: 'Erro ao salvar módulo' });
  }
});

// DELETE /api/admin/members/modules/:id
router.delete('/modules/:id', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.module.delete({ where: { id: String(req.params.id) } });
    return res.json({ success: true });
  } catch (error) {
    console.error('[ADMIN-MEMBERS] delete module failed:', error);
    return res.status(500).json({ error: 'Erro ao excluir módulo' });
  }
});

// POST /api/admin/members/courses/:id/modules/reorder { ids: [] } — ordem nova
// completa, transacional (padrão drag-and-drop do gestor).
router.post('/courses/:id/modules/reorder', async (req: AuthRequest, res: Response) => {
  try {
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ error: 'ids é obrigatório' });
    await prisma.$transaction(
      ids.map((id, i) => prisma.module.update({ where: { id }, data: { sortOrder: i } })),
    );
    return res.json({ success: true });
  } catch (error) {
    console.error('[ADMIN-MEMBERS] reorder modules failed:', error);
    return res.status(500).json({ error: 'Erro ao reordenar módulos' });
  }
});

// ── Aulas ───────────────────────────────────────────────────────────────────

// POST /api/admin/members/modules/:id/lessons — mantém o push broadcast de
// aula nova do CRUD antigo, agora apontando para a área de membros.
router.post('/modules/:id/lessons', async (req: AuthRequest, res: Response) => {
  try {
    const moduleId = String(req.params.id);
    const { title, description, videoUrl, duration, thumbnailUrl, content, materials, tools } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Informe o título' });

    const mod = await prisma.module.findUnique({
      where: { id: moduleId },
      include: { course: { select: { slug: true, status: true } } },
    });
    if (!mod) return res.status(404).json({ error: 'Módulo não encontrado' });

    const last = await prisma.lesson.findFirst({
      where: { moduleId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const lesson = await prisma.lesson.create({
      data: {
        moduleId,
        title: String(title).trim(),
        description: description || null,
        videoUrl: videoUrl || '',
        duration: Number.isInteger(duration) ? duration : null,
        thumbnailUrl: thumbnailUrl || null,
        content: content || null,
        materials: materials ?? undefined,
        tools: tools ?? undefined,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });

    // 🔔 Aula nova → push pros alunos (só quando o curso já está publicado).
    if (mod.course.status === 'published') {
      sendPushBroadcast(
        {
          title: '🎓 Nova Aula Disponível!',
          body: `${lesson.title} — ${mod.title}`,
          url: `https://members.czero.sbs/${mod.course.slug}`,
        },
        'system',
      ).catch(() => {});
    }

    return res.json({ lesson });
  } catch (error) {
    console.error('[ADMIN-MEMBERS] create lesson failed:', error);
    return res.status(500).json({ error: 'Erro ao criar aula' });
  }
});

// PATCH /api/admin/members/lessons/:id — todos os campos + moduleId (mover
// de módulo: entra no fim do módulo destino).
router.patch('/lessons/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { title, description, videoUrl, duration, thumbnailUrl, content, materials, tools, sortOrder, moduleId } =
      req.body || {};
    const data: Record<string, unknown> = {};
    if (typeof title === 'string' && title.trim()) data.title = title.trim();
    if (description !== undefined) data.description = description || null;
    if (videoUrl !== undefined) data.videoUrl = videoUrl || '';
    if (duration !== undefined) data.duration = Number.isInteger(duration) ? duration : null;
    if (thumbnailUrl !== undefined) data.thumbnailUrl = thumbnailUrl || null;
    if (content !== undefined) data.content = content || null;
    if (materials !== undefined) data.materials = materials;
    if (tools !== undefined) data.tools = tools;
    if (Number.isInteger(sortOrder)) data.sortOrder = sortOrder;
    if (typeof moduleId === 'string' && moduleId) {
      const target = await prisma.module.findUnique({ where: { id: moduleId }, select: { id: true } });
      if (!target) return res.status(404).json({ error: 'Módulo destino não encontrado' });
      const last = await prisma.lesson.findFirst({
        where: { moduleId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      data.moduleId = moduleId;
      data.sortOrder = (last?.sortOrder ?? -1) + 1;
    }
    const lesson = await prisma.lesson.update({ where: { id }, data });
    return res.json({ lesson });
  } catch (error) {
    console.error('[ADMIN-MEMBERS] patch lesson failed:', error);
    return res.status(500).json({ error: 'Erro ao salvar aula' });
  }
});

// DELETE /api/admin/members/lessons/:id
router.delete('/lessons/:id', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.lesson.delete({ where: { id: String(req.params.id) } });
    return res.json({ success: true });
  } catch (error) {
    console.error('[ADMIN-MEMBERS] delete lesson failed:', error);
    return res.status(500).json({ error: 'Erro ao excluir aula' });
  }
});

// ── Vídeo da aula no Cloudflare R2 (bucket privado) ──────────────────────────
//
// Fluxo de upload (arquivos até 20 GB, sem passar pela memória do backend):
//   1. POST /lessons/:id/video/init      → abre o multipart no R2, devolve uploadId+key
//   2. POST /lessons/:id/video/sign-part → assina o PUT de cada parte (browser → R2 direto)
//   3. POST /lessons/:id/video/complete  → finaliza o multipart e grava a KEY na aula
//   (cancelar)  POST /lessons/:id/video/abort
//   (ver)       GET  /lessons/:id/video      → metadados + preview assinado (admin)
//   (remover)   DELETE /lessons/:id/video
//
// Nunca gravamos URL pública — só a KEY. O player recebe URL assinada de 5 min
// (ver GET /api/members/video/:lessonId).

const MAX_VIDEO_BYTES = 20 * 1024 * 1024 * 1024; // 20 GB por arquivo
const ALLOWED_VIDEO_EXT = new Set(['mp4', 'mov', 'mkv', 'webm', 'm3u8']);
const ALLOWED_VIDEO_MIME = new Set([
  'video/mp4',
  'video/quicktime', // .mov
  'video/x-matroska', // .mkv
  'video/webm',
  'application/x-mpegurl', // .m3u8
  'application/vnd.apple.mpegurl', // .m3u8
]);

/** Carrega a aula + o id do curso (necessário pro prefixo no R2). */
async function loadLessonWithCourse(lessonId: string) {
  return prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { module: { select: { courseId: true } } },
  });
}

/** Metadados de vídeo prontos pro JSON (BigInt → Number; 20 GB cabe em Number). */
function serializeVideoMeta(l: {
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

/** 503 amigável quando o R2 ainda não foi configurado (env ausente). */
function ensureR2(res: Response): boolean {
  if (r2.isR2Configured()) return true;
  res.status(503).json({
    error: 'Armazenamento de vídeo (R2) não está configurado no servidor. Defina as variáveis R2_* e reinicie o backend.',
  });
  return false;
}

// POST /api/admin/members/lessons/:id/video/init { filename, size, mimeType }
router.post('/lessons/:id/video/init', async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureR2(res)) return;
    const lessonId = String(req.params.id);
    const filename = String(req.body?.filename || '').trim();
    const size = Number(req.body?.size || 0);
    const mimeType = String(req.body?.mimeType || '').toLowerCase().trim();

    const lesson = await loadLessonWithCourse(lessonId);
    if (!lesson) return res.status(404).json({ error: 'Aula não encontrada' });

    if (!Number.isFinite(size) || size <= 0) return res.status(400).json({ error: 'Tamanho de arquivo inválido.' });
    if (size > MAX_VIDEO_BYTES) {
      return res.status(400).json({ error: 'Arquivo acima do limite de 20 GB. Comprima ou divida o vídeo.' });
    }

    const ext = r2.extFor(filename, mimeType);
    const extOk = ALLOWED_VIDEO_EXT.has(ext);
    // MIME nem sempre vem (alguns navegadores mandam vazio pra .mkv). Se a
    // extensão é válida, aceitamos; se veio MIME, ele também precisa bater.
    const mimeOk = !mimeType || ALLOWED_VIDEO_MIME.has(mimeType) || mimeType.startsWith('video/');
    if (!extOk || !mimeOk) {
      return res.status(400).json({ error: 'Formato não suportado. Use MP4, MOV, MKV, WEBM ou M3U8 (HLS).' });
    }

    const videoType = ext === 'm3u8' ? 'hls' : 'mp4';
    const key = r2.videoKeyFor(lesson.module.courseId, lessonId, ext);
    const contentType = mimeType || (videoType === 'hls' ? 'application/x-mpegurl' : 'video/mp4');
    const { uploadId } = await r2.createMultipart({ key, contentType });

    return res.json({
      uploadId,
      key,
      videoType,
      // Parte recomendada: 64 MB. Mín. do S3/R2 é 5 MB (exceto a última). Com
      // 64 MB, 20 GB ≈ 320 partes — bem abaixo do teto de 10.000.
      partSize: 64 * 1024 * 1024,
      maxParts: 10000,
    });
  } catch (error) {
    console.error('[ADMIN-MEMBERS] video/init failed:', error);
    return res.status(500).json({ error: 'Erro ao iniciar o upload do vídeo.' });
  }
});

// POST /api/admin/members/lessons/:id/video/sign-part { key, uploadId, partNumber }
router.post('/lessons/:id/video/sign-part', async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureR2(res)) return;
    const lessonId = String(req.params.id);
    const key = String(req.body?.key || '');
    const uploadId = String(req.body?.uploadId || '');
    const partNumber = Number(req.body?.partNumber || 0);

    const lesson = await loadLessonWithCourse(lessonId);
    if (!lesson) return res.status(404).json({ error: 'Aula não encontrada' });

    // A key TEM de pertencer a esta aula — impede assinar escrita em qualquer
    // outro caminho do bucket.
    const prefix = r2.lessonPrefix(lesson.module.courseId, lessonId);
    if (!key.startsWith(prefix)) return res.status(400).json({ error: 'Key inválida para esta aula.' });
    if (!uploadId) return res.status(400).json({ error: 'uploadId ausente.' });
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
      return res.status(400).json({ error: 'partNumber inválido.' });
    }

    const url = await r2.signUploadPart({ key, uploadId, partNumber });
    return res.json({ url });
  } catch (error) {
    console.error('[ADMIN-MEMBERS] video/sign-part failed:', error);
    return res.status(500).json({ error: 'Erro ao assinar parte do upload.' });
  }
});

// POST /api/admin/members/lessons/:id/video/complete
// { key, uploadId, parts:[{partNumber,etag}], duration?, mimeType?, videoType?, thumbnailUrl? }
router.post('/lessons/:id/video/complete', async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureR2(res)) return;
    const lessonId = String(req.params.id);
    const key = String(req.body?.key || '');
    const uploadId = String(req.body?.uploadId || '');
    const parts = Array.isArray(req.body?.parts) ? req.body.parts : [];
    const duration = Number(req.body?.duration);
    const mimeType = String(req.body?.mimeType || '').trim() || null;
    const videoType = req.body?.videoType === 'hls' ? 'hls' : 'mp4';
    const thumbnailUrl = req.body?.thumbnailUrl ? String(req.body.thumbnailUrl) : null;

    const lesson = await loadLessonWithCourse(lessonId);
    if (!lesson) return res.status(404).json({ error: 'Aula não encontrada' });

    const prefix = r2.lessonPrefix(lesson.module.courseId, lessonId);
    if (!key.startsWith(prefix)) return res.status(400).json({ error: 'Key inválida para esta aula.' });
    if (!uploadId) return res.status(400).json({ error: 'uploadId ausente.' });
    const normParts = parts
      .map((p: any) => ({ partNumber: Number(p?.partNumber), etag: String(p?.etag || '') }))
      .filter((p: any) => Number.isInteger(p.partNumber) && p.etag);
    if (!normParts.length) return res.status(400).json({ error: 'Nenhuma parte enviada.' });

    await r2.completeMultipart({ key, uploadId, parts: normParts });

    // Tamanho autoritativo vem do próprio objeto no R2.
    const head = await r2.headObject(key);
    const size = head?.size ?? 0;

    // Substituição: apaga qualquer vídeo antigo com OUTRA extensão que tenha
    // ficado na pasta (o novo objeto já existe, então é seguro limpar o resto).
    try {
      const siblings = await r2.listPrefix(prefix);
      const stale = siblings.filter(
        (o) => o.key !== key && /\/video\.[a-z0-9]+$/i.test(o.key),
      );
      for (const s of stale) await r2.deleteObject(s.key);
    } catch (e) {
      console.warn('[ADMIN-MEMBERS] limpeza de vídeo antigo falhou (ignorado):', (e as Error).message);
    }

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
        // Preenche os campos legados só quando ainda vazios, pra UI antiga
        // (lista/drawer) continuar mostrando duração e miniatura.
        ...(durationInt && !lesson.duration ? { duration: durationInt } : {}),
        ...(thumbnailUrl && !lesson.thumbnailUrl ? { thumbnailUrl } : {}),
      },
    });

    return res.json({ video: serializeVideoMeta(updated) });
  } catch (error) {
    console.error('[ADMIN-MEMBERS] video/complete failed:', error);
    return res.status(500).json({ error: 'Erro ao finalizar o vídeo.' });
  }
});

// POST /api/admin/members/lessons/:id/video/abort { key, uploadId }
router.post('/lessons/:id/video/abort', async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureR2(res)) return;
    const lessonId = String(req.params.id);
    const key = String(req.body?.key || '');
    const uploadId = String(req.body?.uploadId || '');
    const lesson = await loadLessonWithCourse(lessonId);
    if (!lesson) return res.status(404).json({ error: 'Aula não encontrada' });
    const prefix = r2.lessonPrefix(lesson.module.courseId, lessonId);
    if (key.startsWith(prefix) && uploadId) await r2.abortMultipart({ key, uploadId });
    return res.json({ ok: true });
  } catch (error) {
    console.error('[ADMIN-MEMBERS] video/abort failed:', error);
    return res.status(500).json({ error: 'Erro ao cancelar o upload.' });
  }
});

// GET /api/admin/members/lessons/:id/video — metadados + preview assinado (admin).
router.get('/lessons/:id/video', async (req: AuthRequest, res: Response) => {
  try {
    const lessonId = String(req.params.id);
    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) return res.status(404).json({ error: 'Aula não encontrada' });

    let previewUrl: string | null = null;
    if (lesson.storageProvider === 'r2' && lesson.videoKey && r2.isR2Configured()) {
      try {
        previewUrl = (await r2.getSignedDownloadUrl(lesson.videoKey, { expiresIn: 300 })).url;
      } catch (e) {
        console.warn('[ADMIN-MEMBERS] preview URL falhou:', (e as Error).message);
      }
    }

    return res.json({
      video: serializeVideoMeta(lesson),
      previewUrl,
      // Vídeo legado por embed (iframe) — continua editável no campo videoUrl.
      legacyEmbed: lesson.storageProvider !== 'r2' ? lesson.videoUrl || null : null,
    });
  } catch (error) {
    console.error('[ADMIN-MEMBERS] get video failed:', error);
    return res.status(500).json({ error: 'Erro ao carregar o vídeo.' });
  }
});

// DELETE /api/admin/members/lessons/:id/video — remove do R2 e limpa a aula.
router.delete('/lessons/:id/video', async (req: AuthRequest, res: Response) => {
  try {
    const lessonId = String(req.params.id);
    const lesson = await loadLessonWithCourse(lessonId);
    if (!lesson) return res.status(404).json({ error: 'Aula não encontrada' });

    if (lesson.storageProvider === 'r2' && r2.isR2Configured()) {
      const prefix = r2.lessonPrefix(lesson.module.courseId, lessonId);
      await r2.deletePrefix(prefix);
    }
    const updated = await prisma.lesson.update({
      where: { id: lessonId },
      data: {
        videoKey: null,
        videoSize: null,
        videoDuration: null,
        videoMimeType: null,
        videoType: null,
        storageProvider: 'embed',
        videoUploadedAt: null,
      },
    });
    return res.json({ video: serializeVideoMeta(updated) });
  } catch (error) {
    console.error('[ADMIN-MEMBERS] delete video failed:', error);
    return res.status(500).json({ error: 'Erro ao remover o vídeo.' });
  }
});

// POST /api/admin/members/modules/:id/lessons/reorder { ids: [] }
router.post('/modules/:id/lessons/reorder', async (req: AuthRequest, res: Response) => {
  try {
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ error: 'ids é obrigatório' });
    await prisma.$transaction(
      ids.map((id, i) => prisma.lesson.update({ where: { id }, data: { sortOrder: i } })),
    );
    return res.json({ success: true });
  } catch (error) {
    console.error('[ADMIN-MEMBERS] reorder lessons failed:', error);
    return res.status(500).json({ error: 'Erro ao reordenar aulas' });
  }
});

export default router;
