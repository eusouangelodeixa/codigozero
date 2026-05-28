import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';

const prisma = new PrismaClient();

// Short, copyable code for /c/{code} URLs. Avoids ambiguous glyphs
// (0/O, 1/I/l) so it's safe to dictate over the phone.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz';

function randomCode(len = 8): string {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

/** Generate a unique 7-9 char coproducer code, retrying on collision. */
export async function generateUniqueCoproducerCode(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const len = 7 + Math.floor(Math.random() * 3);
    const code = randomCode(len);
    const exists = await prisma.coproducerAccount.findUnique({ where: { code } });
    if (!exists) return code;
  }
  return randomCode(9) + randomCode(2);
}

/**
 * Reset the coproducer's password to a fresh random one and send a
 * welcome message via Komunika with credentials + a summary of how
 * the dashboard works.
 *
 * Returns a structured result so callers can decide whether to block
 * or just log. Failure to send the WhatsApp does NOT roll back the
 * password reset — superadmin can resend manually from the same
 * endpoint.
 */
export async function sendCoproducerWelcome(opts: {
  coproducerAccountId: string;
}): Promise<{ delivered: boolean; status: number | string; passwordSent?: boolean }> {
  const acc = await prisma.coproducerAccount.findUnique({
    where: { id: opts.coproducerAccountId },
    include: { user: true },
  });
  if (!acc) return { delivered: false, status: 'not-found' };

  const rawPassword = crypto.randomBytes(4).toString('hex');
  const passwordHash = await bcrypt.hash(rawPassword, 10);
  await prisma.user.update({ where: { id: acc.userId }, data: { passwordHash } });

  const sysConfig = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
  const apiKey = sysConfig?.komunikaAdminApiKey;
  const instanceId = sysConfig?.komunikaInstanceId;
  if (!apiKey || !instanceId) {
    console.warn('[COPRODUCER/WELCOME] Komunika not configured — password reset but message NOT sent');
    return { delivered: false, status: 'komunika-not-configured', passwordSent: true };
  }

  let phone = (acc.user.phone || '').replace(/\D/g, '');
  if (phone.length === 9 && phone.startsWith('8')) phone = `258${phone}`;
  if (!phone) {
    return { delivered: false, status: 'no-phone', passwordSent: true };
  }

  const firstName = (acc.user.name || 'parceiro').split(' ')[0];
  const landingUrl = `https://czero.sbs/c/${acc.code}`;
  const dashboardUrl = `${env.FRONTEND_URL}/login`;
  const bumpLine = acc.bumpProductPid
    ? `\n• *Bump:* ${acc.bumpProductPid} (${acc.bumpPrice ?? '—'} MZN)`
    : '\n• *Bump:* usa o bump principal do sistema';

  const message = [
    `Olá ${firstName}! 🤝`,
    ``,
    `Você foi adicionado como *coprodutor* no Código Zero. Bem-vindo!`,
    ``,
    `*🔑 Acesso ao painel*`,
    `Email: ${acc.user.email}`,
    `Senha: ${rawPassword}`,
    `Login: ${dashboardUrl}`,
    ``,
    `*🔗 Seu link de coprodução*`,
    landingUrl,
    `(É uma cópia da landing principal — os pagamentos feitos por esse link caem no seu PID na Lojou.)`,
    ``,
    `*⚙️ Sua configuração*`,
    `• *PID principal:* ${acc.productPid}${bumpLine}`,
    `• *Split:* ${acc.sharePct}% (Lojou faz a divisão automaticamente)`,
    ``,
    `*📊 No painel você acompanha:*`,
    `• Vendas suas (com filtros por hoje / 7d / 30d / personalizado)`,
    `• Leads que entraram pelo seu link`,
    `• Assinantes ativos e próximas renovações`,
    `• Sua parte estimada por período`,
    ``,
    `*ℹ️ Como funciona*`,
    `1. Você divulga o link acima nas suas redes.`,
    `2. Quem clicar vê a landing e preenche o formulário.`,
    `3. Ao pagar, a venda cai no seu PID e fica atribuída a você no painel.`,
    `4. Renovações futuras dessa pessoa continuam atribuídas a você.`,
    ``,
    `Acesso é só de leitura — você acompanha sem precisar gerir nada. Qualquer dúvida, fala comigo. 🚀`,
  ].join('\n');

  // Retry 3x with backoff (same pattern as the webhook credential send)
  const url = (env.KOMUNIKA_API_URL || 'https://api.komunika.site') + '/api/v1/messages/send';
  let lastStatus: number | string = 'no-attempt';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({ instanceId, to: phone, type: 'text', content: message }),
      });
      lastStatus = r.status;
      if (r.ok) {
        console.log(`[COPRODUCER/WELCOME] ✅ Sent to ${phone} (status=${r.status}, attempt=${attempt})`);
        return { delivered: true, status: r.status, passwordSent: true };
      }
      const body = await r.text().catch(() => '');
      console.warn(`[COPRODUCER/WELCOME] attempt ${attempt} failed: ${r.status} ${body.slice(0, 160)}`);
    } catch (e: any) {
      lastStatus = `throw:${e?.message || 'unknown'}`;
      console.warn(`[COPRODUCER/WELCOME] attempt ${attempt} threw:`, e?.message || e);
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  console.error(`[COPRODUCER/WELCOME] 🚨 Failed after 3 attempts to ${phone} (lastStatus=${lastStatus})`);
  return { delivered: false, status: lastStatus, passwordSent: true };
}

export interface ResolvedCoproducer {
  id: string;
  code: string;
  productPid: string;
  bumpProductPid: string | null;
  bumpPrice: number | null;
}

/**
 * Resolve a coproducer attribution for an incoming order.
 *
 * Two signals, in priority order:
 *   1. The Lojou product pid on the payload matches a registered
 *      coproducer's `productPid` — strongest signal, since each
 *      coproducer has their own pid.
 *   2. The buyer's User row has `referredByCoproducer` set (from
 *      landing on /c/{code}) — fallback when pid lookup misses.
 *
 * Returns null when the order belongs to the principal product.
 *
 * Also returns the coproducer's bump pid + price so the webhook can
 * detect that this particular coproducer's bump was added to the
 * order (instead of only the principal bump pid).
 */
export async function resolveCoproducerForOrder(opts: {
  productPid?: string | null;
  buyerReferralCode?: string | null;
}): Promise<ResolvedCoproducer | null> {
  const select = {
    id: true,
    code: true,
    productPid: true,
    bumpProductPid: true,
    bumpPrice: true,
    enabled: true,
  } as const;
  if (opts.productPid) {
    const byPid = await prisma.coproducerAccount.findUnique({
      where: { productPid: opts.productPid },
      select,
    });
    if (byPid && byPid.enabled) {
      return {
        id: byPid.id,
        code: byPid.code,
        productPid: byPid.productPid,
        bumpProductPid: byPid.bumpProductPid,
        bumpPrice: byPid.bumpPrice,
      };
    }
  }
  if (opts.buyerReferralCode) {
    const byCode = await prisma.coproducerAccount.findUnique({
      where: { code: opts.buyerReferralCode },
      select,
    });
    if (byCode && byCode.enabled) {
      return {
        id: byCode.id,
        code: byCode.code,
        productPid: byCode.productPid,
        bumpProductPid: byCode.bumpProductPid,
        bumpPrice: byCode.bumpPrice,
      };
    }
  }
  return null;
}
