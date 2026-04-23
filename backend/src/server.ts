import express from 'express';
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
import { startCronJobs } from './jobs/cron';

const app = express();

// ── Security & Parsing ──
app.use(helmet());
app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true,
}));

// Webhook route needs raw body for signature verification
app.use('/api/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json());

// ── Routes ──
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/radar', radarRoutes);
app.use('/api/cofre', cofreRoutes);
app.use('/api/forja', forjaRoutes);
app.use('/api/qg', qgRoutes);
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
