/**
 * Unit tests for the auth-token contract.
 *
 * The app signs login tokens in `src/routes/auth.routes.ts`:
 *     jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: '7d' })
 * and verifies them in `src/middlewares/auth.middleware.ts`:
 *     jwt.verify(token, env.JWT_SECRET) as { userId: string }
 *
 * These tests lock in that contract using the SAME jsonwebtoken calls and
 * options, asserting: the round-trip payload shape, expiry enforcement, and
 * rejection of a token signed with the wrong secret or a tampered body.
 *
 * NOTE — should be extracted for direct testing: token signing/verifying is
 * inline at the call sites (not a shared helper), and `expiresIn` is hard-coded
 * to '7d' in the route while env exposes JWT_EXPIRES_IN (currently unused by
 * login). Extracting `signAuthToken(userId)` / `verifyAuthToken(token)` into
 * e.g. src/lib/jwt.ts (honoring env.JWT_EXPIRES_IN) would let us import the real
 * implementation here and remove the drift between the route and env.
 */
import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';

const SECRET = 'test-secret-abc123';

// Mirror of auth.routes.ts login sign call.
function signAuthToken(userId: string, opts: jwt.SignOptions = { expiresIn: '7d' }): string {
  return jwt.sign({ userId }, SECRET, opts);
}

describe('auth JWT contract', () => {
  it('round-trips the userId payload via sign → verify', () => {
    const token = signAuthToken('user_123');
    const decoded = jwt.verify(token, SECRET) as { userId: string; iat: number; exp: number };
    expect(decoded.userId).toBe('user_123');
  });

  it("sets a 7-day expiry (exp ≈ iat + 7d) for the login token", () => {
    const token = signAuthToken('user_123');
    const decoded = jwt.verify(token, SECRET) as { iat: number; exp: number };
    const SEVEN_DAYS = 7 * 24 * 60 * 60;
    expect(decoded.exp - decoded.iat).toBe(SEVEN_DAYS);
  });

  it('rejects an already-expired token (TokenExpiredError)', () => {
    // Signed 8 days ago with a 7-day life → expired.
    const past = Math.floor(Date.now() / 1000) - 8 * 24 * 60 * 60;
    const token = jwt.sign({ userId: 'u', iat: past, exp: past + 7 * 24 * 60 * 60 }, SECRET);
    expect(() => jwt.verify(token, SECRET)).toThrowError(jwt.TokenExpiredError);
  });

  it('rejects a token signed with a different secret (forgery)', () => {
    const forged = jwt.sign({ userId: 'attacker' }, 'some-other-secret', { expiresIn: '7d' });
    expect(() => jwt.verify(forged, SECRET)).toThrowError(jwt.JsonWebTokenError);
  });

  it('rejects a token whose body was tampered with after signing', () => {
    const token = signAuthToken('user_123');
    const [h, _payload, s] = token.split('.');
    const evil = Buffer.from(JSON.stringify({ userId: 'admin' })).toString('base64url');
    const tampered = `${h}.${evil}.${s}`;
    expect(() => jwt.verify(tampered, SECRET)).toThrowError(jwt.JsonWebTokenError);
  });
});
