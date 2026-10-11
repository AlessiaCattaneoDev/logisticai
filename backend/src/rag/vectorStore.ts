import { ChromaClient, type Collection } from 'chromadb';

export interface StoredChunk {
  id: string;
  text: string;
  metadata: Record<string, string>;
}

export interface QueryHit extends StoredChunk {
  /** Distanza coseno: 0 = identico, 2 = opposto. */
  distance: number;
}

export interface VectorStore {
  reset(collectionMetadata: Record<string, string>): Promise<void>;
  add(chunks: StoredChunk[], embeddings: number[][]): Promise<void>;
  query(embedding: number[], topK: number, where?: Record<string, string>): Promise<QueryHit[]>;
  info(): Promise<{ count: number; metadata: Record<string, string> } | null>;
  healthy(): Promise<boolean>;
  drop(): Promise<void>;
}

/** Implementazione su ChromaDB (server locale avviato con `chroma run`). */
export class ChromaVectorStore implements VectorStore {
  private readonly client: ChromaClient;

  constructor(
    url: string,
    private readonly name: string,
  ) {
    const u = new URL(url);
    this.client = new ChromaClient({ host: u.hostname, port: Number(u.port || 8000), ssl: u.protocol === 'https:' });
  }

  private async collection(): Promise<Collection | null> {
    try {
      return await this.client.getCollection({ name: this.name, embeddingFunction: null as never });
    } catch {
      return null;
    }
  }

  async reset(collectionMetadata: Record<string, string>): Promise<void> {
    if (await this.collection()) await this.client.deleteCollection({ name: this.name });
    await this.client.createCollection({
      name: this.name,
      ...(Object.keys(collectionMetadata).length ? { metadata: collectionMetadata } : {}),
      configuration: { hnsw: { space: 'cosine' } },
      embeddingFunction: null as never,
    });
  }

  async drop(): Promise<void> {
    if (await this.collection()) await this.client.deleteCollection({ name: this.name });
  }

  async add(chunks: StoredChunk[], embeddings: number[][]): Promise<void> {
    const col = await this.collection();
    if (!col) throw new Error(`Collection ${this.name} inesistente: esegui npm run ingest`);
    await col.add({ ids: chunks.map((c) => c.id), documents: chunks.map((c) => c.text), metadatas: chunks.map((c) => c.metadata), embeddings });
  }

  async query(embedding: number[], topK: number, where?: Record<string, string>): Promise<QueryHit[]> {
    const col = await this.collection();
    if (!col) throw new Error(`Collection ${this.name} inesistente: esegui npm run ingest`);
    const res = await col.query({ queryEmbeddings: [embedding], nResults: topK, ...(where ? { where } : {}) });
    return res.ids[0].map((id, i) => ({
      id,
      text: res.documents[0][i] ?? '',
      metadata: (res.metadatas[0][i] ?? {}) as Record<string, string>,
      distance: res.distances[0][i] ?? 2,
    }));
  }

  async info() {
    const col = await this.collection();
    if (!col) return null;
    return { count: await col.count(), metadata: (col.metadata ?? {}) as Record<string, string> };
  }

  async healthy(): Promise<boolean> {
    try {
      await this.client.heartbeat();
      return true;
    } catch {
      return false;
    }
  }
}

/** Implementazione in memoria (test e sviluppo offline), stessa semantica di distanza coseno. */
export class InMemoryVectorStore implements VectorStore {
  private rows: { chunk: StoredChunk; vector: number[] }[] = [];
  private meta: Record<string, string> | null = null;

  async reset(collectionMetadata: Record<string, string>) {
    this.rows = [];
    this.meta = collectionMetadata;
  }

  async add(chunks: StoredChunk[], embeddings: number[][]) {
    if (!this.meta) throw new Error('Collection inesistente');
    chunks.forEach((chunk, i) => this.rows.push({ chunk, vector: embeddings[i] }));
  }

  async query(embedding: number[], topK: number, where?: Record<string, string>) {
    const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    const qn = norm(embedding);
    return this.rows
      .filter((r) => !where || Object.entries(where).every(([k, v]) => r.chunk.metadata[k] === v))
      .map((r) => ({
        ...r.chunk,
        distance: 1 - r.vector.reduce((s, x, i) => s + x * embedding[i], 0) / (norm(r.vector) * qn),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, topK);
  }

  async info() {
    return this.meta ? { count: this.rows.length, metadata: this.meta } : null;
  }

  async healthy() {
    return true;
  }

  async drop() {
    this.rows = [];
    this.meta = null;
  }
}
