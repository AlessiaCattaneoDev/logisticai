import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { HealthResponse, ServiceStatus } from '@logisticai/shared';
import { adminRoutes } from './admin/routes.js';
import type { AdminService } from './admin/service.js';
import { requireAdmin, requireAuth } from './auth/middleware.js';
import { authRouter, type AuthConfig } from './auth/routes.js';
import { chatRouter } from './chat/routes.js';
import type { ChatService } from './chat/service.js';
import type { PrismaClient } from './db/client.js';
import { documentRoutes } from './documents/routes.js';
import type { DocumentService } from './documents/service.js';
import type { HomeService } from './home/service.js';

export type HealthCheck = () => Promise<boolean>;

export interface AppDeps {
  frontendOrigin: string;
  healthChecks: Record<string, HealthCheck>;
  prisma: PrismaClient;
  auth: AuthConfig;
  chat?: { service: ChatService; rateLimit?: { windowMs: number; limit: number } };
  admin?: AdminService;
  documents?: { service: DocumentService; maxBytes?: number };
  home?: HomeService;
}

async function runCheck(check: HealthCheck): Promise<ServiceStatus> {
  try {
    return (await check()) ? 'ok' : 'down';
  } catch {
    return 'down';
  }
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(helmet());
  app.use(cors({ origin: deps.frontendOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const authenticated = requireAuth(deps.prisma, deps.auth.jwtSecret);
  const healthChecks: Record<string, HealthCheck> = {
    database: async () => (await deps.prisma.$queryRaw`SELECT 1`, true),
    ...deps.healthChecks,
  };

  app.get('/api/health', async (_req, res) => {
    const entries = await Promise.all(
      Object.entries(healthChecks).map(async ([name, check]) => [name, await runCheck(check)] as const),
    );
    const services: Record<string, ServiceStatus> = { backend: 'ok', ...Object.fromEntries(entries) };
    const status: ServiceStatus = Object.values(services).every((s) => s === 'ok') ? 'ok' : 'degraded';
    const body: HealthResponse = { status, services };
    res.json(body);
  });

  app.use('/api/auth', authRouter(deps.prisma, deps.auth, authenticated));

  if (deps.chat) app.use('/api', chatRouter(deps.chat.service, authenticated, deps.chat.rateLimit));
  if (deps.home) {
    const home = deps.home;
    app.get('/api/home', authenticated, async (req, res, next) => {
      try {
        res.json(await home.get(req.user!));
      } catch (err) {
        next(err);
      }
    });
  }
  if (deps.documents) app.use('/api', documentRoutes(deps.documents.service, authenticated, deps.documents.maxBytes));

  const admin = express.Router();
  admin.use(authenticated, requireAdmin);
  admin.get('/ping', (_req, res) => res.json({ ok: true }));
  if (deps.admin) admin.use(adminRoutes(deps.admin));
  app.use('/api/admin', admin);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Errori non gestiti: risposta JSON generica, mai stack trace al client.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return res.end();
    res.status(500).json({ error: 'Errore interno' });
  });

  return app;
}
