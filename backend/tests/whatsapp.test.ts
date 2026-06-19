/**
 * Unit tests for src/lib/whatsapp.ts — normalizeMzPhone().
 *
 * Every outbound WhatsApp (credentials, OTP, lifecycle) runs the recipient
 * number through this. The rule: a bare 9-digit Mozambican mobile starting
 * with 8 gets the 258 country code prefixed; anything already carrying a
 * country code (international / Stripe buyers) must be left as-is so it still
 * delivers. Junk (spaces, +, dashes) is stripped to bare digits. Pure: it does
 * not touch the PrismaClient the module constructs at import time.
 */
import { describe, it, expect } from 'vitest';
import { normalizeMzPhone } from '../src/lib/whatsapp';

describe('normalizeMzPhone', () => {
  it('prefixes 258 to a bare 9-digit MZ mobile starting with 8', () => {
    expect(normalizeMzPhone('841234567')).toBe('258841234567');
    expect(normalizeMzPhone('871234567')).toBe('258871234567');
  });

  it('strips non-digits before deciding (formatted MZ number)', () => {
    expect(normalizeMzPhone('+258 84 123 4567')).toBe('258841234567');
    expect(normalizeMzPhone('84-123-4567')).toBe('258841234567');
  });

  it('leaves an already-prefixed MZ number untouched (no double 258)', () => {
    // 12 digits — already has the country code, must not be re-prefixed
    expect(normalizeMzPhone('258841234567')).toBe('258841234567');
  });

  it('leaves international numbers untouched (Stripe buyers)', () => {
    // 11+ digits, not the 9-digit MZ case → returned as bare digits, unprefixed
    expect(normalizeMzPhone('+1 415 555 2671')).toBe('14155552671');
    expect(normalizeMzPhone('+55 11 91234 5678')).toBe('5511912345678');
  });

  it('does NOT prefix a 9-digit number that does not start with 8', () => {
    expect(normalizeMzPhone('123456789')).toBe('123456789');
  });

  it('handles empty / junk-only input by returning an empty string', () => {
    expect(normalizeMzPhone('')).toBe('');
    expect(normalizeMzPhone('   ')).toBe('');
    expect(normalizeMzPhone('abc')).toBe('');
    // @ts-expect-error — guards against null at runtime
    expect(normalizeMzPhone(null)).toBe('');
  });
});
