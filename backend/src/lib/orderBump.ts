/**
 * Order bump detection for Lojou webhook payloads.
 *
 * We don't have an official schema for how Lojou shapes order-bump payloads,
 * and historical events only included a single `product` object. So this
 * helper checks every plausible location for the bump pid and returns the
 * first hit. When a real bump payload arrives in production, the matched
 * field will be logged so the search can be narrowed down later.
 */

export interface BumpMatch {
  pid: string;
  amount: number;
  matchedAt: string; // path in payload where we found it (for debugging)
}

/** Coerce a value to a positive number, returning 0 when invalid. */
function num(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Best-effort price extraction from a Lojou product-ish object. */
function priceOf(obj: any): number {
  if (!obj || typeof obj !== 'object') return 0;
  return (
    num(obj.amount) ||
    num(obj.price) ||
    num(obj.total) ||
    num(obj.unit_price) ||
    num(obj.subtotal) ||
    0
  );
}

/** Walk an array of items and return the one whose product_pid matches `pid`. */
function findInArray(arr: any, pid: string, path: string): BumpMatch | null {
  if (!Array.isArray(arr)) return null;
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!item) continue;
    const itemPid =
      item.product_pid ||
      item.pid ||
      item.product?.product_pid ||
      item.product?.pid;
    if (itemPid === pid) {
      return {
        pid,
        amount: priceOf(item) || priceOf(item.product),
        matchedAt: `${path}[${i}]`,
      };
    }
  }
  return null;
}

/**
 * Search a Lojou webhook payload for a specific bump product pid.
 *
 * Returns null when not present (the buyer didn't take the bump).
 */
export function detectOrderBump(payload: any, pid: string): BumpMatch | null {
  if (!payload || typeof payload !== 'object' || !pid) return null;

  // ── 1. Arrays — Lojou sends `order_bump: []` empty or filled with items.
  // Each item follows the same shape as `data.product`: { pid, name, price }.
  const arrayPaths: Array<[any, string]> = [
    [payload.order_bump, 'order_bump'],       // confirmed shape from Lojou
    [payload.order_bumps, 'order_bumps'],
    [payload.bumps, 'bumps'],
    [payload.items, 'items'],
    [payload.products, 'products'],
    [payload.order_items, 'order_items'],
    [payload.line_items, 'line_items'],
    [payload.upsells, 'upsells'],
    [payload.addons, 'addons'],
    [payload.additional_products, 'additional_products'],
  ];
  for (const [arr, path] of arrayPaths) {
    const hit = findInArray(arr, pid, path);
    if (hit) return hit;
  }

  // ── 2. Defensive: single-object shapes from older/other gateway versions
  const singleShapes: Array<[any, string]> = [
    [payload.bump, 'bump'],
    [payload.upsell, 'upsell'],
    [payload.addon, 'addon'],
  ];
  for (const [obj, path] of singleShapes) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue;
    const candidatePid =
      obj.product_pid || obj.pid || obj.product?.product_pid || obj.product?.pid;
    if (candidatePid === pid) {
      return { pid, amount: priceOf(obj) || priceOf(obj.product), matchedAt: path };
    }
  }

  // ── 3. Last resort: deep-search the object for the pid string ─────────
  // Capped depth so we don't walk a pathological payload.
  function deep(obj: any, depth: number, path: string): BumpMatch | null {
    if (depth > 4 || !obj || typeof obj !== 'object') return null;
    for (const key of Object.keys(obj)) {
      const val = (obj as any)[key];
      const here = path ? `${path}.${key}` : key;
      if (val === pid) {
        // Found the pid literal — assume the parent is the bump container.
        const amount = priceOf(obj) || priceOf(obj.product);
        return { pid, amount, matchedAt: here };
      }
      if (Array.isArray(val)) {
        const hit = findInArray(val, pid, here);
        if (hit) return hit;
        for (let i = 0; i < val.length; i++) {
          const inner = deep(val[i], depth + 1, `${here}[${i}]`);
          if (inner) return inner;
        }
      } else if (typeof val === 'object' && val !== null) {
        const inner = deep(val, depth + 1, here);
        if (inner) return inner;
      }
    }
    return null;
  }
  return deep(payload, 0, '');
}
