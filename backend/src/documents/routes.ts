import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAdmin } from '../auth/middleware.js';
import { DocumentError, MAX_UPLOAD_BYTES, type DocumentService } from './service.js';

const categorySchema = z.object({ name: z.string().trim().min(2).max(80), description: z.string().trim().max(300).optional() });
const categoryPatch = categorySchema.partial();
const uploadSchema = z.object({ categoryId: z.string().min(1), title: z.string().trim().max(200).optional() });

type Handler = (req: Request, res: Response) => Promise<unknown>;
const wrap = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof DocumentError) return res.status(err.status).json({ error: err.message });
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dati non validi' });
    next(err);
  }
};

export function documentRoutes(service: DocumentService, requireAuth: RequestHandler, maxBytes = MAX_UPLOAD_BYTES): Router {
  const r = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1 } });
  const single: RequestHandler = (req, res, next) =>
    upload.single('file')(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `Il file supera il limite di ${Math.round(maxBytes / 1024 / 1024)} MB` });
      }
      if (err) return res.status(400).json({ error: 'Caricamento non valido' });
      next();
    });

  r.get('/categories', requireAuth, wrap(async (_req, res) => res.json(await service.categories())));
  r.post('/categories', requireAuth, requireAdmin, wrap(async (req, res) => {
    const body = categorySchema.parse(req.body);
    res.status(201).json(await service.createCategory(body.name, body.description));
  }));
  r.patch('/categories/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    await service.updateCategory(req.params.id as string, categoryPatch.parse(req.body));
    res.status(204).end();
  }));

  r.get('/documents', requireAuth, wrap(async (req, res) => {
    const q = z.object({ categoria: z.string().optional(), q: z.string().trim().max(200).optional() }).parse(req.query);
    res.json(await service.list({ categoryId: q.categoria, q: q.q }, req.user));
  }));
  r.get('/documents/:id', requireAuth, wrap(async (req, res) => res.json(await service.get(req.params.id as string, req.user))));
  r.post('/documents', requireAuth, single, wrap(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nessun file ricevuto' });
    const body = uploadSchema.parse(req.body);
    // multer legge il nome in latin1: si ricodifica per non rovinare accenti e caratteri speciali.
    const fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const doc = await service.upload({ user: req.user!, categoryId: body.categoryId, title: body.title, fileName, data: req.file.buffer });
    res.status(202).json(doc);
  }));
  r.delete('/documents/:id', requireAuth, wrap(async (req, res) => {
    await service.delete(req.params.id as string, req.user!);
    res.status(204).end();
  }));
  return r;
}
