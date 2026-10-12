import { describe, expect, it } from 'vitest';
import { formatValue } from './format';

// Intl usa spazi speciali (U+00A0, U+202F): li normalizziamo per confrontare.
const norm = (s: string) => s.replace(/[  ]/g, ' ');

describe('formatValue', () => {
  it('valori nulli diventano un trattino', () => {
    expect(formatValue(null, 'number')).toBe('-');
    expect(formatValue(undefined, 'currency_eur')).toBe('-');
  });

  it('valuta in euro, formato italiano', () => {
    expect(norm(formatValue(1250.5, 'currency_eur'))).toBe('1.250,50 €');
  });

  it('importi sotto il centesimo con più decimali', () => {
    expect(norm(formatValue(0.0013, 'currency_eur'))).toBe('0,0013 €');
    expect(norm(formatValue(0, 'currency_eur'))).toBe('0,00 €');
  });

  it('percentuali da frazione', () => {
    expect(norm(formatValue(0.928, 'percent'))).toBe('92,8%');
  });

  it('interi con separatore delle migliaia', () => {
    expect(formatValue(25000, 'integer')).toBe('25.000');
  });

  it('numeri con al massimo due decimali', () => {
    expect(formatValue(3.14159, 'number')).toBe('3,14');
  });

  it('durate in minuti diventano ore e minuti', () => {
    expect(formatValue(95, 'duration_min')).toBe('1 h 35 min');
    expect(formatValue(40, 'duration_min')).toBe('40 min');
  });

  it('date ISO in formato italiano', () => {
    expect(formatValue('2026-09-14', 'date')).toBe('14/09/2026');
  });

  it('date non valide restano come stringa', () => {
    expect(formatValue('non una data', 'date')).toBe('non una data');
  });

  it('senza formato: numeri come number, stringhe invariate', () => {
    expect(formatValue('ModaNova')).toBe('ModaNova');
    expect(formatValue(1234.5)).toBe('1.234,5');
  });
});

describe('formatCategory', () => {
  it('mesi in forma breve, date complete e testo invariato', async () => {
    const { formatCategory, isMonthlySeries } = await import('./format');
    expect(formatCategory('2026-09')).toBe('set 2026');
    expect(formatCategory('2026-09-01')).toBe('01/09/2026');
    expect(formatCategory('2026-09-01', true)).toBe('set 2026');
    expect(isMonthlySeries(['2026-08-01', '2026-09-01'])).toBe(true);
    expect(isMonthlySeries(['2026-09-01', '2026-09-08'])).toBe(false);
    expect(formatCategory('2026-09-14')).toBe('14/09/2026');
    expect(formatCategory('HUB-VR')).toBe('HUB-VR');
    expect(formatCategory(null)).toBe('');
  });
});
