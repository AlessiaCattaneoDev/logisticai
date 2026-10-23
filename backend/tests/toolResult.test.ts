import { describe, expect, it } from 'vitest';
import { fitJson } from '../src/orchestrator/toolResult';

describe('fitJson', () => {
  it('sotto il limite: JSON invariato', () => {
    const value = { trovato: true, risultati: [{ testo: 'breve' }] };
    expect(fitJson(value, 1000)).toBe(JSON.stringify(value));
  });

  it('testi lunghi: accorciati, JSON valido e segnalato come troncato', () => {
    const value = { trovato: true, risultati: Array.from({ length: 8 }, (_, i) => ({ documento: `Doc ${i}`, sezione: 'S', testo: 'x'.repeat(5000) })) };
    const out = fitJson(value, 12_000);
    expect(out.length).toBeLessThanOrEqual(12_000);
    const parsed = JSON.parse(out);
    expect(parsed.troncato).toBe(true);
    // Si accorciano i testi prima di togliere risultati: tutti i documenti restano citabili.
    expect(parsed.risultati.map((r: { documento: string }) => r.documento)).toEqual(value.risultati.map((r) => r.documento));
    expect(parsed.risultati[0].testo).toMatch(/\[testo troncato\]$/);
  });

  it('troppi elementi brevi: toglie gli ultimi', () => {
    const value = { righe: Array.from({ length: 2000 }, (_, i) => ({ id: i, nome: `riga ${i}` })) };
    const out = fitJson(value, 2000);
    expect(out.length).toBeLessThanOrEqual(2000);
    const parsed = JSON.parse(out);
    expect(parsed.righe[0]).toEqual({ id: 0, nome: 'riga 0' });
    expect(parsed.righe.length).toBeLessThan(2000);
  });

  it('caratteri speciali e virgolette nel testo: sempre JSON valido', () => {
    const value = { sintesi: '"virgolette" \\ e a capo\n'.repeat(3000) };
    const out = fitJson(value, 1500);
    expect(out.length).toBeLessThanOrEqual(1500);
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it('limite impossibile da rispettare: nota di ripiego valida', () => {
    const out = fitJson({ a: 'x'.repeat(1000) }, 50);
    expect(JSON.parse(out)).toMatchObject({ troncato: true });
  });
});
