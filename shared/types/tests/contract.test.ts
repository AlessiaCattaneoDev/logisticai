import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { artifactSchema, chartSpecSchema, MAX_CHART_POINTS } from '../src/artifacts';

const fixturesDir = join(__dirname, '..', '..', 'contracts', 'fixtures');
const load = (sub: string) =>
  readdirSync(join(fixturesDir, sub))
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f, JSON.parse(readFileSync(join(fixturesDir, sub, f), 'utf8'))] as const);

describe('contratto artifact (fixture condivise con pydantic)', () => {
  it.each(load('valid'))('accetta %s', (_name, json) => {
    expect(artifactSchema.safeParse(json).success).toBe(true);
  });

  it.each(load('invalid'))('rifiuta %s', (_name, json) => {
    expect(artifactSchema.safeParse(json).success).toBe(false);
  });

  it(`rifiuta grafici con più di ${MAX_CHART_POINTS} punti`, () => {
    const data = Array.from({ length: MAX_CHART_POINTS + 1 }, (_, i) => ({ x: i, y: i }));
    const spec = { kind: 'chart', id: 'big', type: 'line', title: 't', xKey: 'x', series: [{ key: 'y', label: 'y' }], data };
    expect(chartSpecSchema.safeParse(spec).success).toBe(false);
  });
});
