import dotenv from 'dotenv';
dotenv.config();

// Insecure dev fallback for JWT_SECRET. Fine for local dev, but it must NEVER
// be the active secret in production (tokens could be forged), so we fail fast
// at startup below if it is.
const INSECURE_JWT_SECRET = 'codigo-zero-secret-change-me';

// Fail fast in production if the JWT secret is missing or still the placeholder.
// Doing this at module load means the process refuses to boot misconfigured
// rather than silently signing tokens an attacker could forge.
if (process.env.NODE_ENV === 'production') {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === INSECURE_JWT_SECRET) {
    throw new Error(
      '[env] JWT_SECRET must be set to a strong, unique value in production (the insecure default is not allowed). Set JWT_SECRET in the environment.',
    );
  }
}

export const env = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  DATABASE_URL: process.env.DATABASE_URL || '',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  JWT_SECRET: process.env.JWT_SECRET || INSECURE_JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  LOJOU_API_KEY: process.env.LOJOU_API_KEY || '',
  LOJOU_API_URL: process.env.LOJOU_API_URL || 'https://api.lojou.app',
  LOJOU_WEBHOOK_SECRET: process.env.LOJOU_WEBHOOK_SECRET || '',
  LOJOU_PLAN_ID: process.env.LOJOU_PLAN_ID || 'tbo8f',
  LOJOU_PRODUCT_PID: process.env.LOJOU_PRODUCT_PID || 'uoEHz',
  // Numeric product id from Lojou — used to scope coupons via discount.product_ids.
  // Left empty by default so coupons created in admin are unrestricted.
  LOJOU_PRODUCT_ID: process.env.LOJOU_PRODUCT_ID || '',
  // Close Friends order bump product — when this pid is detected in a webhook
  // payload alongside the main product, the buyer gets +2 months (3 total) and
  // the closeFriends flag set on their account.
  LOJOU_CLOSE_FRIENDS_PID: process.env.LOJOU_CLOSE_FRIENDS_PID || 'JQQWc',
  // Secondary order bump (197 MZN upsell). Detected only to count items
  // exactly for the Lojou fee (10% + 10/item) in the partner revenue-share
  // base. The bump value is already inside data.amount, so it is split among
  // the sócios regardless. Set the real pid in .env. Does NOT extend access.
  LOJOU_BUMP_197_PID: process.env.LOJOU_BUMP_197_PID || 'MWZhQ', // "Cartão Virtual" — 197 MZN
  LOJOU_BUMP_197_PRICE: parseFloat(process.env.LOJOU_BUMP_197_PRICE || '197'),
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  NODE_ENV: process.env.NODE_ENV || 'development',
  // ── Resend (e-mail delivery of access credentials) ────────────────────
  // RESEND_FROM must use a domain verified in the Resend dashboard, e.g.
  // 'Código Zero <acesso@czero.sbs>'. Empty → e-mail sending is a silent no-op.
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  RESEND_FROM: process.env.RESEND_FROM || 'Código Zero <acesso@czero.sbs>',
  // Svix signing secret (whsec_…) for the Resend webhook. Configured in /admin/config.
  RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET || '',
  // Limite DIÁRIO de buscas do Radar. O contador soma por CIDADE (cada busca
  // aceita até 5 cidades), então 50 = ~10 buscas multi-cidade/dia.
  MAX_DAILY_SEARCHES: parseInt(process.env.MAX_DAILY_SEARCHES || '50', 10),
  KOMUNIKA_API_URL: process.env.KOMUNIKA_API_URL || 'https://api.komunika.site',
  KOMUNIKA_ADMIN_API_KEY: process.env.KOMUNIKA_ADMIN_API_KEY || '',
  KOMUNIKA_SDR_VISITOR_ASSISTANT_ID: process.env.KOMUNIKA_SDR_VISITOR_ASSISTANT_ID || '', // SDR outbound agent — visitantes (landing abandonada)
  KOMUNIKA_SDR_CHECKOUT_ASSISTANT_ID: process.env.KOMUNIKA_SDR_CHECKOUT_ASSISTANT_ID || '', // SDR outbound agent — checkout abandonado
  // ── Komunika EMBEDDED MODULE (provision + SSO) ────────────────────
  // Distinct from the funnel/remarketing keys above. Komunika is bundled
  // FREE with the CZ subscription: every paying member is provisioned a
  // tenant on order.approved (no separate add-on/pid) and can open it via
  // an SSO magic-link. Both secrets are 64-byte hex (openssl rand -hex 64)
  // and MUST match CODIGO_ZERO_HMAC_SECRET / CODIGO_ZERO_JWT_SECRET on the
  // Komunika side. Never sent to the browser.
  KOMUNIKA_HMAC_SECRET: process.env.KOMUNIKA_HMAC_SECRET || '',
  KOMUNIKA_SSO_JWT_SECRET: process.env.KOMUNIKA_SSO_JWT_SECRET || '',
  // ── Stripe (international card payments — non-MZ leads) ────────────
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
  // The Código Zero price id(s) on Stripe — comma-separated if more than one.
  // The Stripe account is SHARED across many products/Payment Links, so the
  // webhook MUST verify each checkout is ours before recording a member/sale.
  STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID || '',
  // The Código Zero product id(s) — comma-separated. Broader net than the
  // price id (covers coupons/extra prices under the same product).
  STRIPE_PRODUCT_ID: process.env.STRIPE_PRODUCT_ID || '',
  // The hosted Stripe checkout link used when a non-MZ lead submits the
  // landing form. This is a static link generated in the Stripe dashboard
  // (e.g. https://buy.stripe.com/...). The webhook still uses the
  // PRICE_ID + SECRET_KEY to verify and reconcile incoming payments.
  STRIPE_CHECKOUT_URL: process.env.STRIPE_CHECKOUT_URL || '',
};
