import type { LLMUsage } from '../llm/types.js';

export interface Pricing {
  inputPer1M: number;
  outputPer1M: number;
  cachedInputPer1M: number | null;
}

/** Costo in USD (valuta dei listini). Senza prezzo configurato il costo è 0 e va segnalato in dashboard. */
export function computeCostUsd(usage: LLMUsage, pricing: Pricing | null): number {
  if (!pricing) return 0;
  const cachedRate = pricing.cachedInputPer1M ?? pricing.inputPer1M;
  return (
    (usage.inputTokens * pricing.inputPer1M + usage.cachedInputTokens * cachedRate + usage.outputTokens * pricing.outputPer1M) /
    1_000_000
  );
}

export const roundMoney = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
