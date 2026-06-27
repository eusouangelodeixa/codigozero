import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { PrismaClient } from '@prisma/client';
import { env } from './config/env';
import { logger } from './lib/logger';
import { initSentry, setupSentryErrorHandler } from './lib/sentry';
import authRoutes from './routes/auth.routes';
import dashboardRoutes from './routes/dashboard.routes';
import radarRoutes from './routes/radar.routes';
import cofreRoutes from './routes/cofre.routes';
import forjaRoutes from './routes/forja.routes';
import qgRoutes from './routes/qg.routes';
import webhookRoutes from './routes/webhook.routes';
import landingRoutes from './routes/landing.routes';
import adminRoutes from './routes/admin.routes';
import chatRoutes from './routes/chat.routes';
import affiliateRoutes from './routes/affiliate.routes';
import coproducerAdminRoutes from './routes/coproducer.admin.routes';
import coproducerRoutes from './routes/coproducer.routes';
import partnerRoutes from './routes/partner.routes';
import partnerAdminRoutes from './routes/partner.admin.routes';
import komunikaRoutes from './routes/komunika.routes';
import contentPageAdminRoutes from './routes/contentPage.admin.routes';
import contentPublicRoutes from './routes/contentPage.routes';
import { authMiddleware } from './middlewares/auth.middleware';
import { blockWithdrawOnly } from './middlewares/withdrawOnly.guard';
import { startCronJobs } from './jobs/cron';
import './workers/scraper.worker'; // Inicia o worker do BullMQ para scraping

// Initialize Sentry as early as possible (before routes). No-op unless
// SENTRY_DSN is set, so behavior is unchanged when it's absent.
initSentry();

const app = express();

// Behind nginx (one hop): trust the first proxy so req.ip / X-Forwarded-For
// resolve correctly. Without this, express-rate-limit logs a validation error
// and keys limits by the proxy IP.
app.set('trust proxy', 1);

// ── Request logging (structured) ──
// Wired early so every request is logged. Logs method/url/status/response time;
// attaches the authenticated user id when available (auth middleware sets
// req.user later in the chain, so it's present by the time the response logs).
app.use(
  pinoHttp({
    logger,
    customProps: (req) => {
      const userId = (req as any).user?.id;
      return userId ? { userId } : {};
    },
    // Quiet the health check so DB-probe pings don't flood logs.
    autoLogging: {
      ignore: (req) => req.url === '/api/health',
    },
  })
);

// ── Security & Parsing ──
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // Defense-in-depth: re-enable the safe headers even though nginx may also
  // send them (duplicate HSTS/X-Content-Type-Options/Referrer-Policy values
  // are harmless, unlike a duplicated/conflicting CSP). These don't affect
  // CORS or trigger the Safari/iOS "Load failed" issue.
  hsts: { maxAge: 15552000, includeSubDomains: true }, // ~180 days
  xContentTypeOptions: true,
  referrerPolicy: { policy: 'no-referrer' },
  frameguard: { action: 'deny' },
  // CSP stays OFF — nginx owns it; a second/conflicting policy here would break the app.
  contentSecurityPolicy: false,
}));
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, mobile apps, same-origin)
    if (!origin) return callback(null, true);
    const allowed = [
      env.FRONTEND_URL,           // https://app.czero.sbs
      'https://czero.sbs',        // landing page root domain
      'https://www.czero.sbs',    // www variant
    ].filter(Boolean);
    if (allowed.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// Webhook route needs raw body for signature verification (accepts any content type)
app.use('/api/webhooks', express.raw({ type: '*/*' }));
app.use(express.json());

// ── Static uploads ──
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ── Routes ──
// Member-only feature routes: prepend authMiddleware + blockWithdrawOnly so an
// offboarded "withdraw-only" sócio (role demoted to member) is 403'd here and
// can ONLY reach /api/partner/* (their saque) + /api/auth. (The routers also run
// authMiddleware internally — harmless; the guard just needs req.user first.)
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', authMiddleware, blockWithdrawOnly, dashboardRoutes);
app.use('/api/radar', authMiddleware, blockWithdrawOnly, radarRoutes);
app.use('/api/cofre', authMiddleware, blockWithdrawOnly, cofreRoutes);
app.use('/api/forja', authMiddleware, blockWithdrawOnly, forjaRoutes);
app.use('/api/qg', authMiddleware, blockWithdrawOnly, qgRoutes);
app.use('/api/landing', landingRoutes);
// Content / lead-magnet pages: public read+capture (/api/content) and admin
// CRUD (/api/admin/content-pages). The admin router runs auth+admin internally.
app.use('/api/content', contentPublicRoutes);
app.use('/api/admin/content-pages', contentPageAdminRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/coproducers', coproducerAdminRoutes);
app.use('/api/coproducer', coproducerRoutes);
app.use('/api/partner', partnerRoutes);
app.use('/api/admin', partnerAdminRoutes);
app.use('/api/chat', authMiddleware, blockWithdrawOnly, chatRoutes);
// NÃO prepend authMiddleware aqui: o affiliate router tem a rota PÚBLICA
// /resolve/:code (usada por /r/[code]) e roda auth + blockWithdrawOnly
// internamente nas rotas de membro. Prepender no mount quebra os links de
// afiliado (visitante anônimo → 401 "Token não fornecido").
app.use('/api/affiliate', affiliateRoutes);
app.use('/api/komunika', authMiddleware, blockWithdrawOnly, komunikaRoutes);
app.use('/api/webhooks', webhookRoutes);

// ── Health Check ──
// Probes the DB with a trivial query so load balancers / uptime checks detect
// DB outages, not just "process is up". Kept fast and dependency-light.
const healthPrisma = new PrismaClient();
app.get('/api/health', async (_req, res) => {
  try {
    await healthPrisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', service: 'codigo-zero-api', timestamp: new Date().toISOString() });
  } catch (err) {
    logger.error({ err }, '[HEALTH] DB probe failed');
    res.status(503).json({ status: 'error', service: 'codigo-zero-api', timestamp: new Date().toISOString() });
  }
});

// ── Sentry Error Handler ──
// Must run AFTER routes and BEFORE the app's own error handler. No-op unless
// SENTRY_DSN is set, so the app behaves exactly as today when it's absent.
setupSentryErrorHandler(app);

// ── Global Error Handler ──
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Prefer the per-request logger if pino-http attached one.
  (req.log ?? logger).error({ err }, '[ERROR] unhandled request error');
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start Server ──
app.listen(env.PORT, () => {
  logger.info(`⚡ Código Zero API running on port ${env.PORT} (env: ${env.NODE_ENV})`);

  // Komunika module needs BOTH secrets. Provisioning gates on the HMAC secret,
  // SSO on the JWT secret — warn loudly if only one is set, since the
  // integration would look live but SSO (or provisioning) would silently fail.
  if (env.KOMUNIKA_HMAC_SECRET && !env.KOMUNIKA_SSO_JWT_SECRET) {
    logger.warn('[KOMUNIKA] ⚠️ KOMUNIKA_HMAC_SECRET set but KOMUNIKA_SSO_JWT_SECRET MISSING — users get provisioned but every "Abrir Komunika" SSO click will fail. Set both.');
  } else if (env.KOMUNIKA_SSO_JWT_SECRET && !env.KOMUNIKA_HMAC_SECRET) {
    logger.warn('[KOMUNIKA] ⚠️ KOMUNIKA_SSO_JWT_SECRET set but KOMUNIKA_HMAC_SECRET MISSING — provisioning is disabled, so no tenant ever exists to open. Set both.');
  }

  startCronJobs();
});

export default app;
