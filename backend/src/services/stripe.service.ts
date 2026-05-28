/**
 * Stripe integration service.
 *
 * Scope: international card payments for non-MZ leads. The Mozambican
 * flow stays on Lojou (M-Pesa). A lead with any country code other than
 * +258 on the landing form gets redirected to `env.STRIPE_CHECKOUT_URL`
 * (a hosted Stripe Payment Link). When that link is paid, the Stripe
 * webhook hits `/api/webhooks/stripe` and this service handles the
 * verification + event parsing — the route file does the side effects
 * (user upsert, credentials, push, etc.).
 *
 * We deliberately do NOT use Stripe Connect for coproducer splits — the
 * coproducer split is computed internally (computeFees) and paid out
 * manually. That keeps the integration thin and avoids per-coproducer
 * KYC/onboarding.
 */
import Stripe from 'stripe';
import { env } from '../config/env';

let _stripe: Stripe | null = null;

/**
 * Lazy-init the Stripe client so the backend boots even when the keys
 * are unset (e.g. on a dev machine that hasn't configured Stripe yet).
 * Throws on first use if no key is present — the webhook + checkout
 * helpers check `isStripeConfigured()` before calling.
 */
export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY not configured');
  }
  _stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-04-10',
  });
  return _stripe;
}

export function isStripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
}

/**
 * Verify a webhook payload against the Stripe-Signature header.
 *
 * `rawBody` MUST be the raw bytes Stripe sent — Express's `json()` parser
 * mutates the payload and breaks signature checks. The webhook route is
 * mounted with `express.raw({ type: '*\\/*' })` precisely so we receive
 * the unparsed body here.
 *
 * Returns the parsed Stripe.Event on success. Throws on bad signature
 * or missing config (caller maps the throw → 400/401 response).
 */
export function verifyStripeWebhook(rawBody: Buffer | string, signature: string): Stripe.Event {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET not configured');
  }
  return getStripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
}

/**
 * Fetch the full Customer object (with email, name, phone, metadata).
 * Used by the webhook when the event payload doesn't carry the data
 * we need to identify or contact the buyer.
 */
export async function retrieveCustomer(customerId: string): Promise<Stripe.Customer | null> {
  try {
    const c = await getStripe().customers.retrieve(customerId);
    if (c.deleted) return null;
    return c as Stripe.Customer;
  } catch (e: any) {
    console.warn('[STRIPE] retrieveCustomer failed:', e?.message || e);
    return null;
  }
}
