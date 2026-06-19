import { Router, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { subscriptionMiddleware } from '../middlewares/subscription.middleware';
import { sendPushToUser, sendPushToUsers } from './auth.routes';

const router = Router();
const prisma = new PrismaClient();

// All chat routes require auth + active subscription
router.use(authMiddleware);
router.use(subscriptionMiddleware);

const SENDER_SELECT = {
  id: true, name: true, role: true, avatarUrl: true,
};

// Everything we return for a message: sender, the quoted reply (id+content+type
// +sender name), reactions, @mentions (with names), the pinner, and the poll
// (options + raw votes — folded into counts by `serialize`).
const MESSAGE_INCLUDE = {
  sender: { select: SENDER_SELECT },
  replyTo: { select: { id: true, content: true, type: true, sender: { select: { id: true, name: true } } } },
  reactions: { select: { emoji: true, userId: true } },
  mentions: { select: { userId: true, user: { select: { id: true, name: true } } } },
  pinnedBy: { select: { id: true, name: true } },
  poll: {
    include: {
      options: { orderBy: { order: 'asc' }, select: { id: true, text: true, order: true } },
      votes: { select: { optionId: true, userId: true } },
    },
  },
} satisfies Prisma.ChatMessageInclude;

type FullMessage = Prisma.ChatMessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

// Both 'admin' and 'superadmin' act as the support agent / moderator.
const isAdminRole = (role?: string) => role === 'admin' || role === 'superadmin';

// Pin durations the UI offers, mapped to hours.
const PIN_DURATIONS: Record<string, number> = { '1h': 1, '1d': 24, '7d': 168, '30d': 720 };

// Reshape a DB message for the client: fold poll votes into per-option counts +
// the viewer's own choices, and flatten mentions to {userId,name}. The raw
// `votes` array (which leaks every voter) never reaches the wire.
function serialize(m: FullMessage, viewerId: string) {
  let poll:
    | null
    | {
        id: string; question: string; allowMultiple: boolean; expiresAt: Date | null;
        totalVoters: number; options: { id: string; text: string; order: number; count: number }[]; myVotes: string[];
      } = null;

  if (m.poll) {
    const counts: Record<string, number> = {};
    const myVotes: string[] = [];
    const voters = new Set<string>();
    for (const v of m.poll.votes) {
      counts[v.optionId] = (counts[v.optionId] || 0) + 1;
      voters.add(v.userId);
      if (v.userId === viewerId) myVotes.push(v.optionId);
    }
    poll = {
      id: m.poll.id,
      question: m.poll.question,
      allowMultiple: m.poll.allowMultiple,
      expiresAt: m.poll.expiresAt,
      totalVoters: voters.size,
      options: m.poll.options.map((o) => ({ id: o.id, text: o.text, order: o.order, count: counts[o.id] || 0 })),
      myVotes,
    };
  }

  const { poll: _poll, mentions, ...rest } = m;
  return {
    ...rest,
    mentions: (mentions || []).map((x) => ({ userId: x.userId, name: x.user?.name || '' })),
    poll,
  };
}

// ═══════════════════════════════════════
// MEDIA UPLOAD (images + audio)
// ═══════════════════════════════════════

// Stored on disk under uploads/chat and served by the /uploads static mount in
// server.ts — same pattern as avatars. The SW skips /uploads so media is always
// fetched fresh.
const chatMediaDir = path.join(__dirname, '..', '..', 'uploads', 'chat');
fs.mkdirSync(chatMediaDir, { recursive: true });

const chatUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, chatMediaDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || (file.mimetype.startsWith('audio/') ? '.webm' : '');
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB — covers photos + a few minutes of audio
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/')) cb(null, true);
    else cb(new Error('Apenas imagens ou áudio são permitidos'));
  },
});

/**
 * POST /api/chat/upload  (multipart, field "file")
 * Uploads an image or audio clip, returns the URL to attach to a message.
 */
router.post('/upload', (req: AuthRequest, res: Response) => {
  chatUpload.single('file')(req, res, (err: any) => {
    if (err) return res.status(400).json({ error: err.message || 'Falha no upload' });
    if (!req.file) return res.status(400).json({ error: 'Arquivo ausente' });
    const isAudio = req.file.mimetype.startsWith('audio/');
    res.json({
      url: `/uploads/chat/${req.file.filename}`,
      mime: req.file.mimetype,
      type: isAudio ? 'audio' : 'image',
    });
  });
});

