import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createPrisma, type PrismaClient } from '../../src/db/client';

const TEMPLATE = resolve(import.meta.dirname, '../../prisma/test-template.db');

/** Database SQLite isolato per un file di test (copia del modello migrato). */
export function createTestDb(): PrismaClient {
  const path = join(mkdtempSync(join(tmpdir(), 'logisticai-test-')), 'test.db');
  copyFileSync(TEMPLATE, path);
  return createPrisma(`file:${path}`);
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
