/**
 * API do ALUNO da área de membros (members.czero.sbs).
 *
 * Auth por rota (não no mount): login-config e sso/exchange são públicos.
 *
 * O acesso deixou de ser binário. Antes bastava assinatura activa para ver
 * tudo o que estava publicado; agora somam-se dois eixos — a assinatura (que
 * expira) e o direito ao curso (CourseAccess, que pode ser vitalício). Por
 * isso as rotas de curso NÃO usam `subscriptionMiddleware`: ele responderia
 * 403 antes de qualquer lógica e cortaria justamente quem tem acesso
 * vitalício mas já não é assinante. O gate correcto está em
 * services/courseAccess.service.ts, por curso.
 */
import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import {
  activeCourseAccessIds,
  hasFullAccess,
  isVisible,
  moduleUnlocked,
  hasAnyCourseAccess,
} from '../services/courseAccess.service';
import { blockWithdrawOnly } from '../middlewares/withdrawOnly.guard';
import { consumeMembersSsoCode } from '../lib/membersSso';
import { signAuthToken } from '../lib/authToken';
import * as r2 from '../services/r2.service';

const router = Router();

// Troca do código SSO de uso único: limita brute-force do code (é curto e
// vive 60s). Por IP.
const ssoExchangeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Abra novamente pelo app.' },
});
const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

// Mesma régua do login (auth.routes.ts) — não exportada de lá.
const PAID_STATUSES = ['active', 'grace_period', 'overdue', 'canceled'];
const PRIVILEGED_ROLES = ['admin', 'superadmin', 'coproducer'];

// Sem gate de assinatura aqui de propósito — ver o comentário do topo.
const memberGuards = [authMiddleware, blockWithdrawOnly] as const;

// ── Públicas ────────────────────────────────────────────────────────────────

// GET /api/members/courses/:slug/login-config — visual da página de login
// tematizada. WHITELIST estrita: nunca vazar config.menu (URLs privadas de
// comunidades) nem config.home para visitantes não autenticados.
router.get('/courses/:slug/login-config', async (req: Request, res: Response) => {
  try {
    const course = await prisma.course.findFirst({
      where: { slug: String(req.params.slug), status: 'published' },
      select: { name: true, config: true },
    });
    if (!course) return res.status(404).json({ error: 'Curso não encontrado' });

    const cfg = (course.config as any) || {};
    return res.json({
      name: course.name,
      theme: {
        mode: cfg?.theme?.mode === 'light' ? 'light' : 'dark',
        primaryColor: typeof cfg?.theme?.primaryColor === 'string' ? cfg.theme.primaryColor : undefined,
      },
      branding: {
        logoUrl: cfg?.branding?.logoUrl,
        faviconUrl: cfg?.branding?.faviconUrl,
        ogImageUrl: cfg?.branding?.ogImageUrl,
        loginBgUrl: cfg?.branding?.loginBgUrl,
        loginLayout: cfg?.branding?.loginLayout === 'sidebar' ? 'sidebar' : 'fullscreen',
      },
    });
  } catch (error) {
    console.error('[MEMBERS] login-config failed:', error);
    return res.status(500).json({ error: 'Erro ao carregar configuração' });
  }
});

// POST /api/members/sso/exchange { code } — troca o código de uso único do
// app pelo JWT normal de 7d (mesmo shape do /api/auth/login).
router.post('/sso/exchange', ssoExchangeLimiter, async (req: Request, res: Response) => {
  try {
    const code = String(req.body?.code || '');
    const userId = code ? await consumeMembersSsoCode(code) : null;
    if (!userId) return res.status(401).json({ error: 'Código inválido ou expirado. Abra novamente pelo app.' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) return res.status(401).json({ error: 'Conta indisponível' });
    // Re-checa a régua de pagante — o código não pode contornar o gate do login.
    // Mesma excepção do login: direito vitalício a um curso também dá entrada.
    const podeEntrar =
      PRIVILEGED_ROLES.includes(user.role) ||
      PAID_STATUSES.includes(user.subscriptionStatus) ||
      (await hasAnyCourseAccess(user.id));
    if (!podeEntrar) {
      return res.status(403).json({ error: 'Esta conta não tem uma assinatura ativa.' });
    }

    const token = signAuthToken(user.id, user.tokenVersion);
    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        subscriptionStatus: user.subscriptionStatus,
        avatarUrl: user.avatarUrl,
        hasCompletedOnboarding: user.hasCompletedOnboarding,
      },
    });
  } catch (error) {
    console.error('[MEMBERS] sso/exchange failed:', error);
    return res.status(500).json({ error: 'Erro ao autenticar' });
  }
});

