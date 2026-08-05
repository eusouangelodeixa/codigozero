/**
 * Aviso automático no grupo do WhatsApp quando um conteúdo novo entra na
 * Central (central.czero.sbs).
 *
 * Fluxo: publicar em /admin/conteudo → queueCentralAnnouncement() agenda um
 * registro (CentralAnnouncement) para +10 min → o tick do cron chama
 * processCentralAnnouncements(), que monta um resumo breve e envia via
 * Komunika (POST /api/v1/groups/{id}/messages) pro grupo escolhido em
 * /admin/lp (LandingConfig.sections.lp.announceGroup).
 *
 * Regras de segurança (ver [[cron-whatsapp-send-safety]]):
 *  - pageId é ÚNICO na fila: cada conteúdo anuncia UMA vez, mesmo que o admin
 *    despublique/republique depois (dedup absoluto).
 *  - 1 envio por tick (pacing na instância compartilhada).
 *  - Komunika fora do ar → o registro fica pendente e re-tenta a cada tick;
 *    depois de 24h do vencimento sem sucesso, expira como skipped (nunca
 *    anunciar conteúdo "novo" com um dia de atraso).
 *  - Grupo não configurado → segue pendente até configurar (ou expirar).
 */
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

// Host público da Central. O deep-link ?m={slug} abre o material direto no
// hub (com OG próprio — bom preview no grupo).
const CENTRAL_URL = 'https://central.czero.sbs';

const ANNOUNCE_DELAY_MS = 10 * 60 * 1000; // 10 min após publicar
const EXPIRE_AFTER_MS = 24 * 60 * 60 * 1000; // pendente >24h do dueAt → skipped

interface KomunikaApi {
  apiUrl: string;
  apiKey: string;
  instanceId: string;
}

/** Credenciais Komunika — mesma resolução do lib/whatsapp (SystemConfig → env). */
async function getKomunikaApi(): Promise<KomunikaApi | null> {
  const sysConfig = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
  const apiKey = sysConfig?.komunikaAdminApiKey || env.KOMUNIKA_ADMIN_API_KEY;
  const instanceId = sysConfig?.komunikaInstanceId;
  if (!apiKey || !instanceId) return null;
  return { apiUrl: env.KOMUNIKA_API_URL || 'https://api.komunika.site', apiKey, instanceId };
}

export interface KomunikaGroup {
  id: string;
  name: string;
  jid: string;
}

/**
 * Lista os grupos de WhatsApp da instância admin no Komunika. Com
 * `sync: true`, pede antes um sync (Komunika puxa os grupos atuais do
 * WhatsApp pro banco dele) — usar quando o admin clica "carregar grupos".
 */
export async function listKomunikaGroups(opts: { sync?: boolean } = {}): Promise<{ ok: boolean; groups: KomunikaGroup[]; error?: string }> {
  const api = await getKomunikaApi();
  if (!api) return { ok: false, groups: [], error: 'Komunika não configurado (chave/instância em /admin/config)' };

  const headers = { 'Content-Type': 'application/json', 'X-API-Key': api.apiKey };
  try {
    if (opts.sync) {
      // Falha no sync não é fatal — a listagem ainda devolve o que já existe.
      await fetch(`${api.apiUrl}/api/v1/groups/sync`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ instanceId: api.instanceId }),
      }).catch(() => null);
    }
    const r = await fetch(
      `${api.apiUrl}/api/v1/groups?instanceId=${encodeURIComponent(api.instanceId)}&limit=100`,
      { headers },
    );
    const d: any = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, groups: [], error: `Komunika respondeu ${r.status}` };
    const rows: any[] = Array.isArray(d.data) ? d.data : [];
    const groups = rows
      .filter((g) => g && g.id && g.name)
      .map((g) => ({ id: String(g.id), name: String(g.name), jid: String(g.jid || '') }));
    return { ok: true, groups };
  } catch (e: any) {
    return { ok: false, groups: [], error: e?.message || 'Erro de conexão com o Komunika' };
  }
}

/**
 * Agenda o anúncio de um conteúdo publicado (+10 min). Idempotente: se o
 * conteúdo já tem registro (pendente, enviado, o que for), não faz nada.
 * Nunca lança — chamada fire-and-forget no fluxo de publicação.
 */
export async function queueCentralAnnouncement(pageId: string): Promise<void> {
  try {
    await prisma.centralAnnouncement.createMany({
      data: [{ pageId, dueAt: new Date(Date.now() + ANNOUNCE_DELAY_MS) }],
      skipDuplicates: true,
    });
  } catch (e: any) {
    console.error('[CENTRAL-ANNOUNCE] queue error:', e?.message || e);
  }
}