// ═══════════════════════════════════════
// MEMBERS (for @mention autocomplete)
// ═══════════════════════════════════════

/**
 * GET /api/chat/members?q=  — active members for the @mention picker.
 */
router.get('/members', async (req: AuthRequest, res: Response) => {
  try {
    const q = ((req.query.q as string) || '').trim();
    const where: Prisma.UserWhereInput = { isActive: true };
    if (q) where.name = { contains: q, mode: 'insensitive' };
    const members = await prisma.user.findMany({
      where,
      select: { id: true, name: true, avatarUrl: true, role: true },
      orderBy: { name: 'asc' },
      take: 20,
    });
    res.json({ members });
  } catch (error) {
    console.error('[CHAT] members error:', error);
    res.status(500).json({ error: 'Erro ao buscar membros' });
  }
});

// ═══════════════════════════════════════
// COMMUNITY CHAT
// ═══════════════════════════════════════

/**
 * GET /api/chat/community  — latest messages (paginated) + the active pins.
 */
router.get('/community', async (req: AuthRequest, res: Response) => {
  try {
    const before = req.query.before as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const where: Prisma.ChatMessageWhereInput = { channel: 'community' };
    if (before) where.createdAt = { lt: new Date(before) };

    const [messages, pinned] = await Promise.all([
      prisma.chatMessage.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, include: MESSAGE_INCLUDE }),
      prisma.chatMessage.findMany({
        where: { channel: 'community', pinnedUntil: { gt: new Date() } },
        orderBy: { pinnedAt: 'desc' },
        take: 5,
        include: MESSAGE_INCLUDE,
      }),
    ]);

    res.json({
      messages: messages.reverse().map((m) => serialize(m, req.user!.id)),
      pinned: pinned.map((m) => serialize(m, req.user!.id)),
    });
  } catch (error) {
    console.error('[CHAT] Community fetch error:', error);
    res.status(500).json({ error: 'Erro ao carregar mensagens' });
  }
});

// ═══════════════════════════════════════
// LIVE STREAM (Server-Sent Events)
// ═══════════════════════════════════════

/**
 * GET /api/chat/stream?channel=community|support[&userId=]&token=
 *
 * Pushes chat updates in real-time to replace the old 4s client poll. There is
 * no message-bus/worker publishing chat events (unlike Radar's Redis Pub/Sub),
 * so the simplest robust approach for this codebase is a server-side interval
 * that re-reads the recent window for the channel and pushes a `SYNC` only when
 * something actually changed.
 *
 * Why a windowed SYNC instead of a pure createdAt delta: reactions, poll votes,
 * pins/unpins and deletes mutate *existing* messages without bumping
 * `createdAt`. A createdAt-only delta would miss them; the old full-replace poll
 * caught them. So each tick we read the same data the GET endpoint returns
 * (recent messages + pins), hash it, and emit only on change — same query cost
 * as the old poll but driven server-side and pushed, not pulled.
 *
 * Events emitted: `CONNECTED`, then `SYNC` { messages, pinned } (first one is
 * the initial snapshot, like Radar's initial state), plus `: ping` heartbeats.
 * Auth + subscription run via the router-level middleware; the token rides in
 * the query string because EventSource can't send Authorization headers.
 */
