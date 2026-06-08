import { Router, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
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

// Shared shape for every message we return: the sender, the quoted message it
// replies to (id + content + sender name), and its reactions (emoji + who).
// `satisfies` keeps the literal type so Prisma infers `reactions`/`replyTo`.
const MESSAGE_INCLUDE = {
  sender: { select: SENDER_SELECT },
  replyTo: { select: { id: true, content: true, sender: { select: { id: true, name: true } } } },
  reactions: { select: { emoji: true, userId: true } },
} satisfies Prisma.ChatMessageInclude;

// Both 'admin' and 'superadmin' act as the support agent. Checking only
// 'admin' silently broke support for superadmin owners: GET/POST /support
// fell back to the superadmin's own id (so the member's conversation looked
// empty and replies went nowhere) and new-message pushes skipped them.
const isAdminRole = (role?: string) => role === 'admin' || role === 'superadmin';

// ═══════════════════════════════════════
// COMMUNITY CHAT
// ═══════════════════════════════════════

/**
 * GET /api/chat/community
 * Fetch community messages (latest, paginated)
 */
router.get('/community', async (req: AuthRequest, res: Response) => {
  try {
    const before = req.query.before as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const where: any = { channel: 'community' };
    if (before) {
      where.createdAt = { lt: new Date(before) };
    }

    const messages = await prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: MESSAGE_INCLUDE,
    });

    res.json({ messages: messages.reverse() });
  } catch (error) {
    console.error('[CHAT] Community fetch error:', error);
    res.status(500).json({ error: 'Erro ao carregar mensagens' });
  }
});

/**
 * POST /api/chat/community
 * Send a message to community chat
 */
router.post('/community', async (req: AuthRequest, res: Response) => {
  try {
    const { content, replyToId } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Mensagem vazia' });
    }
    if (content.length > 2000) {
      return res.status(400).json({ error: 'Mensagem muito longa (máx 2000 caracteres)' });
    }

    // Only accept a reply to a message in the same channel.
    let validReplyId: string | null = null;
    if (replyToId) {
      const parent = await prisma.chatMessage.findUnique({ where: { id: String(replyToId) }, select: { channel: true } });
      if (parent && parent.channel === 'community') validReplyId = String(replyToId);
    }

    const message = await prisma.chatMessage.create({
      data: {
        senderId: req.user!.id,
        channel: 'community',
        content: content.trim(),
        replyToId: validReplyId,
      },
      include: MESSAGE_INCLUDE,
    });

    res.json({ message });

    // Push notification to all other active users (fire-and-forget, batched in one query)
    const allUsers = await prisma.user.findMany({
      where: { id: { not: req.user!.id }, isActive: true },
      select: { id: true },
    });
    const senderName = message.sender?.name || 'Alguém';
    sendPushToUsers(
      allUsers.map((u) => u.id),
      {
        title: `💬 ${senderName} na Comunidade`,
        body: content.trim().substring(0, 140),
        url: '/chat',
      },
      'community',
    ).catch((e) => console.error('[CHAT] community push error:', e));
  } catch (error) {
    console.error('[CHAT] Community send error:', error);
    res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
});

// ═══════════════════════════════════════
// DELETE MESSAGE
// ═══════════════════════════════════════

/**
 * DELETE /api/chat/messages/:id
 * Users can delete own messages within 15 minutes.
 * Admins can delete any message at any time.
 */
