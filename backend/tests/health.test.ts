import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

const baseDeps = { frontendOrigin: 'http://localhost:5173' };

describe('GET /api/health', () => {
  it('risponde ok senza servizi esterni', async () => {
    const res = await request(createApp({ ...baseDeps, healthChecks: {} })).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', services: { backend: 'ok' } });
  });

  it('segnala degraded se un servizio non risponde', async () => {
    const app = createApp({
      ...baseDeps,
      healthChecks: {
        chroma: async () => true,
        dataAgent: async () => false,
      },
    });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('degraded');
    expect(res.body.services).toMatchObject({ chroma: 'ok', dataAgent: 'down' });
  });

  it('considera down un controllo che lancia eccezione', async () => {
    const app = createApp({
      ...baseDeps,
      healthChecks: { chroma: async () => { throw new Error('boom'); } },
    });
    const res = await request(app).get('/api/health');
    expect(res.body.services.chroma).toBe('down');
  });

  it('imposta gli header di sicurezza', async () => {
    const res = await request(createApp({ ...baseDeps, healthChecks: {} })).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('risponde 404 JSON sulle rotte sconosciute', async () => {
    const res = await request(createApp({ ...baseDeps, healthChecks: {} })).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });
});
