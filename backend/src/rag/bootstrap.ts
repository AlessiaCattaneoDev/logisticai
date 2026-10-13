import type { DocumentService } from '../documents/service.js';
import type { EmbeddingProvider } from '../llm/types.js';
import { assertEmbeddingModelMatches } from './ingest.js';
import type { VectorStore } from './vectorStore.js';

export interface EnsureKnowledgeBaseDeps {
  store: VectorStore;
  embedder: EmbeddingProvider;
  documents: DocumentService;
  /** Cartella dei documenti iniziali (knowledge_base/source). */
  kbDir: string;
  /** true online (AUTO_INGEST): indice vuoto o con un altro modello viene ricostruito invece di fermare l'avvio. */
  auto: boolean;
}

/** Controllo all'avvio del backend: l'indice in Chroma esiste ed è fatto con il modello di embedding configurato. */
export async function ensureKnowledgeBase(deps: EnsureKnowledgeBaseDeps): Promise<{ indexed: boolean; documents: number }> {
  try {
    await assertEmbeddingModelMatches(deps.store, deps.embedder);
    return { indexed: false, documents: 0 };
  } catch (err) {
    if (!deps.auto) throw err;
  }
  await deps.documents.registerSeedDocuments(deps.kbDir);
  const res = await deps.documents.reindexAll();
  return { indexed: true, documents: res.ready };
}
