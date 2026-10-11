import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../src/auth/middleware';
import { hashPassword, verifyPassword } from '../src/auth/password';
import { signUserToken, verifyUserToken } from '../src/auth/tokens';
import { buildTestApp, createUser, JWT_SECRET } from './helpers/testApp';
import { createTestDb, resetDb } from './helpers/testDb';

const prisma = createTestDb();
afterAll(() => prisma.$disconnect());
beforeEach(() => resetDb(prisma));

const cookieOf = (res: request.Response) => ([] as string[]).concat(res.headers['set-cookie'] ?? []);

async function login(app: ReturnType<typeof buildTestApp>, username: string, password: string) {
  return request(app).post('/api/auth/login').send({ username, password });
}

describe('password', () => {
  it('hash argon2id verificabile e mai in chiaro', async () => {
    const hash = await hashPassword('Segreta!2026');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'Segreta!2026')).toBe(true);
    expect(await verifyPassword(hash, 'sbagliata')).toBe(false);
  });
});

describe('token utente', () => {
  it('contiene sub e ruolo, verificabile solo con il segreto giusto', async () => {
    const token = await signUserToken({ id: 'u1', role: 'ADMIN' }, JWT_SECRET, '1h');
    expect(await verifyUserToken(token, JWT_SECRET)).toMatchObject({ sub: 'u1', role: 'ADMIN' });
    await expect(verifyUserToken(token, 'x'.repeat(40))).rejects.toThrow();
  });
});

describe('POST /api/auth/login', () => {
  it('imposta un cookie httpOnly SameSite=Strict e restituisce l’utente', async () => {
    await createUser(prisma, 'sara.operatrice', 'Password!2026');
    const res = await login(buildTestApp(prisma), 'sara.operatrice', 'Password!2026');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ username: 'sara.operatrice', role: 'OPERATOR' });
    expect(res.body.passwordHash).toBeUndefined();
    const cookie = cookieOf(res).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\//);
  });

  it('aggiorna lastLoginAt', async () => {
    await createUser(prisma, 'sara', 'Password!2026');
    await login(buildTestApp(prisma), 'sara', 'Password!2026');
    const user = await prisma.user.findUniqueOrThrow({ where: { username: 'sara' } });
    expect(user.lastLoginAt).not.toBeNull();
  });

  it.each([
    ['password sbagliata', 'sara', 'Sbagliata!1'],
    ['utente inesistente', 'nessuno', 'Password!2026'],
  ])('401 con messaggio generico: %s', async (_case, username, password) => {
    await createUser(prisma, 'sara', 'Password!2026');
    const res = await login(buildTestApp(prisma), username, password);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Credenziali non valide' });
  });

  it('401 per utente disattivato', async () => {
    const user = await createUser(prisma, 'sara', 'Password!2026');
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    expect((await login(buildTestApp(prisma), 'sara', 'Password!2026')).status).toBe(401);
  });

  it('400 con input non valido', async () => {
    const res = await request(buildTestApp(prisma)).post('/api/auth/login').send({ username: '' });
    expect(res.status).toBe(400);
  });

  it('429 dopo troppi tentativi', async () => {
    const app = buildTestApp(prisma, {
      auth: { jwtSecret: JWT_SECRET, expiresIn: '8h', secureCookies: false, loginRateLimit: { windowMs: 60_000, limit: 3 } },
    });
    for (let i = 0; i < 3; i++) await login(app, 'x', 'y');
    expect((await login(app, 'x', 'y')).status).toBe(429);
  });
});

describe('sessione', () => {
  async function loggedAgent(role: 'OPERATOR' | 'ADMIN' = 'OPERATOR') {
    await createUser(prisma, 'utente', 'Password!2026', role);
    const agent = request.agent(buildTestApp(prisma));
    await agent.post('/api/auth/login').send({ username: 'utente', password: 'Password!2026' });
    return agent;
  }

  it('GET /api/auth/me con cookie restituisce l’utente', async () => {
    const agent = await loggedAgent();
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ username: 'utente', role: 'OPERATOR' });
  });

  it('GET /api/auth/me senza cookie: 401', async () => {
    expect((await request(buildTestApp(prisma)).get('/api/auth/me')).status).toBe(401);
  });

  it('token manomesso: 401', async () => {
    const res = await request(buildTestApp(prisma)).get('/api/auth/me').set('Cookie', `${SESSION_COOKIE}=abc.def.ghi`);
    expect(res.status).toBe(401);
  });

  it('utente disattivato dopo il login: 401 alla richiesta successiva', async () => {
    const agent = await loggedAgent();
    await prisma.user.updateMany({ data: { active: false } });
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('logout cancella il cookie', async () => {
    const agent = await loggedAgent();
    const res = await agent.post('/api/auth/logout');
    expect(res.status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('rotte admin: 403 per operatore, 200 per admin', async () => {
    const operator = await loggedAgent('OPERATOR');
    expect((await operator.get('/api/admin/ping')).status).toBe(403);
    await resetDb(prisma);
    const admin = await loggedAgent('ADMIN');
    expect((await admin.get('/api/admin/ping')).status).toBe(200);
  });

  it('rotte admin senza login: 401', async () => {
    expect((await request(buildTestApp(prisma)).get('/api/admin/ping')).status).toBe(401);
  });
});