router.get('/stream', async (req: AuthRequest, res: Response) => {
  const isAdmin = isAdminRole(req.user!.role);
  const tab = req.query.channel === 'support' ? 'support' : 'community';

  // Resolve the real DB channel. Support is 1:1 (`support_<userId>`); admins may
  // target a member via ?userId=, members always get their own conversation.
  let channel = 'community';
  if (tab === 'support') {
    const targetUserId = isAdmin ? (req.query.userId as string) : req.user!.id;
    if (!targetUserId) return res.status(400).json({ error: 'userId obrigatório para admin' });
    channel = `support_${targetUserId}`;
  }

  // SSE headers. `X-Accel-Buffering: no` is the load-bearing one — without it
  // nginx buffers the stream and clients drop the seemingly-idle connection
  // before any data arrives.
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ event: 'CONNECTED', channel: tab })}\n\n`);

  const viewerId = req.user!.id;
  const limit = 50; // matches the GET endpoints' default page size

  // Reads the same window the GET endpoint returns, so reactions/votes/pins/
  // deletes all propagate exactly like the old full-replace poll did.
  const readWindow = async () => {
    const [messages, pinned] = await Promise.all([
      prisma.chatMessage.findMany({ where: { channel }, orderBy: { createdAt: 'desc' }, take: limit, include: MESSAGE_INCLUDE }),
      tab === 'community'
        ? prisma.chatMessage.findMany({
            where: { channel: 'community', pinnedUntil: { gt: new Date() } },
            orderBy: { pinnedAt: 'desc' },
            take: 5,
            include: MESSAGE_INCLUDE,
          })
        : Promise.resolve([] as FullMessage[]),
    ]);
    return {
      messages: messages.reverse().map((m) => serialize(m, viewerId)),
      pinned: pinned.map((m) => serialize(m, viewerId)),
    };
  };

  // Cheap change signature: id + updatedAt-ish fields per message + pin set.
  // Avoids re-serializing/pushing identical state every tick. We include
  // reaction/vote/pin markers so in-place mutations are detected.
  const signature = (snap: Awaited<ReturnType<typeof readWindow>>) => {
    const msgSig = snap.messages
      .map((m: any) => {
        const reacts = (m.reactions || []).length;
        const votes = m.poll ? m.poll.options.reduce((s: number, o: any) => s + o.count, 0) : 0;
        return `${m.id}:${m.pinnedUntil || ''}:${reacts}:${votes}`;
      })
      .join('|');
    const pinSig = snap.pinned.map((m: any) => `${m.id}:${m.pinnedUntil || ''}`).join('|');
    return `${msgSig}#${pinSig}`;
  };

  let lastSig = '';
  let closed = false;

  const tick = async () => {
    if (closed) return;
    try {
      const snap = await readWindow();
      const sig = signature(snap);
      if (sig !== lastSig) {
        lastSig = sig;
        res.write(`data: ${JSON.stringify({ event: 'SYNC', messages: snap.messages, pinned: snap.pinned })}\n\n`);
      }
    } catch (err) {
      console.error('[CHAT] SSE tick error:', err);
    }
  };

  // Initial snapshot right away (like Radar emitting current state on connect),
  // then poll-and-push on a short interval.
  await tick();
  const poll = setInterval(tick, 2500);

  // Heartbeat: comment lines (':') are ignored by EventSource but keep mobile
  // carrier NAT / iOS from killing the idle connection (~30s).
  const heartbeat = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 15000);

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(poll);
    clearInterval(heartbeat);
  };
  req.on('close', cleanup);
});

/**
 * POST /api/chat/community
 * Body: { content?, replyToId?, type?, mediaUrl?, mediaMime?, mediaDurationSec?,
 *         mentionUserIds?: string[], mentionsAll?: boolean,
 *         poll?: { question, options[], allowMultiple?, expiresHours? } }
 */
