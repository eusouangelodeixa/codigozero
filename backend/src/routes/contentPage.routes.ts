import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { normalizeMzPhone } from '../lib/whatsapp';

const router = Router();
const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

/**
 * PUBLIC routes for content / lead-magnet pages. Mounted at /api/content.
 *  GET  /resolve/:slug  → published page + related pages (increments views)
 *  POST /lead           → first-time capture (name/whatsapp/email)
 *  POST /confirm        → returning lead unlocks by confirming their WhatsApp
 *
 * No auth — these are the public funnel surface. Lead capture is rate-limited.
 */

// Throttle captures: 8 / 10 min per IP. A bit looser than the landing's 5
// because the "veja também" flow legitimately hops pages, but still curbs bots.
const captureLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' },
});

// Schedule a one-time welcome ~10–20 min out. Random offset so simultaneous
// captures don't land at the same minute (the low-rate cron spaces them too).
function welcomeDueAt(): Date {
  const minMs = 10 * 60 * 1000;
  const jitterMs = Math.floor(Math.random() * 10 * 60 * 1000); // 0–10 min
  return new Date(Date.now() + minMs + jitterMs);
}

// Shape a ContentPage for the public renderer (omit internal/admin fields).
function publicShape(page: any, related: any[]) {
  return {
    slug: page.slug,
    title: page.title,
    theme: page.theme,
    blocks: page.blocks,
    gateHeadline: page.gateHeadline,
    gateSubtext: page.gateSubtext,
    ctaText: page.ctaText,
    ctaUrl: page.ctaUrl,
    metaTitle: page.metaTitle,
    metaDescription: page.metaDescription,
    ogImageUrl: page.ogImageUrl,
    headScripts: page.headScripts,
    related: related.map((r) => ({ slug: r.slug, title: r.title, theme: r.theme })),
  };
}

// GET /api/content/resolve/:slug — published page for the public renderer.
router.get('/resolve/:slug', async (req: Request, res: Response) => {
  try {
    const slug = (req.params.slug || '').trim();
    if (!slug) return res.status(400).json({ error: 'Slug inválido' });

    const page = await prisma.contentPage.findUnique({ where: { slug } });
    if (!page || page.status !== 'published') {
      return res.status(404).json({ error: 'Página não encontrada' });
    }

    // "Veja também" — resolve the related ids to published pages, preserving
    // the admin-chosen order and silently dropping any unpublished/deleted.
    const ids = Array.isArray(page.relatedPageIds) ? (page.relatedPageIds as string[]) : [];
    let related: any[] = [];
    if (ids.length) {
      const found = await prisma.contentPage.findMany({
        where: { id: { in: ids }, status: 'published' },
        select: { id: true, slug: true, title: true, theme: true },
      });
      const byId = new Map(found.map((f) => [f.id, f]));
      related = ids.map((id) => byId.get(id)).filter(Boolean);
    }

    // Count the view ONLY when the real client asks to track (?track=1).
    // generateMetadata / link-preview crawlers fetch without it, so previews
    // and SSR don't inflate the counter — only an actual browser visit does.
    if (req.query.track === '1') {
      prisma.contentPage.update({ where: { id: page.id }, data: { viewCount: { increment: 1 } } }).catch(() => {});
    }

    return res.json({ page: publicShape(page, related) });
  } catch (e: any) {
    console.error('[CONTENT] resolve error:', e?.message || e);
    return res.status(500).json({ error: 'Erro ao carregar página' });
  }
});

// GET /api/content/list — published pages for the Central de Material hub
// (central.czero.sbs). Public, lightweight card fields only, NO view tracking
// (listing ≠ opening a page). Optional ?q= filters over title/theme/description.
router.get('/list', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    const where: any = { status: 'published' };
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { theme: { contains: q, mode: 'insensitive' } },
        { metaDescription: { contains: q, mode: 'insensitive' } },
      ];
    }
    const pages = await prisma.contentPage.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      select: {
        slug: true, title: true, theme: true, ogImageUrl: true,
        metaDescription: true, createdAt: true,
      },
    });
    return res.json({ pages });
  } catch (e: any) {
    console.error('[CONTENT] list error:', e?.message || e);
    return res.status(500).json({ error: 'Erro ao listar materiais' });
  }
});

