import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { decodeJwt } from 'jose';
import { z } from 'zod';
import type { AuthUser } from '@logisticai/shared';
import type { PrismaClient } from '../db/client.js';
import { SESSION_COOKIE } from './middleware.js';
import { dummyPasswordHash, verifyPassword } from './password.js';
import { signUserToken } from './tokens.js';

export interface AuthConfig {
  jwtSecret: string;
  expiresIn: string;
  secureCookies: boolean;
  loginRateLimit: { windowMs: number; limit: number };
}

const loginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
});

export function authRouter(prisma: PrismaClient, config: AuthConfig, requireAuth: RequestHandler): Router {
  const router = Router();
  const limiter = rateLimit({
    ...config.loginRateLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Troppi tentativi di accesso: riprova tra qualche minuto' },
  });
  const cookieOptions = { httpOnly: true, sameSite: 'strict' as const, secure: config.secureCookies, path: '/' };

  router.post('/login', limiter, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Username e password sono obbligatori' });
    const { username, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { username } });
    const valid = await verifyPassword(user?.passwordHash ?? (await dummyPasswordHash()), password);
    if (!user || !user.active || !valid) return res.status(401).json({ error: 'Credenziali non valide' });

    const token = await signUserToken(user, config.jwtSecret, config.expiresIn);
    const { exp } = decodeJwt(token);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions, expires: new Date(exp! * 1000) });
    const body: AuthUser = { id: user.id, username: user.username, role: user.role };
    res.json(body);
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, cookieOptions);
    res.status(204).end();
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json(req.user);
  });

  return router;
}
