/**
 * Unit tests for src/lib/orderBump.ts — detectOrderBump().
 *
 * Detecting the Close Friends order bump in a Lojou webhook payload decides
 * whether a buyer gets +2 months and the closeFriends flag, and how the
 * principal/bump amounts are split. The function searches many plausible
 * payload shapes, so these tests lock in the documented `order_bump[]` shape,
 * the single-object fallbacks, the deep search, and the price precedence
 * (amount > price > ...). Fully pure (no DB/network).
 */
import { describe, it, expect } from 'vitest';
import { detectOrderBump } from '../src/lib/orderBump';

const BUMP_PID = 'JQQWc';

describe('detectOrderBump', () => {
  it('returns null when the payload is empty / has no pid', () => {
    expect(detectOrderBump(null, BUMP_PID)).toBeNull();
    expect(detectOrderBump({}, BUMP_PID)).toBeNull();
    expect(detectOrderBump({ order_bump: [] }, BUMP_PID)).toBeNull();
    expect(detectOrderBump({ order_bump: [{ pid: 'OTHER' }] }, BUMP_PID)).toBeNull();
  });

  it('returns null when pid argument is falsy', () => {
    expect(detectOrderBump({ order_bump: [{ pid: BUMP_PID, amount: 100 }] }, '')).toBeNull();
  });

  it('finds the bump in the documented order_bump[] array and reports the path', () => {
    const hit = detectOrderBump(
      { order_bump: [{ product_pid: BUMP_PID, name: 'CF', price: 1297 }] },
      BUMP_PID,
    );
    expect(hit).not.toBeNull();
    expect(hit!.pid).toBe(BUMP_PID);
    expect(hit!.amount).toBe(1297);
    expect(hit!.matchedAt).toBe('order_bump[0]');
  });

  it('prefers `amount` over `price` when both are present (Lojou price can be stale)', () => {
    const hit = detectOrderBump(
      { order_bump: [{ pid: BUMP_PID, amount: 1000, price: 1297 }] },
      BUMP_PID,
    );
    expect(hit!.amount).toBe(1000);
  });

  it('matches items keyed by the nested product.pid', () => {
    const hit = detectOrderBump(
      { items: [{ product: { pid: BUMP_PID, price: 1297 } }] },
      BUMP_PID,
    );
    expect(hit).not.toBeNull();
    expect(hit!.matchedAt).toBe('items[0]');
    // amount comes from the nested product when the item itself has no price
    expect(hit!.amount).toBe(1297);
  });

  it('supports single-object bump shapes (older gateways)', () => {
    const hit = detectOrderBump({ bump: { pid: BUMP_PID, price: 1297 } }, BUMP_PID);
    expect(hit).not.toBeNull();
    expect(hit!.matchedAt).toBe('bump');
    expect(hit!.amount).toBe(1297);
  });

  it('deep-searches a nested payload when no known shape matches', () => {
    const hit = detectOrderBump(
      { data: { extra: { upsell_product: { product_pid: BUMP_PID, amount: 1297 } } } },
      BUMP_PID,
    );
    expect(hit).not.toBeNull();
    expect(hit!.pid).toBe(BUMP_PID);
    expect(hit!.amount).toBe(1297);
  });

  it('does NOT match a different pid hidden in the payload', () => {
    const hit = detectOrderBump(
      { order_bump: [{ pid: 'SOMETHING_ELSE', amount: 1297 }], product: { pid: 'uoEHz' } },
      BUMP_PID,
    );
    expect(hit).toBeNull();
  });
});
