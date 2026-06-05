import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_PRICE = 497;
const CACHE_TTL_MS = 30_000;

let cache: { value: number; expiresAt: number } | null = null;

/**
 * Reads the active subscription price from LandingConfig.priceAmount.
 * Cached for 30s to avoid hitting the DB on every checkout/cron tick.
 * Falls back to 497 only when the singleton row is missing.
 */
export async function getActivePrice(): Promise<number> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  try {
    const cfg = await prisma.landingConfig.findUnique({ where: { id: 'singleton' } });
    const value = cfg?.priceAmount ?? DEFAULT_PRICE;
    cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    // DB hiccup — return last cached or default, do NOT poison the cache.
    return cache?.value ?? DEFAULT_PRICE;
  }
}

/** Call after writing LandingConfig.priceAmount so the next read sees the new value. */
export function invalidatePriceCache(): void {
  cache = null;
}
