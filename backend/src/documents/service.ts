// Libreria documenti: categorie, caricamento, elaborazione in background e indicizzazione nel RAG.
import { createHash, randomUUID } from 'node:crypto';
// Solo API asincrone: file fino a 15 MB letti o scritti in modo sincrono bloccherebbero l'event loop
// (lo stesso che serve gli stream SSE della chat).
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path';
import type { AuthUser, DocumentCategoryDto, DocumentDto, DocumentKind } from '@logisticai/shared';
import type { PrismaClient } from '../db/client.js';
import type { EmbeddingProvider } from '../llm/types.js';
import { chunkMarkdown } from '../rag/chunker.js';
import type { VectorStore } from '../rag/vectorStore.js';
import { DEFAULT_CATEGORIES, SEED_DOCUMENTS } from './catalog.js';
import { detectKind, extractMarkdown, ExtractionError } from './extract.js';

export class DocumentError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 413 | 415,
  ) {
    super(message);
  }
}

export interface DocumentServiceDeps {
  prisma: PrismaClient;
  store: VectorStore;
  embedder: EmbeddingProvider;
  /** Root del repository: i percorsi salvati nel DB sono relativi a questa cartella. */
  rootDir: string;
  /** Cartella dei file caricati. */
  uploadDir: string;
  /** Clienti delle schede SLA (metadato "cliente" sulle sezioni omonime). */
  clienti?: readonly string[];
  maxBytes?: number;
  onEmbedding?: (usage: { inputTokens: number; latencyMs: number }, userId: string | null) => void | Promise<void>;
  logger?: { error: (obj: object, msg: string) => void };
}

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const BATCH = 64;

type DocRow = Awaited<ReturnType<PrismaClient['document']['findFirstOrThrow']>> & {
  category: { id: string; name: string };
  uploadedBy: { username: string } | null;
};