router.post('/community', async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body || {};
    const type: 'text' | 'image' | 'audio' | 'poll' =
      ['image', 'audio', 'poll'].includes(b.type) ? b.type : 'text';
    const isAdmin = isAdminRole(req.user!.role);

    let content = typeof b.content === 'string' ? b.content.trim() : '';
    if (content.length > 2000) return res.status(400).json({ error: 'Mensagem muito longa (máx 2000 caracteres)' });

    let mediaUrl: string | null = null;
    let mediaMime: string | null = null;
    let mediaDurationSec: number | null = null;
    let pollData: { question: string; options: string[]; allowMultiple: boolean; expiresAt: Date | null } | null = null;

    if (type === 'image' || type === 'audio') {
      if (typeof b.mediaUrl !== 'string' || !b.mediaUrl.startsWith('/uploads/chat/')) {
        return res.status(400).json({ error: 'Mídia inválida' });
      }
      mediaUrl = b.mediaUrl;
      mediaMime = typeof b.mediaMime === 'string' ? b.mediaMime.slice(0, 100) : null;
      if (type === 'audio' && Number.isFinite(Number(b.mediaDurationSec))) {
        mediaDurationSec = Math.min(Math.max(Math.round(Number(b.mediaDurationSec)), 0), 3600);
      }
    } else if (type === 'poll') {
      const q = typeof b.poll?.question === 'string' ? b.poll.question.trim() : '';
      const opts = Array.isArray(b.poll?.options)
        ? b.poll.options.map((o: any) => String(o ?? '').trim()).filter(Boolean)
        : [];
      if (!q || opts.length < 2) return res.status(400).json({ error: 'Enquete precisa de pergunta e ao menos 2 opções' });
      if (opts.length > 12) return res.status(400).json({ error: 'Máximo de 12 opções' });
      const hours = Number(b.poll?.expiresHours);
      pollData = {
        question: q.slice(0, 300),
        options: opts.slice(0, 12).map((o: string) => o.slice(0, 120)),
        allowMultiple: !!b.poll?.allowMultiple,
        expiresAt: hours && hours > 0 ? new Date(Date.now() + hours * 3600_000) : null,
      };
      content = pollData.question; // graceful fallback for non-poll-aware viewers
    } else {
      if (!content) return res.status(400).json({ error: 'Mensagem vazia' });
    }

    // @mentions — validate against real active users; @todos is admin-only.
    const rawIds: string[] = Array.isArray(b.mentionUserIds)
      ? b.mentionUserIds.filter((x: any) => typeof x === 'string').slice(0, 50)
      : [];
    const mentionsAll = !!b.mentionsAll && isAdmin;
    let mentionIds: string[] = [];
    if (rawIds.length) {
      const found = await prisma.user.findMany({ where: { id: { in: rawIds }, isActive: true }, select: { id: true } });
      mentionIds = found.map((u) => u.id).filter((id) => id !== req.user!.id);
    }

    // Only accept a reply to a message in the same channel.
    let validReplyId: string | null = null;
    if (b.replyToId) {
      const parent = await prisma.chatMessage.findUnique({ where: { id: String(b.replyToId) }, select: { channel: true } });
      if (parent && parent.channel === 'community') validReplyId = String(b.replyToId);
    }

    const created = await prisma.chatMessage.create({
      data: {
        senderId: req.user!.id,
        channel: 'community',
        type,
        content,
        mediaUrl,
        mediaMime,
        mediaDurationSec,
        mentionsAll,
        replyToId: validReplyId,
        ...(mentionIds.length ? { mentions: { create: mentionIds.map((userId) => ({ userId })) } } : {}),
        ...(pollData
          ? {
              poll: {
                create: {
                  question: pollData.question,
                  allowMultiple: pollData.allowMultiple,
                  expiresAt: pollData.expiresAt,
                  options: { create: pollData.options.map((text, i) => ({ text, order: i })) },
                },
              },
            }
          : {}),
      },
      include: MESSAGE_INCLUDE,
    });

    res.json({ message: serialize(created, req.user!.id) });

    // ── Push (fire-and-forget). Mentioned users get a distinct, higher-signal
    // notification; everyone else gets the normal community ping. @todos pings
    // the whole community with a dedicated title. ──
    const senderName = created.sender?.name || 'Alguém';
    const preview = (content || (type === 'image' ? '📷 Imagem' : type === 'audio' ? '🎤 Áudio' : 'Mensagem')).substring(0, 140);
    (async () => {
      const others = await prisma.user.findMany({ where: { id: { not: req.user!.id }, isActive: true }, select: { id: true } });
      const otherIds = others.map((u) => u.id);
      if (mentionsAll) {
        // @todos bypasses the community mute → category 'mention' (always delivered).
        await sendPushToUsers(otherIds, { title: `📣 ${senderName} marcou @todos`, body: preview, url: '/chat' }, 'mention');
      } else if (mentionIds.length) {
        const mentionSet = new Set(mentionIds);
        // Mentioned members get a higher-signal push that bypasses the community mute.
        await sendPushToUsers(mentionIds, { title: `💬 ${senderName} mencionou você`, body: preview, url: '/chat' }, 'mention');
        await sendPushToUsers(otherIds.filter((id) => !mentionSet.has(id)), { title: `💬 ${senderName} na Comunidade`, body: preview, url: '/chat' }, 'community');
      } else {
        await sendPushToUsers(otherIds, { title: `💬 ${senderName} na Comunidade`, body: preview, url: '/chat' }, 'community');
      }
    })().catch((e) => console.error('[CHAT] community push error:', e));
  } catch (error) {
    console.error('[CHAT] Community send error:', error);
    res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
});

