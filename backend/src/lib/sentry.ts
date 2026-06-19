// Sentry error tracking — fully gated on SENTRY_DSN.
//
// When SENTRY_DSN is unset (the default today), every export here is a no-op
// and @sentry/node is never initialized, so the app behaves exactly as before.
// When SENTRY_DSN is set, Sentry is initialized and the Express error handler
// is wired up in server.ts.
//
// process.env is read directly on purpose (config/env.ts is owned by another
// agent and SENTRY_DSN is optional / not part of the validated schema).
import type { Express } from 'express';

const dsn = process.env.SENTRY_DSN;

export const sentryEnabled = Boolean(dsn);

let Sentry: typeof import('@sentry/node') | null = null;

/**
 * Initialize Sentry. Safe to call unconditionally — it's a no-op unless
 * SENTRY_DSN is set. Call this as early as possible (before routes load).
 */
export function initSentry(): void {
  if (!sentryEnabled) return;
  try {
    // Lazy require so the dependency is only touched when actually enabled.
    Sentry = require('@sentry/node') as typeof import('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      // Conservative default: errors only, no perf tracing unless explicitly opted in.
      tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE
        ? Number(process.env.SENTRY_TRACES_SAMPLE_RATE)
        : 0,
    });
  } catch (err) {
    // Never let observability wiring crash the app.
    // eslint-disable-next-line no-console
    console.warn('[SENTRY] failed to initialize, continuing without it:', err);
    Sentry = null;
  }
}

/**
 * Attach Sentry's Express error handler. No-op when Sentry is disabled.
 * Must run AFTER routes and BEFORE the app's own error handler.
 */
export function setupSentryErrorHandler(app: Express): void {
  if (!sentryEnabled || !Sentry) return;
  // @sentry/node v8+ exposes setupExpressErrorHandler; older v7 uses
  // Handlers.errorHandler(). Support both so a version bump won't break us.
  const s = Sentry as any;
  if (typeof s.setupExpressErrorHandler === 'function') {
    s.setupExpressErrorHandler(app);
  } else if (s.Handlers && typeof s.Handlers.errorHandler === 'function') {
    app.use(s.Handlers.errorHandler());
  }
}

/** Manually report an exception. No-op when Sentry is disabled. */
export function captureException(err: unknown): void {
  if (!sentryEnabled || !Sentry) return;
  Sentry.captureException(err);
}
