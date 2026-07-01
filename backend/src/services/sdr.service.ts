import { env } from '../config/env';

/**
 * Komunika SDR outbound integration.
 *
 * Replaces the old funnel "add-lead" remarketing mechanism. Instead of dropping
 * a lead into a funnel sequence, we ask a Komunika SDR assistant to *initiate*
 * an outbound WhatsApp conversation, optionally seeded with free-text `context`
 * (lead info / quiz answers) that gets injected into the LLM prompt.
 *
 * Endpoint: POST {apiUrl}/api/v1/sdr-bot/assistants/{assistantId}/initiate
 * Auth:     X-API-Key: kmnk_...
 *
 * This function NEVER throws on a per-contact HTTP/network error — it returns a
 * structured result so callers (cron, dispatch, admin routes) can log per
 * contact and decide whether to advance state.
 */

export interface InitiateSdrParams {
  assistantId: string;
  phone: string;
  name?: string;
  context?: string;
  source?: string;
  instanceId?: string;
  expiresAt?: string;
  apiKey: string; // kmnk_...
  apiUrl?: string; // defaults to env.KOMUNIKA_API_URL || 'https://api.komunika.site'
}

export type SdrInitiateStatus = 'queued' | 'already_started' | 'failed';

export interface InitiateSdrResult {
  ok: boolean; // true when HTTP 202 (queued or already_started)
  status: SdrInitiateStatus;
  httpStatus: number;
  error?: string;
  data?: any;
}

/**
 * Normalize a phone number for Komunika. Strips non-digits; if a bare 9-digit
 * Mozambican number starting with '8' is given, prefix the country code 258.
 * Mirrors the existing logic used across cron.ts / admin.routes.ts.
 */
function normalizePhone(raw: string): string {
  let clean = (raw || '').replace(/\D/g, '');
  if (clean.length === 9 && clean.startsWith('8')) {
    clean = `258${clean}`;
  }
  return clean;
}

export async function initiateSdrOutbound(p: InitiateSdrParams): Promise<InitiateSdrResult> {
  const apiUrl = p.apiUrl || env.KOMUNIKA_API_URL || 'https://api.komunika.site';
  const phone = normalizePhone(p.phone);

  // Defensive truncation — the API caps context at ~2000 chars.
  const context =
    typeof p.context === 'string' && p.context.length > 2000
      ? p.context.slice(0, 2000)
      : p.context;

  const body: Record<string, unknown> = { phone };
  if (p.name !== undefined) body.name = p.name;
  if (context !== undefined) body.context = context;
  if (p.source !== undefined) body.source = p.source;
  if (p.instanceId !== undefined) body.instanceId = p.instanceId;
  if (p.expiresAt !== undefined) body.expiresAt = p.expiresAt;

  try {
    const response = await fetch(
      `${apiUrl}/api/v1/sdr-bot/assistants/${p.assistantId}/initiate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': p.apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      },
    );

    const data = await response.json().catch(() => null);

    if (response.status === 202) {
      const status: SdrInitiateStatus =
        data?.data?.status === 'already_started' ? 'already_started' : 'queued';
      return { ok: true, status, httpStatus: 202, data };
    }

    const error =
      (data && (data.error || data.message)) || `HTTP ${response.status}`;
    return { ok: false, status: 'failed', httpStatus: response.status, error, data };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 'failed', httpStatus: 0, error };
  }
}

/**
 * Heurística: o SDR AI da Komunika está REALMENTE entregando as mensagens?
 *
 * Quando a OpenAI está sem crédito, a Komunika CRIA a conversa (HTTP 202) mas o
 * worker não consegue gerar a abertura (LLM 429) → a conversa fica SEM mensagem.
 * O `initiate` continua retornando 202, então esse é o ÚNICO jeito de o Código
 * Zero perceber a falha: olhar as conversas recentes. Se as criadas entre 5min
 * e 3h atrás (que já deram tempo do SDR responder) existem e NENHUMA tem
 * mensagem, o SDR não está entregando → o cron cai no fallback direto. Na dúvida
 * (amostra pequena ou erro de rede), retorna true para NÃO bloquear o SDR.
 */
export async function sdrIsDelivering(apiUrl: string, apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiUrl}/api/v1/conversations?limit=25`, {
      headers: { 'X-API-Key': apiKey },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return true;
    const j: any = await res.json().catch(() => null);
    const convs: any[] = Array.isArray(j?.data) ? j.data : [];
    const now = Date.now();
    const judged = convs.filter((c) => {
      const t = c?.createdAt ? new Date(c.createdAt).getTime() : 0;
      return t > 0 && now - t > 5 * 60 * 1000 && now - t < 3 * 60 * 60 * 1000;
    });
    if (judged.length < 2) return true; // amostra insuficiente → assume ok
    return judged.some((c) => !!c?.lastMessageAt); // alguma com mensagem = entregando
  } catch {
    return true;
  }
}
