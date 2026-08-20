/**
 * Admin da área de membros multi-curso. Mounted em /api/admin/members.
 *
 * Cursos CRUD (o PATCH de curso recebe `config` — é o botão Salvar do editor
 * WYSIWYG) + comerciais (acesso/venda/coprodutor). O CONTEÚDO em si (módulos,
 * aulas, vídeo R2) e o upload de mídia vivem em serviços COMPARTILHADOS com o
 * coprodutor (services/courseContent.service + lib/coursesMediaUpload) — os
 * handlers aqui são finos. Substitui o CRUD antigo do admin.routes (Forja).
 */
import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { adminMiddleware } from '../middlewares/admin.middleware';
import { newCourseWebhookToken } from './courseWebhook.routes';
import { env } from '../config/env';
import { bulkEnroll, parseBulkList } from '../services/bulkEnroll.service';
import { handleCourseMediaUpload } from '../lib/coursesMediaUpload';
import * as content from '../services/courseContent.service';

const router = Router();
const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

router.use(authMiddleware);
router.use(adminMiddleware);

/** Converte ContentError → resposta HTTP; erro genérico → 500. */
function handleContentError(res: Response, error: unknown, ctx: string): void {
  if (error instanceof content.ContentError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error(`[ADMIN-MEMBERS] ${ctx} failed:`, error);
  res.status(500).json({ error: 'Erro no servidor' });
}

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
router.post('/upload', handleCourseMediaUpload);

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

// ── Módulos ──────────────────────────────────────────────────────────────────
// Lógica compartilhada em services/courseContent.service (mesma do coprodutor).

router.post('/courses/:id/modules', async (req: AuthRequest, res: Response) => {
  try { res.json({ module: await content.createModule(String(req.params.id), req.body || {}) }); }
  catch (e) { handleContentError(res, e, 'create module'); }
});

router.patch('/modules/:id', async (req: AuthRequest, res: Response) => {
  try { res.json({ module: await content.updateModule(String(req.params.id), req.body || {}) }); }
  catch (e) { handleContentError(res, e, 'patch module'); }
});

router.delete('/modules/:id', async (req: AuthRequest, res: Response) => {
  try { await content.deleteModule(String(req.params.id)); res.json({ success: true }); }
  catch (e) { handleContentError(res, e, 'delete module'); }
});

router.post('/courses/:id/modules/reorder', async (req: AuthRequest, res: Response) => {
  try { await content.reorderModules(String(req.params.id), req.body?.ids || []); res.json({ success: true }); }
  catch (e) { handleContentError(res, e, 'reorder modules'); }
});

// ── Aulas ────────────────────────────────────────────────────────────────────

router.post('/modules/:id/lessons', async (req: AuthRequest, res: Response) => {
  try { res.json({ lesson: await content.createLesson(String(req.params.id), req.body || {}) }); }
  catch (e) { handleContentError(res, e, 'create lesson'); }
});

router.patch('/lessons/:id', async (req: AuthRequest, res: Response) => {
  try { res.json({ lesson: await content.updateLesson(String(req.params.id), req.body || {}) }); }
  catch (e) { handleContentError(res, e, 'patch lesson'); }
});

router.delete('/lessons/:id', async (req: AuthRequest, res: Response) => {
  try { await content.deleteLesson(String(req.params.id)); res.json({ success: true }); }
  catch (e) { handleContentError(res, e, 'delete lesson'); }
});

router.post('/modules/:id/lessons/reorder', async (req: AuthRequest, res: Response) => {
  try { await content.reorderLessons(String(req.params.id), req.body?.ids || []); res.json({ success: true }); }
  catch (e) { handleContentError(res, e, 'reorder lessons'); }
});

// ── Vídeo da aula no Cloudflare R2 (bucket privado) ──────────────────────────
// Fluxo: init → sign-part (browser→R2 direto) → complete; abort/get/delete.
// Nunca gravamos URL pública — só a KEY. Player recebe URL assinada de 5 min.
// Toda a lógica em services/courseContent.service (compartilhada c/ coprodutor).

router.post('/lessons/:id/video/init', async (req: AuthRequest, res: Response) => {
  try { res.json(await content.initVideoUpload(String(req.params.id), req.body || {})); }
  catch (e) { handleContentError(res, e, 'video/init'); }
});

router.post('/lessons/:id/video/sign-part', async (req: AuthRequest, res: Response) => {
  try { res.json(await content.signVideoPart(String(req.params.id), req.body || {})); }
  catch (e) { handleContentError(res, e, 'video/sign-part'); }
});

router.post('/lessons/:id/video/complete', async (req: AuthRequest, res: Response) => {
  try { res.json({ video: await content.completeVideoUpload(String(req.params.id), req.body || {}) }); }
  catch (e) { handleContentError(res, e, 'video/complete'); }
});

router.post('/lessons/:id/video/abort', async (req: AuthRequest, res: Response) => {
  try { res.json(await content.abortVideoUpload(String(req.params.id), req.body || {})); }
  catch (e) { handleContentError(res, e, 'video/abort'); }
});

router.get('/lessons/:id/video', async (req: AuthRequest, res: Response) => {
  try { res.json(await content.getVideoMeta(String(req.params.id))); }
  catch (e) { handleContentError(res, e, 'get video'); }
});

router.delete('/lessons/:id/video', async (req: AuthRequest, res: Response) => {
  try { res.json({ video: await content.deleteVideo(String(req.params.id)) }); }
  catch (e) { handleContentError(res, e, 'delete video'); }
});

export default router;