// ═══════════════════════════════════════
// PIN / UNPIN  (admin only, community only)
// ═══════════════════════════════════════

/**
 * POST /api/chat/messages/:id/pin  { duration: "1h" | "1d" | "7d" | "30d" }
 */
router.post('/messages/:id/pin', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user!.role)) return res.status(403).json({ error: 'Apenas administradores podem fixar mensagens' });
    const hours = PIN_DURATIONS[String(req.body?.duration || '')];
    if (!hours) return res.status(400).json({ error: 'Duração inválida (use 1h, 1d, 7d ou 30d)' });

    const msg = await prisma.chatMessage.findUnique({ where: { id: req.params.id }, select: { id: true, channel: true } });
    if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada' });
    if (msg.channel !== 'community') return res.status(400).json({ error: 'Só é possível fixar na Comunidade' });

    const updated = await prisma.chatMessage.update({
      where: { id: msg.id },
      data: { pinnedUntil: new Date(Date.now() + hours * 3600_000), pinnedAt: new Date(), pinnedById: req.user!.id },
      include: MESSAGE_INCLUDE,
    });
    res.json({ message: serialize(updated, req.user!.id) });
  } catch (error) {
    console.error('[CHAT] Pin error:', error);
    res.status(500).json({ error: 'Erro ao fixar mensagem' });
  }
});

/**
 * DELETE /api/chat/messages/:id/pin  — unpin (admin only).
 */
router.delete('/messages/:id/pin', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user!.role)) return res.status(403).json({ error: 'Apenas administradores podem desafixar' });
    const msg = await prisma.chatMessage.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada' });
    await prisma.chatMessage.update({ where: { id: msg.id }, data: { pinnedUntil: null, pinnedAt: null, pinnedById: null } });
    res.json({ success: true });
  } catch (error) {
    console.error('[CHAT] Unpin error:', error);
    res.status(500).json({ error: 'Erro ao desafixar mensagem' });
  }
});

// ═══════════════════════════════════════
// POLLS — voting
// ═══════════════════════════════════════

/**
 * POST /api/chat/polls/:id/vote  { optionIds: string[] }
 * Single-choice polls keep one vote (prior votes are replaced); multi-select
 * keeps the full set. An empty array clears the viewer's vote.
 */
router.post('/polls/:id/vote', async (req: AuthRequest, res: Response) => {
  try {
    const poll = await prisma.poll.findUnique({
      where: { id: req.params.id },
      include: { options: { select: { id: true } } },
    });
    if (!poll) return res.status(404).json({ error: 'Enquete não encontrada' });
    if (poll.expiresAt && poll.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'Esta enquete já encerrou' });
    }

    const optionIds: string[] = Array.isArray(req.body?.optionIds)
      ? req.body.optionIds.filter((x: any) => typeof x === 'string')
      : [];
    const valid = new Set(poll.options.map((o) => o.id));
    const chosen = [...new Set(optionIds)].filter((id) => valid.has(id));
    const finalChosen = poll.allowMultiple ? chosen : chosen.slice(0, 1);

    await prisma.$transaction([
      prisma.pollVote.deleteMany({ where: { pollId: poll.id, userId: req.user!.id } }),
      ...(finalChosen.length
        ? [prisma.pollVote.createMany({ data: finalChosen.map((optionId) => ({ pollId: poll.id, optionId, userId: req.user!.id })) })]
        : []),
    ]);

    const msg = await prisma.chatMessage.findFirst({ where: { poll: { id: poll.id } }, include: MESSAGE_INCLUDE });
    res.json({ message: msg ? serialize(msg, req.user!.id) : null });
  } catch (error) {
    console.error('[CHAT] Vote error:', error);
    res.status(500).json({ error: 'Erro ao votar' });
  }
});

// ═══════════════════════════════════════
// DELETE MESSAGE
// ═══════════════════════════════════════

