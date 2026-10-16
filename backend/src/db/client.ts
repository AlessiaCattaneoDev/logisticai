import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../generated/prisma/client.js';

export type { PrismaClient };

export function createPrisma(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databaseUrl }) });
}
