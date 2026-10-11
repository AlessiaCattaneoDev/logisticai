import type { PrismaClient } from '../db/client.js';
import type { LLMUsage } from '../llm/types.js';
import { computeCostUsd, roundMoney, type Pricing } from './costs.js';

export type LlmComponent = 'orchestrator' | 'embedding' | 'data_agent';

export interface LlmCallInput {
  component: LlmComponent;
  provider: string;
  model: string;
  usage: LLMUsage;
  latencyMs: number;
  ok?: boolean;
  userId?: string;
  conversationId?: string;
  messageId?: string;
  at?: Date;
}

/**
 * Prezzo valido alla data della chiamata: cambiare listino non riscrive i costi passati.
 * Le API restituiscono spesso nomi con data (gpt-5.4-mini-2026-03-17): se non c'è un prezzo per il
 * nome esatto si usa quello del modello base più specifico che ne è prefisso (gpt-5.4-mini).
 */
export async function findPricing(prisma: PrismaClient, provider: string, model: string, at: Date): Promise<Pricing | null> {
  const rows = await prisma.modelPricing.findMany({
    where: { provider, validFrom: { lte: at } },
    orderBy: { validFrom: 'desc' },
    select: { model: true, inputPer1M: true, outputPer1M: true, cachedInputPer1M: true },
  });
  const match =
    rows.find((r) => r.model === model) ??
    rows.filter((r) => model.startsWith(`${r.model}-`)).sort((a, b) => b.model.length - a.model.length)[0];
  return match ? { inputPer1M: match.inputPer1M, outputPer1M: match.outputPer1M, cachedInputPer1M: match.cachedInputPer1M } : null;
}

/** Ricalcola i costi delle chiamate registrate senza listino (es. prezzi inseriti dopo). */
export async function recalculateMissingCosts(prisma: PrismaClient, usdEurRate: number): Promise<number> {
  const calls = await prisma.llmCall.findMany({ where: { costUsd: 0, OR: [{ inputTokens: { gt: 0 } }, { outputTokens: { gt: 0 } }] } });
  let updated = 0;
  for (const c of calls) {
    const pricing = await findPricing(prisma, c.provider, c.model, c.createdAt);
    if (!pricing) continue;
    const costUsd = computeCostUsd({ inputTokens: c.inputTokens, outputTokens: c.outputTokens, cachedInputTokens: c.cachedTokens }, pricing);
    await prisma.llmCall.update({ where: { id: c.id }, data: { costUsd: roundMoney(costUsd), costEur: roundMoney(costUsd * usdEurRate) } });
    updated++;
  }
  return updated;
}

/** Unico punto in cui si registrano le chiamate ai modelli (orchestratore, embedding, data agent). */
export class TelemetryRecorder {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly usdEurRate: number,
  ) {}

  async record(input: LlmCallInput) {
    const at = input.at ?? new Date();
    const costUsd = computeCostUsd(input.usage, await findPricing(this.prisma, input.provider, input.model, at));
    return this.prisma.llmCall.create({
      data: {
        component: input.component,
        provider: input.provider,
        model: input.model,
        inputTokens: input.usage.inputTokens,
        outputTokens: input.usage.outputTokens,
        cachedTokens: input.usage.cachedInputTokens,
        costUsd: roundMoney(costUsd),
        costEur: roundMoney(costUsd * this.usdEurRate),
        latencyMs: input.latencyMs,
        ok: input.ok ?? true,
        userId: input.userId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        createdAt: at,
      },
    });
  }
}
