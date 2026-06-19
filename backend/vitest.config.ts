import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the Código Zero backend.
 *
 * Why Vitest (vs jest + ts-ts): it runs TypeScript out of the box via esbuild
 * with NO extra transform/preset wiring and no edits to tsconfig.json — which
 * matters here because other agents are editing source files in parallel and we
 * must not touch shared config. It's also fast and has a Jest-compatible API.
 *
 * Scope: these are UNIT tests for PURE logic only. They never open a DB
 * connection or hit the network. Modules under test do `new PrismaClient()` at
 * import time, but Prisma connects lazily (on first query), so importing them is
 * safe as long as the tests only call pure functions.
 */
export default defineConfig({
  test: {
    // Use describe/it/expect without importing them in every file.
    globals: true,
    environment: 'node',
    // Only pick up our dedicated test folder; don't accidentally try to run
    // ad-hoc scripts like src/test-scraper.ts or backend/test-lojou.ts.
    include: ['tests/**/*.test.ts'],
    // Pure unit tests — keep them snappy and fail fast on a hang.
    testTimeout: 10_000,
  },
});
