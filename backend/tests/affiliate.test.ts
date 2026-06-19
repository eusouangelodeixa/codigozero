/**
 * Unit tests for src/services/affiliate.service.ts pure money helpers.
 *
 * quoteCommission / quoteWithdrawal are the public arithmetic the affiliate
 * dashboard shows and the webhook uses to credit commissions. They are pure;
 * the module constructs a PrismaClient at import, but that connects lazily so
 * importing it for these pure calls is safe.
 */
import { describe, it, expect } from 'vitest';
import {
  quoteCommission,
  quoteWithdrawal,
  AFFILIATE_RULES,
} from '../src/services/affiliate.service';

describe('affiliate quoteCommission', () => {
  it('uses the default 497 sale price when no amount is passed', () => {
    // gross = 497*0.60 = 298.2 ; fee = 497*0.10 + 10 = 59.7 ; net = 238.5
    const q = quoteCommission();
    expect(q.saleAmount).toBe(AFFILIATE_RULES.salePrice);
    expect(q.grossAmount).toBe(298.2);
    expect(q.feeAmount).toBe(59.7);
    expect(q.netAmount).toBe(238.5);
  });

  it('computes 60% gross minus the 10% + 10 platform fee for an explicit amount', () => {
    // amount 1000 → gross 600, fee 110, net 490
    const q = quoteCommission(1000);
    expect(q.grossAmount).toBe(600);
    expect(q.feeAmount).toBe(110);
    expect(q.netAmount).toBe(490);
  });

  it('never returns a negative net commission for a tiny sale', () => {
    // amount 10 → gross 6, fee = 1 + 10 = 11 → net clamped to 0
    const q = quoteCommission(10);
    expect(q.netAmount).toBe(0);
  });
});

describe('affiliate quoteWithdrawal', () => {
  it('charges 3% + 45 MZN on the requested amount', () => {
    // 1000 → fee = 30 + 45 = 75 ; net = 925
    const q = quoteWithdrawal(1000);
    expect(q.amountRequested).toBe(1000);
    expect(q.feeAmount).toBe(75);
    expect(q.amountNet).toBe(925);
  });

  it('uses the affiliate-specific fixed fee (45), distinct from partners (35)', () => {
    expect(AFFILIATE_RULES.withdrawalFixed).toBe(45);
    expect(AFFILIATE_RULES.withdrawalPercent).toBe(0.03);
  });
});
