import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { HealthResponse, ServiceStatus } from '@logisticai/shared';

export type HealthCheck = () => Promise<boolean>;

export interface AppDeps {
  frontendOrigin: string;
  healthChecks: Record<string, HealthCheck>;
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
  app.use(helmet());
  app.use(cors({ origin: deps.frontendOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', async (_req, res) => {
    const entries = await Promise.all(
      Object.entries(deps.healthChecks).map(async ([name, check]) => [name, await runCheck(check)] as const),
    );
    const services: Record<string, ServiceStatus> = { backend: 'ok', ...Object.fromEntries(entries) };
    const status: ServiceStatus = Object.values(services).every((s) => s === 'ok') ? 'ok' : 'degraded';
    const body: HealthResponse = { status, services };
    res.json(body);
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}
