import { describe, expect, it } from 'vitest';
import { slug, toCsv } from './csv';

describe('toCsv', () => {
  it('separatore ; e virgola decimale, celle vuote e testo con virgolette', () => {
    const csv = toCsv(
      [{ key: 'cliente', label: 'Cliente' }, { key: 'margine', label: 'Margine %' }],
      [{ cliente: 'CasaViva "Arredo"', margine: -0.07 }, { cliente: 'ModaNova', margine: null }],
    );
    expect(csv).toBe('﻿Cliente;Margine %\r\n"CasaViva ""Arredo""";-0,07\r\nModaNova;');
  });
});

describe('slug', () => {
  it('nome file leggibile', () => {
    expect(slug('Puntualità ModaNova - settembre 2026')).toBe('puntualita-modanova-settembre-2026');
  });
});
