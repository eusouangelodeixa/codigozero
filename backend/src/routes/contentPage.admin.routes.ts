import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { adminMiddleware } from '../middlewares/admin.middleware';

const router = Router();
const prisma = new PrismaClient();

/**
 * Admin CRUD for content / lead-magnet pages. Mounted under
 * /api/admin/content-pages. Any admin can manage these (no revenue
 * attribution is involved, unlike coproducers). The public read +
 * lead-capture side lives in content.routes.ts (mounted at /api/content).
 */
router.use(authMiddleware);
router.use(adminMiddleware);

// kebab-case slug from a title: strip accents, non-alphanumerics → dashes.
function slugify(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// Ensure the slug is unique, appending -2, -3, … on collision. `ignoreId`
// lets an update keep its own slug.
async function uniqueSlug(base: string, ignoreId?: string): Promise<string> {
  const root = slugify(base) || 'pagina';
  let candidate = root;
  let n = 1;
  // Loop until we find a free slug. Bounded in practice by collisions.
  while (true) {
    const existing = await prisma.contentPage.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing || existing.id === ignoreId) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

// GET /api/admin/content-pages — list (lightweight; no full blocks payload)
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const pages = await prisma.contentPage.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, slug: true, title: true, theme: true, status: true,
        viewCount: true, leadCount: true, createdAt: true, updatedAt: true,
      },
    });
    return res.json({ pages });
  } catch (e: any) {
    console.error('[CONTENT-ADMIN] list error:', e?.message || e);
    return res.status(500).json({ error: 'Erro ao listar páginas' });
  }
});

// GET /api/admin/content-pages/:id — full page (for the editor)
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const page = await prisma.contentPage.findUnique({ where: { id: req.params.id } });
    if (!page) return res.status(404).json({ error: 'Página não encontrada' });
    return res.json({ page });
  } catch (e: any) {
    console.error('[CONTENT-ADMIN] get error:', e?.message || e);
    return res.status(500).json({ error: 'Erro ao carregar página' });
  }
});

// Shared field whitelist for create/update. Blocks/relatedPageIds are stored
// as-is (admin is trusted; the video block carries raw embed HTML exactly like
// the VSL field). Everything is optional on update.
function pickFields(body: any) {
  const out: any = {};
  if (typeof body.title === 'string') out.title = body.title.trim();
  if (typeof body.theme === 'string') out.theme = body.theme.trim() || null;
  if (typeof body.status === 'string' && ['draft', 'published'].includes(body.status)) out.status = body.status;
  if (Array.isArray(body.blocks)) out.blocks = body.blocks;
  if (typeof body.gateHeadline === 'string') out.gateHeadline = body.gateHeadline.trim() || null;
  if (typeof body.gateSubtext === 'string') out.gateSubtext = body.gateSubtext.trim() || null;
  if (typeof body.ctaText === 'string') out.ctaText = body.ctaText.trim() || null;
  if (typeof body.ctaUrl === 'string') out.ctaUrl = body.ctaUrl.trim() || null;
  if (Array.isArray(body.relatedPageIds)) out.relatedPageIds = body.relatedPageIds.filter((x: any) => typeof x === 'string');
  if (typeof body.metaTitle === 'string') out.metaTitle = body.metaTitle.trim() || null;
  if (typeof body.metaDescription === 'string') out.metaDescription = body.metaDescription.trim() || null;
  if (typeof body.ogImageUrl === 'string') out.ogImageUrl = body.ogImageUrl.trim() || null;
  if (typeof body.headScripts === 'string') out.headScripts = body.headScripts.trim() || null;
  return out;
}

// POST /api/admin/content-pages — create
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    if (!title) return res.status(400).json({ error: 'Título é obrigatório' });

    const slug = await uniqueSlug(typeof req.body.slug === 'string' && req.body.slug.trim() ? req.body.slug : title);
    const data = pickFields(req.body);
    const page = await prisma.contentPage.create({ data: { ...data, title, slug } });
    return res.status(201).json({ page });
  } catch (e: any) {
    console.error('[CONTENT-ADMIN] create error:', e?.message || e);
    return res.status(500).json({ error: 'Erro ao criar página' });
  }
});

// PATCH /api/admin/content-pages/:id — update
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.contentPage.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!existing) return res.status(404).json({ error: 'Página não encontrada' });

    const data = pickFields(req.body);
    // Slug may be changed explicitly; re-uniquify if provided.
    if (typeof req.body.slug === 'string' && req.body.slug.trim()) {
      data.slug = await uniqueSlug(req.body.slug, existing.id);
    }
    const page = await prisma.contentPage.update({ where: { id: existing.id }, data });
    return res.json({ page });
  } catch (e: any) {
    console.error('[CONTENT-ADMIN] update error:', e?.message || e);
    return res.status(500).json({ error: 'Erro ao salvar página' });
  }
});

// POST /api/admin/content-pages/:id/duplicate — clone as a fresh DRAFT with a
// new unique slug and zeroed counters. Handy for spinning up similar iscas.
router.post('/:id/duplicate', async (req: AuthRequest, res: Response) => {
  try {
    const src = await prisma.contentPage.findUnique({ where: { id: req.params.id } });
    if (!src) return res.status(404).json({ error: 'Página não encontrada' });
    const slug = await uniqueSlug(`${src.slug}-copia`);
    const page = await prisma.contentPage.create({
      data: {
        slug,
        title: `${src.title} (cópia)`,
        theme: src.theme,
        status: 'draft', // never publish a copy automatically
        blocks: src.blocks as any,
        gateHeadline: src.gateHeadline,
        gateSubtext: src.gateSubtext,
        ctaText: src.ctaText,
        ctaUrl: src.ctaUrl,
        relatedPageIds: src.relatedPageIds as any,
        metaTitle: src.metaTitle,
        metaDescription: src.metaDescription,
        ogImageUrl: src.ogImageUrl,
        headScripts: src.headScripts,
        // viewCount/leadCount fall back to their schema default of 0
      },
    });
    return res.status(201).json({ page });
  } catch (e: any) {
    console.error('[CONTENT-ADMIN] duplicate error:', e?.message || e);
    return res.status(500).json({ error: 'Erro ao duplicar página' });
  }
});

// DELETE /api/admin/content-pages/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.contentPage.delete({ where: { id: req.params.id } });
    return res.json({ ok: true });
  } catch (e: any) {
    console.error('[CONTENT-ADMIN] delete error:', e?.message || e);
    return res.status(500).json({ error: 'Erro ao excluir página' });
  }
});

export default router;
