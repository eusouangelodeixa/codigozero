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
import { startCronJobs } from './jobs/cron';
import './workers/scraper.worker'; // Inicia o worker do BullMQ para scraping

const app = express();

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

// Webhook route needs raw body for signature verification
app.use('/api/webhooks', express.raw({ type: 'application/json' }));
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
app.use('/api/chat', chatRoutes);
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
  startCronJobs();
});

export default app;
