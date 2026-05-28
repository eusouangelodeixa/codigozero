/**
 * Compute the gross + fee breakdown of a paid order.
 *
 * The webhook gives us the NET (already after Lojou fee + coproducer
 * split). Reconstructing the rest lets the admin see the full picture
 * — "you grossed X, Lojou kept Y, coproducer got Z, you netted W" —
 * without parsing payload metadata every time.
 *
 * Lojou's documented platform fee is `10% × gross + 10 MZN per item`.
 * Coproducer split is applied to the principal product only (the
 * order bump pays full to the seller). When there's no coproducer,
 * coproducerFee is 0.
 *
 * All numbers are rounded to 2 decimals for storage; the underlying
 * cents are still off by ≤1 MZN from what Lojou ultimately settled,
 * but consistent across reports.
 */

const LOJOU_PERCENT = 0.10;
const LOJOU_FIXED_PER_ITEM = 10;

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface FeesInput {
  /** Principal product gross price (from `data.product.price`). */
  principalPrice: number;
  /** Bump gross price when the buyer took the bump, else 0. */
  bumpPrice: number;
  /** Coproducer's share of the principal (0-100). NULL/0 when none. */
  coproducerSharePct?: number | null;
}

export interface FeesResult {
  grossAmount: number;
  lojouFee: number;
  coproducerFee: number;
  /** Net the seller actually receives. Useful as a sanity check vs
   *  the `amount` Lojou reported on the webhook. */
  netAmount: number;
}

export function computeFees(input: FeesInput): FeesResult {
  const principal = Math.max(0, input.principalPrice || 0);
  const bump = Math.max(0, input.bumpPrice || 0);
  const grossAmount = principal + bump;

  const numItems = (principal > 0 ? 1 : 0) + (bump > 0 ? 1 : 0);
  const lojouFee = grossAmount * LOJOU_PERCENT + numItems * LOJOU_FIXED_PER_ITEM;

  const coproducerSharePct = input.coproducerSharePct ?? 0;
  // Coproducer split only on the principal (consistent with the
  // Anderson math we validated earlier).
  const coproducerFee = principal * (coproducerSharePct / 100);

  const netAmount = grossAmount - lojouFee - coproducerFee;

  return {
    grossAmount: round2(grossAmount),
    lojouFee: round2(lojouFee),
    coproducerFee: round2(coproducerFee),
    netAmount: round2(netAmount),
  };
}
