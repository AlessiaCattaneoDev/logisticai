import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import { beforeAll } from 'vitest';
import { PrismaClient } from '../../src/generated/prisma/client';

const MIGRATIONS = resolve(import.meta.dirname, '../../prisma/migrations');

/** SQL di tutte le migrazioni, in ordine: lo stesso schema che Prisma applica a Neon. */
const migrationSql = () =>
  readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .map((name) => readFileSync(join(MIGRATIONS, name, 'migration.sql'), 'utf8'))
    .join('\n');

/**
 * PostgreSQL vero ma in memoria (PGlite), isolato per ogni file di test: nessun server da installare.
 * Va chiamata al livello del modulo di test: registra un beforeAll che applica le migrazioni.
 */
export function createTestDb(): PrismaClient {
  const pg = new PGlite();
  beforeAll(async () => {
    await pg.exec(migrationSql());
  });
  return new PrismaClient({ adapter: new PrismaPGlite(pg) });
}

export async function resetDb(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.feedback.deleteMany(),
    prisma.llmCall.deleteMany(),
    prisma.messageArtifact.deleteMany(),
    prisma.toolCall.deleteMany(),
    prisma.message.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.modelPricing.deleteMany(),
    prisma.document.deleteMany(),
    prisma.documentCategory.deleteMany(),
    prisma.setting.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}
