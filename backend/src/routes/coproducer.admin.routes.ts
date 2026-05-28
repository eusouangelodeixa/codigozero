import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { adminMiddleware } from '../middlewares/admin.middleware';
import { superadminMiddleware } from '../middlewares/superadmin.middleware';
import { generateUniqueCoproducerCode, sendCoproducerWelcome } from '../services/coproducer.service';

const router = Router();
const prisma = new PrismaClient();

/**
 * Mounted under /api/admin/coproducers.
 *
 * Reads are open to any admin (so the admin/finance source filter works);
 * writes are gated on superadmin — promoting/demoting a coproducer
 * controls revenue attribution and must not be delegated.
 */

router.use(authMiddleware);
router.use(adminMiddleware);

/**
 * GET /api/admin/coproducers
 * Returns every coproducer + their lifetime rollups (sales, revenue,
 * active subscribers). Used by both the macro list view and the source
 * filter dropdown in admin/finance.
 */
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const accounts = await prisma.coproducerAccount.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    // Roll up transactions per coproducer in a single grouped query.
    const rollupsRaw = await prisma.transaction.groupBy({
      by: ['coproducerId'],
      where: { status: 'approved', coproducerId: { in: accounts.map((a) => a.id) } },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const byId = new Map(rollupsRaw.map((r) => [r.coproducerId, r]));

    // Active subscribers attributed via the referredByCoproducer pointer
    const subsCount = await prisma.user.groupBy({
      by: ['referredByCoproducer'],
      where: {
        role: 'member',
        subscriptionStatus: 'active',
        referredByCoproducer: { in: accounts.map((a) => a.code) },
      },
      _count: { _all: true },
    });
    const subsByCode = new Map(subsCount.map((s) => [s.referredByCoproducer, s._count._all]));

    const items = accounts.map((acc) => ({
      id: acc.id,
      code: acc.code,
      productPid: acc.productPid,
      planId: acc.planId,
      publicCheckoutUrl: acc.publicCheckoutUrl,
      sharePct: acc.sharePct,
      bumpProductPid: acc.bumpProductPid,
      bumpPrice: acc.bumpPrice,
      displayName: acc.displayName || acc.user.name,
      enabled: acc.enabled,
      notes: acc.notes,
      vslEmbedHtml: acc.vslEmbedHtml,
      headScripts: acc.headScripts,
      createdAt: acc.createdAt,
      updatedAt: acc.updatedAt,
      user: acc.user,
      lifetimeRevenue: byId.get(acc.id)?._sum.amount || 0,
      lifetimeSales: byId.get(acc.id)?._count._all || 0,
      activeSubscribers: subsByCode.get(acc.code) || 0,
    }));

    res.json({ coproducers: items });
  } catch (error) {
    console.error('[ADMIN/COPRODUCERS] List error:', error);
    res.status(500).json({ error: 'Erro ao listar coprodutores' });
  }
});

/**
 * POST /api/admin/coproducers
 * Body: { userEmail, productPid, planId?, publicCheckoutUrl?, sharePct?, displayName?, notes? }
 *
 * Promotes an existing user account to coproducer (sets role + creates
 * CoproducerAccount). Auto-generates a /c/ code.
 */
router.post('/', superadminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { userEmail, productPid, planId, publicCheckoutUrl, sharePct, displayName, notes, bumpProductPid, bumpPrice, vslEmbedHtml, headScripts } = req.body || {};

    if (!userEmail || !productPid) {
      return res.status(400).json({ error: 'userEmail e productPid são obrigatórios' });
    }
    if (sharePct != null && (sharePct < 0 || sharePct > 100)) {
      return res.status(400).json({ error: 'sharePct deve estar entre 0 e 100' });
    }
    if (bumpPrice != null && bumpPrice < 0) {
      return res.status(400).json({ error: 'bumpPrice não pode ser negativo' });
    }

    const user = await prisma.user.findUnique({ where: { email: userEmail.toLowerCase().trim() } });
    if (!user) return res.status(404).json({ error: 'Usuário com esse email não encontrado' });

    const existing = await prisma.coproducerAccount.findUnique({ where: { userId: user.id } });
    if (existing) return res.status(400).json({ error: 'Este usuário já é coprodutor' });

    const pidTaken = await prisma.coproducerAccount.findUnique({ where: { productPid } });
    if (pidTaken) return res.status(400).json({ error: 'Este productPid já está em uso por outro coprodutor' });

    const code = await generateUniqueCoproducerCode();

    // Promote: set role + create the account in one transaction
    const [, account] = await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { role: 'coproducer' } }),
      prisma.coproducerAccount.create({
        data: {
          userId: user.id,
          code,
          productPid: productPid.trim(),
          planId: planId?.trim() || null,
          publicCheckoutUrl: publicCheckoutUrl?.trim() || null,
          sharePct: sharePct != null ? Number(sharePct) : 50,
          bumpProductPid: bumpProductPid?.trim() || null,
          bumpPrice: bumpPrice != null && bumpPrice !== '' ? Number(bumpPrice) : null,
          displayName: displayName?.trim() || null,
          notes: notes?.trim() || null,
          vslEmbedHtml: vslEmbedHtml?.trim() || null,
          headScripts: headScripts?.trim() || null,
        },
      }),
    ]);

    // Fire-and-await the welcome message so the admin immediately sees
    // whether delivery worked. The function resets the password as part
    // of the flow (same nova-senha pattern as the post-checkout webhook).
    const welcome = await sendCoproducerWelcome({ coproducerAccountId: account.id });

    return res.json({
      coproducer: account,
      code,
      welcome: {
        delivered: welcome.delivered,
        status: welcome.status,
      },
    });
  } catch (error) {
    console.error('[ADMIN/COPRODUCERS] Create error:', error);
    res.status(500).json({ error: 'Erro ao criar coprodutor' });
  }
});

