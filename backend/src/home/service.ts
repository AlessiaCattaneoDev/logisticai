import type { AuthUser, HomeData } from '@logisticai/shared';
import type { PrismaClient } from '../db/client.js';

export interface HomeDeps {
  prisma: PrismaClient;
  dailyBudgetEur: number;
  services?: () => Promise<Record<string, 'ok' | 'down'>>;
  now?: () => Date;
}

const STRATEGIE = ['Solo documenti', 'Solo dati', 'Documenti e dati', 'Nessuno strumento'] as const;

function strategia(tools: string[]): (typeof STRATEGIE)[number] {
  const kb = tools.includes('cerca_knowledge_base');
  const dati = tools.includes('analizza_dati');
  return kb && dati ? 'Documenti e dati' : kb ? 'Solo documenti' : dati ? 'Solo dati' : 'Nessuno strumento';
}

/** Home dopo il login: la dashboard personale dell'utente, con in più gli indicatori dell'admin. */
export class HomeService {
  constructor(private readonly deps: HomeDeps) {}

  async get(user: AuthUser): Promise<HomeData> {
    const { prisma } = this.deps;
    const now = this.deps.now?.() ?? new Date();
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const startOfMonth = new Date(`${day(now).slice(0, 7)}-01T00:00:00.000Z`);
    const since30 = new Date(now.getTime() - 29 * 86_400_000);
    const since14 = new Date(`${day(new Date(now.getTime() - 13 * 86_400_000))}T00:00:00.000Z`);
    const mine = { conversation: { userId: user.id } };

    const [documentiDisponibili, categorie, conversazioni, domandeMese, feedback, risposte30, domande14, recentConv, recentDocs] = await Promise.all([
      prisma.document.count({ where: { status: 'ready' } }),
      prisma.documentCategory.count(),
      prisma.conversation.count({ where: { userId: user.id, archivedAt: null } }),
      prisma.message.count({ where: { ...mine, role: 'USER', createdAt: { gte: startOfMonth } } }),
      prisma.feedback.groupBy({ by: ['rating'], where: { userId: user.id }, _count: true }),
      prisma.message.findMany({ where: { ...mine, role: 'ASSISTANT', status: 'ok', createdAt: { gte: since30 } }, select: { toolCalls: { select: { tool: true, ok: true } } } }),
      prisma.message.findMany({ where: { ...mine, role: 'USER', createdAt: { gte: since14 } }, select: { createdAt: true } }),
      prisma.conversation.findMany({ where: { userId: user.id, archivedAt: null }, orderBy: { updatedAt: 'desc' }, take: 5 }),
      prisma.document.findMany({ orderBy: { createdAt: 'desc' }, take: 5, include: { category: { select: { name: true } } } }),
    ]);

    const up = feedback.find((f) => f.rating === 'up')?._count ?? 0;
    const totFeedback = feedback.reduce((s, f) => s + f._count, 0);
    const perTipo = new Map<string, number>(STRATEGIE.map((s) => [s, 0]));
    for (const m of risposte30) {
      const k = strategia(m.toolCalls.filter((t) => t.ok).map((t) => t.tool));
      perTipo.set(k, perTipo.get(k)! + 1);
    }
    const giornaliere = Array.from({ length: 14 }, (_, i) => {
      const g = day(new Date(since14.getTime() + i * 86_400_000));
      return { giorno: g, domande: domande14.filter((m) => day(m.createdAt) === g).length };
    });

    const data: HomeData = {
      utente: { nome: user.username, ruolo: user.role },
      kpi: {
        documentiDisponibili,
        categorie,
        conversazioni,
        domandeMese,
        risposteUtiliPct: totFeedback ? Math.round((up / totFeedback) * 1000) / 1000 : null,
      },
      domandePerTipo: [...perTipo.entries()].map(([tipo, domande]) => ({ tipo, domande })),
      domandeGiornaliere: giornaliere,
      conversazioniRecenti: recentConv.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString() })),
      documentiRecenti: recentDocs.map((d) => ({ id: d.id, title: d.title, categoria: d.category.name, status: d.status as HomeData['documentiRecenti'][number]['status'], createdAt: d.createdAt.toISOString() })),
    };

    if (user.role === 'ADMIN') {
      const startOfDay = new Date(`${day(now)}T00:00:00.000Z`);
      const [cost, segnalazioni, servizi] = await Promise.all([
        prisma.llmCall.aggregate({ _sum: { costEur: true }, where: { createdAt: { gte: startOfDay } } }),
        prisma.feedback.count({ where: { rating: 'down', status: 'new' } }),
        this.deps.services?.() ?? Promise.resolve({}),
      ]);
      data.admin = {
        costoOggiEur: Math.round((cost._sum.costEur ?? 0) * 10_000) / 10_000,
        budgetGiornalieroEur: this.deps.dailyBudgetEur,
        segnalazioniDaRivedere: segnalazioni,
        servizi,
      };
    }
    return data;
  }
}
