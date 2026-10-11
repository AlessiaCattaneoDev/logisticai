import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hashPassword } from '../auth/password.js';
import type { PrismaClient } from './client.js';

export interface SeedEnv {
  SEED_ADMIN_USERNAME?: string;
  SEED_ADMIN_PASSWORD?: string;
  SEED_OPERATOR_USERNAME?: string;
  SEED_OPERATOR_PASSWORD?: string;
}

const MIN_PASSWORD = 10;

/** Crea (o riallinea) gli utenti demo documentati nel README. Idempotente. */
export async function seedUsers(prisma: PrismaClient, env: SeedEnv): Promise<string[]> {
  const users = [
    { username: env.SEED_ADMIN_USERNAME || 'admin', password: env.SEED_ADMIN_PASSWORD, role: 'ADMIN' as const, key: 'SEED_ADMIN_PASSWORD' },
    { username: env.SEED_OPERATOR_USERNAME || 'sara.operatrice', password: env.SEED_OPERATOR_PASSWORD, role: 'OPERATOR' as const, key: 'SEED_OPERATOR_PASSWORD' },
  ];
  for (const u of users) {
    if (!u.password || u.password.length < MIN_PASSWORD) {
      throw new Error(`${u.key} obbligatoria nel .env (almeno ${MIN_PASSWORD} caratteri)`);
    }
  }
  for (const u of users) {
    const passwordHash = await hashPassword(u.password!);
    await prisma.user.upsert({
      where: { username: u.username },
      create: { username: u.username, passwordHash, role: u.role },
      update: { passwordHash, role: u.role, active: true },
    });
  }
  return users.map((u) => `${u.username} (${u.role})`);
}

interface PricingFile {
  validFrom: string;
  prezzi: { provider: string; model: string; inputPer1M: number; outputPer1M: number; cachedInputPer1M: number | null }[];
}

export const PRICING_FILE = resolve(import.meta.dirname, '../../prisma/pricing.json');

/** Carica i listini di prisma/pricing.json (idempotente: una riga per provider, modello e data). */
export async function seedPricing(prisma: PrismaClient, file = PRICING_FILE): Promise<number> {
  const data = JSON.parse(readFileSync(file, 'utf8')) as PricingFile;
  const validFrom = new Date(data.validFrom);
  for (const p of data.prezzi) {
    await prisma.modelPricing.upsert({
      where: { provider_model_validFrom: { provider: p.provider, model: p.model, validFrom } },
      create: { ...p, validFrom },
      update: { inputPer1M: p.inputPer1M, outputPer1M: p.outputPer1M, cachedInputPer1M: p.cachedInputPer1M },
    });
  }
  return data.prezzi.length;
}
