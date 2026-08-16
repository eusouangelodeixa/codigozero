/**
 * SSO de uso único app.czero.sbs → members.czero.sbs.
 *
 * localStorage não cruza origens, então o botão "Área de Membros" do app
 * minta aqui um CÓDIGO curto (60s, jti de uso único) e navega para
 * members.czero.sbs/sso#code=… (fragment — nunca query string, fragments não
 * aparecem em logs de servidor/nginx). A página /sso troca o código pelo JWT
 * de 7 dias via POST /api/members/sso/exchange.
 *
 * SEGURANÇA: assinado com chave DERIVADA de JWT_SECRET (nunca o secret cru —
 * um código destes jamais pode ser aceito pelo authMiddleware; mesmo racional
 * do lib/feedbackToken.ts). Uso único via Redis `SET NX EX` (vale para N
 * réplicas — o Map em memória antigo era "uso único POR PROCESSO"), com
 * fallback para o Map local se o Redis estiver fora: melhor degradar para a
 * garantia antiga do que negar login a todo mundo.
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { redisConnection } from '../queues/scraper.queue';

const SSO_KEY = crypto.createHmac('sha256', env.JWT_SECRET).update('cz-members-sso-v1').digest();
const PURPOSE = 'members-sso';
const TTL_SECONDS = 60;

// jti já queimados → expiram naturalmente; varremos ao usar.
const burned = new Map<string, number>();

function sweep(now: number): void {
  if (burned.size < 1000) return;
  for (const [jti, exp] of burned) if (exp < now) burned.delete(jti);
}

export function signMembersSsoCode(userId: string): string {
  return jwt.sign({ userId, purpose: PURPOSE, jti: crypto.randomUUID() }, SSO_KEY, {
    algorithm: 'HS256',
    expiresIn: `${TTL_SECONDS}s`,
  });
}

/** Valida E QUEIMA o código. Retorna o userId ou null (inválido/expirado/repetido). */
export async function consumeMembersSsoCode(code: string): Promise<string | null> {
  try {
    const decoded = jwt.verify(code, SSO_KEY, { algorithms: ['HS256'] }) as {
      userId?: string;
      purpose?: string;
      jti?: string;
      exp?: number;
    };
    if (decoded.purpose !== PURPOSE || !decoded.userId || !decoded.jti) return null;
    const now = Date.now();

    // Queima distribuída: SET NX só ganha uma vez por jti, em qualquer réplica.
    try {
      const won = await redisConnection.set(`sso:jti:${decoded.jti}`, '1', 'EX', TTL_SECONDS * 2, 'NX');
      if (won !== 'OK') return null; // replay
    } catch {
      // Redis fora → fallback para a garantia por-processo de sempre.
      if (burned.has(decoded.jti)) return null;
    }
    burned.set(decoded.jti, (decoded.exp ?? 0) * 1000 + 60_000);
    sweep(now);
    return decoded.userId;
  } catch {
    return null;
  }
}
