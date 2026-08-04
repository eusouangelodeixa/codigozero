/**
 * API do ALUNO da área de membros (members.czero.sbs).
 *
 * Auth por rota (não no mount): login-config e sso/exchange são públicos; o
 * resto exige token + assinatura ativa (mesma régua da Forja antiga). Regra
 * de acesso v1: todo assinante ativo vê TODOS os cursos published — não há
 * entitlements por curso.
 */
import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { subscriptionMiddleware } from '../middlewares/subscription.middleware';
import { blockWithdrawOnly } from '../middlewares/withdrawOnly.guard';
import { consumeMembersSsoCode } from '../lib/membersSso';

const router = Router();
const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

// Mesma régua do login (auth.routes.ts) — não exportada de lá.
const PAID_STATUSES = ['active', 'grace_period', 'overdue', 'canceled'];
const PRIVILEGED_ROLES = ['admin', 'superadmin', 'coproducer'];

const memberGuards = [authMiddleware, blockWithdrawOnly, subscriptionMiddleware] as const;

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
router.post('/sso/exchange', async (req: Request, res: Response) => {
  try {
    const code = String(req.body?.code || '');
    const userId = code ? consumeMembersSsoCode(code) : null;
    if (!userId) return res.status(401).json({ error: 'Código inválido ou expirado. Abra novamente pelo app.' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) return res.status(401).json({ error: 'Conta indisponível' });
    // Re-checa a régua de pagante — o código não pode contornar o gate do login.
    if (!PRIVILEGED_ROLES.includes(user.role) && !PAID_STATUSES.includes(user.subscriptionStatus)) {
      return res.status(403).json({ error: 'Esta conta não tem uma assinatura ativa.' });
    }

    const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: '7d' as any });
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
    const courses = await prisma.course.findMany({
      where: { status: 'published' },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        coverUrl: true,
        modules: { select: { lessons: { select: { id: true } } } },
      },
    });
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

    const lessonIds = course.modules.flatMap((m) => m.lessons.map((l) => l.id));
    const progress = await prisma.lessonProgress.findMany({
      where: { userId, lessonId: { in: lessonIds } },
      select: { lessonId: true, completed: true, rating: true },
    });
    const byLesson = new Map(progress.map((p) => [p.lessonId, p]));

    const cont = await prisma.lessonProgress.findFirst({
      where: {
        userId,
        completed: false,
        lastViewedAt: { not: null },
        lesson: { module: { courseId: course.id } },
      },
      orderBy: { lastViewedAt: 'desc' },
      include: { lesson: { select: { id: true, moduleId: true, title: true, thumbnailUrl: true } } },
    });

    return res.json({
      course: { id: course.id, slug: course.slug, name: course.name, config: course.config },
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
          lessons,
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
      include: { module: { include: { course: { select: { id: true, slug: true, status: true } } } } },
    });
    if (!lesson || lesson.module.course.status !== 'published') {
      return res.status(404).json({ error: 'Aula não encontrada' });
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
        duration: lesson.duration,
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

    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { id: true } });
    if (!lesson) return res.status(404).json({ error: 'Aula não encontrada' });

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
