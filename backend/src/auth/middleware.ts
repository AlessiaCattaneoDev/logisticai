import type { NextFunction, Request, Response } from 'express';
import type { AuthUser } from '@logisticai/shared';
import type { PrismaClient } from '../db/client.js';
import { verifyUserToken } from './tokens.js';

export const SESSION_COOKIE = 'lai_session';

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export function requireAuth(prisma: PrismaClient, jwtSecret: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return res.status(401).json({ error: 'Autenticazione richiesta' });
    try {
      const claims = await verifyUserToken(token, jwtSecret);
      // Ruolo e stato si rileggono dal DB: un utente disattivato perde subito l'accesso.
      const user = await prisma.user.findUnique({ where: { id: claims.sub } });
      if (!user || !user.active) return res.status(401).json({ error: 'Autenticazione richiesta' });
      req.user = { id: user.id, username: user.username, role: user.role };
      next();
    } catch {
      res.status(401).json({ error: 'Autenticazione richiesta' });
    }
  };
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Accesso riservato agli amministratori' });
  next();
}
