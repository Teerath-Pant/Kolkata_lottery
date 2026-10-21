import fs from 'fs';
import path from 'path';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { config, corsOrigins } from './config';
import { errorHandler } from './middleware';
import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { gameRouter } from './routes/game';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(express.json({ limit: '50kb' }));

  const test = config.NODE_ENV === 'test';
  const api = express.Router();
  api.use(rateLimit({ windowMs: 60_000, limit: test ? 100_000 : 300, standardHeaders: true, legacyHeaders: false }));
  api.use(['/auth/login', '/auth/register'], rateLimit({ windowMs: 15 * 60_000, limit: test ? 100_000 : 30, standardHeaders: true, legacyHeaders: false }));
  api.get('/health', (_req, res) => res.json({ ok: true }));
  api.use(authRouter, gameRouter, adminRouter);
  app.use('/api/v1', api);
  app.use('/api', (_req, res) => { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown endpoint' } }); });

  // Serve the built SPAs in production if present: admin/dist at /admin/, user/dist at /.
  const adminDist = path.resolve(__dirname, '../../admin/dist');
  if (fs.existsSync(adminDist)) {
    app.use('/admin', express.static(adminDist));
    app.get(/^\/admin(\/.*)?$/, (_req, res) => res.sendFile(path.join(adminDist, 'index.html')));
  }
  const userDist = path.resolve(__dirname, '../../user/dist');
  if (fs.existsSync(userDist)) {
    app.use(express.static(userDist));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(userDist, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}
