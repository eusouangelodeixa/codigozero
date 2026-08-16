import { PrismaClient } from '@prisma/client';
import { sendWhatsAppMessage } from '../lib/whatsapp';
import { env } from '../config/env';

/**
 * Post-purchase onboarding via WhatsApp.
 *
 * Two moving parts:
 *  1. WELCOME — sent once, the first time a paying member opens the platform
 *     (GET /api/auth/me stamps `firstAccessAt` and calls sendFirstAccessWelcome).
 *  2. NUDGES — a cron (processOnboardingNudges) reminds buyers who paid but
 *     haven't accessed yet to log in. Max 3 reminders, ~1/day, stopping the
 *     instant `firstAccessAt` is stamped (the authoritative "they accessed"
 *     signal). The same pass also retries any welcome that failed to send.
 *
 * All sends go through the shared `sendWhatsAppMessage` (Komunika admin instance,
 * retries, never throws). Existing users were backfilled as already-accessed by
 * the migration, so only genuinely-new buyers are ever messaged.
 */

const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

const firstName = (name?: string | null) => (name || 'membro').split(' ')[0];
const loginUrl = () => `${env.FRONTEND_URL || 'https://app.czero.sbs'}/login`;

/**
 * Send the one-time welcome WhatsApp on a member's first platform access.
 * Idempotent: no-ops when there's no phone or the welcome was already sent.
 * Stamps `welcomeSentAt` only on a successful send, so a failure (e.g. Komunika
 * blip) is retried later by the onboarding cron.
 */
export async function sendFirstAccessWelcome(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, phone: true, welcomeSentAt: true },
  });
  if (!user || !user.phone || user.welcomeSentAt) return;

  const content = [
    `Olá ${firstName(user.name)}! 🎉 Que bom te ver dentro do *Código Zero*!`,
    ``,
    `Vi que você fez o seu primeiro acesso. A partir de agora tens o Radar, o Disparador, os Scripts, as aulas e a comunidade na palma da mão.`,
    ``,
    `👉 Pra começar com o pé direito: abre o *Radar*, escolhe um nicho e uma cidade e faz a tua primeira busca de clientes.`,
    ``,
    `A próxima call ao vivo é no domingo. Qualquer dúvida, é só responder aqui. Bora! 🚀`,
  ].join('\n');

  const r = await sendWhatsAppMessage({ phone: user.phone, content });
  if (r.ok) {
    await prisma.user.update({ where: { id: userId }, data: { welcomeSentAt: new Date() } });
    console.log(`[ONBOARDING] 👋 Welcome sent to user=${userId}`);
  } else {
    console.warn(`[ONBOARDING] welcome send failed for user=${userId} (status=${r.status}) — will retry`);
  }
}

/**
 * Schedule the "save our contact" WhatsApp for 30–60 minutes after the access
 * credentials were delivered. Phones hide messages from unsaved numbers, so a
 * buyer who never saves us silently stops seeing support and announcements.
 *
 * Called from every path that hands a NEW buyer their credentials. Idempotent:
 * never re-arms once sent, and never overwrites a pending schedule.
 */
export async function scheduleSaveContactReminder(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { saveContactDueAt: true, saveContactSentAt: true },
  });
  if (!user || user.saveContactSentAt || user.saveContactDueAt) return;

  const delayMs = (30 + Math.random() * 30) * 60 * 1000; // 30–60 min
  await prisma.user.update({
    where: { id: userId },
    data: { saveContactDueAt: new Date(Date.now() + delayMs) },
  });
  console.log(`[ONBOARDING] 📇 Save-contact reminder scheduled for user=${userId} in ${Math.round(delayMs / 60000)}min`);
}

/** Copy do pedido para gravar o contacto. */
function saveContactMessage(name: string): string {
  return [
    `⚠️ ${firstName(name)}, recomendamos que você salve este contato como *Código Zero* ou *Czero*.`,
    ``,
    `Alguns celulares podem ocultar mensagens de números não salvos. Salvando este contato, você garante que receberá avisos importantes e terá nosso suporte sempre à mão.`,
  ].join('\n');
}

// Anti-ban do número compartilhado: no MÁXIMO um "guarde o contacto" por tick,
// espaçado 15–30 min do anterior, e teto diário. Com importações de turma em
// massa, mandar em rajada é o caminho curto para o bloqueio.
const SAVE_CONTACT_DAILY_CAP = 25;
const SAVE_CONTACT_MIN_GAP_MS = 15 * 60 * 1000;
const SAVE_CONTACT_MAX_GAP_MS = 30 * 60 * 1000;

/**
 * Cron entrypoint (roda a cada 5 min): envia NO MÁXIMO UM "guarde o contacto"
 * por vez. Só dispara se já passaram ≥15–30 min (aleatório) do último envio e
 * se o teto do dia não foi atingido. `saveContactSentAt` é carimbado só no
 * envio confirmado; falha deixa a linha vencida para a próxima tentativa.
 */