/**
 * POST /api/admin/coproducers/:id/resend-welcome
 * Generates a fresh password and re-sends the welcome message. Useful
 * when the WhatsApp was disconnected on first creation, or when the
 * coprodutor lost their credentials.
 */
router.post('/:id/resend-welcome', superadminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const acc = await prisma.coproducerAccount.findUnique({ where: { id: req.params.id } });
    if (!acc) return res.status(404).json({ error: 'Coprodutor não encontrado' });
    const result = await sendCoproducerWelcome({ coproducerAccountId: acc.id });
    if (!result.delivered) {
      return res.status(502).json({
        success: false,
        error: `WhatsApp não entregou (status=${result.status}). Senha foi resetada — copie do log ou tente novamente.`,
        passwordSent: result.passwordSent,
      });
    }
    res.json({ success: true, status: result.status });
  } catch (error) {
    console.error('[ADMIN/COPRODUCERS] Resend welcome error:', error);
    res.status(500).json({ error: 'Erro ao reenviar boas-vindas' });
  }
});

router.patch('/:id', superadminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { productPid, planId, publicCheckoutUrl, sharePct, displayName, enabled, notes, bumpProductPid, bumpPrice, vslEmbedHtml, headScripts } = req.body || {};
    const existing = await prisma.coproducerAccount.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Coprodutor não encontrado' });

    if (sharePct != null && (sharePct < 0 || sharePct > 100)) {
      return res.status(400).json({ error: 'sharePct deve estar entre 0 e 100' });
    }
    if (bumpPrice != null && bumpPrice !== '' && Number(bumpPrice) < 0) {
      return res.status(400).json({ error: 'bumpPrice não pode ser negativo' });
    }
    if (productPid && productPid !== existing.productPid) {
      const pidTaken = await prisma.coproducerAccount.findUnique({ where: { productPid } });
      if (pidTaken) return res.status(400).json({ error: 'productPid em uso por outro coprodutor' });
    }

    const updated = await prisma.coproducerAccount.update({
      where: { id: req.params.id },
      data: {
        ...(productPid != null ? { productPid: String(productPid).trim() } : {}),
        ...(planId != null ? { planId: String(planId).trim() || null } : {}),
        ...(publicCheckoutUrl != null ? { publicCheckoutUrl: String(publicCheckoutUrl).trim() || null } : {}),
        ...(sharePct != null ? { sharePct: Number(sharePct) } : {}),
        ...(bumpProductPid != null ? { bumpProductPid: String(bumpProductPid).trim() || null } : {}),
        ...(bumpPrice != null
          ? { bumpPrice: bumpPrice === '' ? null : Number(bumpPrice) }
          : {}),
        ...(displayName != null ? { displayName: String(displayName).trim() || null } : {}),
        ...(enabled != null ? { enabled: !!enabled } : {}),
        ...(notes != null ? { notes: String(notes).trim() || null } : {}),
        ...(vslEmbedHtml != null ? { vslEmbedHtml: String(vslEmbedHtml).trim() || null } : {}),
        ...(headScripts != null ? { headScripts: String(headScripts).trim() || null } : {}),
      },
    });
    res.json({ coproducer: updated });
  } catch (error) {
    console.error('[ADMIN/COPRODUCERS] Update error:', error);
    res.status(500).json({ error: 'Erro ao atualizar coprodutor' });
  }
});

/**
 * DELETE /api/admin/coproducers/:id
 *
 * Removes the coproducer relationship but PRESERVES historical
 * transactions (Transaction.coproducerId is set to NULL by the FK's
 * ON DELETE SET NULL) so financial history stays intact. The User
 * role is downgraded back to 'member' so they can still log in.
 */
router.delete('/:id', superadminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const acc = await prisma.coproducerAccount.findUnique({ where: { id: req.params.id } });
    if (!acc) return res.status(404).json({ error: 'Coprodutor não encontrado' });
    await prisma.$transaction([
      prisma.user.update({ where: { id: acc.userId }, data: { role: 'member' } }),
      prisma.coproducerAccount.delete({ where: { id: acc.id } }),
    ]);
    res.json({ success: true });
  } catch (error) {
    console.error('[ADMIN/COPRODUCERS] Delete error:', error);
    res.status(500).json({ error: 'Erro ao remover coprodutor' });
  }
});

export default router;
