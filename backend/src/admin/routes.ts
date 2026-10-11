import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { AdminError, type AdminService } from './service.js';

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const periodSchema = z.object({ da: isoDay.optional(), a: isoDay.optional() });
const conversationsSchema = periodSchema.extend({
  utente: z.string().optional(),
  feedback: z.literal('down').optional(),
  errori: z.enum(['true', 'false']).optional(),
  q: z.string().trim().max(200).optional(),
});
const feedbackQuery = z.object({ stato: z.enum(['new', 'reviewing', 'resolved']).optional(), rating: z.enum(['up', 'down']).optional() });
const feedbackPatch = z.object({ stato: z.enum(['new', 'reviewing', 'resolved']).optional(), notaAdmin: z.string().trim().max(2000).optional() });
const pricingSchema = z.object({
  provider: z.string().trim().min(1).max(50),
  modello: z.string().trim().min(1).max(100),
  inputPer1M: z.number().nonnegative(),
  outputPer1M: z.number().nonnegative(),
  cachedInputPer1M: z.number().nonnegative().nullable().optional(),
  validoDal: isoDay,
});
const role = z.enum(['OPERATOR', 'ADMIN']);
const newUser = z.object({ username: z.string().trim().min(3).max(100).regex(/^[a-z0-9._-]+$/i), password: z.string().min(10).max(200), ruolo: role });
const userPatch = z.object({ attivo: z.boolean().optional(), ruolo: role.optional(), password: z.string().min(10).max(200).optional() });

type Handler = (req: Request, res: Response) => Promise<unknown>;

/** Converte AdminError e ZodError in risposte JSON leggibili. */
const wrap = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof AdminError) return res.status(err.status).json({ error: err.message });
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Parametri non validi', dettagli: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    next(err);
  }
};

/** Rotte della dashboard: il router va montato dopo requireAuth + requireAdmin. */
export function adminRoutes(service: AdminService): Router {
  const r = Router();
  const adminId = (req: Request) => req.user!.id;

  r.get('/overview', wrap(async (req, res) => {
    const q = periodSchema.parse(req.query);
    res.json(await service.overview(q.da, q.a));
  }));
  r.get('/conversations', wrap(async (req, res) => {
    const q = conversationsSchema.parse(req.query);
    res.json(await service.conversations({ from: q.da, to: q.a, userId: q.utente, feedback: q.feedback, errori: q.errori === 'true', q: q.q }));
  }));
  r.get('/conversations/:id', wrap(async (req, res) => res.json(await service.conversationDetail(req.params.id as string, adminId(req)))));
  r.get('/feedback', wrap(async (req, res) => res.json(await service.feedback(feedbackQuery.parse(req.query)))));
  r.patch('/feedback/:id', wrap(async (req, res) => {
    await service.updateFeedback(req.params.id as string, adminId(req), feedbackPatch.parse(req.body));
    res.status(204).end();
  }));
  r.get('/costs', wrap(async (req, res) => {
    const q = periodSchema.parse(req.query);
    res.json(await service.costs(q.da, q.a));
  }));
  r.post('/pricing', wrap(async (req, res) => res.status(201).json(await service.addPricing(adminId(req), pricingSchema.parse(req.body)))));
  r.get('/users', wrap(async (_req, res) => res.json(await service.users())));
  r.post('/users', wrap(async (req, res) => {
    const u = await service.createUser(adminId(req), newUser.parse(req.body));
    res.status(201).json({ id: u.id, username: u.username, ruolo: u.role });
  }));
  r.patch('/users/:id', wrap(async (req, res) => {
    await service.updateUser(adminId(req), req.params.id as string, userPatch.parse(req.body));
    res.status(204).end();
  }));
  r.post('/reveal-names', wrap(async (req, res) => res.json(await service.revealNames(adminId(req)))));
  r.get('/system', wrap(async (_req, res) => res.json(await service.system())));
  r.get('/audit', wrap(async (_req, res) => res.json(await service.auditLog())));
  return r;
}
