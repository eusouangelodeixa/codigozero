/**
 * Unit tests for the core money rule used by the Lojou webhook:
 *
 *     totalAmount   = data.amount   (NEVER data.product.price — it's stale)
 *     principal     = bump > 0 ? max(0, total - bump) : total
 *
 * This is the rule recorded in MEMORY (lojou-product-price-stale): data.product.price
 * carries the old plan LIST price (e.g. 797 long after the plan moved to 497) and
 * ignores coupons, so trusting it polluted faturamento bruto + affiliate commissions
 * with phantom values. The principal split drives affiliate/partner commission bases.
 *
 * NOTE — should be extracted for direct testing: this arithmetic currently lives
 * INLINE inside `src/routes/webhook.routes.ts` (the `order.approved` case:
 * `totalAmount = parseFloat(... data.amount || data.total || data.product?.price ...)`
 * and `principalAmount = bumpAmount > 0 ? Math.max(0, totalAmount - bumpAmount) : totalAmount`).
 * It is not exported, so these tests reconstruct the EXACT same expressions and assert
 * the behavior. Extracting it into a pure helper (e.g. lib/orderMath.ts
 * `resolveOrderAmounts(data, bumpAmount)`) would let us import and test the real code.
 */
import { describe, it, expect } from 'vitest';

/**
 * Faithful reconstruction of the webhook's total-amount precedence.
 * Mirrors webhook.routes.ts order.approved: data.amount || data.total ||
 * data.product?.price || <active price fallback>. We pass the fallback in so the
 * test stays pure (the real code awaits getActivePrice()).
 */
function resolveTotalAmount(data: any, activePriceFallback: number): number {
  return parseFloat(
    String(data.amount || data.total || data.product?.price || activePriceFallback),
  );
}

/** Faithful reconstruction of the principal split. */
function resolvePrincipal(totalAmount: number, bumpAmount: number): number {
  return bumpAmount > 0 ? Math.max(0, totalAmount - bumpAmount) : totalAmount;
}

describe('webhook money math — total amount precedence', () => {
  it('uses data.amount when present, ignoring the stale data.product.price', () => {
    // The classic bug: product.price = 797 (stale list price), real charge = 497.
    const data = { amount: 497, product: { price: 797 } };
    expect(resolveTotalAmount(data, 497)).toBe(497);
  });

  it('reflects a coupon-discounted charge (data.amount already net of coupon)', () => {
    const data = { amount: 397, product: { price: 797 } };
    expect(resolveTotalAmount(data, 497)).toBe(397);
  });

  it('falls back to data.total when amount is absent', () => {
    expect(resolveTotalAmount({ total: 597, product: { price: 797 } }, 497)).toBe(597);
  });

  it('only falls back to product.price when neither amount nor total exist', () => {
    expect(resolveTotalAmount({ product: { price: 797 } }, 497)).toBe(797);
  });

  it('falls back to the active price when the payload carries no money fields', () => {
    expect(resolveTotalAmount({ product: { name: 'CZ' } }, 497)).toBe(497);
  });
});

describe('webhook money math — principal = total - bump', () => {
  it('subtracts the bump from the total to get the principal', () => {
    // total 1794 (497 + 1297 CF bump) → principal 497
    expect(resolvePrincipal(1794, 1297)).toBe(497);
  });

  it('returns the full total as principal when there is no bump', () => {
    expect(resolvePrincipal(497, 0)).toBe(497);
  });

  it('never goes negative if the bump somehow exceeds the total', () => {
    expect(resolvePrincipal(1000, 1297)).toBe(0);
  });

  it('end-to-end: stale 797 is never used for the affiliate/partner base', () => {
    // Buyer took the CF bump. amount=1794 is the truth; product.price=797 is stale.
    const data = { amount: 1794, product: { price: 797 } };
    const total = resolveTotalAmount(data, 497);
    const principal = resolvePrincipal(total, 1297);
    expect(total).toBe(1794);
    expect(principal).toBe(497); // commission base — NOT 797, NOT 1794
  });
});
