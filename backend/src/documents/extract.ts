// Estrazione del testo dai documenti caricati: il risultato è sempre Markdown semplice
// (titoli "#"/"##" e paragrafi), così il chunker divide per sezioni quando i titoli ci sono.
import mammoth from 'mammoth';
import { extractText as extractPdfText } from 'unpdf';

export type DocKind = 'pdf' | 'docx' | 'txt' | 'md';

export const ACCEPTED_EXTENSIONS: Record<string, DocKind> = { '.pdf': 'pdf', '.docx': 'docx', '.txt': 'txt', '.md': 'md' };

export class ExtractionError extends Error {}

/** Formato dal nome e dalla firma reale del contenuto: un .pdf che non è un PDF viene rifiutato. */
export function detectKind(filename: string, data: Buffer): DocKind | null {
  const ext = filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? '';
  const kind = ACCEPTED_EXTENSIONS[ext];
  if (!kind) return null;
  if (kind === 'pdf') return data.subarray(0, 5).toString('latin1') === '%PDF-' ? 'pdf' : null;
  if (kind === 'docx') return data[0] === 0x50 && data[1] === 0x4b ? 'docx' : null; // archivio zip "PK"
  // Testo: niente byte nulli (file binari rinominati in .txt/.md)
  return data.includes(0) ? null : kind;
}

const decodeEntities = (s: string) =>
  s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** HTML di mammoth -> Markdown con titoli, paragrafi ed elenchi. */
export function htmlToMarkdown(html: string): string {
  return decodeEntities(
    html
      .replace(/<h1[^>]*>(.*?)<\/h1>/gis, '\n# $1\n\n')
      .replace(/<h[2-6][^>]*>(.*?)<\/h[2-6]>/gis, '\n## $1\n\n')
      .replace(/<li[^>]*>(.*?)<\/li>/gis, '- $1\n')
      .replace(/<\/(p|ul|ol|table|tr)>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<td[^>]*>/gi, ' | ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractMarkdown(kind: DocKind, data: Buffer): Promise<string> {
  let text: string;
  try {
    if (kind === 'pdf') {
      const { text: pages } = await extractPdfText(new Uint8Array(data), { mergePages: false });
      text = pages.map((p) => p.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n\n');
    } else if (kind === 'docx') {
      text = htmlToMarkdown((await mammoth.convertToHtml({ buffer: data })).value);
    } else {
      text = data.toString('utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n').trim();
    }
  } catch {
    throw new ExtractionError('Il file non si può leggere: potrebbe essere danneggiato o protetto da password');
  }
  if (text.replace(/\s/g, '').length < 20) {
    throw new ExtractionError(
      kind === 'pdf'
        ? 'Nessun testo leggibile: il PDF sembra una scansione. Carica una versione con testo selezionabile'
        : 'Il documento non contiene testo sufficiente',
    );
  }
  return text;
}
