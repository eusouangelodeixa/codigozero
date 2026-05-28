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
