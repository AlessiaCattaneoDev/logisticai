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

/** Prezzo valido alla data della chiamata: cambiare listino non riscrive i costi passati. */
export async function findPricing(prisma: PrismaClient, provider: string, model: string, at: Date): Promise<Pricing | null> {
  return prisma.modelPricing.findFirst({
    where: { provider, model, validFrom: { lte: at } },
    orderBy: { validFrom: 'desc' },
    select: { inputPer1M: true, outputPer1M: true, cachedInputPer1M: true },
  });
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
