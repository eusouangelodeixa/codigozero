import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
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
import { startCronJobs } from './jobs/cron';
import './workers/scraper.worker'; // Inicia o worker do BullMQ para scraping

const app = express();

// Behind nginx (one hop): trust the first proxy so req.ip / X-Forwarded-For
// resolve correctly. Without this, express-rate-limit logs a validation error
// and keys limits by the proxy IP.
app.set('trust proxy', 1);

// ── Security & Parsing ──
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // Nginx already sends these headers — disable to prevent duplicates
  // that cause Safari/iOS "Load failed" network errors
  hsts: false,
  contentSecurityPolicy: false,
  xContentTypeOptions: false,
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
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/radar', radarRoutes);
app.use('/api/cofre', cofreRoutes);
app.use('/api/forja', forjaRoutes);
app.use('/api/qg', qgRoutes);
app.use('/api/landing', landingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/coproducers', coproducerAdminRoutes);
app.use('/api/coproducer', coproducerRoutes);
app.use('/api/partner', partnerRoutes);
app.use('/api/admin', partnerAdminRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/affiliate', affiliateRoutes);
app.use('/api/komunika', komunikaRoutes);
app.use('/api/webhooks', webhookRoutes);

// ── Health Check ──
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'codigo-zero-api', timestamp: new Date().toISOString() });
});

// ── Global Error Handler ──
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start Server ──
app.listen(env.PORT, () => {
  console.log(`\n⚡ Código Zero API running on port ${env.PORT}`);
  console.log(`   Environment: ${env.NODE_ENV}\n`);

  // Komunika module needs BOTH secrets. Provisioning gates on the HMAC secret,
  // SSO on the JWT secret — warn loudly if only one is set, since the
  // integration would look live but SSO (or provisioning) would silently fail.
  if (env.KOMUNIKA_HMAC_SECRET && !env.KOMUNIKA_SSO_JWT_SECRET) {
    console.warn('[KOMUNIKA] ⚠️ KOMUNIKA_HMAC_SECRET set but KOMUNIKA_SSO_JWT_SECRET MISSING — users get provisioned but every "Abrir Komunika" SSO click will fail. Set both.');
  } else if (env.KOMUNIKA_SSO_JWT_SECRET && !env.KOMUNIKA_HMAC_SECRET) {
    console.warn('[KOMUNIKA] ⚠️ KOMUNIKA_SSO_JWT_SECRET set but KOMUNIKA_HMAC_SECRET MISSING — provisioning is disabled, so no tenant ever exists to open. Set both.');
  }

  startCronJobs();
});

export default app;
