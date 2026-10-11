import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { verifyPassword } from '../src/auth/password';
import { seedUsers } from '../src/db/seed';
import { createTestDb, resetDb } from './helpers/testDb';

const prisma = createTestDb();
afterAll(() => prisma.$disconnect());
beforeEach(() => resetDb(prisma));

const env = { SEED_ADMIN_PASSWORD: 'AdminDemo!2026', SEED_OPERATOR_PASSWORD: 'SaraDemo!2026' };

describe('seedUsers', () => {
  it('crea admin e operatrice con i nomi di default', async () => {
    await seedUsers(prisma, env);
    const users = await prisma.user.findMany({ orderBy: { username: 'asc' } });
    expect(users.map((u) => [u.username, u.role])).toEqual([['admin', 'ADMIN'], ['sara.operatrice', 'OPERATOR']]);
    expect(await verifyPassword(users[0].passwordHash, 'AdminDemo!2026')).toBe(true);
  });

  it('è idempotente e riattiva gli utenti', async () => {
    await seedUsers(prisma, env);
    await prisma.user.updateMany({ data: { active: false } });
    await seedUsers(prisma, env);
    expect(await prisma.user.count()).toBe(2);
    expect(await prisma.user.count({ where: { active: true } })).toBe(2);
  });

  it('rifiuta password mancanti o corte', async () => {
    await expect(seedUsers(prisma, { SEED_ADMIN_PASSWORD: 'corta' })).rejects.toThrow(/SEED_ADMIN_PASSWORD/);
    expect(await prisma.user.count()).toBe(0);
  });
});