// ── Autenticadas (assinante) ───────────────────────────────────────────────

// GET /api/members/courses — grade "Meus Cursos" com progresso por curso.
router.get('/courses', ...memberGuards, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const allCourses = await prisma.course.findMany({
      where: { status: 'published' },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        coverUrl: true,
        accessType: true,
        includedInSubscription: true,
        modules: { select: { lessons: { select: { id: true } } } },
      },
    });
    const owned = await activeCourseAccessIds(userId);
    const viewer = { id: userId, role: req.user!.role, subscriptionStatus: req.user!.subscriptionStatus };
    // Curso pago aparece mesmo bloqueado (é vitrine); curso do plano só
    // aparece a quem pode abrir.
    const courses = allCourses.filter((c) => isVisible(viewer, c, owned));
    const completed = await prisma.lessonProgress.findMany({
      where: { userId, completed: true },
      select: { lessonId: true },
    });
    const completedSet = new Set(completed.map((p) => p.lessonId));

    return res.json({
      courses: courses.map((c) => {
        const lessonIds = c.modules.flatMap((m) => m.lessons.map((l) => l.id));
        const done = lessonIds.filter((id) => completedSet.has(id)).length;
        return {
          id: c.id,
          slug: c.slug,
          name: c.name,
          coverUrl: c.coverUrl,
          totalLessons: lessonIds.length,
          completedLessons: done,
          locked: !hasFullAccess(viewer, c, owned),
          accessType: c.accessType || 'subscription',
          pct: lessonIds.length ? Math.round((done / lessonIds.length) * 100) : 0,
        };
      }),
    });
  } catch (error) {
    console.error('[MEMBERS] courses failed:', error);
    return res.status(500).json({ error: 'Erro ao carregar cursos' });
  }
});

// GET /api/members/courses/:slug — payload da home/página do curso: config +
// módulos com aulas MAGRAS (sem videoUrl/content — peso) + progresso +
// "continuar assistindo".
router.get('/courses/:slug', ...memberGuards, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const course = await prisma.course.findFirst({
      where: { slug: String(req.params.slug), status: 'published' },
      include: {
        modules: {
          orderBy: { sortOrder: 'asc' },
          include: {
            lessons: {
              orderBy: { sortOrder: 'asc' },
              select: { id: true, title: true, thumbnailUrl: true, duration: true, sortOrder: true },
            },
          },
        },
      },
    });
    if (!course) return res.status(404).json({ error: 'Curso não encontrado' });

    const owned = await activeCourseAccessIds(userId);
    const viewer = { id: userId, role: req.user!.role, subscriptionStatus: req.user!.subscriptionStatus };
    const fullAccess = hasFullAccess(viewer, course, owned);
    // Curso do plano sem acesso nenhum não é vitrine — é porta fechada.
    if (!fullAccess && (course.accessType || 'subscription') !== 'paid') {
      return res.status(403).json({ error: 'Assinatura inativa', subscriptionStatus: req.user!.subscriptionStatus });
    }

    const lessonIds = course.modules.flatMap((m) => m.lessons.map((l) => l.id));
    const progress = await prisma.lessonProgress.findMany({
      where: { userId, lessonId: { in: lessonIds } },
      select: { lessonId: true, completed: true, rating: true },
    });
    const byLesson = new Map(progress.map((p) => [p.lessonId, p]));

    // "Continuar assistindo" só aponta para aula que o aluno PODE abrir: sem
    // acesso completo, restringe aos módulos de amostra — senão progresso
    // antigo (acesso revogado/expirado) vira um botão que só dá 403.
    const cont = await prisma.lessonProgress.findFirst({
      where: {
        userId,
        completed: false,
        lastViewedAt: { not: null },
        lesson: { module: { courseId: course.id, ...(fullAccess ? {} : { isFree: true }) } },
      },
      orderBy: { lastViewedAt: 'desc' },
      include: { lesson: { select: { id: true, moduleId: true, title: true, thumbnailUrl: true } } },
    });

    return res.json({
      course: {
        id: course.id, slug: course.slug, name: course.name, config: course.config,
        accessType: course.accessType || 'subscription',
        // A UI mostra a estante inteira e põe cadeado no que está fechado —
        // ver o que se está a perder vende melhor do que não ver nada.
        locked: !fullAccess,
        // O banner do cadeado só fala de "aulas de amostra" quando existem.
        hasSamples: course.modules.some((m) => !!m.isFree),
        // CTA do cadeado: sem o link, o banner diz "abre depois da compra"
        // e não dá caminho nenhum — o funil morria aqui. Só vai quando
        // bloqueado (quem já tem acesso não precisa de botão de compra).
        checkoutUrl: !fullAccess ? course.checkoutUrl || null : null,
      },
      modules: course.modules.map((m) => {
        const lessons = m.lessons.map((l) => {
          const p = byLesson.get(l.id);
          return { ...l, completed: p?.completed ?? false, rating: p?.rating ?? null };
        });
        return {
          id: m.id,
          title: m.title,
          description: m.description,
          coverUrl: m.coverUrl,
          sortOrder: m.sortOrder,
          totalLessons: lessons.length,
          completedLessons: lessons.filter((l) => l.completed).length,
          locked: !moduleUnlocked(fullAccess, m),
          // Aula de módulo bloqueado não leva vídeo nenhum no payload: o
          // cadeado tem de valer no servidor, não só no ecrã.
          lessons: moduleUnlocked(fullAccess, m) ? lessons : lessons.map((l) => ({ ...l, locked: true })),
        };
      }),
      continue: cont
        ? {
            lessonId: cont.lesson.id,
            moduleId: cont.lesson.moduleId,
            title: cont.lesson.title,
            thumbnailUrl: cont.lesson.thumbnailUrl,
          }
        : null,
    });
  } catch (error) {
    console.error('[MEMBERS] course payload failed:', error);
    return res.status(500).json({ error: 'Erro ao carregar curso' });
  }
});

