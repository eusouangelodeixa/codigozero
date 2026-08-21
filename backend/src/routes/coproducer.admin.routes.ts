import { Router, Response } from 'express';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { adminMiddleware } from '../middlewares/admin.middleware';
import { superadminMiddleware } from '../middlewares/superadmin.middleware';
import { generateUniqueCoproducerCode, sendCoproducerWelcome } from '../services/coproducer.service';
import { pageArgs, paginated } from '../lib/pagination';

const router = Router();
const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

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
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { page, pageSize, skip, take } = pageArgs(req);
    // Explicit SELECT: excludes the heavy vslEmbedHtml / headScripts blobs — the
    // list/table doesn't render them; they load only in the detail endpoint.
    const [accounts, total] = await Promise.all([
      prisma.coproducerAccount.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          code: true,
          productPid: true,
          planId: true,
          publicCheckoutUrl: true,
          sharePct: true,
          bumpProductPid: true,
          bumpPrice: true,
          displayName: true,
          enabled: true,
          notes: true,
          webhookToken: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, name: true, email: true, phone: true } },
        },
      }),
      prisma.coproducerAccount.count(),
    ]);

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
      createdAt: acc.createdAt,
      updatedAt: acc.updatedAt,
      user: acc.user,
      lifetimeRevenue: byId.get(acc.id)?._sum.amount || 0,
      lifetimeSales: byId.get(acc.id)?._count._all || 0,
      activeSubscribers: subsByCode.get(acc.code) || 0,
    }));

    // `coproducers` kept as an alias of `items` for backward compat with the old front.
    res.json({ ...paginated(items, total, page, pageSize), coproducers: items });
  } catch (error) {
    console.error('[ADMIN/COPRODUCERS] List error:', error);
    res.status(500).json({ error: 'Erro ao listar coprodutores' });
  }
});

/**
 * POST /api/admin/coproducers
 * Body: { userEmail, name?, phone?, sharePct?, productPid?, planId?,
 *         publicCheckoutUrl?, displayName?, notes?, ... }
 *
 * O cadastro mínimo é email + WhatsApp + split: se o email ainda não tem
 * conta, ela é CRIADA aqui (a senha sai no welcome). productPid é opcional —
 * só é preciso quando a venda entra pelo webhook principal ou pela landing
 * /c/{code}; coproduções que vendem na própria conta Lojou usam a URL de
 * webhook por token, onde a atribuição já é forçada.
 */
router.post('/', superadminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { userEmail, name, phone, productPid, planId, publicCheckoutUrl, sharePct, displayName, notes, bumpProductPid, bumpPrice, vslEmbedHtml, headScripts } = req.body || {};

    if (!userEmail) {
      return res.status(400).json({ error: 'userEmail é obrigatório' });
    }
    if (sharePct != null && (sharePct < 0 || sharePct > 100)) {
      return res.status(400).json({ error: 'sharePct deve estar entre 0 e 100' });
    }
    if (bumpPrice != null && bumpPrice < 0) {
      return res.status(400).json({ error: 'bumpPrice não pode ser negativo' });
    }

    const email = String(userEmail).toLowerCase().trim();
    // Mesma normalização de telefone dos outros fluxos (welcome/grant-trial):
    // só dígitos; 9 dígitos começando em 8 ganham o 258 de Moçambique.
    let cleanPhone = String(phone || '').replace(/\D/g, '');
    if (cleanPhone.length === 9 && cleanPhone.startsWith('8')) cleanPhone = `258${cleanPhone}`;

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      if (!cleanPhone) {
        return res.status(400).json({ error: 'Informe o WhatsApp — é onde as credenciais do coprodutor serão entregues' });
      }
      const phoneTaken = await prisma.user.findUnique({ where: { phone: cleanPhone } });
      if (phoneTaken) {
        return res.status(400).json({ error: `Este WhatsApp já pertence à conta ${phoneTaken.email} — use esse email ou outro número` });
      }
      user = await prisma.user.create({
        data: {
          email,
          name: String(name || '').trim() || email.split('@')[0],
          phone: cleanPhone,
          // Placeholder impossível de adivinhar — o welcome logo abaixo troca
          // por uma senha real e a envia no WhatsApp.
          passwordHash: crypto.randomBytes(32).toString('hex'),
          role: 'coproducer',
        },
      });
    } else if (cleanPhone && cleanPhone !== user.phone) {
      // O admin digitou um WhatsApp diferente do da conta: atualiza, senão o
      // welcome (que usa user.phone) iria para o número antigo.
      const phoneTaken = await prisma.user.findUnique({ where: { phone: cleanPhone } });
      if (phoneTaken && phoneTaken.id !== user.id) {
        return res.status(400).json({ error: `Este WhatsApp já pertence à conta ${phoneTaken.email}` });
      }
      user = await prisma.user.update({ where: { id: user.id }, data: { phone: cleanPhone } });
    }

    const existing = await prisma.coproducerAccount.findUnique({ where: { userId: user.id } });
    if (existing) return res.status(400).json({ error: 'Este usuário já é coprodutor' });

    const pid = typeof productPid === 'string' && productPid.trim() ? productPid.trim() : null;
    if (pid) {
      const pidTaken = await prisma.coproducerAccount.findUnique({ where: { productPid: pid } });
      if (pidTaken) return res.status(400).json({ error: 'Este productPid já está em uso por outro coprodutor' });
    }

    const code = await generateUniqueCoproducerCode();

    // Promote: set role + create the account in one transaction
    const [, account] = await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { role: 'coproducer' } }),
      prisma.coproducerAccount.create({
        data: {
          userId: user.id,
          code,
          productPid: pid,
          planId: planId?.trim() || null,
          publicCheckoutUrl: publicCheckoutUrl?.trim() || null,
          sharePct: sharePct != null ? Number(sharePct) : 50,
          bumpProductPid: bumpProductPid?.trim() || null,
          bumpPrice: bumpPrice != null && bumpPrice !== '' ? Number(bumpPrice) : null,
          displayName: displayName?.trim() || null,
          notes: notes?.trim() || null,
          vslEmbedHtml: vslEmbedHtml?.trim() || null,
          headScripts: headScripts?.trim() || null,
          // URL de webhook própria desta coprodução (vendas via conta
          // própria na plataforma) — o token é a autenticação da rota
          // /api/webhooks/lojou/copro/{token}.
          webhookToken: crypto.randomBytes(24).toString('hex'),
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
        // "" limpa o pid (coprodução só-webhook); a atribuição fica pelo token/código.
        ...(productPid != null ? { productPid: String(productPid).trim() || null } : {}),
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

// POST /api/admin/coproducers/:id/webhook-token — gera/rotaciona o token da
// URL de webhook desta coprodução (o antigo para de funcionar na hora).
router.post('/:id/webhook-token', superadminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const account = await prisma.coproducerAccount.update({
      where: { id: String(req.params.id) },
      data: { webhookToken: crypto.randomBytes(24).toString('hex') },
      select: { id: true, webhookToken: true },
    });
    return res.json({ webhookToken: account.webhookToken });
  } catch (error) {
    console.error('[ADMIN/COPRODUCERS] webhook-token error:', error);
    return res.status(500).json({ error: 'Erro ao gerar token' });
  }
});

export default router;