/**
 * DELETE /api/chat/messages/:id
 * Owner can delete within 15 minutes; admins can delete any message anytime.
 * Cascades to poll/options/votes/mentions/reactions via FK onDelete.
 */
router.delete('/messages/:id', async (req: AuthRequest, res: Response) => {
  try {
    const message = await prisma.chatMessage.findUnique({ where: { id: req.params.id } });
    if (!message) return res.status(404).json({ error: 'Mensagem não encontrada' });

    const role = req.user!.role;
    const isAdmin = isAdminRole(role);
    const isOwner = message.senderId === req.user!.id;

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Sem permissão para deletar esta mensagem' });
    }

    if (isOwner && !isAdmin) {
      const ageMs = Date.now() - new Date(message.createdAt).getTime();
      if (ageMs > 15 * 60 * 1000) {
        return res.status(403).json({ error: 'O prazo de 15 minutos para deletar já expirou' });
      }
    }

    await prisma.chatMessage.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    console.error('[CHAT] Delete error:', error);
    res.status(500).json({ error: 'Erro ao deletar mensagem' });
  }
});

// ═══════════════════════════════════════
// REACTIONS
// ═══════════════════════════════════════

/**
 * POST /api/chat/messages/:id/react  { emoji }  — toggle a reaction.
 */
router.post('/messages/:id/react', async (req: AuthRequest, res: Response) => {
  try {
    const raw = req.body?.emoji;
    if (!raw || typeof raw !== 'string' || !raw.trim()) {
      return res.status(400).json({ error: 'Emoji obrigatório' });
    }
    const emoji = raw.trim().slice(0, 12);

    const msg = await prisma.chatMessage.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada' });

    const existing = await prisma.messageReaction.findUnique({
      where: { messageId_userId_emoji: { messageId: msg.id, userId: req.user!.id, emoji } },
    });

    if (existing) {
      await prisma.messageReaction.delete({ where: { id: existing.id } });
      return res.json({ toggled: 'off', emoji });
    }

    await prisma.messageReaction.create({ data: { messageId: msg.id, userId: req.user!.id, emoji } });
    return res.json({ toggled: 'on', emoji });
  } catch (error) {
    console.error('[CHAT] React error:', error);
    res.status(500).json({ error: 'Erro ao reagir' });
  }
});

// ═══════════════════════════════════════
// SUPPORT CHAT (1:1 with Admin) — text + image/audio
// ═══════════════════════════════════════

/**
 * GET /api/chat/support
 * Members: their own conversation. Admins: a user's conversation via ?userId=.
 */
router.get('/support', async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = isAdminRole(req.user!.role);
    const targetUserId = isAdmin ? (req.query.userId as string) : req.user!.id;
    if (!targetUserId) return res.status(400).json({ error: 'userId obrigatório para admin' });

    const channel = `support_${targetUserId}`;
    const before = req.query.before as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const where: Prisma.ChatMessageWhereInput = { channel };
    if (before) where.createdAt = { lt: new Date(before) };

    const messages = await prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: MESSAGE_INCLUDE,
    });

    if (messages.length > 0) {
      await prisma.chatMessage.updateMany({
        where: { channel, senderId: { not: req.user!.id }, readAt: null },
        data: { readAt: new Date() },
      });
    }

    res.json({ messages: messages.reverse().map((m) => serialize(m, req.user!.id)), channel });
  } catch (error) {
    console.error('[CHAT] Support fetch error:', error);
    res.status(500).json({ error: 'Erro ao carregar mensagens de suporte' });
  }
});

/**
 * POST /api/chat/support
 * Body: { content?, userId?(admin), replyToId?, type?, mediaUrl?, mediaMime?, mediaDurationSec? }
 * Support allows text + image + audio (no polls / mentions / pins).
 */