// GET /api/members/lessons/:id — aula completa (player) + prev/next na ordem
// do curso + estado do usuário.
router.get('/lessons/:id', ...memberGuards, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const lesson = await prisma.lesson.findUnique({
      where: { id: String(req.params.id) },
      include: {
        module: {
          include: { course: { select: { id: true, slug: true, status: true, accessType: true, includedInSubscription: true, checkoutUrl: true } } },
        },
      },
    });
    if (!lesson || lesson.module.course.status !== 'published') {
      return res.status(404).json({ error: 'Aula não encontrada' });
    }

    // O cadeado tem de valer aqui: sem esta verificação bastava adivinhar (ou
    // reaproveitar) um id de aula para receber o vídeo de um módulo pago.
    const owned = await activeCourseAccessIds(userId);
    const viewer = { id: userId, role: req.user!.role, subscriptionStatus: req.user!.subscriptionStatus };
    const fullAccess = hasFullAccess(viewer, lesson.module.course, owned);
    if (!moduleUnlocked(fullAccess, lesson.module)) {
      return res.status(403).json({
        error: 'Aula bloqueada',
        locked: true,
        courseSlug: lesson.module.course.slug,
        accessType: lesson.module.course.accessType || 'subscription',
        checkoutUrl: lesson.module.course.checkoutUrl || null,
      });
    }

    // Lista achatada do curso na ordem módulo.sortOrder → aula.sortOrder
    const modules = await prisma.module.findMany({
      where: { courseId: lesson.module.course.id },
      orderBy: { sortOrder: 'asc' },
      select: { lessons: { orderBy: { sortOrder: 'asc' }, select: { id: true } } },
    });
    const flat = modules.flatMap((m) => m.lessons.map((l) => l.id));
    const idx = flat.indexOf(lesson.id);

    const p = await prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId: lesson.id } },
      select: { completed: true, rating: true },
    });

    return res.json({
      lesson: {
        id: lesson.id,
        moduleId: lesson.moduleId,
        courseSlug: lesson.module.course.slug,
        title: lesson.title,
        description: lesson.description,
        videoUrl: lesson.videoUrl,
        // R2: o player pede a URL assinada em GET /api/members/video/:id.
        // 'embed' = vídeo legado por iframe (usa videoUrl direto).
        storageProvider: lesson.storageProvider,
        videoType: lesson.videoType,
        duration: lesson.videoDuration ?? lesson.duration,
        thumbnailUrl: lesson.thumbnailUrl,
        content: lesson.content,
        materials: lesson.materials,
        tools: lesson.tools,
      },
      completed: p?.completed ?? false,
      rating: p?.rating ?? null,
      prevLessonId: idx > 0 ? flat[idx - 1] : null,
      nextLessonId: idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null,
    });
  } catch (error) {
    console.error('[MEMBERS] lesson failed:', error);
    return res.status(500).json({ error: 'Erro ao carregar aula' });
  }
});

