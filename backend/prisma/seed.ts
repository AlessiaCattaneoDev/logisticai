import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { createPrisma } from '../src/db/client.js';
import { seedPricing, seedUsers } from '../src/db/seed.js';
import { recalculateMissingCosts } from '../src/telemetry/recorder.js';

loadDotenv({ path: resolve(import.meta.dirname, '../../.env'), quiet: true });

const prisma = createPrisma(process.env.DATABASE_URL ?? 'file:./prisma/dev.db');
try {
  const created = await seedUsers(prisma, process.env);
  console.log(`Utenti demo pronti: ${created.join(', ')}`);
  console.log(`Listini caricati: ${await seedPricing(prisma)} modelli`);
  const updated = await recalculateMissingCosts(prisma, Number(process.env.USD_EUR_RATE ?? 0.92));
  if (updated) console.log(`Costi ricalcolati per ${updated} chiamate registrate senza listino`);
} finally {
  await prisma.$disconnect();
}
