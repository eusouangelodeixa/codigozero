/**
 * Shared post-payment effects used by BOTH gateway webhooks.
 *
 * The Lojou webhook in webhook.routes.ts has all of this inline (it
 * predates the multi-gateway requirement); we leave that code untouched
 * to avoid regression risk and call this module from the new Stripe
 * webhook instead. A future pass can migrate Lojou to call these
 * helpers too — same logic, less duplication.
 *
 * What lives here:
 *   • sendCredentialsViaWhatsApp — the 3-retry Komunika delivery loop
 *   • notifyAdminOfSale          — superadmin push on every approved sale
 *   • upsertPayingUser           — create/reactivate a User from a payment
 *   • reconcileManualStripe      — replace MANUAL_STRIPE_* placeholder
 *                                  with real Stripe IDs (covers people
 *                                  like Esley who were granted access
 *                                  manually before Stripe was wired)
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { env } from '../config/env';
import { sendPushToSuperAdmins } from './push.service';
import { sendWhatsAppMessage } from '../lib/whatsapp';
import { sendEmail, type EmailSendResult } from '../lib/email';

const prisma = new PrismaClient();

/**
 * Build a random 8-char password (hex) + bcrypt hash.
 *
 * Used by both gateways when activating a brand-new user. Matches the
 * crypto.randomBytes(4) pattern the Lojou webhook uses today.
 */
export async function generateUserPassword(): Promise<{ raw: string; hash: string }> {
  const raw = crypto.randomBytes(4).toString('hex');
  const hash = await bcrypt.hash(raw, 10);
  return { raw, hash };
}

export interface CredentialDelivery {
  delivered: boolean;
  status: number | string;
}

/**
 * Send the welcome message with email + password via WhatsApp.
 * Retries up to 3x with linear backoff. Returns the final status so the
 * caller can decide whether to notify the admin (we DO push to
 * superadmins on hard failure — same behavior as the Lojou flow).
 *
 * `phone` should already be a numeric E.164 string (no `+`). For MZ
 * numbers, the caller is expected to have prefixed 258 if needed; we
 * don't second-guess country here because Stripe carries international
 * customers and the Lojou helper for MZ normalization shouldn't run
 * blindly on a +351 number.
 */
export async function sendCredentialsViaWhatsApp(opts: {
  phone: string;
  email: string;
  rawPassword: string;
}): Promise<CredentialDelivery> {
  const { phone, email, rawPassword } = opts;

  const message = [
    `🎉 *Bem-vindo ao Código Zero!*`,
    ``,
    `Sua conta foi criada com sucesso.`,
    ``,
    `📧 *Email:* ${email}`,
    `🔑 *Senha:* ${rawPassword}`,
    ``,
    `🔗 *Acesse:* ${env.FRONTEND_URL}/login`,
    ``,
    `Guarde essas informações em local seguro. 💬`,
  ].join('\n');

  // `phone` is already normalized by the caller (Lojou/Stripe webhooks carry
  // international numbers), so skip the MZ-specific normalization here.
  const r = await sendWhatsAppMessage({ phone, content: message, normalize: false });
  if (r.ok) {
    console.log(`[PAYMENT/CREDS] ✅ Delivered to ${phone} (status=${r.status})`);
    return { delivered: true, status: r.status };
  }

  console.error(`[PAYMENT/CREDS] 🚨 Failed to deliver credentials (lastStatus=${r.status})`);
  sendPushToSuperAdmins({
    title: '🚨 Entrega de acesso falhou',
    body: `${email} pagou mas não recebeu credenciais. Status: ${r.status}`,
    url: '/admin/users',
  }).catch(() => {});
  return { delivered: false, status: r.status };
}