export async function processSaveContactReminders(): Promise<number> {
  const now = new Date();

  // Teto diário.
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const sentToday = await prisma.user.count({ where: { saveContactSentAt: { gte: startOfDay } } });
  if (sentToday >= SAVE_CONTACT_DAILY_CAP) return 0;

  // Intervalo desde o último envio (15–30 min, aleatório por tick).
  const last = await prisma.user.findFirst({
    where: { saveContactSentAt: { not: null } },
    orderBy: { saveContactSentAt: 'desc' },
    select: { saveContactSentAt: true },
  });
  const gap = SAVE_CONTACT_MIN_GAP_MS + Math.random() * (SAVE_CONTACT_MAX_GAP_MS - SAVE_CONTACT_MIN_GAP_MS);
  if (last?.saveContactSentAt && now.getTime() - last.saveContactSentAt.getTime() < gap) return 0;

  // Próximo vencido (um só).
  const u = await prisma.user.findFirst({
    where: { saveContactSentAt: null, saveContactDueAt: { not: null, lte: now }, phone: { not: '' } },
    orderBy: { saveContactDueAt: 'asc' },
    select: { id: true, name: true, phone: true, saveContactDueAt: true },
  });
  if (!u) return 0;

  // Claim atômico (empurra o dueAt) — evita envio duplo entre ticks/réplicas.
  const claim = await prisma.user.updateMany({
    where: { id: u.id, saveContactSentAt: null, saveContactDueAt: u.saveContactDueAt },
    data: { saveContactDueAt: new Date(now.getTime() + 5 * 60 * 1000) },
  });
  if (claim.count === 0) return 0;

  const r = await sendWhatsAppMessage({ phone: u.phone, content: saveContactMessage(u.name) });
  if (r.ok) {
    await prisma.user.update({ where: { id: u.id }, data: { saveContactSentAt: new Date() } });
    console.log(`[ONBOARDING] 📇 Save-contact reminder sent to ${u.phone} (${sentToday + 1}/${SAVE_CONTACT_DAILY_CAP} hoje)`);
    return 1;
  }
  console.warn(`[ONBOARDING] save-contact send failed for user=${u.id} (status=${r.status}) — will retry`);
  return 0;
}

/** Copy for each nudge tier (0 = first reminder … 2 = last). */
function nudgeMessage(name: string, tier: number): string {
  const link = loginUrl();
  if (tier <= 0) {
    return [
      `Olá ${firstName(name)}! 👋 Vi que garantiste o teu acesso ao *Código Zero* — parabéns pela decisão!`,
      ``,
      `Já conseguiste entrar na plataforma? Se ainda não, é só acessar com o e-mail da compra:`,
      `👉 ${link}`,
      ``,
      `Me conta: já entraste? Se tiveres qualquer dificuldade pra acessar, responde aqui que eu te ajudo.`,
    ].join('\n');
  }
  if (tier === 1) {
    return [
      `${firstName(name)}, ainda não te vi lá dentro 👀`,
      ``,
      `O Código Zero só trabalha por ti se tu entrares — o *Radar* acha os clientes sozinho. Entra e faz a primeira busca:`,
      `👉 ${link}`,
      ``,
      `Tás com algum problema pra acessar? Me fala que resolvo contigo.`,
    ].join('\n');
  }
  return [
    `${firstName(name)}, último toque por aqui 🙏`,
    ``,
    `Tu pagaste e o teu acesso ao *Código Zero* ainda está parado. Não deixa essa oportunidade na gaveta — dá o primeiro passo:`,
    `👉 ${link}`,
    ``,
    `Se for algo técnico que te impede de entrar, responde aqui que eu te desbloqueio.`,
  ].join('\n');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Cron entrypoint. (a) Retries pending welcomes (firstAccessAt set but welcome
 * not yet sent), then (b) sends the next reminder to recent buyers who still
 * haven't accessed. Returns how many messages were sent.
 */
export async function processOnboardingNudges(): Promise<number> {
  const now = new Date();
  const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  const twentyHoursAgo = new Date(now.getTime() - 20 * 60 * 60 * 1000);
  let sent = 0;

  // (a) Welcome retries — first access happened but the welcome never landed.
  const pendingWelcome = await prisma.user.findMany({
    where: {
      welcomeSentAt: null,
      firstAccessAt: { gt: fiveDaysAgo },
      phone: { not: '' },
    },
    select: { id: true },
    take: 50,
  });
  for (const u of pendingWelcome) {
    await sendFirstAccessWelcome(u.id);
    await sleep(8000 + Math.floor(Math.random() * 7000));
  }

  // (b) Nudges — paid members who bought recently and haven't accessed yet.
  const candidates = await prisma.user.findMany({
    where: {
      role: 'member',
      isActive: true,
      subscriptionStatus: 'active',
      firstAccessAt: null,
      onboardingNudgeCount: { lt: 3 },
      createdAt: { gt: fiveDaysAgo },
      phone: { not: '' },
      OR: [{ lastOnboardingNudgeAt: null }, { lastOnboardingNudgeAt: { lt: twentyHoursAgo } }],
    },
    select: { id: true, name: true, phone: true, onboardingNudgeCount: true },
    take: 50,
  });

  for (let i = 0; i < candidates.length; i++) {
    const u = candidates[i];
    const content = nudgeMessage(u.name, u.onboardingNudgeCount);
    const r = await sendWhatsAppMessage({ phone: u.phone, content });
    if (r.ok) {
      await prisma.user.update({
        where: { id: u.id },
        data: { onboardingNudgeCount: { increment: 1 }, lastOnboardingNudgeAt: now },
      });
      sent++;
      console.log(`[ONBOARDING] 🔔 Nudge ${u.onboardingNudgeCount + 1}/3 sent to ${u.phone}`);
    }
    // Long, randomized gap to avoid a robotic burst pattern (low volume anyway).
    if (i < candidates.length - 1) await sleep(15000 + Math.floor(Math.random() * 15000));
  }

  return sent;
}
