import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';

/**
 * Link de AUTO-LOGIN do e-mail de credenciais: o botão "Acessar meu produto"
 * já entra logado, sem digitar senha.
 *
 * Segurança:
 *  - Assinado com chave DERIVADA de JWT_SECRET (nunca o secret cru) — um token
 *    destes JAMAIS é aceito pelo authMiddleware; só pela troca em /auto-login.
 *  - Carrega o `tv` (tokenVersion) do usuário no momento do envio: se a senha
 *    for trocada, o link morre (mesma revogação da sessão).
 *  - TTL de 14 dias e trocado por POST (não single-use de propósito: scanners
 *    de e-mail fazem GET e queimariam um link de uso único antes do cliente
 *    clicar; e o próprio e-mail já traz a senha, então o teto de exposição é o
 *    mesmo). A troca re-checa conta ativa + tokenVersion.
 */
const KEY = crypto.createHmac('sha256', env.JWT_SECRET).update('cz-autologin-v1').digest();
const PURPOSE = 'auto-login';

export function signAutoLoginToken(userId: string, tokenVersion: number): string {
  return jwt.sign({ userId, tv: tokenVersion ?? 0, purpose: PURPOSE }, KEY, {
    algorithm: 'HS256',
    expiresIn: '14d',
  });
}

export function verifyAutoLoginToken(token: string): { userId: string; tv: number } | null {
  try {
    const d = jwt.verify(token, KEY, { algorithms: ['HS256'] }) as {
      userId?: string;
      tv?: number;
      purpose?: string;
    };
    if (d.purpose !== PURPOSE || !d.userId) return null;
    return { userId: d.userId, tv: d.tv ?? 0 };
  } catch {
    return null;
  }
}
