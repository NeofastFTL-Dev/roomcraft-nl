import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { ZodError } from 'zod';
import { env } from './env';
import { prisma } from './db';
import { authRouter } from './routes/auth';
import { projectsRouter } from './routes/projects';
import { catalogRouter, retailersRouter } from './routes/catalog';
import { aiRouter } from './routes/ai';
import { formatZodError } from '../shared/validation';
import { HttpError } from './http';
import { requireSameOrigin } from './auth';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(requireSameOrigin);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    next();
  });

  if (!env.isProduction) {
    app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', env.clientOrigin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'content-type');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
      next();
    });
  }

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'up', time: new Date().toISOString() });
    } catch (error) {
      res.status(503).json({
        status: 'degraded',
        database: 'down',
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  });

  app.use('/api/auth', authRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/catalog', catalogRouter);
  app.use('/api/retailers', retailersRouter);
  app.use('/api/ai', aiRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API-route niet gevonden.' });
  });

  if (env.isProduction) {
    const dist = path.resolve('dist');
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET') {
        next();
        return;
      }
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      res.status(400).json({ error: formatZodError(error), issues: error.issues });
      return;
    }
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message, details: error.details });
      return;
    }
    console.error('[api] unhandled error', error);
    res.status(500).json({ error: 'Er ging iets mis op de server.' });
  });

  return app;
}
