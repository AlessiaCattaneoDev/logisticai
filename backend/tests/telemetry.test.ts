import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { computeCostUsd } from '../src/telemetry/costs';
import { findPricing, TelemetryRecorder } from '../src/telemetry/recorder';
import { createTestDb, resetDb } from './helpers/testDb';

const prisma = createTestDb();
afterAll(() => prisma.$disconnect());
beforeEach(() => resetDb(prisma));

const usage = { inputTokens: 1_000_000, outputTokens: 100_000, cachedInputTokens: 500_000 };

describe('computeCostUsd', () => {
  it('somma input, output e input in cache', () => {
    expect(computeCostUsd(usage, { inputPer1M: 4, outputPer1M: 20, cachedInputPer1M: 0.4 })).toBeCloseTo(4 + 2 + 0.2);
  });

  it('senza prezzo cache usa il prezzo di input', () => {
    expect(computeCostUsd(usage, { inputPer1M: 2, outputPer1M: 10, cachedInputPer1M: null })).toBeCloseTo(2 + 1 + 1);
  });

  it('senza listino il costo è zero', () => {
    expect(computeCostUsd(usage, null)).toBe(0);
  });
});

describe('prezzi nel tempo', () => {
  it('usa il listino valido alla data della chiamata', async () => {
    await prisma.modelPricing.createMany({
      data: [
        { provider: 'p', model: 'm', inputPer1M: 5, outputPer1M: 25, validFrom: new Date('2026-01-01') },
        { provider: 'p', model: 'm', inputPer1M: 4, outputPer1M: 20, validFrom: new Date('2026-09-01') },
      ],
    });
    expect((await findPricing(prisma, 'p', 'm', new Date('2026-06-15')))?.inputPer1M).toBe(5);
    expect((await findPricing(prisma, 'p', 'm', new Date('2026-10-01')))?.inputPer1M).toBe(4);
    expect(await findPricing(prisma, 'p', 'm', new Date('2025-12-31'))).toBeNull();
  });
});

describe('TelemetryRecorder', () => {
  it('registra token, costo in USD ed EUR e latenza', async () => {
    await prisma.modelPricing.create({ data: { provider: 'anthropic', model: 'claude-x', inputPer1M: 4, outputPer1M: 20, cachedInputPer1M: 0.4, validFrom: new Date('2026-01-01') } });
    const recorder = new TelemetryRecorder(prisma, 0.9);
    const row = await recorder.record({
      component: 'orchestrator', provider: 'anthropic', model: 'claude-x',
      usage: { inputTokens: 2000, outputTokens: 500, cachedInputTokens: 1000 }, latencyMs: 1234,
    });
    expect(row.costUsd).toBeCloseTo((2000 * 4 + 1000 * 0.4 + 500 * 20) / 1e6, 6);
    expect(row.costEur).toBeCloseTo(row.costUsd * 0.9, 6);
    expect(row).toMatchObject({ inputTokens: 2000, outputTokens: 500, cachedTokens: 1000, latencyMs: 1234, ok: true });
  });

  it('modello senza listino: chiamata registrata con costo zero', async () => {
    const row = await new TelemetryRecorder(prisma, 0.9).record({
      component: 'embedding', provider: 'openai', model: 'senza-prezzo',
      usage: { inputTokens: 10, outputTokens: 0, cachedInputTokens: 0 }, latencyMs: 3,
    });
    expect(row.costUsd).toBe(0);
  });
});
