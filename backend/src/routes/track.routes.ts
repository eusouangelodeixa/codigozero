import { Router, Request, Response } from 'express';
import { sendMetaEvent } from '../services/meta.service';

/**
 * Espelho server-side dos eventos do navegador (Meta CAPI).
 *
 * A landing dispara o evento no pixel E manda-o para aqui com o MESMO
 * `event_id`. O Meta junta os dois e conta uma vez só — mas se o browser
 * falhar (bloqueador, ITP, a pessoa fecha a aba, ou a navegação do CTA corta o
 * request a meio), o evento chega na mesma por este caminho.
 *
 * Rota PÚBLICA de propósito: a landing não tem sessão. Por isso nada aqui
 * confia no cliente — só passa adiante uma allowlist de eventos e um conjunto
 * fechado de campos.
 */

const router = Router();

/**
 * Eventos aceites. Sem allowlist, qualquer um podia injectar "Purchase" falso
 * no pixel e envenenar a otimização das campanhas — que é exactamente o dado
 * que estamos a tentar tornar fiável.
 *
 * `Purchase`/`Subscribe` NÃO estão aqui: essas só são emitidas pelo webhook de
 * pagamento, onde o valor é real e verificado.
 */
const ALLOWED_EVENTS = new Set([
  'PageView',
  'ViewContent',
  'Lead',
  'CompleteRegistration',
  'InitiateCheckout',
  'Contact',
  // Custom (funil do quiz e do VSL)
  'QuizStart',
  'QuizStep',
  'QuizComplete',
  'VideoPlay',
  'VideoProgress',
  'CTAClick',
]);

/** Só estes campos seguem para o `custom_data` — nada de payload livre. */
const ALLOWED_CUSTOM_KEYS = new Set([
  'content_name', 'content_category', 'content_type', 'content_ids',
  'value', 'currency', 'status',
  'step', 'step_id', 'answer', 'percent', 'source', 'variant',
]);

function pickCustomData(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!ALLOWED_CUSTOM_KEYS.has(key)) continue;
    if (typeof value === 'string') out[key] = value.slice(0, 200);
    else if (typeof value === 'number' || typeof value === 'boolean') out[key] = value;
  }
  return out;
}

const str = (v: unknown, max = 300): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;

/**
 * O IP real do visitante, atrás do nginx. Sem isto o CAPI recebe o IP do
 * container e a qualidade da correspondência cai.
 */
function clientIp(req: Request): string | undefined {
  const fwd = req.headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  const ip = (raw || req.socket.remoteAddress || '').split(',')[0].trim();
  return ip || undefined;
}

router.post('/', async (req: Request, res: Response) => {
  const body = req.body || {};
  const eventName = str(body.eventName, 40);
  const eventId = str(body.eventId, 80);

  // Responde já: o navegador está muitas vezes a navegar para fora (CTA) e não
  // pode ficar preso à espera do Meta.
  res.status(202).json({ ok: true });

  if (!eventName || !eventId || !ALLOWED_EVENTS.has(eventName)) return;

  void sendMetaEvent({
    eventName,
    eventId,
    eventSourceUrl: str(body.sourceUrl, 500),
    actionSource: 'website',
    userData: {
      email: str(body.email, 200),
      phone: str(body.phone, 40),
      firstName: str(body.firstName, 100),
      lastName: str(body.lastName, 100),
      externalId: str(body.externalId, 100),
      fbp: str(body.fbp, 200),
      fbc: str(body.fbc, 500),
      ip: clientIp(req),
      userAgent: str(req.headers['user-agent'] as string, 500),
    },
    customData: pickCustomData(body.customData),
  });
});

export default router;