// ── Playback do vídeo privado (R2) ───────────────────────────────────────────
//
// O front NUNCA recebe URL pública nem a KEY. Aqui verificamos, na ordem:
// aula existe → curso publicado → utilizador tem acesso (mesmo gate do /lessons)
// e SÓ ENTÃO assinamos uma URL temporária de 5 min. O player renova sozinho
// antes de expirar (ver frontend). HLS é servido por proxy autenticado.

/** Carrega a aula com o curso e aplica o gate de acesso. Devolve a aula ou
 *  envia a resposta de erro (404/403) e retorna null. */
async function loadPlayableLesson(req: AuthRequest, res: Response) {
  const userId = req.user!.id;
  const lesson = await prisma.lesson.findUnique({
    where: { id: String(req.params.lessonId) },
    include: {
      module: {
        include: {
          course: {
            select: { id: true, slug: true, status: true, accessType: true, includedInSubscription: true, checkoutUrl: true },
          },
        },
      },
    },
  });
  if (!lesson || lesson.module.course.status !== 'published') {
    res.status(404).json({ error: 'Aula não encontrada' });
    return null;
  }
  const owned = await activeCourseAccessIds(userId);
  const viewer = { id: userId, role: req.user!.role, subscriptionStatus: req.user!.subscriptionStatus };
  const fullAccess = hasFullAccess(viewer, lesson.module.course, owned);
  if (!moduleUnlocked(fullAccess, lesson.module)) {
    res.status(403).json({
      error: 'Aula bloqueada',
      locked: true,
      courseSlug: lesson.module.course.slug,
      accessType: lesson.module.course.accessType || 'subscription',
      checkoutUrl: lesson.module.course.checkoutUrl || null,
    });
    return null;
  }
  return lesson;
}

// GET /api/members/video/:lessonId — devolve a URL temporária do vídeo.
router.get('/video/:lessonId', ...memberGuards, async (req: AuthRequest, res: Response) => {
  try {
    const lesson = await loadPlayableLesson(req, res);
    if (!lesson) return;

    // Aula ainda no modelo antigo (embed por iframe): devolve o embed.
    if (lesson.storageProvider !== 'r2' || !lesson.videoKey) {
      return res.json({ type: 'embed', embed: lesson.videoUrl || null, url: null });
    }
    if (!r2.isR2Configured()) {
      return res.status(503).json({ error: 'Armazenamento de vídeo indisponível.' });
    }

    if (lesson.videoType === 'hls') {
      // HLS: o player carrega o master pelo proxy autenticado (cada segmento
      // volta a passar pelo gate). Não é URL assinada — é a nossa rota.
      const base = `${req.protocol}://${req.get('host')}`;
      return res.json({
        type: 'hls',
        url: `${base}/api/members/video/${lesson.id}/hls/master.m3u8`,
        mimeType: 'application/vnd.apple.mpegurl',
      });
    }

    const signed = await r2.getSignedDownloadUrl(lesson.videoKey, {
      expiresIn: 300, // 5 min
      responseContentType: lesson.videoMimeType || 'video/mp4',
    });
    return res.json({
      type: 'mp4',
      url: signed.url,
      expiresAt: signed.expiresAt,
      expiresIn: signed.expiresIn,
      mimeType: lesson.videoMimeType || 'video/mp4',
    });
  } catch (error) {
    console.error('[MEMBERS] video url failed:', error);
    return res.status(500).json({ error: 'Erro ao carregar o vídeo.' });
  }
});

