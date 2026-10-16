// Crea una volta il database "modello" con le migrazioni; ogni file di test ne usa una copia.
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

export const TEMPLATE_DB = resolve(import.meta.dirname, '../prisma/test-template.db');

export default function setup() {
  if (existsSync(TEMPLATE_DB)) rmSync(TEMPLATE_DB);
  execSync('npx prisma migrate deploy', {
    cwd: resolve(import.meta.dirname, '..'),
    env: { ...process.env, DATABASE_URL: `file:${TEMPLATE_DB}` },
    stdio: 'pipe',
  });
}
