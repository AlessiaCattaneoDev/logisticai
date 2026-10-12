import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EmbeddingProvider } from '../llm/types.js';
import { chunkMarkdown } from './chunker.js';
import type { VectorStore } from './vectorStore.js';

export interface IngestResult {
  documents: number;
  chunks: number;
  embeddingTokens: number;
}

const BATCH = 64;

/** Solo sorgenti "NN_nome.md": ignora copie come "01_documento 2.md" create da iCloud o dal Finder. */
export const isKbSource = (file: string) => /^\d{2}_[a-z0-9_]+\.md$/.test(file);

/** I clienti sono i titoli ## del documento con le schede SLA (esclusa la sezione delle regole comuni). */
export function deriveClienti(sourceDir: string): string[] {
  const file = readdirSync(sourceDir).find((f) => isKbSource(f) && /schede_sla/.test(f));
  if (!file) return [];
  return readFileSync(join(sourceDir, file), 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('## ') && !/^## Regole/.test(l))
    .map((l) => l.slice(3).trim());
}

/** Ricrea da zero la collection (idempotente) e salva nei metadati quale modello di embedding è stato usato. */
export async function ingestKnowledgeBase(opts: {
  sourceDir: string;
  embedder: EmbeddingProvider;
  store: VectorStore;
}): Promise<IngestResult> {
  const files = readdirSync(opts.sourceDir).filter(isKbSource).sort();
  const clienti = deriveClienti(opts.sourceDir);
  const chunks = files.flatMap((f) => chunkMarkdown(f, readFileSync(join(opts.sourceDir, f), 'utf8'), clienti));
  await opts.store.reset({
    embedding_provider: opts.embedder.id,
    embedding_model: opts.embedder.model,
    ingested_at: new Date().toISOString(),
    documents: String(files.length),
  });
  let tokens = 0;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const { vectors, usage } = await opts.embedder.embed(batch.map((c) => c.text));
    tokens += usage.inputTokens;
    await opts.store.add(batch.map((c) => ({ id: c.id, text: c.text, metadata: c.metadata })), vectors);
  }
  return { documents: files.length, chunks: chunks.length, embeddingTokens: tokens };
}

/** Vettori di modelli diversi non sono confrontabili: all'avvio si verifica che il modello coincida. */
export async function assertEmbeddingModelMatches(store: VectorStore, embedder: EmbeddingProvider): Promise<void> {
  const info = await store.info();
  if (!info) throw new Error('Knowledge base non indicizzata: esegui npm run ingest');
  const { embedding_provider, embedding_model } = info.metadata;
  if (embedding_provider !== embedder.id || embedding_model !== embedder.model) {
    throw new Error(
      `Knowledge base indicizzata con ${embedding_provider}:${embedding_model} ma configurato ${embedder.id}:${embedder.model}: esegui npm run ingest`,
    );
  }
}