/** Branded HTML for the access-credentials e-mail. */
function credentialsEmailHtml(opts: { name: string; email: string; password: string; loginUrl: string }): string {
  const first = (opts.name || '').split(' ')[0] || 'membro';
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#0b1413;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1413;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="background:#001412;padding:22px 28px;text-align:center;">
          <span style="color:#2DD4BF;font-size:20px;font-weight:800;letter-spacing:-0.02em;">Código Zero</span>
        </td></tr>
        <tr><td style="padding:30px 28px 6px;">
          <h1 style="margin:0 0 6px;font-size:22px;color:#0b1413;">Bem-vindo, ${first}! 🎉</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#475569;">Sua conta no <strong>Código Zero</strong> está pronta. Aqui estão os seus dados de acesso:</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;border-radius:12px;">
            <tr><td style="padding:14px 16px 6px;">
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">E-mail</div>
              <div style="font-size:16px;color:#0b1413;font-weight:600;word-break:break-all;">${opts.email}</div>
            </td></tr>
            <tr><td style="padding:6px 16px 14px;">
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Senha</div>
              <div style="font-size:18px;color:#0b1413;font-weight:700;font-family:ui-monospace,Menlo,monospace;">${opts.password}</div>
            </td></tr>
          </table>
          <a href="${opts.loginUrl}" style="display:block;margin:22px 0 4px;background:#2DD4BF;color:#001412;text-decoration:none;text-align:center;font-weight:700;font-size:16px;padding:14px;border-radius:10px;">Acessar o Código Zero &rarr;</a>
          <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#64748b;">Guarde esses dados em local seguro. Recomendamos fazer login e, no seu perfil, trocar a senha por uma de sua preferência.</p>
        </td></tr>
        <tr><td style="padding:18px 28px 26px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.5;">Código Zero — o ecossistema pra criar micronegócios de IA. Sem código, sem barreiras.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Deliver the access credentials (email + password + login link) by e-mail via
 * Resend. Mirrors sendCredentialsViaWhatsApp so the buyer gets their access on
 * BOTH channels. Best-effort: no-ops when Resend isn't configured.
 */
export async function sendCredentialsEmail(opts: {
  name: string;
  email: string;
  rawPassword: string;
  loginUrl?: string;
}): Promise<EmailSendResult> {
  const loginUrl = opts.loginUrl || `${env.FRONTEND_URL || 'https://app.czero.sbs'}/login`;
  const html = credentialsEmailHtml({ name: opts.name, email: opts.email, password: opts.rawPassword, loginUrl });
  const text = [
    `Bem-vindo ao Código Zero!`,
    ``,
    `Email: ${opts.email}`,
    `Senha: ${opts.rawPassword}`,
    ``,
    `Acesse: ${loginUrl}`,
    ``,
    `Guarde esses dados em local seguro.`,
  ].join('\n');
  return sendEmail({ to: opts.email, subject: '🎉 Seu acesso ao Código Zero', html, text });
}

/**
 * Push the "new sale" notification to every superadmin.
 * Format mirrors the Lojou webhook for consistency in the admin's feed.
 */
export async function notifyAdminOfSale(opts: {
  customerName: string;
  customerEmail: string;
  amount: number;
  currency: string;
  gateway: string;
  paymentMethod?: string;
  isCloseFriends?: boolean;
}): Promise<void> {
  const { customerName, customerEmail, amount, currency, gateway, paymentMethod, isCloseFriends } = opts;
  const cfTag = isCloseFriends ? ' ⭐CF' : '';
  await sendPushToSuperAdmins({
    title: `💰 Nova Venda${cfTag} (${gateway.toUpperCase()})`,
    body: `${customerName || customerEmail} pagou ${amount.toFixed(0)} ${currency}` +
      (paymentMethod ? ` via ${paymentMethod}` : ''),
    url: '/admin/finance',
  }).catch(() => {});
}

/**
 * Reconciliation helper: find a user that was granted access manually
 * before Stripe was wired (lojouOrderId like `MANUAL_STRIPE_*`) and
 * update it with real Stripe identifiers + transaction reference.
 *
 * Match priority: email (case-insensitive). We don't fall back to phone
 * here — Stripe customers are keyed by email and a phone collision
 * across countries is more likely to mis-attribute.
 *
 * Returns the matched user id or null.
 */
export async function reconcileManualStripe(opts: {
  email: string;
  stripeCustomerId: string;
  stripeSubscriptionId?: string;
}): Promise<string | null> {
  const email = opts.email.toLowerCase().trim();
  const existing = await prisma.user.findFirst({
    where: {
      email,
      lojouOrderId: { startsWith: 'MANUAL_STRIPE_' },
    },
  });
  if (!existing) return null;

  await prisma.user.update({
    where: { id: existing.id },
    data: {
      stripeCustomerId: opts.stripeCustomerId,
      stripeSubscriptionId: opts.stripeSubscriptionId ?? null,
      // Clear the placeholder so future reconciliation runs don't re-match
      lojouOrderId: null,
    },
  });
  console.log(`[PAYMENT/RECONCILE] ${email} → linked to Stripe customer ${opts.stripeCustomerId}`);
  return existing.id;
}
