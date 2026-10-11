import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers/testApp';
import { createTestDb } from './helpers/testDb';

const prisma = createTestDb();
afterAll(() => prisma.$disconnect());

describe('GET /api/health', () => {
  it('risponde ok con il database raggiungibile', async () => {
    const res = await request(buildTestApp(prisma)).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', services: { backend: 'ok', database: 'ok' } });
  });

  it('segnala degraded se un servizio non risponde', async () => {
    const app = buildTestApp(prisma, { healthChecks: { chroma: async () => true, dataAgent: async () => false } });
    const res = await request(app).get('/api/health');
    expect(res.body.status).toBe('degraded');
    expect(res.body.services).toMatchObject({ chroma: 'ok', dataAgent: 'down' });
  });

  it('considera down un controllo che lancia eccezione', async () => {
    const app = buildTestApp(prisma, { healthChecks: { chroma: async () => { throw new Error('boom'); } } });
    expect((await request(app).get('/api/health')).body.services.chroma).toBe('down');
  });

  it('imposta gli header di sicurezza', async () => {
    const res = await request(buildTestApp(prisma)).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('risponde 404 JSON sulle rotte sconosciute', async () => {
    const res = await request(buildTestApp(prisma)).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });
});
