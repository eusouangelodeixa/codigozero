/**
 * Post-purchase feedback system (D+14 WhatsApp polls / D+21 suggestion ask).
 *
 * Flow: buyers are ENROLLED ~14 days after their first approved purchase
 * (Transaction.createdAt anchor). A low-rate cron tick then drives a per-user
 * state machine:
 *
 *   feedback  : scheduled → awaiting_consent → in_progress → completed
 *                         ↘ declined ("não" ao consentimento — encerra as duas)
 *                         ↘ paused (2 silent polls) → expired (48h)
 *                         ↘ awaiting_web (email fallback) → completed
 *                         ↘ skipped (refunded / ineligible at send time)
 *   suggestion: scheduled → awaiting_consent → awaiting_reply → completed | expired
 *                         ↘ declined | awaiting_web | skipped
 *
 * CONSENT (exigência de produto): no canal WhatsApp NADA é enviado sem um
 * "SIM" prévio — nem enquetes (D+14) nem o pedido de sugestão (D+21). "NÃO"
 * encerra educadamente (e o não do D+14 também cancela o D+21); 48h de
 * silêncio expiram a sessão sem insistência. O canal email/web dispensa
 * consentimento: abrir o link já é um ato voluntário.
 *
 * Channel rule: exactly ONE channel per user. WhatsApp (native polls) is
 * primary; when Komunika is unhealthy or the first send fails, we fall back
 * to an EMAILED link to the /pesquisa web form — and never send WhatsApp
 * afterwards (channel is only written after a successful send, then frozen).
 *
 * Anti-ban pacing ([[cron-whatsapp-send-safety]]): sessions of different
 * users start 30–60min apart (checked against the DB, restart-safe); inside
 * a session the next poll goes 1–2min after a vote, or 30–60min after
 * silence; 2 consecutive silent polls pause the session; sends happen only
 * 08:00–20:00 CAT (06:00–18:00 UTC); state advances ONLY on a confirmed send.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import {
  komunikaIsHealthy,
  normalizeMzPhone,
  sendWhatsAppMessage,
  sendWhatsAppPoll,
} from '../lib/whatsapp';
import { sendEmail } from '../lib/email';
import {
  CONSENT_DECLINED_ACK,
  FEEDBACK_CONSENT_MESSAGE,
  FEEDBACK_OPTIONS,
  FEEDBACK_QUESTIONS,
  SUGGESTION_ASK_MESSAGE,
  SUGGESTION_CONSENT_MESSAGE,
  SUGGESTION_THANKS_MESSAGE,
  parseConsentReply,
  scoreForOption,
} from '../lib/feedbackQuestions';
import { buildFeedbackLink, signFeedbackToken } from '../lib/feedbackToken';

const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

// Mirrors PAID_STATUSES in auth.routes.ts:48 (local there, not exported).
// 'canceled' is included on purpose: ex-customers may answer the web survey,
// and their feedback is the most valuable of all.
const PAID_STATUSES = ['active', 'grace_period', 'overdue', 'canceled'];

const DAY_MS = 24 * 60 * 60 * 1000;
const ENROLL_WINDOW_MS = 45 * DAY_MS; // launch backfill + steady-state cutoff
const FEEDBACK_DELAY_MS = 14 * DAY_MS; // D+14
const SUGGESTION_DELAY_MS = 7 * DAY_MS; // D+21 (feedbackDueAt + 7d)
const SUGGESTION_WINDOW_MS = 72 * 60 * 60 * 1000; // replies stored for 72h
const PAUSE_EXPIRE_MS = 48 * 60 * 60 * 1000; // paused → expired
const CONSENT_WINDOW_MS = 48 * 60 * 60 * 1000; // sem resposta ao consentimento → expira
const SESSION_TTL_MS = 7 * DAY_MS; // safety net for stuck in_progress rows
const ENROLL_BATCH = 100; // candidates examined per enroll tick
const ADVANCE_BATCH = 10; // in-progress sessions advanced per send tick

const randBetween = (minMs: number, maxMs: number) =>
  minMs + Math.floor(Math.random() * (maxMs - minMs));
/** Cross-user session gap + silent-poll wait: 30–60min. */
const randGapMs = () => randBetween(30 * 60 * 1000, 60 * 60 * 1000);
/** Voted → next poll: 1–2min. */
const randQuickMs = () => randBetween(60 * 1000, 2 * 60 * 1000);

/** Earliest approved transaction for this user = the purchase anchor.
 *  Transaction has no userId FK — match by email (primary) or phone. */
