import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

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
 */
export async function resolveCoproducerForOrder(opts: {
  productPid?: string | null;
  buyerReferralCode?: string | null;
}): Promise<{ id: string; code: string } | null> {
  if (opts.productPid) {
    const byPid = await prisma.coproducerAccount.findUnique({
      where: { productPid: opts.productPid },
      select: { id: true, code: true, enabled: true },
    });
    if (byPid && byPid.enabled) return { id: byPid.id, code: byPid.code };
  }
  if (opts.buyerReferralCode) {
    const byCode = await prisma.coproducerAccount.findUnique({
      where: { code: opts.buyerReferralCode },
      select: { id: true, code: true, enabled: true },
    });
    if (byCode && byCode.enabled) return { id: byCode.id, code: byCode.code };
  }
  return null;
}