router.post('/support', async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body || {};
    const isAdmin = isAdminRole(req.user!.role);
    const targetUserId = isAdmin ? b.userId : req.user!.id;
    if (!targetUserId) return res.status(400).json({ error: 'userId obrigatório para admin' });

    const channel = `support_${targetUserId}`;
    const type: 'text' | 'image' | 'audio' = ['image', 'audio'].includes(b.type) ? b.type : 'text';

    let content = typeof b.content === 'string' ? b.content.trim() : '';
    if (content.length > 2000) return res.status(400).json({ error: 'Mensagem muito longa (máx 2000 caracteres)' });

    let mediaUrl: string | null = null;
    let mediaMime: string | null = null;
    let mediaDurationSec: number | null = null;
    if (type === 'image' || type === 'audio') {
      if (typeof b.mediaUrl !== 'string' || !b.mediaUrl.startsWith('/uploads/chat/')) {
        return res.status(400).json({ error: 'Mídia inválida' });
      }
      mediaUrl = b.mediaUrl;
      mediaMime = typeof b.mediaMime === 'string' ? b.mediaMime.slice(0, 100) : null;
      if (type === 'audio' && Number.isFinite(Number(b.mediaDurationSec))) {
        mediaDurationSec = Math.min(Math.max(Math.round(Number(b.mediaDurationSec)), 0), 3600);
      }
    } else if (!content) {
      return res.status(400).json({ error: 'Mensagem vazia' });
    }

    let validReplyId: string | null = null;
    if (b.replyToId) {
      const parent = await prisma.chatMessage.findUnique({ where: { id: String(b.replyToId) }, select: { channel: true } });
      if (parent && parent.channel === channel) validReplyId = String(b.replyToId);
    }

    const created = await prisma.chatMessage.create({
      data: {
        senderId: req.user!.id,
        channel,
        type,
        content,
        mediaUrl,
        mediaMime,
        mediaDurationSec,
        replyToId: validReplyId,
      },
      include: MESSAGE_INCLUDE,
    });

    res.json({ message: serialize(created, req.user!.id) });

    const preview = (content || (type === 'image' ? '📷 Imagem' : type === 'audio' ? '🎤 Áudio' : 'Mensagem')).substring(0, 140);
    if (isAdmin) {
      sendPushToUser(targetUserId, { title: '🛟 Suporte — Código Zero', body: preview, url: '/chat' })
        .catch((e) => console.error('[CHAT] support push error:', e));
    } else {
      const admins = await prisma.user.findMany({ where: { role: { in: ['admin', 'superadmin'] } }, select: { id: true } });
      sendPushToUsers(admins.map((a) => a.id), { title: '🛟 Nova mensagem de suporte', body: preview, url: '/chat' })
        .catch((e) => console.error('[CHAT] support push (admins) error:', e));
    }
  } catch (error) {
    console.error('[CHAT] Support send error:', error);
    res.status(500).json({ error: 'Erro ao enviar mensagem de suporte' });
  }
});

/**
 * GET /api/chat/support/inbox  — admin: all support conversations.
 */
router.get('/support/inbox', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user!.role)) return res.status(403).json({ error: 'Admin only' });

    const channels = await prisma.chatMessage.groupBy({
      by: ['channel'],
      where: { channel: { startsWith: 'support_' } },
      _count: true,
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
    });

    const conversations = await Promise.all(
      channels.map(async (ch) => {
        const userId = ch.channel.replace('support_', '');
        const [user, lastMessage, unreadCount] = await Promise.all([
          prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, email: true, subscriptionStatus: true, avatarUrl: true },
          }),
          prisma.chatMessage.findFirst({
            where: { channel: ch.channel },
            orderBy: { createdAt: 'desc' },
            include: { sender: { select: { name: true, role: true } } },
          }),
          prisma.chatMessage.count({ where: { channel: ch.channel, senderId: { not: req.user!.id }, readAt: null } }),
        ]);
        return { channel: ch.channel, userId, user, lastMessage, unreadCount, totalMessages: ch._count };
      })
    );

    res.json({ conversations });
  } catch (error) {
    console.error('[CHAT] Inbox error:', error);
    res.status(500).json({ error: 'Erro ao carregar inbox' });
  }
});

/**
 * GET /api/chat/unread  — unread counts for the current user.
 */
router.get('/unread', async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = isAdminRole(req.user!.role);
    const supportUnread = await prisma.chatMessage.count({
      where: isAdmin
        ? { channel: { startsWith: 'support_' }, senderId: { not: req.user!.id }, readAt: null }
        : { channel: `support_${req.user!.id}`, senderId: { not: req.user!.id }, readAt: null },
    });
    res.json({ supportUnread });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao verificar não-lidas' });
  }
});

export default router;