export class DocumentService {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly deps: DocumentServiceDeps) {}

  private get prisma() {
    return this.deps.prisma;
  }

  private collectionMetadata() {
    return {
      embedding_provider: this.deps.embedder.id,
      embedding_model: this.deps.embedder.model,
      ingested_at: new Date().toISOString(),
    };
  }

  private toDto(d: DocRow, user?: AuthUser): DocumentDto {
    return {
      id: d.id,
      title: d.title,
      fileName: d.fileName,
      kind: d.kind as DocumentKind,
      sizeBytes: d.sizeBytes,
      category: { id: d.category.id, name: d.category.name },
      uploadedBy: d.uploadedBy?.username ?? 'Sistema',
      origin: d.origin as DocumentDto['origin'],
      status: d.status as DocumentDto['status'],
      errorMessage: d.errorMessage,
      sections: d.sections,
      createdAt: d.createdAt.toISOString(),
      canDelete: !!user && (user.role === 'ADMIN' || d.uploadedById === user.id),
    };
  }

  // --- Categorie ------------------------------------------------------------------------

  async ensureDefaultCategories(): Promise<void> {
    for (const [i, c] of DEFAULT_CATEGORIES.entries()) {
      await this.prisma.documentCategory.upsert({ where: { name: c.name }, create: { ...c, position: i }, update: {} });
    }
  }

  async categories(): Promise<DocumentCategoryDto[]> {
    const rows = await this.prisma.documentCategory.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }], include: { documents: { select: { status: true } } } });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      documents: c.documents.length,
      ready: c.documents.filter((d) => d.status === 'ready').length,
    }));
  }

  async createCategory(name: string, description = ''): Promise<DocumentCategoryDto> {
    if (await this.prisma.documentCategory.findUnique({ where: { name } })) throw new DocumentError('Esiste già una categoria con questo nome', 409);
    const position = await this.prisma.documentCategory.count();
    const c = await this.prisma.documentCategory.create({ data: { name, description, position } });
    return { id: c.id, name: c.name, description: c.description, documents: 0, ready: 0 };
  }

  async updateCategory(id: string, data: { name?: string; description?: string }): Promise<void> {
    const c = await this.prisma.documentCategory.findUnique({ where: { id } });
    if (!c) throw new DocumentError('Categoria non trovata', 404);
    if (data.name && data.name !== c.name && (await this.prisma.documentCategory.findUnique({ where: { name: data.name } }))) {
      throw new DocumentError('Esiste già una categoria con questo nome', 409);
    }
    await this.prisma.documentCategory.update({ where: { id }, data });
    // Il nome della categoria è anche nei metadati delle sezioni: si aggiorna rielaborando i suoi documenti.
    if (data.name && data.name !== c.name) {
      const docs = await this.prisma.document.findMany({ where: { categoryId: id, status: 'ready' }, select: { id: true } });
      for (const d of docs) this.enqueue(d.id);
    }
  }

  // --- Documenti ------------------------------------------------------------------------

  private include = { category: { select: { id: true, name: true } }, uploadedBy: { select: { username: true } } } as const;

  async list(filters: { categoryId?: string; q?: string }, user?: AuthUser): Promise<DocumentDto[]> {
    const rows = await this.prisma.document.findMany({
      where: {
        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
        ...(filters.q ? { OR: [{ title: { contains: filters.q } }, { fileName: { contains: filters.q } }] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: this.include,
    });
    return rows.map((d) => this.toDto(d as DocRow, user));
  }

  async get(id: string, user?: AuthUser): Promise<DocumentDto> {
    const d = await this.prisma.document.findUnique({ where: { id }, include: this.include });
    if (!d) throw new DocumentError('Documento non trovato', 404);
    return this.toDto(d as DocRow, user);
  }

  async upload(input: { user: AuthUser; categoryId: string; fileName: string; data: Buffer; title?: string }): Promise<DocumentDto> {
    const max = this.deps.maxBytes ?? MAX_UPLOAD_BYTES;
    if (input.data.length > max) throw new DocumentError(`Il file supera il limite di ${Math.round(max / 1024 / 1024)} MB`, 413);
    if (input.data.length === 0) throw new DocumentError('Il file è vuoto', 400);
    const category = await this.prisma.documentCategory.findUnique({ where: { id: input.categoryId } });
    if (!category) throw new DocumentError('Categoria non trovata', 404);
    const kind = detectKind(input.fileName, input.data);
    if (!kind) throw new DocumentError('Formato non supportato: carica un file PDF, Word (.docx), TXT o Markdown', 415);
    const checksum = createHash('sha256').update(input.data).digest('hex');
    const duplicate = await this.prisma.document.findUnique({ where: { categoryId_checksum: { categoryId: category.id, checksum } } });
    if (duplicate) throw new DocumentError(`Questo file è già presente nella categoria come "${duplicate.title}"`, 409);

    const path = join(this.deps.uploadDir, `${randomUUID()}.${kind}`);
    await mkdir(this.deps.uploadDir, { recursive: true });
    await writeFile(path, input.data);
    const fileName = basename(input.fileName).slice(0, 200);
    const doc = await this.prisma.document.create({
      data: {
        title: (input.title?.trim() || fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ')).slice(0, 200),
        fileName,
        kind,
        sizeBytes: input.data.length,
        checksum,
        storagePath: relative(this.deps.rootDir, path),
        categoryId: category.id,
        uploadedById: input.user.id,
        origin: 'upload',
        status: 'processing',
      },
      include: this.include,
    });
    this.enqueue(doc.id);
    return this.toDto(doc as DocRow, input.user);
  }

  async delete(id: string, user: AuthUser): Promise<void> {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new DocumentError('Documento non trovato', 404);
    if (user.role !== 'ADMIN' && doc.uploadedById !== user.id) {
      throw new DocumentError('Puoi eliminare solo i documenti che hai caricato tu', 403);
    }
    await this.deps.store.deleteWhere({ documentId: id });
    await this.prisma.document.delete({ where: { id } });
    // I file della knowledge base originale restano nel repository; si eliminano solo i caricamenti.
    if (doc.origin === 'upload') {
      await unlink(this.absolute(doc.storagePath)).catch(() => undefined); // file già assente
    }
  }

  // --- Elaborazione ------------------------------------------------------------------------

  private absolute(storagePath: string) {
    return isAbsolute(storagePath) ? storagePath : resolve(this.deps.rootDir, storagePath);
  }

  /** Coda sequenziale: un documento alla volta, senza bloccare le richieste HTTP. */
  enqueue(id: string): void {
    this.queue = this.queue.then(() => this.process(id)).catch(() => undefined);
  }

  /** Attende che la coda sia vuota (test, ingest da riga di comando). */
  idle(): Promise<void> {
    return this.queue;
  }

  async process(id: string): Promise<void> {
    const doc = await this.prisma.document.findUnique({ where: { id }, include: { category: true } });
    if (!doc) return;
    await this.prisma.document.update({ where: { id }, data: { status: 'processing', errorMessage: null } });
    try {
      const data = await readFile(this.absolute(doc.storagePath));
      const markdown = await extractMarkdown(doc.kind as DocumentKind, data);
      const chunks = chunkMarkdown(doc.fileName, markdown, {
        clienti: this.deps.clienti,
        titolo: doc.title,
        idPrefix: doc.id,
        extra: { documentId: doc.id, categoryId: doc.categoryId, categoria: doc.category.name },
      });
      await this.deps.store.ensure(this.collectionMetadata());
      await this.deps.store.deleteWhere({ documentId: doc.id });
      for (let i = 0; i < chunks.length; i += BATCH) {
        const batch = chunks.slice(i, i + BATCH);
        const { vectors, usage, latencyMs } = await this.deps.embedder.embed(batch.map((c) => c.text));
        await this.deps.onEmbedding?.({ inputTokens: usage.inputTokens, latencyMs }, doc.uploadedById);
        await this.deps.store.add(batch.map((c) => ({ id: c.id, text: c.text, metadata: c.metadata as Record<string, string> })), vectors);
      }
      await this.prisma.document.update({ where: { id }, data: { status: 'ready', sections: chunks.length } });
    } catch (err) {
      const message = err instanceof ExtractionError ? err.message : 'Elaborazione non riuscita: riprova a caricare il documento';
      if (!(err instanceof ExtractionError)) this.deps.logger?.error({ err, documentId: id }, 'Elaborazione documento non riuscita');
      await this.deps.store.deleteWhere({ documentId: id }).catch(() => undefined);
      await this.prisma.document.update({ where: { id }, data: { status: 'error', errorMessage: message, sections: 0 } });
    }
  }

  /** All'avvio: rielabora i documenti rimasti "in analisi" (server fermato a metà). */
  async resumePending(): Promise<number> {
    const pending = await this.prisma.document.findMany({ where: { status: 'processing' }, select: { id: true } });
    for (const d of pending) this.enqueue(d.id);
    return pending.length;
  }

  /** Registra i documenti della knowledge base originale come documenti di sistema (idempotente). */
  async registerSeedDocuments(sourceDir: string): Promise<number> {
    await this.ensureDefaultCategories();
    let created = 0;
    for (const [file, categoryName] of Object.entries(SEED_DOCUMENTS)) {
      const path = join(sourceDir, file);
      const data = await readFile(path);
      const checksum = createHash('sha256').update(data).digest('hex');
      const category = await this.prisma.documentCategory.findUniqueOrThrow({ where: { name: categoryName } });
      const title = data.toString('utf8').split('\n').find((l) => l.startsWith('# '))?.slice(2).trim() ?? file;
      const storagePath = relative(this.deps.rootDir, path);
      const existing = await this.prisma.document.findFirst({ where: { origin: 'seed', fileName: file } });
      if (existing) {
        if (existing.checksum !== checksum) {
          await this.prisma.document.update({ where: { id: existing.id }, data: { checksum, sizeBytes: data.length, title, storagePath, status: 'processing' } });
        }
        continue;
      }
      await this.prisma.document.create({
        data: { title, fileName: file, kind: extname(file) === '.md' ? 'md' : 'txt', sizeBytes: data.length, checksum, storagePath, categoryId: category.id, origin: 'seed', status: 'processing' },
      });
      created++;
    }
    return created;
  }

  /** Ricrea da zero la collection con tutti i documenti (seed e caricati). */
  async reindexAll(): Promise<{ documents: number; ready: number; errors: number }> {
    await this.deps.store.reset(this.collectionMetadata());
    const docs = await this.prisma.document.findMany({ select: { id: true } });
    for (const d of docs) await this.process(d.id);
    const ready = await this.prisma.document.count({ where: { status: 'ready' } });
    return { documents: docs.length, ready, errors: docs.length - ready };
  }
}
