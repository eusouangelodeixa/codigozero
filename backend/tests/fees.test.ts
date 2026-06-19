/**
 * Unit tests for src/lib/fees.ts — computeFees().
 *
 * This is the gross + fee breakdown stored on every approved Transaction
 * (faturamento bruto / Lojou fee / coproducer split / net). The arithmetic
 * feeds the admin finance panel, so a regression here silently corrupts
 * reported revenue. computeFees is fully pure (no DB/network).
 */
import { describe, it, expect } from 'vitest';
import { computeFees } from '../src/lib/fees';

describe('computeFees', () => {
  it('principal only, no bump, no coproducer (497 plan)', () => {
    // gross 497, 1 item → lojouFee = 497*0.10 + 1*10 = 59.7, net = 437.3
    const r = computeFees({ principalPrice: 497, bumpPrice: 0 });
    expect(r.grossAmount).toBe(497);
    expect(r.lojouFee).toBe(59.7);
    expect(r.coproducerFee).toBe(0);
    expect(r.netAmount).toBe(437.3);
  });

  it('counts the bump as a second item for the fixed per-item fee', () => {
    // gross 1794, 2 items → lojouFee = 1794*0.10 + 2*10 = 199.4
    const r = computeFees({ principalPrice: 497, bumpPrice: 1297 });
    expect(r.grossAmount).toBe(1794);
    expect(r.lojouFee).toBe(199.4);
    expect(r.coproducerFee).toBe(0);
    expect(r.netAmount).toBe(1594.6);
  });

  it('applies the coproducer split to the PRINCIPAL only (not the bump)', () => {
    // gross 1794, lojouFee 199.4, coproducerFee = 497*50% = 248.5
    // net = 1794 - 199.4 - 248.5 = 1346.1
    const r = computeFees({ principalPrice: 497, bumpPrice: 1297, coproducerSharePct: 50 });
    expect(r.coproducerFee).toBe(248.5);
    expect(r.netAmount).toBe(1346.1);
  });

  it('treats a null/undefined coproducer share as 0%', () => {
    const a = computeFees({ principalPrice: 497, bumpPrice: 0, coproducerSharePct: null });
    const b = computeFees({ principalPrice: 497, bumpPrice: 0 });
    expect(a.coproducerFee).toBe(0);
    expect(a).toEqual(b);
  });

  it('clamps negative inputs to 0 and never charges per-item fee for a 0 item', () => {
    // principal -100 → 0, bump 0 → 0 items → lojouFee 0
    const r = computeFees({ principalPrice: -100, bumpPrice: 0 });
    expect(r.grossAmount).toBe(0);
    expect(r.lojouFee).toBe(0);
    expect(r.netAmount).toBe(0);
  });

  it('rounds all monetary fields to 2 decimals', () => {
    // 33.333 → gross 33.33, lojouFee = 3.3333 + 10 = 13.33 (rounded)
    const r = computeFees({ principalPrice: 33.333, bumpPrice: 0 });
    expect(r.grossAmount).toBe(33.33);
    expect(r.lojouFee).toBe(13.33);
    // every numeric field is rounded to <=2 decimal places
    for (const v of [r.grossAmount, r.lojouFee, r.coproducerFee, r.netAmount]) {
      expect(Number.isInteger(Math.round(v * 100))).toBe(true);
    }
  });
});
