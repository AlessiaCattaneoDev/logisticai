import { describe, expect, it } from 'vitest';
import { greeting, relativeDay } from './time';

describe('relativeDay', () => {
  const now = new Date(2026, 9, 12, 10, 0);
  it('usa oggi, ieri e i giorni fa nella settimana', () => {
    expect(relativeDay(new Date(2026, 9, 12, 8).toISOString(), now)).toBe('oggi');
    expect(relativeDay(new Date(2026, 9, 11, 23).toISOString(), now)).toBe('ieri');
    expect(relativeDay(new Date(2026, 9, 9).toISOString(), now)).toBe('3 giorni fa');
  });
  it('oltre la settimana mostra la data', () => {
    expect(relativeDay(new Date(2026, 8, 20).toISOString(), now)).toMatch(/20 set/);
  });
});

describe('greeting', () => {
  it('cambia con l\'ora', () => {
    expect(greeting(new Date(2026, 9, 12, 9))).toBe('Buongiorno');
    expect(greeting(new Date(2026, 9, 12, 15))).toBe('Buon pomeriggio');
    expect(greeting(new Date(2026, 9, 12, 20))).toBe('Buonasera');
  });
});
