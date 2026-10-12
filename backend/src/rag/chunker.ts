// Divide i documenti Markdown della knowledge base in chunk per sezione (titolo ##).
// Ogni chunk porta documento e sezione (per le citazioni) e, nelle schede SLA, il cliente.

export type ChunkMetadata = {
  documento: string;
  sezione: string;
  file: string;
  cliente?: string;
  documentId?: string;
  categoryId?: string;
  categoria?: string;
};

export interface Chunk {
  id: string;
  text: string;
  metadata: ChunkMetadata;
}

export interface ChunkOptions {
  clienti?: readonly string[];
  /** Titolo da usare se il testo non ha un titolo "#" (es. PDF o TXT). */
  titolo?: string;
  /** Prefisso degli id: con i documenti caricati è l'id del documento, così gli id restano univoci. */
  idPrefix?: string;
  extra?: Pick<ChunkMetadata, 'documentId' | 'categoryId' | 'categoria'>;
}

export const MAX_CHUNK_CHARS = 2400; // ~600 token
const OVERLAP_CHARS = 300;

function splitLong(body: string): string[] {
  if (body.length <= MAX_CHUNK_CHARS) return [body];
  const paragraphs = body.split(/\n{2,}/);
  const parts: string[] = [];
  let current = '';
  for (const p of paragraphs) {
    if (current && current.length + p.length + 2 > MAX_CHUNK_CHARS) {
      parts.push(current);
      current = current.slice(-OVERLAP_CHARS) + '\n\n' + p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current) parts.push(current);
  return parts;
}

export function chunkMarkdown(file: string, markdown: string, clientiOrOptions: readonly string[] | ChunkOptions = []): Chunk[] {
  const opts: ChunkOptions = Array.isArray(clientiOrOptions) ? { clienti: clientiOrOptions } : (clientiOrOptions as ChunkOptions);
  const clienti = opts.clienti ?? [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const documento = (lines.find((l) => l.startsWith('# '))?.slice(2) ?? opts.titolo ?? file).trim();
  const hasSections = lines.some((l) => l.startsWith('## '));
  const sections: { title: string; body: string[] }[] = [{ title: hasSections ? 'Introduzione' : documento, body: [] }];
  for (const line of lines) {
    if (line.startsWith('# ')) continue;
    if (line.startsWith('## ')) sections.push({ title: line.slice(3).trim(), body: [] });
    else sections.at(-1)!.body.push(line);
  }
  const stem = opts.idPrefix ?? file.replace(/\.md$/, '');
  return sections.flatMap((s, si) => {
    const body = s.body.join('\n').trim();
    if (!body) return [];
    const cliente = clienti.find((c) => c === s.title);
    const parts = splitLong(body);
    return parts.map((part, pi) => {
      // Testi senza titoli (PDF, TXT): le parti si numerano, così la fonte resta precisa.
      const sezione = !hasSections && parts.length > 1 ? `${s.title} (parte ${pi + 1})` : s.title;
      return {
        id: `${stem}#${si}.${pi}`,
        // Il contesto in testa al chunk migliora la ricerca semantica.
        text: `Documento: ${documento}\nSezione: ${sezione}\n\n${part}`,
        metadata: { documento, sezione, file, ...(cliente ? { cliente } : {}), ...(opts.extra ?? {}) },
      };
    });
  });
}
