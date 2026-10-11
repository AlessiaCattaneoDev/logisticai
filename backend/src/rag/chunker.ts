// Divide i documenti Markdown della knowledge base in chunk per sezione (titolo ##).
// Ogni chunk porta documento e sezione (per le citazioni) e, nelle schede SLA, il cliente.

export interface Chunk {
  id: string;
  text: string;
  metadata: { documento: string; sezione: string; file: string; cliente?: string };
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

export function chunkMarkdown(file: string, markdown: string, clienti: readonly string[] = []): Chunk[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const documento = (lines.find((l) => l.startsWith('# ')) ?? `# ${file}`).slice(2).trim();
  const sections: { title: string; body: string[] }[] = [{ title: 'Introduzione', body: [] }];
  for (const line of lines) {
    if (line.startsWith('# ')) continue;
    if (line.startsWith('## ')) sections.push({ title: line.slice(3).trim(), body: [] });
    else sections.at(-1)!.body.push(line);
  }
  const stem = file.replace(/\.md$/, '');
  return sections.flatMap((s, si) => {
    const body = s.body.join('\n').trim();
    if (!body) return [];
    const cliente = clienti.find((c) => c === s.title);
    return splitLong(body).map((part, pi) => ({
      id: `${stem}#${si}.${pi}`,
      // Il contesto in testa al chunk migliora la ricerca semantica.
      text: `Documento: ${documento}\nSezione: ${s.title}\n\n${part}`,
      metadata: { documento, sezione: s.title, file, ...(cliente ? { cliente } : {}) },
    }));
  });
}
