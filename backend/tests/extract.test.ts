import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectKind, extractMarkdown, ExtractionError, htmlToMarkdown } from '../src/documents/extract';
import { chunkMarkdown } from '../src/rag/chunker';

const fx = (name: string) => readFileSync(resolve(import.meta.dirname, 'fixtures/documents', name));

describe('riconoscimento del formato', () => {
  it.each([
    ['inventario.pdf', 'pdf'],
    ['policy-resi.docx', 'docx'],
    ['note.txt', 'txt'],
  ] as const)('%s -> %s', (file, kind) => {
    expect(detectKind(file, fx(file))).toBe(kind);
  });

  it('rifiuta un falso PDF, estensioni non ammesse e binari rinominati', () => {
    expect(detectKind('finto.pdf', fx('finto.pdf'))).toBeNull();
    expect(detectKind('virus.exe', fx('note.txt'))).toBeNull();
    expect(detectKind('immagine.txt', fx('inventario.pdf').subarray(0, 50).fill(0, 10, 12))).toBeNull();
    expect(detectKind('policy.docx', fx('note.txt'))).toBeNull();
  });
});

describe('estrazione del testo', () => {
  it('PDF con testo', async () => {
    const md = await extractMarkdown('pdf', fx('inventario.pdf'));
    expect(md).toContain('Istruzione operativa inventario');
    expect(md).toContain('0,5%');
  });

  it('PDF scansionato: errore leggibile', async () => {
    await expect(extractMarkdown('pdf', fx('scansione.pdf'))).rejects.toThrow(ExtractionError);
    await expect(extractMarkdown('pdf', fx('scansione.pdf'))).rejects.toThrow(/scansione/);
  });

  it('DOCX: titoli convertiti in Markdown', async () => {
    const md = await extractMarkdown('docx', fx('policy-resi.docx'));
    expect(md).toMatch(/^# Policy resi e-commerce/);
    expect(md).toContain('## Finestra di reso');
    expect(md).toContain('30 giorni');
  });

  it('TXT diretto, senza BOM', async () => {
    const md = await extractMarkdown('txt', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), fx('note.txt')]));
    expect(md.startsWith('Contatti')).toBe(true);
  });

  it('file corrotto: errore leggibile', async () => {
    await expect(extractMarkdown('docx', Buffer.from('PK non un vero docx'))).rejects.toThrow(/non si può leggere/);
  });

  it('htmlToMarkdown gestisce elenchi ed entità', () => {
    expect(htmlToMarkdown('<h2>A &amp; B</h2><ul><li>uno</li><li>due</li></ul>')).toBe('## A & B\n\n- uno\n- due');
  });
});

describe('sezioni dei documenti caricati', () => {
  it('DOCX con titoli: una sezione per titolo, metadati del documento', async () => {
    const md = await extractMarkdown('docx', fx('policy-resi.docx'));
    const chunks = chunkMarkdown('policy-resi.docx', md, { idPrefix: 'doc1', extra: { documentId: 'doc1', categoryId: 'cat1', categoria: 'Reclami e giacenze' } });
    expect(chunks.map((c) => c.metadata.sezione)).toEqual(['Introduzione', 'Finestra di reso', 'Ritiro del reso']);
    expect(chunks[1]).toMatchObject({ id: 'doc1#1.0', metadata: { documento: 'Policy resi e-commerce', documentId: 'doc1', categoryId: 'cat1' } });
  });

  it('testo senza titoli: titolo dal nome, parti numerate se lungo', () => {
    const long = Array.from({ length: 30 }, (_, i) => `Paragrafo ${i} ${'testo '.repeat(25)}`).join('\n\n');
    const chunks = chunkMarkdown('manuale.txt', long, { titolo: 'Manuale carrelli', idPrefix: 'd2' });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].metadata).toMatchObject({ documento: 'Manuale carrelli', sezione: 'Manuale carrelli (parte 1)' });
    expect(new Set(chunks.map((c) => c.id)).size).toBe(chunks.length);
  });
});
