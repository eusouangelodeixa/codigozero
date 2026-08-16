import jwt from 'jsonwebtoken';
import { env } from '../config/env';

/**
 * Token de sessão do app. Centralizado aqui para que TODO token carregue o
 * `tokenVersion` do usuário — o authMiddleware compara, e um bump (troca/reset
 * de senha, logout forçado) invalida na hora todos os tokens já emitidos.
 * Antes o token só carregava `{ userId }` e vivia 7 dias sem revogação.
 */
export interface AuthTokenPayload {
  userId: string;
  tv: number; // tokenVersion no momento da emissão
}

export function signAuthToken(userId: string, tokenVersion: number): string {
  const payload: AuthTokenPayload = { userId, tv: tokenVersion ?? 0 };
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: (env.JWT_EXPIRES_IN || '7d') as any,
  });
}