// GET /api/members/video/:lessonId/hls/* — proxy autenticado dos arquivos HLS
// (master.m3u8, playlists e segmentos .ts). Cada requisição repassa pelo gate
// e faz stream do objeto privado do R2 — o segmento nunca fica público.
router.get('/video/:lessonId/hls/*', ...memberGuards, async (req: AuthRequest, res: Response) => {
  try {
    const lesson = await loadPlayableLesson(req, res);
    if (!lesson) return;
    if (lesson.storageProvider !== 'r2' || lesson.videoType !== 'hls' || !r2.isR2Configured()) {
      return res.status(404).json({ error: 'HLS indisponível.' });
    }
    // Caminho relativo pedido (depois de /hls/). Sanitizado: sem traversal.
    const rel = String((req.params as any)[0] || '').replace(/\\/g, '/');
    if (!rel || rel.includes('..') || rel.startsWith('/')) {
      return res.status(400).json({ error: 'Caminho inválido.' });
    }
    const key = `${r2.lessonPrefix(lesson.module.courseId, lesson.id)}hls/${rel}`;
    const obj = await r2.getObjectStream(key);
    if (!obj) return res.status(404).json({ error: 'Segmento não encontrado.' });

    const ct = rel.endsWith('.m3u8')
      ? 'application/vnd.apple.mpegurl'
      : rel.endsWith('.ts')
        ? 'video/mp2t'
        : obj.contentType || 'application/octet-stream';
    res.setHeader('Content-Type', ct);
    if (obj.contentLength) res.setHeader('Content-Length', String(obj.contentLength));
    // Playlists nunca em cache (URLs mudam); segmentos podem cachear no cliente.
    res.setHeader('Cache-Control', rel.endsWith('.m3u8') ? 'no-store' : 'private, max-age=60');
    obj.body.on('error', () => { if (!res.headersSent) res.status(502).end(); });
    obj.body.pipe(res);
  } catch (error) {
    console.error('[MEMBERS] hls proxy failed:', error);
    if (!res.headersSent) return res.status(500).json({ error: 'Erro no HLS.' });
  }
});

// POST /api/members/progress { lessonId, completed?, rating?, viewed? }
// Um upsert cobre os três gestos: marcar concluída, avaliar, registrar
// visualização (player dispara viewed:true ao abrir → continuar assistindo).
router.post('/progress', ...memberGuards, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { lessonId, completed, rating, viewed } = req.body || {};
    if (!lessonId || typeof lessonId !== 'string') {
      return res.status(400).json({ error: 'lessonId é obrigatório' });
    }
    if (rating !== undefined && rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      return res.status(400).json({ error: 'rating deve ser um inteiro de 1 a 5' });
    }

    // Mesmo gate do player: progresso em aula de módulo fechado não existe —
    // sem isto qualquer member gravava progresso (e alimentava "continuar
    // assistindo") em curso pago que nunca comprou.
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        module: {
          include: { course: { select: { id: true, accessType: true, includedInSubscription: true } } },
        },
      },
    });
    if (!lesson) return res.status(404).json({ error: 'Aula não encontrada' });
    const owned = await activeCourseAccessIds(userId);
    const viewer = { id: userId, role: req.user!.role, subscriptionStatus: req.user!.subscriptionStatus };
    if (!moduleUnlocked(hasFullAccess(viewer, lesson.module.course, owned), lesson.module)) {
      return res.status(403).json({ error: 'Aula bloqueada' });
    }

    const now = new Date();
    const patch: Record<string, unknown> = {};
    if (typeof completed === 'boolean') {
      patch.completed = completed;
      patch.completedAt = completed ? now : null;
    }
    if (rating !== undefined && rating !== null) patch.rating = rating;
    if (viewed === true) patch.lastViewedAt = now;
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Nada para atualizar' });
    }

    const progress = await prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      update: patch,
      create: {
        userId,
        lessonId,
        completed: typeof completed === 'boolean' ? completed : false,
        completedAt: completed === true ? now : null,
        rating: rating ?? null,
        lastViewedAt: viewed === true ? now : null,
      },
    });
    return res.json({
      progress: { completed: progress.completed, rating: progress.rating, lastViewedAt: progress.lastViewedAt },
    });
  } catch (error) {
    console.error('[MEMBERS] progress failed:', error);
    return res.status(500).json({ error: 'Erro ao salvar progresso' });
  }
});

export default router;
