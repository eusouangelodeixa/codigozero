/**
 * One-time WhatsApp verification codes (OTP).
 *
 * Powers two flows:
 *   • password_reset  — forgot-password (unauthenticated, matched by phone)
 *   • password_change — confirm a password change in /perfil
 *
 * Codes are 6 digits, expire in 10 minutes, single-use, and brute-force
 * limited (max 5 verify attempts). Delivery reuses the shared Komunika
 * sender (lib/whatsapp).
 */
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { sendWhatsAppMessage, normalizeMzPhone } from '../lib/whatsapp';

const prisma = new PrismaClient();

const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export type OtpPurpose = 'password_reset' | 'password_change';

function generateCode(): string {
  // 6-digit numeric, zero-padded. crypto.randomInt avoids Math.random bias.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Create an OTP for `phone`+`purpose` and deliver it over WhatsApp.
 * Invalidates any previous unconsumed code for the same pair first so only
 * the latest code is valid. Returns whether the WhatsApp send succeeded.
 */
export async function createAndSendOtp(opts: {
  phone: string;
  purpose: OtpPurpose;
  userId?: string;
}): Promise<{ sent: boolean }> {
  const phone = normalizeMzPhone(opts.phone);
  const code = generateCode();

  // Drop older live codes for this phone+purpose (single active code).
  await prisma.otpCode.updateMany({
    where: { phone, purpose: opts.purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  await prisma.otpCode.create({
    data: {
      phone,
      purpose: opts.purpose,
      code,
      userId: opts.userId ?? null,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });

  const message = [
    `🔐 *Código Zero* — código de verificação`,
    ``,
    `Seu código é: *${code}*`,
    ``,
    `Ele expira em 10 minutos. Não compartilhe com ninguém.`,
    opts.purpose === 'password_reset'
      ? `Se você não pediu para redefinir a senha, ignore esta mensagem.`
      : `Se você não pediu para alterar a senha, ignore esta mensagem.`,
  ].join('\n');

  const r = await sendWhatsAppMessage({ phone, content: message, normalize: false });
  return { sent: r.ok };
}

/**
 * Validate an OTP. Consumes it on success. Returns false (and bumps the
 * attempt counter) on any mismatch / expiry / exhaustion.
 */
export async function verifyOtp(opts: {
  phone: string;
  purpose: OtpPurpose;
  code: string;
}): Promise<{ valid: boolean; userId?: string | null; reason?: string }> {
  const phone = normalizeMzPhone(opts.phone);
  const code = String(opts.code || '').trim();

  const otp = await prisma.otpCode.findFirst({
    where: { phone, purpose: opts.purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!otp) return { valid: false, reason: 'no-code' };
  if (otp.expiresAt < new Date()) return { valid: false, reason: 'expired' };
  if (otp.attempts >= MAX_ATTEMPTS) return { valid: false, reason: 'too-many-attempts' };

  if (otp.code !== code) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    return { valid: false, reason: 'mismatch' };
  }

  await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
  return { valid: true, userId: otp.userId };
}
