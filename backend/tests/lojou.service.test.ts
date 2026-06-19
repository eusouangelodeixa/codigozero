/**
 * Unit test for src/services/lojou.service.ts — LojouService.extractDiscountId().
 *
 * Lojou has returned the created-coupon id under several different response
 * shapes over time; extractDiscountId is the static, pure normalizer that picks
 * whichever is present (discount.id → data.id → id → null) and stringifies it.
 * Getting this wrong means the admin can't later update/delete the coupon it
 * just created. Static method → no instance / network needed.
 */
import { describe, it, expect } from 'vitest';
import { LojouService } from '../src/services/lojou.service';

describe('LojouService.extractDiscountId', () => {
  it('reads the nested discount.id shape first', () => {
    expect(LojouService.extractDiscountId({ discount: { id: 42 }, data: { id: 99 } })).toBe('42');
  });

  it('falls back to data.id', () => {
    expect(LojouService.extractDiscountId({ data: { id: 99 } })).toBe('99');
  });

  it('falls back to a top-level id', () => {
    expect(LojouService.extractDiscountId({ id: 7 })).toBe('7');
  });

  it('stringifies numeric ids', () => {
    expect(LojouService.extractDiscountId({ id: 12345 })).toBe('12345');
    expect(typeof LojouService.extractDiscountId({ id: 12345 })).toBe('string');
  });

  it('returns null when no id is present in any shape', () => {
    expect(LojouService.extractDiscountId({})).toBeNull();
    expect(LojouService.extractDiscountId(null)).toBeNull();
    expect(LojouService.extractDiscountId({ discount: {} })).toBeNull();
  });
});
