/**
 * Unit tests for the Resend (Svix) webhook HMAC signature verification.
 *
 * The Resend webhook at POST /api/webhooks/resend verifies a Svix signature
 * before ingesting e-mail delivery events. The algorithm (in
 * `src/routes/webhook.routes.ts` → verifySvixSignature):
 *
 *   secretBytes = base64decode(secret without "whsec_" prefix)
 *   expected    = base64( HMAC_SHA256(secretBytes, `${id}.${ts}.${body}`) )
 *   accept if ANY space-separated `v1,<sig>` value equals `expected`
 *   (compared constant-time; length-checked first)
 *
 * NOTE — should be extracted for direct testing: verifySvixSignature is a
 * private (non-exported) function inside webhook.routes.ts, so we cannot import
 * the real implementation. These tests reconstruct the EXACT algorithm, prove
 * a correctly-signed payload is accepted and that tampering / wrong-secret /
 * malformed headers are rejected. Exporting verifySvixSignature (or moving it
 * to src/lib/svix.ts) would let these assertions run against the real code —
 * this is the only HMAC signature check in the codebase (Stripe delegates to
 * its SDK; Lojou uses a plain shared-secret equality, not HMAC).
 */
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

// Faithful reconstruction of webhook.routes.ts:verifySvixSignature.
function verifySvixSignature(
  secret: string,
  id: string,
  ts: string,
  body: string,
  sigHeader: string,
): boolean {
  try {
    const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const expected = crypto
      .createHmac('sha256', secretBytes)
      .update(`${id}.${ts}.${body}`)
      .digest('base64');
    const expectedBuf = Buffer.from(expected, 'base64');
    return sigHeader
      .split(' ')
      .map((s) => s.split(',')[1])
      .filter(Boolean)
      .some((s) => {
        try {
          const got = Buffer.from(s, 'base64');
          return got.length === expectedBuf.length && crypto.timingSafeEqual(got, expectedBuf);
        } catch {
          return false;
        }
      });
  } catch {
    return false;
  }
}

// Helper: produce the valid `v1,<sig>` header for a payload, the way Svix does.
function sign(secretNoPrefix: string, id: string, ts: string, body: string): string {
  const sig = crypto
    .createHmac('sha256', Buffer.from(secretNoPrefix, 'base64'))
    .update(`${id}.${ts}.${body}`)
    .digest('base64');
  return `v1,${sig}`;
}

const SECRET_RAW = Buffer.from('super-secret-signing-key-0123456789').toString('base64');
const SECRET = `whsec_${SECRET_RAW}`;
const ID = 'msg_2abc';
const TS = '1700000000';
const BODY = JSON.stringify({ type: 'email.delivered', data: { email_id: 'e1' } });

describe('verifySvixSignature (Resend webhook HMAC)', () => {
  it('accepts a correctly-signed payload', () => {
    const header = sign(SECRET_RAW, ID, TS, BODY);
    expect(verifySvixSignature(SECRET, ID, TS, BODY, header)).toBe(true);
  });

  it('accepts when the valid sig is one of several space-separated values', () => {
    const good = sign(SECRET_RAW, ID, TS, BODY);
    const header = `v1,AAAA v1,${good.split(',')[1]}`;
    expect(verifySvixSignature(SECRET, ID, TS, BODY, header)).toBe(true);
  });

  it('rejects a tampered body (signature no longer matches)', () => {
    const header = sign(SECRET_RAW, ID, TS, BODY);
    const tamperedBody = BODY.replace('delivered', 'bounced');
    expect(verifySvixSignature(SECRET, ID, TS, tamperedBody, header)).toBe(false);
  });

  it('rejects a tampered timestamp', () => {
    const header = sign(SECRET_RAW, ID, TS, BODY);
    expect(verifySvixSignature(SECRET, ID, '9999999999', BODY, header)).toBe(false);
  });

  it('rejects a signature made with a different secret', () => {
    const otherRaw = Buffer.from('a-totally-different-key').toString('base64');
    const header = sign(otherRaw, ID, TS, BODY);
    expect(verifySvixSignature(SECRET, ID, TS, BODY, header)).toBe(false);
  });

  it('rejects an empty / malformed signature header', () => {
    expect(verifySvixSignature(SECRET, ID, TS, BODY, '')).toBe(false);
    expect(verifySvixSignature(SECRET, ID, TS, BODY, 'garbage-without-comma')).toBe(false);
    expect(verifySvixSignature(SECRET, ID, TS, BODY, 'v1,not-valid-base64-@@@')).toBe(false);
  });
});
