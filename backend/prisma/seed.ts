import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { createPrisma } from '../src/db/client.js';
import { seedUsers } from '../src/db/seed.js';

loadDotenv({ path: resolve(import.meta.dirname, '../../.env'), quiet: true });

const prisma = createPrisma(process.env.DATABASE_URL ?? 'file:./prisma/dev.db');
try {
  const created = await seedUsers(prisma, process.env);
  console.log(`Utenti demo pronti: ${created.join(', ')}`);
} finally {
  await prisma.$disconnect();
}
