import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
    subscriptionStatus: string;
  };
}

// Cache curtíssimo (10s) do lookup de usuário: os polls do painel (chat,
// e-mails, broadcast) pagavam um findUnique POR REQUISIÇÃO. 10s de staleness
// em role/status é aceitável — desativação/upgrade pega no tick seguinte.
// Limpeza preguiçosa a cada 60s para o Map não crescer sem teto.
type CachedUser = { user: NonNullable<AuthRequest['user']>; isActive: boolean; tokenVersion: number; expiresAt: number };
const userCache = new Map<string, CachedUser>();
let nextCacheSweep = 0;
const USER_CACHE_TTL_MS = 10_000;

// Rotas SSE (EventSource não envia header Authorization) — as ÚNICAS onde
// ?token= é aceito: /api/chat/stream e /api/radar/stream/:jobId.
const SSE_TOKEN_PATHS = ['/stream'];

function sweepUserCache(now: number): void {
  if (now < nextCacheSweep) return;
  nextCacheSweep = now + 60_000;
  for (const [k, v] of userCache) {
    if (v.expiresAt <= now) userCache.delete(k);
  }
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    let token = '';
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query.token && SSE_TOKEN_PATHS.some((p) => req.path.includes(p))) {
      // ?token= só é aceito nas rotas de streaming (EventSource não manda
      // header). Fora delas, um token na URL só existiria para vazar em log/
      // histórico — recusamos.
      token = req.query.token as string;
    }

    if (!token) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as { userId: string; tv?: number };
    const tokenTv = decoded.tv ?? 0;

    const now = Date.now();
    sweepUserCache(now);
    const cached = userCache.get(decoded.userId);
    if (cached && cached.expiresAt > now) {
      if (!cached.isActive) return res.status(401).json({ error: 'Usuário não encontrado ou inativo' });
      // Revogação: um token com versão antiga (senha trocada / logout forçado)
      // não vale mais, mesmo dentro da janela de cache.
      if (tokenTv !== cached.tokenVersion) return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
      req.user = cached.user;
      return next();
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        subscriptionStatus: true,
        isActive: true,
        tokenVersion: true,
      },
    });

    if (!user || !user.isActive) {
      if (user) {
        userCache.set(decoded.userId, {
          user: { id: user.id, email: user.email, name: user.name, role: user.role, subscriptionStatus: user.subscriptionStatus },
          isActive: false,
          tokenVersion: user.tokenVersion,
          expiresAt: now + USER_CACHE_TTL_MS,
        });
      }
      return res.status(401).json({ error: 'Usuário não encontrado ou inativo' });
    }

    if (tokenTv !== user.tokenVersion) {
      return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      subscriptionStatus: user.subscriptionStatus,
    };
    userCache.set(decoded.userId, { user: req.user, isActive: true, tokenVersion: user.tokenVersion, expiresAt: now + USER_CACHE_TTL_MS });

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
};
