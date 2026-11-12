import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.route.js';
import messageRoutes from './routes/message.route.js';
import sessionRoutes from './routes/session.route.js';
import { initSocket } from './lib/socket.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.env.FRONTEND_DIST ?? path.resolve(here, '../../frontend/dist');

export function createApp() {
  const app = express();
  const server = http.createServer(app);
  const origins = (process.env.CLIENT_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  initSocket(server, { origins });

  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  }));
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  if (origins.length) app.use(cors({ origin: origins, credentials: true }));

  const limiter = (windowMs, limit) => rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    message: { message: 'Too many requests, slow down a little' },
  });

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth/signup', limiter(60 * 60 * 1000, 20));
  app.use('/api/auth/login', limiter(15 * 60 * 1000, 30));
  app.use('/api', limiter(60 * 1000, 240));
  app.use('/api/auth', authRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/session', sessionRoutes);
  app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));

  // In production the backend also serves the built single-page app.
  if (fs.existsSync(path.join(DIST, 'index.html'))) {
    app.use(express.static(DIST, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/|socket\.io\/).*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ message: 'Malformed JSON' });
    if (err?.type === 'entity.too.large') return res.status(413).json({ message: 'Request too large' });
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  });

  return { app, server };
}
