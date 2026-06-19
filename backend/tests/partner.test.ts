/**
 * Unit tests for src/services/partner.service.ts pure money helpers.
 *
 * computePartnerBase is the NET pool that gets split among the sócios for one
 * order; quoteWithdrawal is the saque fee math. Both are pure. (The module
 * constructs a PrismaClient and imports cost.service, which also constructs one,
 * but neither connects at import time, so importing for these pure calls is safe.)
 */
import { describe, it, expect } from 'vitest';
import {
  computePartnerBase,
  quoteWithdrawal,
  PARTNER_RULES,
} from '../src/services/partner.service';

describe('computePartnerBase', () => {
  it('subtracts the Lojou fee (10% + 10/item) for a single-item order', () => {
    // 497 → lojouFee = 49.7 + 10 = 59.7 → base 437.3
    expect(computePartnerBase({ amount: 497, numItems: 1 })).toBe(437.3);
  });

  it('charges the per-item fixed fee for each item when numItems is given', () => {
    // 1794, 2 items → lojouFee = 179.4 + 20 = 199.4 → base 1594.6
    expect(computePartnerBase({ amount: 1794, numItems: 2 })).toBe(1594.6);
  });

  it('falls back to 2 items when isCloseFriends is true and numItems is omitted', () => {
    // 497, CF → numItems 2 → lojouFee = 49.7 + 20 = 69.7 → base 427.3
    expect(computePartnerBase({ amount: 497, isCloseFriends: true })).toBe(427.3);
    // ...and 1 item otherwise
    expect(computePartnerBase({ amount: 497 })).toBe(437.3);
  });

  it('treats numItems as at least 1 even if 0 is passed', () => {
    // numItems clamped to 1 → lojouFee = 49.7 + 10 = 59.7
    expect(computePartnerBase({ amount: 497, numItems: 0 })).toBe(437.3);
  });

  it('returns 0 for a non-positive amount', () => {
    expect(computePartnerBase({ amount: 0 })).toBe(0);
    expect(computePartnerBase({ amount: -50 })).toBe(0);
  });
});

describe('partner quoteWithdrawal', () => {
  it('charges 3% + 35 MZN on the requested amount', () => {
    // 1000 → fee = 30 + 35 = 65 → net 935
    const q = quoteWithdrawal(1000);
    expect(q.amountRequested).toBe(1000);
    expect(q.feeAmount).toBe(65);
    expect(q.amountNet).toBe(935);
  });

  it('uses the partner-specific fixed fee (35), distinct from affiliates (45)', () => {
    expect(PARTNER_RULES.withdrawalFixed).toBe(35);
    expect(PARTNER_RULES.minWithdrawal).toBe(1000);
  });
});
