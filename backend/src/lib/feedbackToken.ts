/**
 * Stateless signed tokens for the /pesquisa web survey links (email fallback).
 *
 * SECURITY: signed with a key DERIVED from JWT_SECRET — never the raw secret.
 * auth.middleware.ts accepts any HS256 token signed with the raw JWT_SECRET
 * and reads `decoded.userId`, so a survey token signed with the raw secret
 * would double as a 7-day login token. Deriving via HMAC(JWT_SECRET, context)
 * makes the two token universes cryptographically disjoint with zero new env
 * vars (nothing to add to the docker-compose allowlist).
 *
 * Tokens are reusable until expiry (the link must render on repeat opens);
 * submission is gated by the survey's completed state instead.
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

const FEEDBACK_LINK_KEY = crypto
  .createHmac('sha256', env.JWT_SECRET)
  .update('cz-feedback-link-v1')
  .digest();

const PURPOSE = 'feedback-link';

export function signFeedbackToken(surveyId: string): string {
  return jwt.sign({ sid: surveyId, purpose: PURPOSE }, FEEDBACK_LINK_KEY, {
    algorithm: 'HS256',
    expiresIn: '7d',
  });
}

/** Returns the surveyId, or null for anything invalid/expired/foreign. */
export function verifyFeedbackToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, FEEDBACK_LINK_KEY, { algorithms: ['HS256'] }) as {
      sid?: string;
      purpose?: string;
    };
    if (decoded.purpose !== PURPOSE || !decoded.sid) return null;
    return decoded.sid;
  } catch {
    return null;
  }
}

export function buildFeedbackLink(surveyId: string): string {
  return `${env.FRONTEND_URL}/pesquisa?token=${encodeURIComponent(signFeedbackToken(surveyId))}`;
}
