import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { subscriptionMiddleware } from '../middlewares/subscription.middleware';
import { sendPushToUser } from './auth.routes';

const router = Router();
const prisma = new PrismaClient();

// All chat routes require auth + active subscription
router.use(authMiddleware);
router.use(subscriptionMiddleware);

const SENDER_SELECT = {
  id: true, name: true, role: true, avatarUrl: true,
};

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
      include: { sender: { select: SENDER_SELECT } },
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
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Mensagem vazia' });
    }
    if (content.length > 2000) {
      return res.status(400).json({ error: 'Mensagem muito longa (máx 2000 caracteres)' });
    }

    const message = await prisma.chatMessage.create({
      data: {
        senderId: req.user!.id,
        channel: 'community',
        content: content.trim(),
      },
      include: { sender: { select: SENDER_SELECT } },
    });

    // Push notification to all other users
    const allUsers = await prisma.user.findMany({ where: { id: { not: req.user!.id }, isActive: true }, select: { id: true } });
    const senderName = message.sender?.name || 'Alguém';
    for (const u of allUsers) {
      sendPushToUser(u.id, { title: `💬 ${senderName} na Comunidade`, body: content.trim().substring(0, 100), url: '/chat' }).catch(() => {});
    }

    res.json({ message });
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

    const isAdmin = req.user!.role === 'admin';
    const isOwner = message.senderId === req.user!.id;

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Sem permissão para deletar esta mensagem' });
    }

    // 15-minute window for non-admins
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
// SUPPORT CHAT (1:1 with Admin)
// ═══════════════════════════════════════

/**
 * GET /api/chat/support
 * For members: fetch their support conversation
 * For admins: fetch a specific user's conversation via ?userId=xxx
 */
router.get('/support', async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.user!.role === 'admin';
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
      include: { sender: { select: SENDER_SELECT } },
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
    const { content, userId } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Mensagem vazia' });
    }

    const isAdmin = req.user!.role === 'admin';
    const targetUserId = isAdmin ? userId : req.user!.id;

    if (!targetUserId) {
      return res.status(400).json({ error: 'userId obrigatório para admin' });
    }

    const channel = `support_${targetUserId}`;

    const message = await prisma.chatMessage.create({
      data: {
        senderId: req.user!.id,
        channel,
        content: content.trim(),
      },
      include: { sender: { select: SENDER_SELECT } },
    });

    // Push notification to the other party
    const recipientId = isAdmin ? targetUserId : 'admin';
    if (isAdmin) {
      // Admin replying to user
      sendPushToUser(targetUserId, { title: '🛟 Suporte — Código Zero', body: content.trim().substring(0, 100), url: '/chat' }).catch(() => {});
    } else {
      // User messaging support — notify all admins
      const admins = await prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } });
      for (const a of admins) {
        sendPushToUser(a.id, { title: '🛟 Nova mensagem de suporte', body: content.trim().substring(0, 100), url: '/chat' }).catch(() => {});
      }
    }

    res.json({ message });
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
    if (req.user!.role !== 'admin') {
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
    const isAdmin = req.user!.role === 'admin';

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
