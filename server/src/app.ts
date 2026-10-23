import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import type { Db } from './db';
import { errorHandler } from './lib/http';
import { requireAuth } from './services/auth';
import type { Ctx } from './routes/context';
import { authRoutes } from './routes/auth';
import { auditRoutes, settingsRoutes } from './routes/settings';

export function createApp(getDb: () => Db) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Railway sits behind a proxy; needed for correct client IPs in rate limiting
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, maxAge: 86400 }));
  app.use(express.json({ limit: '6mb' }));

  const ctx: Ctx = { db: getDb, auth: requireAuth(getDb) };

  app.get('/api/health', async (_req, res) => {
    await getDb().raw('SELECT 1');
    res.json({ ok: true, time: new Date().toISOString() });
  });
  app.use('/api/auth', authRoutes(ctx));
  app.use('/api/settings', settingsRoutes(ctx));
  app.use('/api/audit', auditRoutes(ctx));

  app.use('/api', (_req, res) => { res.status(404).json({ error: 'Not found.' }); });
  app.use(errorHandler);
  return app;
}
