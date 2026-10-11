import { Router, type RequestHandler, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { FEEDBACK_REASONS, type ChatStreamEvent } from '@logisticai/shared';
import { NotFoundError, type ChatService } from './service.js';

const chatSchema = z.object({
  conversationId: z.uuid().optional(),
  message: z.string().trim().min(1).max(4000),
});

const feedbackSchema = z.object({
  rating: z.enum(['up', 'down']),
  reason: z.enum(FEEDBACK_REASONS).optional(),
  comment: z.string().trim().max(1000).optional(),
});

function sse(res: Response, e: ChatStreamEvent) {
  res.write(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`);
}

export function chatRouter(service: ChatService, requireAuth: RequestHandler, limit = { windowMs: 60_000, limit: 20 }): Router {
  const router = Router();
  const chatLimiter = rateLimit({
    ...limit,
    keyGenerator: (req) => req.user!.id,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Troppi messaggi in poco tempo: attendi qualche secondo' },
  });

  router.post('/chat', requireAuth, chatLimiter, async (req, res) => {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Messaggio non valido (1-4000 caratteri)' });
    const userId = req.user!.id;
    let conversationId: string;
    try {
      conversationId = (await service.resolveConversation(userId, parsed.data.conversationId, parsed.data.message)).id;
    } catch (err) {
      if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
      throw err;
    }

    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });
    for await (const event of service.handle({ userId, conversationId, message: parsed.data.message, signal: abort.signal })) {
      if (abort.signal.aborted) break;
      sse(res, event);
    }
    res.end();
  });

  router.get('/conversations', requireAuth, async (req, res) => {
    res.json(await service.list(req.user!.id));
  });

  router.get('/conversations/:id', requireAuth, async (req, res) => {
    try {
      res.json(await service.detail(req.params.id as string, req.user!.id));
    } catch (err) {
      if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
      throw err;
    }
  });

  router.delete('/conversations/:id', requireAuth, async (req, res) => {
    try {
      await service.archive(req.params.id as string, req.user!.id);
      res.status(204).end();
    } catch (err) {
      if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
      throw err;
    }
  });

  router.post('/messages/:id/feedback', requireAuth, async (req, res) => {
    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Feedback non valido' });
    try {
      const fb = await service.feedback(req.params.id as string, req.user!.id, parsed.data);
      res.json({ rating: fb.rating });
    } catch (err) {
      if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
      throw err;
    }
  });

  return router;
}
