import type {
  AdminAuditRow,
  AdminConversationDetail,
  AdminConversationRow,
  AdminCosts,
  AdminFeedbackRow,
  AdminOverview,
  AdminSystem,
  AdminUserRow,
  FeedbackStatus,
  Pseudonym,
  Role,
} from '@logisticai/shared';
import { hashPassword } from '../auth/password.js';
import type { ChatService } from '../chat/service.js';
import type { PrismaClient } from '../db/client.js';
import { findPricing } from '../telemetry/recorder.js';

export interface AdminDeps {
  prisma: PrismaClient;
  chat: Pick<ChatService, 'detail'>;
  budgets: { dailyEur: number; monthlyEur: number; usdEurRate: number };
  models: { orchestrator: string; dataAgent: string; embedding: string };
  system?: () => Promise<Omit<AdminSystem, 'ultimiErrori'>>;
  now?: () => Date;
}

export class AdminError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
  }
}

const round = (v: number, d = 4) => Math.round(v * 10 ** d) / 10 ** d;
const day = (d: Date) => d.toISOString().slice(0, 10);

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

export class AdminService {
  private readonly now: () => Date;
  constructor(private readonly deps: AdminDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private get prisma() {
    return this.deps.prisma;
  }

  /** Alias stabili "Utente #n" in ordine di creazione. */
  private async aliases(): Promise<Map<string, Pseudonym>> {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true } });
    return new Map(users.map((u, i) => [u.id, { id: u.id, alias: `Utente #${i + 1}` }]));
  }

  private async audit(actorId: string, action: string, targetType: string, targetId?: string) {
    await this.prisma.auditLog.create({ data: { actorId, action, targetType, targetId } });
  }

  range(from?: string, to?: string): { da: Date; a: Date } {
    const a = to ? new Date(`${to}T23:59:59.999Z`) : this.now();
    const da = from ? new Date(`${from}T00:00:00.000Z`) : new Date(a.getTime() - 29 * 86_400_000);
    if (Number.isNaN(da.getTime()) || Number.isNaN(a.getTime()) || da > a) throw new AdminError('Periodo non valido', 400);
    return { da, a };
  }

  async overview(from?: string, to?: string): Promise<AdminOverview> {
    const { da, a } = this.range(from, to);
    const now = this.now();
    const startOfDay = new Date(`${day(now)}T00:00:00.000Z`);
    const startOfMonth = new Date(`${day(now).slice(0, 7)}-01T00:00:00.000Z`);
    const [calls, messages, feedback, costToday, costMonth] = await Promise.all([
      this.prisma.llmCall.findMany({ where: { createdAt: { gte: da, lte: a } } }),
      this.prisma.message.findMany({
        where: { role: 'ASSISTANT', createdAt: { gte: da, lte: a } },
        include: { toolCalls: true, conversation: { select: { userId: true } } },
      }),
      this.prisma.feedback.findMany({ where: { createdAt: { gte: da, lte: a } } }),
      this.prisma.llmCall.aggregate({ _sum: { costEur: true }, where: { createdAt: { gte: startOfDay } } }),
      this.prisma.llmCall.aggregate({ _sum: { costEur: true }, where: { createdAt: { gte: startOfMonth } } }),
    ]);

    const cost = calls.reduce((s, c) => s + c.costEur, 0);
    const conversations = new Set(messages.map((m) => m.conversationId));
    const latencies = messages.filter((m) => m.status === 'ok' && m.latencyMs !== null).map((m) => m.latencyMs!);
    const ups = feedback.filter((f) => f.rating === 'up').length;

    const unpriced = new Set<string>();
    for (const c of calls.filter((c) => c.costUsd === 0 && c.inputTokens + c.outputTokens > 0)) {
      if (!(await findPricing(this.prisma, c.provider, c.model, c.createdAt))) unpriced.add(`${c.provider}:${c.model}`);
    }

    const days: AdminOverview['giornaliero'] = [];
    for (let d = new Date(`${day(da)}T00:00:00.000Z`); d <= a; d = new Date(d.getTime() + 86_400_000)) {
      const key = day(d);
      const dc = calls.filter((c) => day(c.createdAt) === key);
      const dm = messages.filter((m) => day(m.createdAt) === key);
      const dl = dm.filter((m) => m.status === 'ok' && m.latencyMs !== null).map((m) => m.latencyMs!);
      const df = feedback.filter((f) => day(f.createdAt) === key);
      const costOf = (component: string) => round(dc.filter((c) => c.component === component).reduce((s, c) => s + c.costEur, 0));
      days.push({
        giorno: key,
        costo_orchestratore: costOf('orchestrator'),
        costo_embedding: costOf('embedding'),
        costo_data_agent: costOf('data_agent'),
        richieste: dm.length,
        latenza_media_s: dl.length ? round(dl.reduce((s, v) => s + v, 0) / dl.length / 1000, 1) : 0,
        latenza_p95_s: round(percentile(dl, 95) / 1000, 1),
        token_input: dc.reduce((s, c) => s + c.inputTokens + c.cachedTokens, 0),
        token_output: dc.reduce((s, c) => s + c.outputTokens, 0),
        feedback_positivi: df.filter((f) => f.rating === 'up').length,
        feedback_negativi: df.filter((f) => f.rating === 'down').length,
      });
    }

    const strategy = (tools: string[]) =>
      tools.includes('cerca_knowledge_base') && tools.includes('analizza_dati')
        ? 'Documenti e dati'
        : tools.includes('cerca_knowledge_base')
          ? 'Solo documenti'
          : tools.includes('analizza_dati')
            ? 'Solo dati'
            : 'Nessuno strumento';
    const counts = new Map<string, number>(['Solo documenti', 'Solo dati', 'Documenti e dati', 'Nessuno strumento'].map((k) => [k, 0]));
    for (const m of messages.filter((m) => m.status === 'ok')) {
      const k = strategy(m.toolCalls.filter((t) => t.ok).map((t) => t.tool));
      counts.set(k, counts.get(k)! + 1);
    }

    return {
      da: day(da),
      a: day(a),
      kpi: {
        costoPeriodoEur: round(cost),
        costoOggiEur: round(costToday._sum.costEur ?? 0),
        costoMeseEur: round(costMonth._sum.costEur ?? 0),
        budgetGiornalieroEur: this.deps.budgets.dailyEur,
        budgetMensileEur: this.deps.budgets.monthlyEur,
        richieste: messages.length,
        conversazioni: conversations.size,
        costoMedioRichiestaEur: messages.length ? round(cost / messages.length) : 0,
        costoMedioConversazioneEur: conversations.size ? round(cost / conversations.size) : 0,
        tokenInput: calls.reduce((s, c) => s + c.inputTokens + c.cachedTokens, 0),
        tokenOutput: calls.reduce((s, c) => s + c.outputTokens, 0),
        latenzaMediaMs: latencies.length ? Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length) : 0,
        latenzaP95Ms: percentile(latencies, 95),
        feedbackTotali: feedback.length,
        feedbackPositiviPct: feedback.length ? round(ups / feedback.length) : null,
        erroriPct: messages.length ? round(messages.filter((m) => m.status === 'error').length / messages.length) : 0,
        utentiAttivi: new Set(messages.map((m) => m.conversation.userId)).size,
        modelliSenzaPrezzo: [...unpriced],
      },
      giornaliero: days,
      decisioni: [...counts.entries()].map(([strategia, richieste]) => ({ strategia, richieste })),
    };
  }

  async conversations(filters: { from?: string; to?: string; userId?: string; feedback?: 'down'; errori?: boolean; q?: string }): Promise<AdminConversationRow[]> {
    const { da, a } = this.range(filters.from, filters.to);
    const aliases = await this.aliases();
    const rows = await this.prisma.conversation.findMany({
      where: {
        updatedAt: { gte: da, lte: a },
        ...(filters.userId ? { userId: filters.userId } : {}),
        ...(filters.q ? { OR: [{ title: { contains: filters.q } }, { messages: { some: { content: { contains: filters.q } } } }] } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: { messages: { include: { toolCalls: true, feedback: true } }, llmCalls: { select: { costEur: true } } },
    });
    return rows
      .map((c) => ({
        id: c.id,
        titolo: c.title,
        utente: aliases.get(c.userId) ?? { id: c.userId, alias: 'Utente' },
        aggiornata: c.updatedAt.toISOString(),
        messaggi: c.messages.length,
        costoEur: round(c.llmCalls.reduce((s, l) => s + l.costEur, 0)),
        strumenti: [...new Set(c.messages.flatMap((m) => m.toolCalls.filter((t) => t.ok).map((t) => t.tool)))],
        feedbackNegativi: c.messages.filter((m) => m.feedback?.rating === 'down').length,
        errori: c.messages.filter((m) => m.status === 'error').length,
      }))
      .filter((r) => (filters.feedback === 'down' ? r.feedbackNegativi > 0 : true) && (filters.errori ? r.errori > 0 : true));
  }

  async conversationDetail(id: string, adminId: string): Promise<AdminConversationDetail> {
    const detail = await this.deps.chat.detail(id, null).catch(() => {
      throw new AdminError('Conversazione non trovata', 404);
    });
    const conv = await this.prisma.conversation.findUniqueOrThrow({ where: { id }, select: { userId: true } });
    const messages = await this.prisma.message.findMany({ where: { conversationId: id, role: 'ASSISTANT' }, include: { llmCalls: true, toolCalls: { orderBy: { position: 'asc' } } } });
    await this.audit(adminId, 'apertura_conversazione', 'conversation', id);
    const aliases = await this.aliases();
    return {
      ...detail,
      utente: aliases.get(conv.userId) ?? { id: conv.userId, alias: 'Utente' },
      trace: Object.fromEntries(
        messages.map((m) => [
          m.id,
          {
            costoEur: round(m.llmCalls.reduce((s, c) => s + c.costEur, 0)),
            latenzaMs: m.latencyMs,
            chiamate: m.llmCalls
              .sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())
              .map((c) => ({ componente: c.component, provider: c.provider, modello: c.model, tokenInput: c.inputTokens, tokenOutput: c.outputTokens, tokenCache: c.cachedTokens, costoEur: round(c.costEur, 6), latenzaMs: c.latencyMs })),
            strumenti: m.toolCalls.map((t) => ({ tool: t.tool, ok: t.ok, durationMs: t.durationMs, resultSummary: t.resultSummary, error: t.error, args: t.args })),
          },
        ]),
      ),
    };
  }

  async feedback(filters: { stato?: FeedbackStatus; rating?: 'up' | 'down' }): Promise<AdminFeedbackRow[]> {
    const aliases = await this.aliases();
    const rows = await this.prisma.feedback.findMany({
      where: { rating: filters.rating ?? 'down', ...(filters.stato ? { status: filters.stato } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { message: true },
    });
    const out: AdminFeedbackRow[] = [];
    for (const f of rows) {
      const question = await this.prisma.message.findFirst({
        where: { conversationId: f.message.conversationId, role: 'USER', createdAt: { lte: f.message.createdAt } },
        orderBy: { createdAt: 'desc' },
      });
      out.push({
        id: f.id,
        rating: f.rating as 'up' | 'down',
        motivo: f.reason,
        commento: f.comment,
        stato: f.status as FeedbackStatus,
        notaAdmin: f.adminNote,
        creato: f.createdAt.toISOString(),
        messageId: f.messageId,
        conversationId: f.message.conversationId,
        domanda: question?.content ?? '',
        risposta: f.message.content.slice(0, 600),
        utente: aliases.get(f.userId) ?? { id: f.userId, alias: 'Utente' },
      });
    }
    return out;
  }

  async updateFeedback(id: string, adminId: string, data: { stato?: FeedbackStatus; notaAdmin?: string }) {
    const exists = await this.prisma.feedback.findUnique({ where: { id } });
    if (!exists) throw new AdminError('Feedback non trovato', 404);
    await this.prisma.feedback.update({ where: { id }, data: { ...(data.stato ? { status: data.stato } : {}), ...(data.notaAdmin !== undefined ? { adminNote: data.notaAdmin } : {}) } });
    await this.audit(adminId, 'revisione_feedback', 'feedback', id);
  }

  async costs(from?: string, to?: string): Promise<AdminCosts> {
    const { da, a } = this.range(from, to);
    const aliases = await this.aliases();
    const calls = await this.prisma.llmCall.findMany({ where: { createdAt: { gte: da, lte: a } } });
    const byModel = new Map<string, AdminCosts['perModello'][number]>();
    for (const c of calls) {
      const key = `${c.provider}|${c.model}|${c.component}`;
      const row = byModel.get(key) ?? { provider: c.provider, modello: c.model, componente: c.component, chiamate: 0, tokenInput: 0, tokenOutput: 0, costoEur: 0 };
      row.chiamate++;
      row.tokenInput += c.inputTokens + c.cachedTokens;
      row.tokenOutput += c.outputTokens;
      row.costoEur = round(row.costoEur + c.costEur, 6);
      byModel.set(key, row);
    }
    const byUser = new Map<string, { richieste: Set<string>; costoEur: number }>();
    for (const c of calls.filter((c) => c.userId)) {
      const row = byUser.get(c.userId!) ?? { richieste: new Set(), costoEur: 0 };
      if (c.messageId) row.richieste.add(c.messageId);
      row.costoEur += c.costEur;
      byUser.set(c.userId!, row);
    }
    const pricing = await this.prisma.modelPricing.findMany({ orderBy: [{ provider: 'asc' }, { model: 'asc' }, { validFrom: 'desc' }] });
    return {
      perModello: [...byModel.values()].sort((x, y) => y.costoEur - x.costoEur).map((r) => ({ ...r, costoEur: round(r.costoEur) })),
      perUtente: [...byUser.entries()]
        .map(([id, r]) => ({ utente: aliases.get(id) ?? { id, alias: 'Utente' }, richieste: r.richieste.size, costoEur: round(r.costoEur) }))
        .sort((x, y) => y.costoEur - x.costoEur),
      listini: pricing.map((p) => ({ id: p.id, provider: p.provider, modello: p.model, inputPer1M: p.inputPer1M, outputPer1M: p.outputPer1M, cachedInputPer1M: p.cachedInputPer1M, validoDal: day(p.validFrom) })),
      modelliAttivi: { orchestratore: this.deps.models.orchestrator, dataAgent: this.deps.models.dataAgent, embedding: this.deps.models.embedding },
      budget: { giornalieroEur: this.deps.budgets.dailyEur, mensileEur: this.deps.budgets.monthlyEur, cambioUsdEur: this.deps.budgets.usdEurRate },
    };
  }

  async addPricing(adminId: string, p: { provider: string; modello: string; inputPer1M: number; outputPer1M: number; cachedInputPer1M?: number | null; validoDal: string }) {
    const validFrom = new Date(`${p.validoDal}T00:00:00.000Z`);
    try {
      const row = await this.prisma.modelPricing.create({
        data: { provider: p.provider, model: p.modello, inputPer1M: p.inputPer1M, outputPer1M: p.outputPer1M, cachedInputPer1M: p.cachedInputPer1M ?? null, validFrom },
      });
      await this.audit(adminId, 'nuovo_listino', 'pricing', row.id);
      return row;
    } catch {
      throw new AdminError('Esiste già un listino per questo modello con la stessa data', 409);
    }
  }

  async users(): Promise<AdminUserRow[]> {
    const aliases = await this.aliases();
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    const calls = await this.prisma.llmCall.groupBy({ by: ['userId'], _sum: { costEur: true } });
    const requests = await this.prisma.message.findMany({ where: { role: 'ASSISTANT' }, select: { conversation: { select: { userId: true } } } });
    return users.map((u) => ({
      id: u.id,
      alias: aliases.get(u.id)!.alias,
      username: u.username,
      ruolo: u.role,
      attivo: u.active,
      creato: u.createdAt.toISOString(),
      ultimoAccesso: u.lastLoginAt?.toISOString() ?? null,
      richieste: requests.filter((r) => r.conversation.userId === u.id).length,
      costoEur: round(calls.find((c) => c.userId === u.id)?._sum.costEur ?? 0),
    }));
  }

  async createUser(adminId: string, data: { username: string; password: string; ruolo: Role }) {
    if (await this.prisma.user.findUnique({ where: { username: data.username } })) throw new AdminError('Nome utente già in uso', 409);
    const user = await this.prisma.user.create({ data: { username: data.username, passwordHash: await hashPassword(data.password), role: data.ruolo } });
    await this.audit(adminId, 'creazione_utente', 'user', user.id);
    return user;
  }

  async updateUser(adminId: string, id: string, data: { attivo?: boolean; ruolo?: Role; password?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new AdminError('Utente non trovato', 404);
    if (id === adminId && (data.attivo === false || (data.ruolo && data.ruolo !== 'ADMIN'))) {
      throw new AdminError('Non puoi disattivare o declassare il tuo account', 400);
    }
    await this.prisma.user.update({
      where: { id },
      data: {
        ...(data.attivo !== undefined ? { active: data.attivo } : {}),
        ...(data.ruolo ? { role: data.ruolo } : {}),
        ...(data.password ? { passwordHash: await hashPassword(data.password) } : {}),
      },
    });
    await this.audit(adminId, data.password ? 'reset_password' : 'modifica_utente', 'user', id);
  }

  /** Mostra i nomi reali al posto degli pseudonimi: azione tracciata. */
  async revealNames(adminId: string): Promise<Record<string, string>> {
    await this.audit(adminId, 'visualizzazione_nomi', 'user');
    const users = await this.prisma.user.findMany({ select: { id: true, username: true } });
    return Object.fromEntries(users.map((u) => [u.id, u.username]));
  }

  async system(): Promise<AdminSystem> {
    const base = (await this.deps.system?.()) ?? { servizi: {}, knowledgeBase: null, qualitaDati: null };
    const errors = await this.prisma.message.findMany({ where: { status: 'error' }, orderBy: { createdAt: 'desc' }, take: 10 });
    return { ...base, ultimiErrori: errors.map((e) => ({ quando: e.createdAt.toISOString(), conversationId: e.conversationId, messaggio: e.content })) };
  }

  async auditLog(): Promise<AdminAuditRow[]> {
    const rows = await this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { actor: { select: { username: true } } } });
    return rows.map((r) => ({ id: r.id, quando: r.createdAt.toISOString(), admin: r.actor.username, azione: r.action, oggetto: `${r.targetType}${r.targetId ? ` ${r.targetId.slice(0, 8)}` : ''}` }));
  }
}
