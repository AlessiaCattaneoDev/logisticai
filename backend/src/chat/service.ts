import { randomUUID } from 'node:crypto';
import type {
  Artifact,
  ChatResponse,
  ChatStreamEvent,
  ConversationDetail,
  ConversationSummary,
  DataAgentDetails,
  FeedbackRating,
  Source,
  StoredMessage,
  ToolName,
  ToolUsage,
} from '@logisticai/shared';
import type { PrismaClient } from '../db/client.js';
import { LLMError, type NeutralMessage } from '../llm/types.js';
import type { Orchestrator, OrchestratorOutcome } from '../orchestrator/agent.js';
import type { TelemetryRecorder } from '../telemetry/recorder.js';

export class NotFoundError extends Error {}

const ERROR_REPLY = 'Si è verificato un errore durante la risposta. Riprova tra qualche istante.';

export class ChatService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly orchestrator: Pick<Orchestrator, 'run'>,
    private readonly recorder: TelemetryRecorder,
    private readonly historyLimit = 20,
  ) {}

  /** Conversazione esistente dell'utente (404 se non sua) oppure nuova. Da chiamare prima di aprire lo stream. */
  async resolveConversation(userId: string, conversationId: string | undefined, firstMessage: string) {
    if (conversationId) {
      const conv = await this.prisma.conversation.findFirst({ where: { id: conversationId, userId, archivedAt: null } });
      if (!conv) throw new NotFoundError('Conversazione non trovata');
      return conv;
    }
    const title = firstMessage.trim().replace(/\s+/g, ' ').slice(0, 60);
    return this.prisma.conversation.create({ data: { userId, title } });
  }

  private async history(conversationId: string): Promise<NeutralMessage[]> {
    const rows = await this.prisma.message.findMany({
      where: { conversationId, status: 'ok' },
      orderBy: { createdAt: 'desc' },
      take: this.historyLimit,
    });
    return rows.reverse().map((m) => ({ role: m.role === 'USER' ? 'user' : 'assistant', content: m.content }) as NeutralMessage);
  }

  async *handle(input: { userId: string; conversationId: string; message: string; signal?: AbortSignal }): AsyncGenerator<ChatStreamEvent> {
    const started = performance.now();
    const history = await this.history(input.conversationId);
    await this.prisma.message.create({ data: { conversationId: input.conversationId, role: 'USER', content: input.message } });

    let outcome: OrchestratorOutcome;
    try {
      const run = this.orchestrator.run({ history, message: input.message, userId: input.userId, requestId: randomUUID(), signal: input.signal });
      for (;;) {
        const step = await run.next();
        if (step.done) {
          outcome = step.value;
          break;
        }
        yield step.value;
      }
    } catch (err) {
      const interrupted = input.signal?.aborted;
      await this.prisma.message.create({
        data: { conversationId: input.conversationId, role: 'ASSISTANT', content: interrupted ? 'Risposta interrotta.' : ERROR_REPLY, status: 'error', latencyMs: Math.round(performance.now() - started) },
      });
      if (!interrupted) {
        yield { event: 'error', data: { message: ERROR_REPLY, retryable: err instanceof LLMError ? err.retryable : true } };
      }
      return;
    }

    const latencyMs = Math.round(performance.now() - started);
    const message = await this.prisma.message.create({
      data: { conversationId: input.conversationId, role: 'ASSISTANT', content: outcome.reply, latencyMs },
    });
    await this.persistDetails(message.id, outcome);
    await this.prisma.conversation.update({ where: { id: input.conversationId }, data: { updatedAt: new Date() } });

    let costEur = 0;
    for (const call of outcome.llmCalls) {
      const row = await this.recorder.record({ ...call, userId: input.userId, conversationId: input.conversationId, messageId: message.id });
      costEur += row.costEur;
    }
    const orchestratorCalls = outcome.llmCalls.filter((c) => c.component === 'orchestrator');
    const response: ChatResponse = {
      conversationId: input.conversationId,
      messageId: message.id,
      reply: outcome.reply,
      artifacts: outcome.artifacts,
      sources: outcome.sources,
      toolsUsed: outcome.toolsUsed,
      ...(outcome.dataAgent ? { dataAgent: outcome.dataAgent } : {}),
      usage: {
        inputTokens: orchestratorCalls.reduce((s, c) => s + c.usage.inputTokens + c.usage.cachedInputTokens, 0),
        outputTokens: orchestratorCalls.reduce((s, c) => s + c.usage.outputTokens, 0),
        costEur: Math.round(costEur * 1_000_000) / 1_000_000,
        latencyMs,
      },
    };
    yield { event: 'done', data: response };
  }

  private async persistDetails(messageId: string, outcome: OrchestratorOutcome) {
    await this.prisma.toolCall.createMany({
      data: outcome.toolLog.map((t, position) => ({
        messageId, tool: t.tool, args: t.args as object, resultSummary: t.resultSummary, durationMs: t.durationMs, ok: t.ok, error: t.error, position,
      })),
    });
    const artifacts: { type: string; payload: object }[] = outcome.artifacts.map((a) => ({ type: a.kind, payload: a }));
    if (outcome.sources.length) artifacts.push({ type: 'source', payload: outcome.sources });
    if (outcome.dataAgent) artifacts.push({ type: 'data_agent', payload: outcome.dataAgent });
    await this.prisma.messageArtifact.createMany({ data: artifacts.map((a, position) => ({ messageId, ...a, position })) });
  }

  async list(userId: string): Promise<ConversationSummary[]> {
    const rows = await this.prisma.conversation.findMany({ where: { userId, archivedAt: null }, orderBy: { updatedAt: 'desc' }, take: 100 });
    return rows.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString() }));
  }

  /** Dettaglio di una conversazione; con `userId` null (admin) non si filtra per proprietario. */
  async detail(conversationId: string, userId: string | null): Promise<ConversationDetail> {
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, ...(userId ? { userId, archivedAt: null } : {}) },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { artifacts: { orderBy: { position: 'asc' } }, toolCalls: { orderBy: { position: 'asc' } }, feedback: true },
        },
      },
    });
    if (!conv) throw new NotFoundError('Conversazione non trovata');
    return {
      id: conv.id,
      title: conv.title,
      updatedAt: conv.updatedAt.toISOString(),
      messages: conv.messages.map((m): StoredMessage => {
        const byType = (t: string) => m.artifacts.filter((a) => a.type === t).map((a) => a.payload);
        return {
          id: m.id,
          role: m.role === 'USER' ? 'user' : 'assistant',
          content: m.content,
          status: m.status === 'error' ? 'error' : 'ok',
          createdAt: m.createdAt.toISOString(),
          artifacts: m.artifacts.filter((a) => a.type === 'chart' || a.type === 'table').map((a) => a.payload as unknown as Artifact),
          sources: (byType('source')[0] as unknown as Source[] | undefined) ?? [],
          toolsUsed: m.toolCalls.map((t): ToolUsage => ({ name: t.tool as ToolName, args: t.args as Record<string, unknown>, durationMs: t.durationMs, ok: t.ok })),
          ...(byType('data_agent')[0] ? { dataAgent: byType('data_agent')[0] as unknown as DataAgentDetails } : {}),
          ...(m.feedback ? { feedback: m.feedback.rating as FeedbackRating } : {}),
        };
      }),
    };
  }

  async archive(conversationId: string, userId: string): Promise<void> {
    const { count } = await this.prisma.conversation.updateMany({ where: { id: conversationId, userId, archivedAt: null }, data: { archivedAt: new Date() } });
    if (!count) throw new NotFoundError('Conversazione non trovata');
  }

  async feedback(messageId: string, userId: string, data: { rating: FeedbackRating; reason?: string; comment?: string }) {
    const message = await this.prisma.message.findFirst({ where: { id: messageId, role: 'ASSISTANT', conversation: { userId } } });
    if (!message) throw new NotFoundError('Messaggio non trovato');
    const fields = { rating: data.rating, reason: data.rating === 'down' ? (data.reason ?? null) : null, comment: data.comment ?? null };
    return this.prisma.feedback.upsert({
      where: { messageId },
      create: { messageId, userId, ...fields },
      update: { ...fields, status: 'new' },
    });
  }
}
