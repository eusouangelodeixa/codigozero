import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { normalizeMzPhone } from '../lib/whatsapp';

const router = Router();
const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

/**
 * PUBLIC routes for the reels LP (lp.czero.sbs). Mounted at /api/lp.
 *  GET  /config → admin-editable copy + group/central links (LandingConfig.sections.lp)
 *  POST /lead   → capture name + WhatsApp (+ optional qualifying survey)
 *
 * Unlike /api/landing/lead, this does NOT create a checkout — it's a free
 * lead magnet. A capture is stored as a User row with subscriptionStatus
 * 'lead' and leadSource 'lp:reels', so it shows up in /admin/leads filtered
 * by that source. No auth; capture is rate-limited.
 */

const LP_SOURCE = 'lp:reels';

// 6 captures / 10 min per IP. The form posts twice per completion (step 0 =
// name+whatsapp, then again with the survey), so this comfortably allows a
// full flow while curbing bots.
const captureLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' },
});

// GET /api/lp/config — public LP overrides. The page merges these over its
// own LP_DEFAULTS, so an empty/missing config simply renders the defaults.
router.get('/config', async (_req: Request, res: Response) => {
  try {
    const cfg = await prisma.landingConfig.findUnique({ where: { id: 'singleton' } });
    const sections = (cfg?.sections as Record<string, unknown>) || {};
    const lp = (sections.lp as Record<string, unknown>) || {};
    return res.json({ config: lp });
  } catch (e: any) {
    console.error('[LP] config error:', e?.message || e);
    return res.json({ config: {} });
  }
});

// POST /api/lp/lead — capture a reels lead. Body: { name, whatsapp (or phone),
// survey? }. Called on step 0 (name+whatsapp) and again on completion (with the
// survey), so it upserts by phone and merges survey answers idempotently.
router.post('/lead', captureLimiter, async (req: Request, res: Response) => {
  try {
    const name = String(req.body?.name || '').trim();
    const whatsappRaw = String(req.body?.whatsapp || req.body?.phone || '').trim();
    const survey =
      req.body?.survey && typeof req.body.survey === 'object' && !Array.isArray(req.body.survey)
        ? (req.body.survey as Record<string, unknown>)
        : null;

    if (whatsappRaw.replace(/\D/g, '').length < 8) {
      return res.status(400).json({ error: 'WhatsApp inválido.' });
    }

    const contactPhone = normalizeMzPhone(whatsappRaw) || `258${Date.now().toString().slice(-9)}`;

    // Match an existing person on the last 9 digits (the local number) so a
    // returning visitor — or a paying member with the same number — is updated,
    // never duplicated. We NEVER touch subscriptionStatus/role here, so a real
    // member is never downgraded to a lead.
    const last9 = contactPhone.slice(-9);
    const existing = await prisma.user.findFirst({ where: { phone: { contains: last9 } } });

    if (existing) {
      const mergedSurvey: any = survey
        ? { ...((existing.surveyAnswers as Record<string, unknown>) || {}), ...survey }
        : existing.surveyAnswers;
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          ...(name && !existing.name ? { name } : {}),
          ...(existing.leadSource ? {} : { leadSource: LP_SOURCE }),
          ...(mergedSurvey ? { surveyAnswers: mergedSurvey } : {}),
        },
      });
      return res.json({ success: true });
    }

    // New lead. email is @unique + required, but the LP only collects a phone —
    // synthesize a stable per-phone address. Fall back to a suffixed phone/email
    // on the rare @unique collision so a capture never 500s.
    const email = `lp_${contactPhone}@lead.czero.sbs`;
    try {
      await prisma.user.create({
        data: {
          name: name || 'Lead',
          email,
          phone: contactPhone,
          passwordHash: crypto.randomBytes(32).toString('hex'),
          subscriptionStatus: 'lead',
          leadSource: LP_SOURCE,
          ...(survey ? { surveyAnswers: survey as any } : {}),
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        const suffix = Date.now();
        await prisma.user.create({
          data: {
            name: name || 'Lead',
            email: `lp_${contactPhone}_${suffix}@lead.czero.sbs`,
            phone: `${contactPhone}_${suffix}`,
            passwordHash: crypto.randomBytes(32).toString('hex'),
            subscriptionStatus: 'lead',
            leadSource: LP_SOURCE,
            ...(survey ? { surveyAnswers: survey as any } : {}),
          },
        });
      } else {
        throw err;
      }
    }

    return res.json({ success: true });
  } catch (e: any) {
    console.error('[LP] lead error:', e?.message || e);
    return res.status(500).json({ error: 'Erro ao registrar. Tente de novo.' });
  }
});

export default router;
