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
import { sendWhatsAppMessage, type WhatsAppSendResult } from '../lib/whatsapp';
import { sendEmail, type EmailSendResult } from '../lib/email';
import { signAutoLoginToken } from '../lib/autoLoginToken';

const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

/**
 * Build a random password + bcrypt hash. 9 bytes → 12 chars base64url (~72
 * bits), sem caracteres ambíguos (base64url não tem 0/O/l confusos além do
 * aceitável). Antes eram 8 hex (~32 bits, "quebráveis offline" nas próprias
 * palavras do código).
 */
export async function generateUserPassword(): Promise<{ raw: string; hash: string }> {
  const raw = crypto.randomBytes(9).toString('base64url');
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
  /** Nome do produto comprado (ex.: "Curso COD do Zero"). Quando presente, a
   *  mensagem diz explicitamente O QUE foi desbloqueado — pedido do produto:
   *  quem compra um curso avulso não pode receber um "bem-vindo" genérico. */
  productName?: string;
  /** URL de acesso específica do produto (ex.: members.czero.sbs/{slug}). */
  accessUrl?: string;
}): Promise<CredentialDelivery> {
  const { phone, email, rawPassword } = opts;

  const accessUrl = opts.accessUrl || `${env.FRONTEND_URL}/login`;
  const message = [
    opts.productName ? `🎉 *Compra confirmada!*` : `🎉 *Bem-vindo ao Código Zero!*`,
    ``,
    ...(opts.productName ? [`📦 *Produto:* ${opts.productName}`, ``] : []),
    `Sua conta foi criada com sucesso.`,
    ``,
    `📧 *Email:* ${email}`,
    `🔑 *Senha:* ${rawPassword}`,
    ``,
    `🔗 *Acesse:* ${accessUrl}`,
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

/** HTML do e-mail de credenciais — clean, fundo claro (inspirado no da Kiwify).
 *  `buttonUrl` já entra logado (auto-login); `loginUrl` é o link simples de
 *  fallback mostrado como texto. */
function credentialsEmailHtml(opts: {
  name: string;
  email: string;
  password: string;
  loginUrl: string;
  buttonUrl: string;
  productName?: string;
}): string {
  const first = (opts.name || '').split(' ')[0] || '';
  const produto = opts.productName || 'Código Zero';
  const ola = first ? `Olá, ${first}, tudo bem?` : 'Olá, tudo bem?';
  return `<!doctype html>
<html lang="pt"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background:#eef2f1;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a2b27;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f1;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8e6;border-radius:16px;overflow:hidden;">
        <!-- Faixa de marca -->
        <tr><td style="background:#001412;padding:22px 30px;text-align:center;">
          <img src="https://app.czero.sbs/logo-mark.png" alt="Código Zero" width="40" height="40" style="display:inline-block;width:40px;height:40px;border-radius:11px;vertical-align:middle;border:0;" />
          <span style="display:inline-block;vertical-align:middle;margin-left:11px;font-size:18px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">Código Zero</span>
        </td></tr>

        <tr><td style="padding:32px 32px 8px;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3a4a46;">${ola}</p>
          <p style="margin:0 0 22px;font-size:16px;line-height:1.6;color:#1a2b27;">
            <strong>Sua compra foi confirmada!</strong> O seu acesso ao
            <strong>${produto}</strong> já está liberado. 🎉
          </p>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#3a4a46;">
            Para começar agora mesmo, toque no botão abaixo — ele já entra logado.
            Se preferir, use as credenciais mais abaixo em ${opts.loginUrl}.
          </p>

          <!-- Botão auto-login -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 22px;"><tr>
            <td align="center" style="background:#0FB89E;border-radius:11px;">
              <a href="${opts.buttonUrl}" style="display:inline-block;padding:15px 34px;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;">Acessar meu produto &rarr;</a>
            </td>
          </tr></table>

          <!-- Credenciais -->
          <div style="background:#f5f8f7;border:1px solid #e2e8e6;border-radius:12px;padding:16px 18px;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.07em;color:#7c8a86;font-weight:700;margin:0 0 4px;">🔒 Seus dados de acesso</div>
            <div style="margin-top:10px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#9aa7a3;font-weight:600;">E-mail</div>
            <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:15px;color:#1a2b27;word-break:break-all;">${opts.email}</div>
            <div style="margin-top:12px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#9aa7a3;font-weight:600;">Senha provisória</div>
            <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:17px;font-weight:700;color:#0a7c6c;word-break:break-all;">${opts.password}</div>
          </div>

          <p style="margin:18px 0 0;font-size:13.5px;line-height:1.6;color:#5a6b66;">
            Recomendamos <strong>trocar essa senha provisória</strong> no seu primeiro acesso, pelo seu perfil.
          </p>
          <p style="margin:14px 0 0;font-size:13.5px;line-height:1.6;color:#5a6b66;">
            💡 <strong>Dica:</strong> salve este e-mail nos favoritos para não perder o link e os dados de login.
          </p>
          <p style="margin:14px 0 4px;font-size:13.5px;line-height:1.6;color:#5a6b66;">
            Precisa de ajuda? É só responder a este e-mail.
          </p>
        </td></tr>

        <tr><td style="padding:22px 32px 28px;border-top:1px solid #eef2f1;">
          <p style="margin:0 0 4px;font-size:14px;color:#3a4a46;">Bom proveito! 🚀</p>
          <p style="margin:0;font-size:14px;font-weight:700;color:#1a2b27;">CZERO <span style="font-weight:400;color:#7c8a86;">by Ângelo Deixa</span></p>
        </td></tr>
      </table>
      <p style="max-width:520px;margin:14px auto 0;font-size:11.5px;color:#9aa7a3;text-align:center;line-height:1.5;">
        Você recebeu este e-mail porque comprou um produto do Código Zero.
      </p>
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
  /** Nome do produto comprado — entra no assunto e no corpo para o comprador
   *  saber exatamente o que desbloqueou (curso avulso vs assinatura). */
  productName?: string;
  /** userId → monta o link de auto-login do botão "Acessar meu produto"
   *  (já entra logado). Sem ele, o botão vira o login normal. */
  userId?: string;
}): Promise<EmailSendResult> {
  const base = env.FRONTEND_URL || 'https://app.czero.sbs';
  const loginUrl = opts.loginUrl || `${base}/login`;

  // Botão de auto-login: precisa do tokenVersion atual do usuário.
  let buttonUrl = loginUrl;
  if (opts.userId) {
    try {
      const u = await prisma.user.findUnique({ where: { id: opts.userId }, select: { tokenVersion: true } });
      if (u) buttonUrl = `${base}/login?al=${encodeURIComponent(signAutoLoginToken(opts.userId, u.tokenVersion))}`;
    } catch (e: any) {
      console.error('[PAYMENT/CREDS] auto-login link falhou (usando login normal):', e?.message || e);
    }
  }

  const html = credentialsEmailHtml({
    name: opts.name,
    email: opts.email,
    password: opts.rawPassword,
    loginUrl,
    buttonUrl,
    productName: opts.productName,
  });
  const produto = opts.productName || 'Código Zero';
  const text = [
    `Compra confirmada — seu acesso ao ${produto} está liberado.`,
    ``,
    `Acessar já logado: ${buttonUrl}`,
    ``,
    `Ou entre em ${loginUrl} com:`,
    `E-mail: ${opts.email}`,
    `Senha provisória: ${opts.rawPassword}`,
    ``,
    `Recomendamos trocar a senha no primeiro acesso.`,
    ``,
    `Bom proveito!`,
    `CZERO by Ângelo Deixa`,
  ].join('\n');
  const subject = `✅ Seu acesso ao ${produto} está liberado`;
  return sendEmail({ to: opts.email, subject, html, text });
}

/**
 * Confirmação de compra para quem JÁ TEM conta (não há senha nova a entregar):
 * diz o produto comprado e onde acessar, nos dois canais. Usada quando um
 * assinante/aluno existente compra um curso avulso.
 */
export async function sendPurchaseConfirmation(opts: {
  name: string;
  email: string;
  phone?: string | null;
  productName: string;
  accessUrl?: string;
}): Promise<void> {
  const accessUrl = opts.accessUrl || `${env.FRONTEND_URL || 'https://app.czero.sbs'}/login`;
  const first = (opts.name || '').split(' ')[0] || 'membro';

  const text = [
    `Compra confirmada: ${opts.productName}`,
    ``,
    `${first}, o acesso já está liberado na sua conta de sempre (${opts.email}).`,
    ``,
    `Acesse: ${accessUrl}`,
    ``,
    `Esqueceu a senha? Recupere em ${env.FRONTEND_URL || 'https://app.czero.sbs'}/resgate`,
  ].join('\n');
  void sendEmail({
    to: opts.email,
    subject: `✅ Compra confirmada: ${opts.productName}`,
    html: `<p>${text.replace(/\n/g, '<br>')}</p>`,
    text,
  }).catch(() => {});

  if (opts.phone) {
    const message = [
      `✅ *Compra confirmada: ${opts.productName}*`,
      ``,
      `${first}, o acesso já está liberado na sua conta de sempre.`,
      ``,
      `📧 *Email:* ${opts.email}`,
      `🔗 *Acesse:* ${accessUrl}`,
    ].join('\n');
    void sendWhatsAppMessage({ phone: opts.phone, content: message, normalize: false }).catch(() => {});
  }
}

/** Branded HTML for the password-reset e-mail (same look as the credentials e-mail). */
function passwordResetEmailHtml(opts: { name: string; resetUrl: string }): string {
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
          <h1 style="margin:0 0 8px;font-size:23px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">Redefinir senha</h1>
          <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#A1A1AA;">Olá, ${first}. Recebemos um pedido para redefinir a senha da sua conta no <strong style="color:#ffffff;">Código Zero</strong>. Toque no botão abaixo para criar uma nova senha:</p>
          <a href="${opts.resetUrl}" style="display:block;margin:8px 0 14px;background:#2DD4BF;color:#001412;text-decoration:none;text-align:center;font-weight:700;font-size:16px;padding:15px;border-radius:11px;">Criar nova senha &rarr;</a>
          <p style="margin:14px 0 6px;font-size:12px;color:#7b8a85;line-height:1.6;">Ou copie e cole este link no navegador:</p>
          <div style="background:#0c1c17;border:1px solid #213029;border-radius:10px;padding:12px 14px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;color:#cdd6d3;word-break:break-all;">${opts.resetUrl}</div>
          <p style="margin:18px 0 4px;font-size:13px;line-height:1.6;color:#7b8a85;">Este link expira em <strong style="color:#cdd6d3;">1 hora</strong> e só pode ser usado uma vez. Se você não pediu para redefinir a senha, ignore este e-mail — sua senha atual continua valendo.</p>
        </td></tr>
        <tr><td style="padding:24px 30px 28px;text-align:center;border-top:1px solid #11231e;">
          <img src="https://app.czero.sbs/logo-mark.png" alt="Código Zero" width="40" height="40" style="display:inline-block;width:40px;height:40px;border-radius:12px;border:0;" />
          <p style="margin:14px 0 8px;font-size:13px;line-height:1.5;color:#8a9994;">O ecossistema pra criar micronegócios de IA.<br>Sem código, sem barreiras.</p>
          <p style="margin:0;font-size:12px;color:#52605c;line-height:1.5;">Você recebeu este e-mail porque alguém solicitou a redefinição de senha da sua conta.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * E-mail a single-use password-reset link via Resend. Best-effort: no-ops when
 * Resend isn't configured (same contract as sendCredentialsEmail). The caller
 * builds the `resetUrl` with the raw token; we never log or persist it.
 */
export async function sendPasswordResetEmail(opts: {
  name: string;
  email: string;
  resetUrl: string;
}): Promise<EmailSendResult> {
  const html = passwordResetEmailHtml({ name: opts.name, resetUrl: opts.resetUrl });
  const text = [
    `Redefinir senha — Código Zero`,
    ``,
    `Recebemos um pedido para redefinir a senha da sua conta.`,
    `Abra o link abaixo para criar uma nova senha (expira em 1 hora, uso único):`,
    ``,
    opts.resetUrl,
    ``,
    `Se você não pediu isto, ignore este e-mail — sua senha atual continua valendo.`,
  ].join('\n');
  return sendEmail({ to: opts.email, subject: 'Redefinir sua senha — Código Zero', html, text });
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
 * Send the customer a WhatsApp "renovação confirmada" message.
 *
 * The renewal handlers otherwise only notify the ADMIN (notifyAdminOfSale) —
 * the buyer got nothing on a successful auto-renewal. Fire-and-forget; never
 * throws (sendWhatsAppMessage swallows errors and returns a result). Greets by
 * first name when we have it.
 */
export async function sendRenewalConfirmation(opts: {
  name?: string | null;
  phone: string;
  /** Passed through to sendWhatsAppMessage; default true (MZ normalization). */
  normalize?: boolean;
}): Promise<WhatsAppSendResult> {
  const first = (opts.name || '').trim().split(' ')[0];
  const greeting = first ? `Olá, ${first}! 👋` : 'Olá! 👋';
  const content = [
    greeting,
    ``,
    `Aqui é da equipe do *Código Zero*. Passando pra confirmar que a *renovação* da sua assinatura foi processada com sucesso ✅ — o seu acesso continua *ativo* por mais um mês.`,
    ``,
    `Qualquer dúvida, é só responder por aqui. Bons projetos! 🚀`,
  ].join('\n');
  return sendWhatsAppMessage({ phone: opts.phone, content, normalize: opts.normalize });
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
