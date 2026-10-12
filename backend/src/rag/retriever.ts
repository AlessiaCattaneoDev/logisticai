import type { EmbeddingProvider } from '../llm/types.js';
import type { QueryHit, VectorStore } from './vectorStore.js';

export interface RetrievedChunk {
  documento: string;
  sezione: string;
  cliente?: string;
  testo: string;
  rilevanza: number; // 1 - distanza coseno
}

export interface EmbeddingCall {
  provider: string;
  model: string;
  inputTokens: number;
  latencyMs: number;
}

export interface RetrievalResult {
  trovato: boolean;
  risultati: RetrievedChunk[];
  /** Uso del modello di embedding per questa ricerca (telemetria dei costi). */
  embedding: EmbeddingCall;
}

export interface RetrieverOptions {
  topK?: number;
  /** Oltre questa distanza coseno un chunk è considerato non pertinente. */
  maxDistance?: number;
}

export class Retriever {
  constructor(
    private readonly embedder: EmbeddingProvider,
    private readonly store: VectorStore,
    private readonly options: RetrieverOptions = {},
  ) {}

  /**
   * filtro: limita la ricerca a un documento o a una categoria ("Chiedi a questo documento").
   */
  async search(query: string, opts: { cliente?: string; topK?: number; filtro?: { documentId?: string; categoryId?: string } } = {}): Promise<RetrievalResult> {
    const topK = opts.topK ?? this.options.topK ?? 5;
    const maxDistance = this.options.maxDistance ?? 0.65;
    const embedding = await this.embedder.embed([query]);
    const vector = embedding.vectors[0];

    // Con un cliente indicato si cerca prima nella sua scheda SLA, poi nel resto della KB:
    // le schede SLA hanno testi quasi identici e senza filtro si confondono.
    const scope: Record<string, string> = Object.fromEntries(Object.entries(opts.filtro ?? {}).filter(([, v]) => v)) as Record<string, string>;
    const hits: QueryHit[] = opts.cliente ? await this.store.query(vector, Math.min(3, topK), { ...scope, cliente: opts.cliente }) : [];
    for (const hit of await this.store.query(vector, topK + hits.length, Object.keys(scope).length ? scope : undefined)) {
      if (hits.length >= topK) break;
      if (!hits.some((h) => h.id === hit.id) && !(opts.cliente && hit.metadata.cliente && hit.metadata.cliente !== opts.cliente)) {
        hits.push(hit);
      }
    }
    const risultati = hits
      .filter((h) => h.distance <= maxDistance)
      .map((h) => ({
        documento: h.metadata.documento,
        sezione: h.metadata.sezione,
        ...(h.metadata.cliente ? { cliente: h.metadata.cliente } : {}),
        testo: h.text.replace(/^Documento: .*\nSezione: .*\n\n/, ''),
        rilevanza: Math.round((1 - h.distance) * 1000) / 1000,
      }));
    return {
      trovato: risultati.length > 0,
      risultati,
      embedding: { provider: this.embedder.id, model: this.embedder.model, inputTokens: embedding.usage.inputTokens, latencyMs: embedding.latencyMs },
    };
  }
}