/** Tira marcação markdown básica pra virar texto de WhatsApp. */
function stripMd(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // [texto](url) → texto
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Resumo breve: metaDescription > gateSubtext > primeiro bloco de texto. */
function buildSummary(page: { metaDescription: string | null; gateSubtext: string | null; blocks: any }): string {
  const meta = (page.metaDescription || '').trim();
  if (meta) return meta;
  const gate = (page.gateSubtext || '').trim();
  if (gate) return gate;
  const blocks: any[] = Array.isArray(page.blocks) ? page.blocks : [];
  const firstText = blocks.find((b) => b?.type === 'text' && typeof b.md === 'string');
  if (firstText) {
    const txt = stripMd(firstText.md);
    return txt.length > 220 ? `${txt.slice(0, 217)}…` : txt;
  }
  return 'Material novo, prático e pronto pra resgatar.';
}

function buildMessage(page: { title: string; slug: string; metaDescription: string | null; gateSubtext: string | null; blocks: any }): string {
  return [
    '📢 *Material novo na Central!*',
    '',
    `*${page.title}*`,
    buildSummary(page),
    '',
    `👉 Resgata aqui: ${CENTRAL_URL}/?m=${encodeURIComponent(page.slug)}`,
  ].join('\n');
}

/**
 * Corpo do tick do cron (a cada minuto): expira pendentes velhos e envia NO
 * MÁXIMO UM anúncio vencido por tick. Nunca lança.
 */
export async function processCentralAnnouncements(): Promise<void> {
  const now = new Date();

  // 1) Expira o que ficou pendente por mais de 24h (Komunika fora, grupo
  //    nunca configurado…) — anúncio velho não é mais "material novo".
  await prisma.centralAnnouncement.updateMany({
    where: { status: 'pending', dueAt: { lt: new Date(now.getTime() - EXPIRE_AFTER_MS) } },
    data: { status: 'skipped', error: 'expirado (24h sem condições de envio)' },
  });

  // 2) Próximo vencido.
  const item = await prisma.centralAnnouncement.findFirst({
    where: { status: 'pending', dueAt: { lte: now } },
    orderBy: { dueAt: 'asc' },
  });
  if (!item) return;

  // 3) O conteúdo ainda existe e continua publicado?
  const page = await prisma.contentPage.findUnique({
    where: { id: item.pageId },
    select: { title: true, slug: true, status: true, metaDescription: true, gateSubtext: true, blocks: true },
  });
  if (!page || page.status !== 'published') {
    await prisma.centralAnnouncement.update({
      where: { id: item.id },
      data: { status: 'skipped', error: page ? 'despublicado antes do envio' : 'conteúdo excluído' },
    });
    return;
  }

  // 4) Grupo escolhido em /admin/lp (sections.lp.announceGroup = {id, name}).
  const landing = await prisma.landingConfig.findUnique({
    where: { id: 'singleton' },
    select: { sections: true },
  });
  const group = (landing?.sections as any)?.lp?.announceGroup;
  if (!group?.id) {
    // Sem grupo: fica pendente (o admin pode configurar já já) até expirar.
    if (item.attempts === 0) {
      await prisma.centralAnnouncement.update({
        where: { id: item.id },
        data: { attempts: 1, error: 'aguardando grupo em /admin/lp' },
      });
    }
    return;
  }

  const api = await getKomunikaApi();
  if (!api) {
    await prisma.centralAnnouncement.update({
      where: { id: item.id },
      data: { attempts: { increment: 1 }, error: 'Komunika não configurado' },
    });
    return;
  }

  // 5) Envia pro grupo.
  try {
    const r = await fetch(`${api.apiUrl}/api/v1/groups/${encodeURIComponent(group.id)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': api.apiKey },
      body: JSON.stringify({ content: buildMessage(page) }),
    });
    if (r.ok) {
      await prisma.centralAnnouncement.update({
        where: { id: item.id },
        data: { status: 'sent', sentAt: new Date(), error: null, attempts: { increment: 1 } },
      });
      console.log(`[CENTRAL-ANNOUNCE] 📢 Anunciado no grupo "${group.name || group.id}": ${page.title}`);
    } else {
      const body = await r.text().catch(() => '');
      await prisma.centralAnnouncement.update({
        where: { id: item.id },
        data: { attempts: { increment: 1 }, error: `Komunika ${r.status}: ${body.slice(0, 160)}` },
      });
      console.warn(`[CENTRAL-ANNOUNCE] envio falhou (${r.status}) — re-tenta no próximo tick`);
    }
  } catch (e: any) {
    await prisma.centralAnnouncement.update({
      where: { id: item.id },
      data: { attempts: { increment: 1 }, error: `throw: ${e?.message || 'desconhecido'}` },
    });
    console.warn('[CENTRAL-ANNOUNCE] envio lançou erro — re-tenta no próximo tick:', e?.message || e);
  }
}