async function firstApprovedTransaction(user: { email: string; phone: string }) {
  const phones = Array.from(new Set([user.phone, normalizeMzPhone(user.phone)].filter(Boolean)));
  return prisma.transaction.findFirst({
    where: {
      status: 'approved',
      OR: [
        { userEmail: { equals: user.email, mode: 'insensitive' } },
        ...(phones.length ? [{ userPhone: { in: phones } }] : []),
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Enrollment (cron, every 30min — creates rows, never sends)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Enroll eligible buyers into the survey queue. Users whose anchor purchase
 * is OLDER than 45d (or who have no anchor at all) get a `skipped` row so
 * they are structurally excluded from future scans (userId is unique) —
 * they can still answer later via the /pesquisa request-link path, which
 * revives the row.
 */
export async function feedbackEnrollTick(): Promise<number> {
  const now = new Date();

  const candidates = await prisma.user.findMany({
    where: {
      role: 'member',
      grantedManually: false,
      subscriptionStatus: { in: PAID_STATUSES },
      feedbackSurvey: null,
    },
    select: { id: true, email: true, phone: true, subscriptionStart: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: ENROLL_BATCH,
  });
  if (candidates.length === 0) return 0;

  // Resolve every candidate's purchase anchor FIRST, then assign dueAts in
  // anchor order — the stagger cursor is monotonic, so mixing a new buyer
  // (base = D+14 in the future) before a backfill user (base = now) in the
  // same batch must not push the backfill user two weeks out.
  const resolved: {
    user: (typeof candidates)[number];
    anchorTxn: Awaited<ReturnType<typeof firstApprovedTransaction>>;
    anchorAt: Date;
  }[] = [];
  for (const user of candidates) {
    try {
      const anchorTxn = await firstApprovedTransaction(user);
      const anchorAt = anchorTxn?.createdAt ?? user.subscriptionStart ?? user.createdAt;
      resolved.push({ user, anchorTxn, anchorAt });
    } catch (e: any) {
      console.error(`[FEEDBACK] anchor lookup failed for user ${user.id}:`, e?.message || e);
    }
  }
  resolved.sort((a, b) => a.anchorAt.getTime() - b.anchorAt.getTime());

  // Stagger cursor: new dueAts are pre-spaced 30–60min after the latest
  // pending one, so the backfill drains one session at a time.
  const agg = await prisma.feedbackSurvey.aggregate({
    _max: { feedbackDueAt: true },
    where: { feedbackStatus: 'scheduled' },
  });
  let cursorMs = Math.max(agg._max.feedbackDueAt?.getTime() ?? 0, now.getTime());

  let enrolled = 0;
  for (const { user, anchorTxn, anchorAt } of resolved) {
    try {
      const outOfWindow = !anchorTxn || anchorAt.getTime() < now.getTime() - ENROLL_WINDOW_MS;

      if (outOfWindow) {
        await prisma.feedbackSurvey.create({
          data: {
            userId: user.id,
            anchorTxnId: anchorTxn?.id ?? null,
            anchorAt,
            feedbackStatus: 'skipped',
            suggestionStatus: 'skipped',
            feedbackDueAt: new Date(anchorAt.getTime() + FEEDBACK_DELAY_MS),
            suggestionDueAt: new Date(anchorAt.getTime() + FEEDBACK_DELAY_MS + SUGGESTION_DELAY_MS),
          },
        });
        continue;
      }

      const baseMs = Math.max(anchorAt.getTime() + FEEDBACK_DELAY_MS, now.getTime());
      const dueMs = Math.max(baseMs, cursorMs + randGapMs());
      cursorMs = dueMs;

      await prisma.feedbackSurvey.create({
        data: {
          userId: user.id,
          anchorTxnId: anchorTxn!.id,
          anchorAt,
          feedbackDueAt: new Date(dueMs),
          suggestionDueAt: new Date(dueMs + SUGGESTION_DELAY_MS),
        },
      });
      enrolled++;
    } catch (e: any) {
      if (e?.code === 'P2002') continue; // raced with another enroll — already exists
      console.error(`[FEEDBACK] enroll failed for user ${user.id}:`, e?.message || e);
    }
  }
  if (enrolled > 0) console.log(`[FEEDBACK] 📋 Enrolled ${enrolled} buyer(s) into the survey queue`);
  return enrolled;
}

// ─────────────────────────────────────────────────────────────────────────
// Send tick (cron, every 2min — the state-machine driver)
// ─────────────────────────────────────────────────────────────────────────

export async function feedbackSendTick(): Promise<void> {
  const now = new Date();

  const cfg = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
  if (cfg?.feedbackEnabled === false) return; // kill switch (/admin/config)

  // Daytime CAT only: 08:00–20:00 CAT = 06:00–18:00 UTC (server is UTC).
  const hourUtc = now.getUTCHours();
  if (hourUtc < 6 || hourUtc >= 18) return;

  await expireStaleSessions(now);
  await advanceInProgressSessions(now);
  await maybeStartNextSession(now);
}

async function expireStaleSessions(now: Date): Promise<void> {
  // Paused 48h with no vote → expired. If the user never answered ANYTHING,
  // also skip the D+21 ask — insisting on a silent number is a ban signal.
  const stale = await prisma.feedbackSurvey.findMany({
    where: { feedbackStatus: 'paused', pausedAt: { lt: new Date(now.getTime() - PAUSE_EXPIRE_MS) } },
    include: { responses: { where: { answeredAt: { not: null } }, select: { id: true } } },
  });
  for (const s of stale) {
    const skipSuggestion = s.responses.length === 0 && s.suggestionStatus === 'scheduled';
    await prisma.feedbackSurvey.update({
      where: { id: s.id },
      data: {
        feedbackStatus: 'expired',
        nextActionAt: null,
        ...(skipSuggestion ? { suggestionStatus: 'skipped' } : {}),
      },
    });
    console.log(`[FEEDBACK] ⌛ Survey ${s.id} expired (paused 48h)${skipSuggestion ? ' — suggestion skipped' : ''}`);
  }

  // Suggestion reply window closed → expired (stored suggestions remain).
  await prisma.feedbackSurvey.updateMany({
    where: { suggestionStatus: 'awaiting_reply', suggestionWindowEndsAt: { lt: now } },
    data: { suggestionStatus: 'expired' },
  });

  // Consentimento ignorado por 48h → expira sem insistir. Se foi o
  // consentimento do D+14, o D+21 também é cancelado (número sem resposta =
  // não insistir, anti-ban). A ORDEM importa: o skip da sugestão precisa
  // rodar antes de o status do feedback mudar para expired.
  await prisma.feedbackSurvey.updateMany({
    where: {
      feedbackStatus: 'awaiting_consent',
      nextActionAt: { lt: now },
      suggestionStatus: 'scheduled',
    },
    data: { suggestionStatus: 'skipped' },
  });
  await prisma.feedbackSurvey.updateMany({
    where: { feedbackStatus: 'awaiting_consent', nextActionAt: { lt: now } },
    data: { feedbackStatus: 'expired', nextActionAt: null },
  });
  await prisma.feedbackSurvey.updateMany({
    where: { suggestionStatus: 'awaiting_consent', suggestionWindowEndsAt: { lt: now } },
    data: { suggestionStatus: 'expired' },
  });

  // Safety TTL: an in_progress session stuck for 7 days (shouldn't happen).
  await prisma.feedbackSurvey.updateMany({
    where: {
      feedbackStatus: 'in_progress',
      feedbackStartedAt: { lt: new Date(now.getTime() - SESSION_TTL_MS) },
    },
    data: { feedbackStatus: 'expired', nextActionAt: null },
  });
}

async function advanceInProgressSessions(now: Date): Promise<void> {
  const sessions = await prisma.feedbackSurvey.findMany({
    where: { feedbackStatus: 'in_progress', nextActionAt: { lte: now } },
    include: {
      responses: { orderBy: { sentAt: 'asc' } },
      user: { select: { name: true, phone: true } },
    },
    take: ADVANCE_BATCH,
  });

  for (const s of sessions) {
    try {
      // Was the most recently sent poll answered?
      const lastSent = s.responses.filter((r) => r.channel === 'whatsapp').pop();
      const lastAnswered = !lastSent || lastSent.answeredAt != null;

      let streak = s.unansweredStreak;
      if (!lastAnswered) {
        streak += 1;
        if (streak >= 2) {
          await prisma.feedbackSurvey.update({
            where: { id: s.id },
            data: { feedbackStatus: 'paused', pausedAt: now, unansweredStreak: streak, nextActionAt: null },
          });
          console.log(`[FEEDBACK] ⏸️ Survey ${s.id} paused (2 silent polls)`);
          continue;
        }
      }

      // All polls already sent → nothing to send; keep watching for votes
      // (completion happens in ingestPollVote; 48h/TTL rules close the rest).
      if (s.currentQuestion >= FEEDBACK_QUESTIONS.length) {
        await prisma.feedbackSurvey.update({
          where: { id: s.id },
          data: { unansweredStreak: streak, nextActionAt: new Date(now.getTime() + randGapMs()) },
        });
        continue;
      }

      const question = FEEDBACK_QUESTIONS[s.currentQuestion];
      const r = await sendWhatsAppPoll({
        phone: s.user.phone,
        question: question.text,
        options: [...FEEDBACK_OPTIONS],
      });

      if (!r.ok) {
        // Never advance on failure — defer 30min and retry.
        await prisma.feedbackSurvey.update({
          where: { id: s.id },
          data: { nextActionAt: new Date(now.getTime() + 30 * 60 * 1000) },
        });
        console.warn(`[FEEDBACK] ⚠️ Poll send failed for survey ${s.id} (${r.status}) — deferred 30min`);
        continue;
      }

      await prisma.$transaction([
        prisma.feedbackResponse.create({
          data: {
            surveyId: s.id,
            questionKey: question.key,
            channel: 'whatsapp',
            whatsappMessageId: r.messageId,
            sentAt: now,
          },
        }),
        prisma.feedbackSurvey.update({
          where: { id: s.id },
          data: {
            currentQuestion: s.currentQuestion + 1,
            unansweredStreak: streak,
            nextActionAt: new Date(now.getTime() + randGapMs()),
          },
        }),
      ]);
      console.log(`[FEEDBACK] 📊 Poll ${s.currentQuestion + 1}/${FEEDBACK_QUESTIONS.length} (${question.key}) sent — survey ${s.id}`);
    } catch (e: any) {
      console.error(`[FEEDBACK] advance failed for survey ${s.id}:`, e?.message || e);
    }
  }
}

/**
 * Start at most ONE new session per tick (feedback D+14 or suggestion D+21),
 * and only when the last session start across ALL users is 30–60min old —
 * checked against the DB so restarts can't burst.
 */
async function maybeStartNextSession(now: Date): Promise<void> {
  const agg = await prisma.feedbackSurvey.aggregate({
    _max: { feedbackStartedAt: true, suggestionSentAt: true, emailSentAt: true },
  });
  const lastStartMs = Math.max(
    agg._max.feedbackStartedAt?.getTime() ?? 0,
    agg._max.suggestionSentAt?.getTime() ?? 0,
    agg._max.emailSentAt?.getTime() ?? 0,
  );
  if (now.getTime() - lastStartMs < randGapMs()) return;

  const [feedbackDue, suggestionDue] = await Promise.all([
    prisma.feedbackSurvey.findFirst({
      where: { feedbackStatus: 'scheduled', feedbackDueAt: { lte: now } },
      orderBy: { feedbackDueAt: 'asc' },
      include: { user: true },
    }),
    prisma.feedbackSurvey.findFirst({
      where: { suggestionStatus: 'scheduled', suggestionDueAt: { lte: now }, channel: 'whatsapp' },
      orderBy: { suggestionDueAt: 'asc' },
      include: { user: true },
    }),
  ]);

  // Oldest due first.
  const pickSuggestion =
    suggestionDue &&
    (!feedbackDue || suggestionDue.suggestionDueAt.getTime() <= feedbackDue.feedbackDueAt.getTime());

  if (pickSuggestion && suggestionDue) return startSuggestionSession(suggestionDue, now);
  if (feedbackDue) return startFeedbackSession(feedbackDue, now);
}

type SurveyWithUser = Prisma.FeedbackSurveyGetPayload<{ include: { user: true } }>;

/** Re-check eligibility at SEND time (refund may have landed since enroll). */
async function stillEligible(s: SurveyWithUser): Promise<boolean> {
  if (!s.user) return false;
  if (s.user.role !== 'member' || s.user.grantedManually) return false;
  if (!PAID_STATUSES.includes(s.user.subscriptionStatus)) return false; // e.g. flipped to 'lead' on refund
  if (s.anchorTxnId) {
    const txn = await prisma.transaction.findUnique({ where: { id: s.anchorTxnId } });
    if (txn && txn.status !== 'approved') return false; // refunded anchor
  }
  return true;
}

async function markSkipped(surveyId: string): Promise<void> {
  await prisma.feedbackSurvey.update({
    where: { id: surveyId },
    data: { feedbackStatus: 'skipped', suggestionStatus: 'skipped', nextActionAt: null },
  });
  console.log(`[FEEDBACK] ⏭️ Survey ${surveyId} skipped (no longer eligible)`);
}

async function startFeedbackSession(s: SurveyWithUser, now: Date): Promise<void> {
  if (!(await stillEligible(s))) return markSkipped(s.id);

  // Channel decision happens HERE, on the first send of the pair. WhatsApp is
  // primary; email fallback only when Komunika is down or the send fails.
  // No canal WhatsApp, a sessão abre com um PEDIDO DE CONSENTIMENTO — as
  // enquetes só começam depois do "SIM" (ingestInboundText); nextActionAt
  // guarda o prazo de 48h do consentimento enquanto o status é
  // awaiting_consent.
  const healthy = await komunikaIsHealthy();
  if (healthy) {
    const firstName = (s.user.name || '').split(' ')[0] || '';
    const r = await sendWhatsAppMessage({
      phone: s.user.phone,
      content: FEEDBACK_CONSENT_MESSAGE(firstName),
    });
    if (r.ok) {
      await prisma.feedbackSurvey.update({
        where: { id: s.id },
        data: {
          channel: 'whatsapp',
          feedbackStatus: 'awaiting_consent',
          feedbackStartedAt: now,
          unansweredStreak: 0,
          nextActionAt: new Date(now.getTime() + CONSENT_WINDOW_MS),
        },
      });
      console.log(`[FEEDBACK] 🤝 Consent ask sent — survey ${s.id} (${s.user.email})`);
      return;
    }
    console.warn(`[FEEDBACK] ⚠️ Consent send failed (${r.status}) — falling back to email for survey ${s.id}`);
  } else {
    console.warn(`[FEEDBACK] ⚠️ Komunika unhealthy — email fallback for survey ${s.id}`);
  }

  // Email fallback: web link covers BOTH sessions.
  const sent = await sendFeedbackLinkEmail({
    name: s.user.name,
    email: s.user.email,
    surveyUrl: buildFeedbackLink(s.id),
  });
  if (sent.ok) {
    await prisma.feedbackSurvey.update({
      where: { id: s.id },
      data: {
        channel: 'email',
        feedbackStatus: 'awaiting_web',
        suggestionStatus: 'awaiting_web',
        emailSentAt: now,
      },
    });
    console.log(`[FEEDBACK] ✉️ Web-survey link emailed — survey ${s.id} (${s.user.email})`);
    return;
  }

  // Both channels failed — stay scheduled, retry in 30min.
  await prisma.feedbackSurvey.update({
    where: { id: s.id },
    data: { feedbackDueAt: new Date(now.getTime() + 30 * 60 * 1000) },
  });
  console.error(`[FEEDBACK] 🚨 Both channels failed for survey ${s.id} — deferred 30min`);
}

async function startSuggestionSession(s: SurveyWithUser, now: Date): Promise<void> {
  if (!(await stillEligible(s))) return markSkipped(s.id);

  // Consentimento primeiro — o pedido de sugestão real só sai depois do "SIM"
  // (ingestInboundText). Enquanto awaiting_consent, suggestionWindowEndsAt
  // guarda o prazo de 48h do consentimento (é re-armado para 72h quando o
  // pedido real for enviado).
  const firstName = (s.user.name || '').split(' ')[0] || '';
  const r = await sendWhatsAppMessage({
    phone: s.user.phone,
    content: SUGGESTION_CONSENT_MESSAGE(firstName),
  });
  if (r.ok) {
    await prisma.feedbackSurvey.update({
      where: { id: s.id },
      data: {
        suggestionStatus: 'awaiting_consent',
        // suggestionSentAt marca ESTE envio para o pacing global (30–60min
        // entre usuários); é re-estampado quando o pedido real sair.
        suggestionSentAt: now,
        suggestionWindowEndsAt: new Date(now.getTime() + CONSENT_WINDOW_MS),
      },
    });
    console.log(`[FEEDBACK] 🤝 Suggestion consent ask sent — survey ${s.id} (${s.user.email})`);
    return;
  }
  // Channel is locked to WhatsApp — keep retrying it, never email.
  await prisma.feedbackSurvey.update({
    where: { id: s.id },
    data: { suggestionDueAt: new Date(now.getTime() + 30 * 60 * 1000) },
  });
  console.warn(`[FEEDBACK] ⚠️ Suggestion consent failed (${r.status}) for survey ${s.id} — deferred 30min`);
}

// ─────────────────────────────────────────────────────────────────────────
// Inbound ingestion (called by the Komunika webhook route)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Record a poll vote. Correlation is purely by poll message id — a miss means
 * a vote on some unrelated poll of the shared instance (ignored). Idempotent:
 * duplicate deliveries land on the same row; a vote CHANGE overwrites it.
 */
export async function ingestPollVote(input: {
  phone?: string;
  pollMessageId?: string | null;
  selectedOptions?: (string | null | undefined)[];
}): Promise<void> {
  const pollMessageId = input.pollMessageId || null;
  if (!pollMessageId) return;

  const resp = await prisma.feedbackResponse.findUnique({
    where: { whatsappMessageId: pollMessageId },
    include: { survey: true },
  });
  if (!resp) return; // not one of our polls

  const optionText = (input.selectedOptions || [])
    .map((o) => (o || '').toString())
    .find((o) => scoreForOption(o) != null);
  if (!optionText) return; // vote retraction or unknown option — nothing to record
  const score = scoreForOption(optionText)!;

  const now = new Date();
  await prisma.feedbackResponse.update({
    where: { id: resp.id },
    data: { optionText, score, answeredAt: resp.answeredAt ?? now },
  });
  console.log(`[FEEDBACK] ✅ Vote: ${resp.questionKey}=${score} — survey ${resp.surveyId}`);

  const answered = await prisma.feedbackResponse.count({
    where: { surveyId: resp.surveyId, answeredAt: { not: null } },
  });

  if (answered >= FEEDBACK_QUESTIONS.length) {
    // Late votes UPGRADE paused/expired sessions to completed — strictly
    // better data, and the session is over either way.
    await prisma.feedbackSurvey.update({
      where: { id: resp.surveyId },
      data: {
        feedbackStatus: 'completed',
        feedbackCompletedAt: resp.survey.feedbackCompletedAt ?? now,
        unansweredStreak: 0,
        pausedAt: null,
        nextActionAt: null,
      },
    });
    console.log(`[FEEDBACK] 🏁 Survey ${resp.surveyId} feedback completed`);
    return;
  }

  if (['in_progress', 'paused'].includes(resp.survey.feedbackStatus)) {
    // Voted → resume and send the next poll quickly (1–2min).
    await prisma.feedbackSurvey.update({
      where: { id: resp.surveyId },
      data: {
        feedbackStatus: 'in_progress',
        unansweredStreak: 0,
        pausedAt: null,
        nextActionAt: new Date(now.getTime() + randQuickMs()),
      },
    });
  }
}

/**
 * Route an inbound WhatsApp text: (1) consent replies for the D+14 polls,
 * (2) consent replies for the D+21 suggestion ask, (3) suggestion capture
 * while the reply window is open (72h). Everything else on the shared
 * instance (support chats, SDR replies…) is none of our business here.
 */
export async function ingestInboundText(input: {
  phone?: string;
  content?: string;
  whatsappMessageId?: string | null;
}): Promise<void> {
  const content = (input.content || '').trim();
  if (!content || !input.phone) return;

  const phones = Array.from(new Set([input.phone, normalizeMzPhone(input.phone)].filter(Boolean)));
  const user = await prisma.user.findFirst({
    where: { phone: { in: phones } },
    select: { id: true, phone: true, name: true },
  });
  if (!user) return;

  const survey = await prisma.feedbackSurvey.findUnique({ where: { userId: user.id } });
  if (!survey) return;
  const now = new Date();

  // ── Consentimento das enquetes (D+14) ──────────────────────────────────
  // Retorna SEMPRE dentro deste bloco: texto ambíguo durante o consentimento
  // não pode virar sugestão nem destravar nada.
  if (survey.feedbackStatus === 'awaiting_consent') {
    const consent = parseConsentReply(content);
    if (consent === 'yes') {
      await prisma.feedbackSurvey.update({
        where: { id: survey.id },
        data: {
          feedbackStatus: 'in_progress',
          unansweredStreak: 0,
          nextActionAt: new Date(now.getTime() + randQuickMs()),
        },
      });
      console.log(`[FEEDBACK] ✅ Consent YES — polls starting for survey ${survey.id}`);
    } else if (consent === 'no') {
      // O não do D+14 também cancela o pedido de sugestão do D+21.
      await prisma.feedbackSurvey.update({
        where: { id: survey.id },
        data: {
          feedbackStatus: 'declined',
          nextActionAt: null,
          ...(survey.suggestionStatus === 'scheduled' ? { suggestionStatus: 'skipped' } : {}),
        },
      });
      await sendWhatsAppMessage({ phone: user.phone, content: CONSENT_DECLINED_ACK });
      console.log(`[FEEDBACK] 🚫 Consent NO — survey ${survey.id} declined`);
    }
    return;
  }

  // ── Consentimento do pedido de sugestão (D+21) ─────────────────────────
  if (survey.suggestionStatus === 'awaiting_consent') {
    const consent = parseConsentReply(content);
    if (consent === 'yes') {
      const firstName = (user.name || '').split(' ')[0] || '';
      const r = await sendWhatsAppMessage({
        phone: user.phone,
        content: SUGGESTION_ASK_MESSAGE(firstName),
      });
      if (r.ok) {
        await prisma.feedbackSurvey.update({
          where: { id: survey.id },
          data: {
            suggestionStatus: 'awaiting_reply',
            suggestionSentAt: now,
            suggestionWindowEndsAt: new Date(now.getTime() + SUGGESTION_WINDOW_MS),
          },
        });
        console.log(`[FEEDBACK] ✅ Suggestion consent YES — ask sent for survey ${survey.id}`);
      } else {
        // Falha rara de envio logo após o SIM: volta para a fila e o tick
        // re-pede em 30min (melhor um novo pedido do que um SIM no vácuo).
        await prisma.feedbackSurvey.update({
          where: { id: survey.id },
          data: {
            suggestionStatus: 'scheduled',
            suggestionDueAt: new Date(now.getTime() + 30 * 60 * 1000),
            suggestionWindowEndsAt: null,
          },
        });
      }
    } else if (consent === 'no') {
      await prisma.feedbackSurvey.update({
        where: { id: survey.id },
        data: { suggestionStatus: 'declined' },
      });
      await sendWhatsAppMessage({ phone: user.phone, content: CONSENT_DECLINED_ACK });
      console.log(`[FEEDBACK] 🚫 Suggestion consent NO — survey ${survey.id}`);
    }
    return;
  }

  // ── Captura de sugestão (janela de 72h após o pedido real) ─────────────
  if (!survey.suggestionSentAt || !survey.suggestionWindowEndsAt || now > survey.suggestionWindowEndsAt) {
    return;
  }

  try {
    await prisma.feedbackSuggestion.create({
      data: {
        surveyId: survey.id,
        channel: 'whatsapp',
        content: content.slice(0, 4000),
        whatsappMessageId: input.whatsappMessageId || null,
      },
    });
  } catch (e: any) {
    if (e?.code === 'P2002') return; // duplicate webhook delivery
    throw e;
  }
  console.log(`[FEEDBACK] 💡 Suggestion stored — survey ${survey.id}`);

  // Thank exactly once. updateMany-with-guard wins any race between two
  // near-simultaneous replies; the stamp lands BEFORE the send on purpose
  // (a lost thank-you beats a double one).
  const won = await prisma.feedbackSurvey.updateMany({
    where: { id: survey.id, thankYouSentAt: null },
    data: { thankYouSentAt: now, suggestionStatus: 'completed' },
  });
  if (won.count > 0) {
    await sendWhatsAppMessage({ phone: user.phone, content: SUGGESTION_THANKS_MESSAGE });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Web survey (public /api/feedback routes)
// ─────────────────────────────────────────────────────────────────────────

export type WebSubmitResult =
  | { ok: true }
  | { ok: false; code: 'not-found' | 'already-completed' | 'invalid-answers' };

/**
 * Full web submission: all 4 scale answers (+ optional suggestion) in one
 * shot. Completes BOTH sessions. First-answer-wins against WhatsApp votes
 * that already landed (partial sessions keep their voted rows).
 */
export async function submitWebSurvey(input: {
  surveyId: string;
  answers: Record<string, number>;
  suggestion?: string;
}): Promise<WebSubmitResult> {
  const survey = await prisma.feedbackSurvey.findUnique({
    where: { id: input.surveyId },
    include: { responses: true },
  });
  if (!survey) return { ok: false, code: 'not-found' };
  if (survey.feedbackStatus === 'completed') return { ok: false, code: 'already-completed' };

  for (const q of FEEDBACK_QUESTIONS) {
    const score = input.answers[q.key];
    if (!Number.isInteger(score) || score < 1 || score > FEEDBACK_OPTIONS.length) {
      return { ok: false, code: 'invalid-answers' };
    }
  }

  const now = new Date();
  const ops = [];
  for (const q of FEEDBACK_QUESTIONS) {
    const existing = survey.responses.find((r) => r.questionKey === q.key);
    if (existing?.answeredAt) continue; // WhatsApp vote already there — keep it
    const score = input.answers[q.key];
    const optionText = FEEDBACK_OPTIONS[score - 1];
    if (existing) {
      ops.push(
        prisma.feedbackResponse.update({
          where: { id: existing.id },
          data: { score, optionText, channel: 'web', answeredAt: now },
        }),
      );
    } else {
      ops.push(
        prisma.feedbackResponse.create({
          data: {
            surveyId: survey.id,
            questionKey: q.key,
            channel: 'web',
            score,
            optionText,
            sentAt: now,
            answeredAt: now,
          },
        }),
      );
    }
  }

  const suggestion = (input.suggestion || '').trim();
  if (suggestion) {
    ops.push(
      prisma.feedbackSuggestion.create({
        data: { surveyId: survey.id, channel: 'web', content: suggestion.slice(0, 4000) },
      }),
    );
  }

  ops.push(
    prisma.feedbackSurvey.update({
      where: { id: survey.id },
      data: {
        feedbackStatus: 'completed',
        feedbackCompletedAt: now,
        suggestionStatus: 'completed',
        nextActionAt: null,
        pausedAt: null,
        unansweredStreak: 0,
      },
    }),
  );

  await prisma.$transaction(ops);
  console.log(`[FEEDBACK] 🏁 Web submission completed survey ${survey.id}`);
  return { ok: true };
}

/** Shape consumed by the /pesquisa page. */
export async function getWebSurveyState(surveyId: string) {
  const survey = await prisma.feedbackSurvey.findUnique({
    where: { id: surveyId },
    include: {
      responses: { where: { answeredAt: { not: null } } },
      user: { select: { name: true } },
    },
  });
  if (!survey) return null;
  const answered: Record<string, number> = {};
  for (const r of survey.responses) if (r.score != null) answered[r.questionKey] = r.score;
  return {
    firstName: (survey.user.name || '').split(' ')[0] || '',
    questions: FEEDBACK_QUESTIONS.map(({ key, text }) => ({ key, text })),
    options: [...FEEDBACK_OPTIONS],
    answered,
    completed: survey.feedbackStatus === 'completed',
  };
}

export type OpenByEmailResult =
  | { ok: true; token: string }
  | { ok: false; code: 'not-customer' | 'already-completed' };

/**
 * Web gate of /pesquisa: the visitor types their account e-mail; if it belongs
 * to a current-or-former customer (someone who actually paid at least once),
 * the survey opens RIGHT THERE — no e-mail round trip. Deliberately confirms
 * customer status on screen (product decision); the route rate-limits to blunt
 * enumeration abuse.
 */
export async function openSurveyByEmail(email: string): Promise<OpenByEmailResult> {
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });
  if (!user || user.role !== 'member' || user.grantedManually) {
    return { ok: false, code: 'not-customer' };
  }
  if (!PAID_STATUSES.includes(user.subscriptionStatus)) {
    return { ok: false, code: 'not-customer' }; // leads never qualify
  }
  const anchorTxn = await firstApprovedTransaction(user);
  if (!anchorTxn) return { ok: false, code: 'not-customer' }; // never actually paid

  let survey = await prisma.feedbackSurvey.findUnique({ where: { userId: user.id } });
  if (survey?.feedbackStatus === 'completed') return { ok: false, code: 'already-completed' };

  if (!survey) {
    // Outside the 45d backfill (or not yet enrolled): create on demand as a
    // web-only survey. emailSentAt doubles as the "web link issued" stamp so
    // the admin funnel counts it as reached.
    const now = new Date();
    survey = await prisma.feedbackSurvey.create({
      data: {
        userId: user.id,
        anchorTxnId: anchorTxn.id,
        anchorAt: anchorTxn.createdAt,
        channel: 'web',
        feedbackStatus: 'awaiting_web',
        suggestionStatus: 'awaiting_web',
        feedbackDueAt: now,
        suggestionDueAt: now,
        emailSentAt: now,
      },
    });
  }
  // An existing scheduled/in-progress WhatsApp survey is left untouched — just
  // viewing the web form must not flip the channel. A web SUBMISSION completes
  // both sessions and halts the polls.

  return { ok: true, token: signFeedbackToken(survey.id) };
}

// ─────────────────────────────────────────────────────────────────────────
// Admin ops helpers (superadmin — E2E testing / support)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Create-or-RESET a user's survey with near-term due dates, bypassing the
 * 45d window and the stagger. Deletes previous responses/suggestions —
 * this is a test/ops tool, not a user-facing path.
 */
export async function forceEnroll(input: {
  userId: string;
  feedbackDueInMinutes?: number;
  suggestionDueInMinutes?: number;
}): Promise<{ surveyId: string }> {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new Error('Usuário não encontrado');

  const anchorTxn = await firstApprovedTransaction(user);
  const now = new Date();
  const feedbackDueAt = new Date(now.getTime() + (input.feedbackDueInMinutes ?? 1) * 60 * 1000);
  const suggestionDueAt = new Date(
    now.getTime() + (input.suggestionDueInMinutes ?? 24 * 60) * 60 * 1000,
  );

  const data = {
    anchorTxnId: anchorTxn?.id ?? null,
    anchorAt: anchorTxn?.createdAt ?? user.subscriptionStart ?? user.createdAt,
    channel: null as string | null,
    feedbackStatus: 'scheduled',
    feedbackDueAt,
    feedbackStartedAt: null,
    feedbackCompletedAt: null,
    currentQuestion: 0,
    unansweredStreak: 0,
    nextActionAt: null,
    pausedAt: null,
    suggestionStatus: 'scheduled',
    suggestionDueAt,
    suggestionSentAt: null,
    suggestionWindowEndsAt: null,
    thankYouSentAt: null,
    emailSentAt: null,
  };

  const survey = await prisma.feedbackSurvey.upsert({
    where: { userId: input.userId },
    create: { userId: input.userId, ...data },
    update: data,
  });
  await prisma.feedbackResponse.deleteMany({ where: { surveyId: survey.id } });
  await prisma.feedbackSuggestion.deleteMany({ where: { surveyId: survey.id } });
  console.log(`[FEEDBACK] 🧪 Force-enrolled user ${input.userId} (survey ${survey.id})`);
  return { surveyId: survey.id };
}

/** Mint a fresh web link for a user (creates the survey if needed). */
export async function adminResendLink(userId: string): Promise<{ url: string; emailed: boolean }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('Usuário não encontrado');

  let survey = await prisma.feedbackSurvey.findUnique({ where: { userId } });
  if (!survey) {
    const anchorTxn = await firstApprovedTransaction(user);
    const now = new Date();
    survey = await prisma.feedbackSurvey.create({
      data: {
        userId,
        anchorTxnId: anchorTxn?.id ?? null,
        anchorAt: anchorTxn?.createdAt ?? user.subscriptionStart ?? user.createdAt,
        channel: 'email',
        feedbackStatus: 'awaiting_web',
        suggestionStatus: 'awaiting_web',
        feedbackDueAt: now,
        suggestionDueAt: now,
      },
    });
  }

  const url = buildFeedbackLink(survey.id);
  const sent = await sendFeedbackLinkEmail({ name: user.name, email: user.email, surveyUrl: url });
  if (sent.ok) {
    await prisma.feedbackSurvey.update({
      where: { id: survey.id },
      data: { emailSentAt: new Date() },
    });
  }
  return { url, emailed: sent.ok };
}

// ─────────────────────────────────────────────────────────────────────────
// E-mail template (same branded dark HTML as payment.service.ts)
// ─────────────────────────────────────────────────────────────────────────

function feedbackLinkEmailHtml(opts: { name: string; surveyUrl: string }): string {
  const first = (opts.name || '').split(' ')[0] || 'membro';
  return `<!doctype html>
<html lang="pt"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
</head>
<body style="margin:0;padding:0;background:#001412;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#001412;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#06130f;border:1px solid #14352f;border-radius:18px;overflow:hidden;">
        <tr><td style="padding:26px 30px 22px;text-align:center;border-bottom:1px solid #11231e;">
          <img src="https://app.czero.sbs/logo-mark.png" alt="Código Zero" width="46" height="46" style="display:inline-block;width:46px;height:46px;border-radius:13px;vertical-align:middle;border:0;" />
          <span style="display:inline-block;vertical-align:middle;margin-left:12px;font-size:19px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">Código Zero</span>
        </td></tr>
        <tr><td style="padding:30px 30px 6px;">
          <h1 style="margin:0 0 8px;font-size:23px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">Sua opinião vale muito</h1>
          <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#A1A1AA;">Olá, ${first}! Você já tem um tempo de <strong style="color:#ffffff;">Código Zero</strong> e queremos saber como está sendo a experiência. São 4 perguntas rápidas + espaço pra sugestões — leva menos de 2 minutos:</p>
          <a href="${opts.surveyUrl}" style="display:block;margin:8px 0 14px;background:#2DD4BF;color:#001412;text-decoration:none;text-align:center;font-weight:700;font-size:16px;padding:15px;border-radius:11px;">Responder a pesquisa &rarr;</a>
          <p style="margin:14px 0 6px;font-size:12px;color:#7b8a85;line-height:1.6;">Ou copie e cole este link no navegador:</p>
          <div style="background:#0c1c17;border:1px solid #213029;border-radius:10px;padding:12px 14px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;color:#cdd6d3;word-break:break-all;">${opts.surveyUrl}</div>
          <p style="margin:18px 0 4px;font-size:13px;line-height:1.6;color:#7b8a85;">Este link expira em <strong style="color:#cdd6d3;">7 dias</strong>. Sua resposta vai direto pra equipe do Código Zero.</p>
        </td></tr>
        <tr><td style="padding:24px 30px 28px;text-align:center;border-top:1px solid #11231e;">
          <img src="https://app.czero.sbs/logo-mark.png" alt="Código Zero" width="40" height="40" style="display:inline-block;width:40px;height:40px;border-radius:12px;border:0;" />
          <p style="margin:14px 0 8px;font-size:13px;line-height:1.5;color:#8a9994;">O ecossistema pra criar micronegócios de IA.<br>Sem código, sem barreiras.</p>
          <p style="margin:0;font-size:12px;color:#52605c;line-height:1.5;">Você recebeu este e-mail porque é (ou foi) assinante do Código Zero.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendFeedbackLinkEmail(opts: { name: string; email: string; surveyUrl: string }) {
  const html = feedbackLinkEmailHtml({ name: opts.name, surveyUrl: opts.surveyUrl });
  const text = [
    'Sua opinião vale muito — Código Zero',
    '',
    'Queremos saber como está sendo sua experiência. São 4 perguntas rápidas',
    '+ espaço pra sugestões — leva menos de 2 minutos:',
    '',
    opts.surveyUrl,
    '',
    'O link expira em 7 dias.',
  ].join('\n');
  return sendEmail({
    to: opts.email,
    subject: 'Sua opinião vale muito — Código Zero 💬',
    html,
    text,
  });
}