router.delete('/messages/:id', async (req: AuthRequest, res: Response) => {
  try {
    const message = await prisma.chatMessage.findUnique({ where: { id: req.params.id } });
    if (!message) return res.status(404).json({ error: 'Mensagem não encontrada' });

    const role = req.user!.role;
    const isAdmin = role === 'admin' || role === 'superadmin';
    const isOwner = message.senderId === req.user!.id;

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Sem permissão para deletar esta mensagem' });
    }

    // Owners (non-admin) only have a 15-minute window. Admins/superadmins
    // can delete any message at any time.
    if (isOwner && !isAdmin) {
      const ageMs = Date.now() - new Date(message.createdAt).getTime();
      const fifteenMin = 15 * 60 * 1000;
      if (ageMs > fifteenMin) {
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
 * POST /api/chat/messages/:id/react  { emoji }
 * Toggle one emoji reaction for the current user on a message.
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

    await prisma.messageReaction.create({
      data: { messageId: msg.id, userId: req.user!.id, emoji },
    });
    return res.json({ toggled: 'on', emoji });
  } catch (error) {
    console.error('[CHAT] React error:', error);
    res.status(500).json({ error: 'Erro ao reagir' });
  }
});

// ═══════════════════════════════════════
// SUPPORT CHAT (1:1 with Admin)
// ═══════════════════════════════════════

/**
 * GET /api/chat/support
 * For members: fetch their support conversation
 * For admins: fetch a specific user's conversation via ?userId=xxx
 */
router.get('/support', async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = isAdminRole(req.user!.role);
    const targetUserId = isAdmin ? (req.query.userId as string) : req.user!.id;

    if (!targetUserId) {
      return res.status(400).json({ error: 'userId obrigatório para admin' });
    }

    const channel = `support_${targetUserId}`;
    const before = req.query.before as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const where: any = { channel };
    if (before) {
      where.createdAt = { lt: new Date(before) };
    }

    const messages = await prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: MESSAGE_INCLUDE,
    });

    // Mark unread messages as read for the viewer
    if (messages.length > 0) {
      await prisma.chatMessage.updateMany({
        where: {
          channel,
          senderId: { not: req.user!.id },
          readAt: null,
        },
        data: { readAt: new Date() },
      });
    }

    res.json({ messages: messages.reverse(), channel });
  } catch (error) {
    console.error('[CHAT] Support fetch error:', error);
    res.status(500).json({ error: 'Erro ao carregar mensagens de suporte' });
  }
});

/**
 * POST /api/chat/support
 * Send a support message
 */
router.post('/support', async (req: AuthRequest, res: Response) => {
  try {
    const { content, userId, replyToId } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Mensagem vazia' });
    }

    const isAdmin = isAdminRole(req.user!.role);
    const targetUserId = isAdmin ? userId : req.user!.id;

    if (!targetUserId) {
      return res.status(400).json({ error: 'userId obrigatório para admin' });
    }

    const channel = `support_${targetUserId}`;

    // Only accept a reply to a message in this same support channel.
    let validReplyId: string | null = null;
    if (replyToId) {
      const parent = await prisma.chatMessage.findUnique({ where: { id: String(replyToId) }, select: { channel: true } });
      if (parent && parent.channel === channel) validReplyId = String(replyToId);
    }

    const message = await prisma.chatMessage.create({
      data: {
        senderId: req.user!.id,
        channel,
        content: content.trim(),
        replyToId: validReplyId,
      },
      include: MESSAGE_INCLUDE,
    });

    res.json({ message });

    // Push notification to the other party (fire-and-forget)
    if (isAdmin) {
      sendPushToUser(targetUserId, {
        title: '🛟 Suporte — Código Zero',
        body: content.trim().substring(0, 140),
        url: '/chat',
      }).catch((e) => console.error('[CHAT] support push error:', e));
    } else {
      const admins = await prisma.user.findMany({
        where: { role: { in: ['admin', 'superadmin'] } },
        select: { id: true },
      });
      sendPushToUsers(
        admins.map((a) => a.id),
        { title: '🛟 Nova mensagem de suporte', body: content.trim().substring(0, 140), url: '/chat' },
      ).catch((e) => console.error('[CHAT] support push (admins) error:', e));
    }
  } catch (error) {
    console.error('[CHAT] Support send error:', error);
    res.status(500).json({ error: 'Erro ao enviar mensagem de suporte' });
  }
});

/**
 * GET /api/chat/support/inbox
 * Admin only: list all support conversations with last message + unread count
 */
router.get('/support/inbox', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user!.role)) {
      return res.status(403).json({ error: 'Admin only' });
    }

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
          prisma.chatMessage.count({
            where: {
              channel: ch.channel,
              senderId: { not: req.user!.id },
              readAt: null,
            },
          }),
        ]);

        return {
          channel: ch.channel,
          userId,
          user,
          lastMessage,
          unreadCount,
          totalMessages: ch._count,
        };
      })
    );

    res.json({ conversations });
  } catch (error) {
    console.error('[CHAT] Inbox error:', error);
    res.status(500).json({ error: 'Erro ao carregar inbox' });
  }
});

/**
 * GET /api/chat/unread
 * Returns unread counts for the current user
 */
router.get('/unread', async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = isAdminRole(req.user!.role);

    let supportUnread = 0;
    if (isAdmin) {
      supportUnread = await prisma.chatMessage.count({
        where: {
          channel: { startsWith: 'support_' },
          senderId: { not: req.user!.id },
          readAt: null,
        },
      });
    } else {
      supportUnread = await prisma.chatMessage.count({
        where: {
          channel: `support_${req.user!.id}`,
          senderId: { not: req.user!.id },
          readAt: null,
        },
      });
    }

    res.json({ supportUnread });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao verificar não-lidas' });
  }
});

export default router;