// POST /api/content/lead — first-time lead capture from a content page gate.
// Body: { slug, name, whatsapp (or phone), email }.
router.post('/lead', captureLimiter, async (req: Request, res: Response) => {
  try {
    const slug = String(req.body?.slug || '').trim();
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const whatsappRaw = String(req.body?.whatsapp || req.body?.phone || '').trim();

    if (!name || !email || !whatsappRaw) {
      return res.status(400).json({ error: 'Nome, WhatsApp e e-mail são obrigatórios.' });
    }

    const page = await prisma.contentPage.findUnique({ where: { slug }, select: { id: true, slug: true } });
    if (!page) return res.status(404).json({ error: 'Página não encontrada' });

    const contactPhone = normalizeMzPhone(whatsappRaw) || `258${Date.now().toString().slice(-9)}`;
    const source = `content:${page.slug}`;

    // Upsert by email (mirrors the landing gate). Existing leads/members keep
    // their data; we only backfill leadSource and schedule the welcome if this
    // is genuinely a first contact that never got one.
    let user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: name || user.name,
          remarketingStage: 'none',
          ...(user.leadSource ? {} : { leadSource: source }),
          ...(!user.newsletterWelcomeSentAt && !user.newsletterWelcomeDueAt
            ? { newsletterWelcomeDueAt: welcomeDueAt() }
            : {}),
        },
      });
    } else {
      // phone is @unique — fall back to a suffixed value on collision (same as
      // the landing) so a shared/duplicate number never 500s the capture.
      const phoneTaken = await prisma.user.findUnique({ where: { phone: contactPhone }, select: { id: true } });
      user = await prisma.user.create({
        data: {
          name,
          email,
          phone: phoneTaken ? `${contactPhone}_${Date.now()}` : contactPhone,
          passwordHash: crypto.randomBytes(32).toString('hex'),
          subscriptionStatus: 'lead',
          leadSource: source,
          newsletterWelcomeDueAt: welcomeDueAt(),
        },
      });
    }

    // Count the lead (gate passed). Best-effort.
    prisma.contentPage.update({ where: { id: page.id }, data: { leadCount: { increment: 1 } } }).catch(() => {});

    return res.json({ success: true });
  } catch (e: any) {
    console.error('[CONTENT] lead error:', e?.message || e);
    return res.status(500).json({ error: 'Erro ao registrar. Tente de novo.' });
  }
});

// POST /api/content/confirm — returning lead unlocks by confirming a WhatsApp
// that's already in the system. Body: { slug, whatsapp }. Returns { found }.
router.post('/confirm', captureLimiter, async (req: Request, res: Response) => {
  try {
    const slug = String(req.body?.slug || '').trim();
    const whatsappRaw = String(req.body?.whatsapp || req.body?.phone || '').trim();
    const digits = whatsappRaw.replace(/\D/g, '');
    if (digits.length < 8) return res.status(400).json({ error: 'WhatsApp inválido.' });

    const page = await prisma.contentPage.findUnique({ where: { slug }, select: { id: true } });
    if (!page) return res.status(404).json({ error: 'Página não encontrada' });

    // Match on the last 9 digits (the local MZ number) so stored prefixes
    // (+258 / 258 / none) all line up without exact-format coupling.
    const last9 = digits.slice(-9);
    const user = await prisma.user.findFirst({
      where: { phone: { contains: last9 } },
      select: { id: true, name: true },
    });

    if (!user) return res.json({ found: false });

    // Known lead → unlock. Count it as a lead reach for this page.
    prisma.contentPage.update({ where: { id: page.id }, data: { leadCount: { increment: 1 } } }).catch(() => {});
    return res.json({ found: true, name: user.name?.split(' ')[0] || null });
  } catch (e: any) {
    console.error('[CONTENT] confirm error:', e?.message || e);
    return res.status(500).json({ error: 'Erro ao confirmar. Tente de novo.' });
  }
});

export default router;
