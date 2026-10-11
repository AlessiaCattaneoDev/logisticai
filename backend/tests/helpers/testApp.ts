import type { Express } from 'express';
import { createApp, type AppDeps } from '../../src/app';
import { hashPassword } from '../../src/auth/password';
import type { PrismaClient } from '../../src/db/client';

export const JWT_SECRET = 'j'.repeat(40);

export function buildTestApp(prisma: PrismaClient, overrides: Partial<AppDeps> = {}): Express {
  return createApp({
    frontendOrigin: 'http://localhost:5173',
    healthChecks: {},
    prisma,
    auth: { jwtSecret: JWT_SECRET, expiresIn: '8h', secureCookies: false, loginRateLimit: { windowMs: 60_000, limit: 100 } },
    ...overrides,
  });
}

export async function createUser(
  prisma: PrismaClient,
  username: string,
  password: string,
  role: 'OPERATOR' | 'ADMIN' = 'OPERATOR',
) {
  return prisma.user.create({ data: { username, passwordHash: await hashPassword(password), role } });
}
