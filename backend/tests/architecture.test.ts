// Garantisce che LogisticAI resti un'architettura a microservizi:
// nessun servizio importa codice di un altro e Python non viene mai lanciato da Node.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..', '..');
const SERVICES = ['backend', 'frontend'] as const;
const OTHER_SERVICE_DIRS = ['backend', 'frontend', 'data_agent', 'data', 'knowledge_base'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const importRe = /(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

describe('confini tra microservizi', () => {
  for (const service of SERVICES) {
    const files = sourceFiles(join(ROOT, service, 'src'));

    it(`${service}: nessun import da altri servizi`, () => {
      const violations: string[] = [];
      for (const file of files) {
        for (const m of readFileSync(file, 'utf8').matchAll(importRe)) {
          const spec = m[1] ?? m[2];
          if (!spec.startsWith('.')) continue;
          const target = relative(ROOT, resolve(file, '..', spec));
          const top = target.split('/')[0];
          if (top !== service && OTHER_SERVICE_DIRS.includes(top)) {
            violations.push(`${relative(ROOT, file)} -> ${spec}`);
          }
        }
      }
      expect(violations).toEqual([]);
    });

    it(`${service}: nessun child_process (i servizi parlano via HTTP)`, () => {
      const offenders = files.filter((f) => /['"](node:)?child_process['"]/.test(readFileSync(f, 'utf8')));
      expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
    });
  }
});

describe('stile dei testi', () => {
  const SKIP = new Set(['node_modules', '.venv', 'generated', '.git', 'dist', '.pytest_cache', '__pycache__']);
  const EM_DASH = String.fromCharCode(0x2014);

  function textFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      if (SKIP.has(name)) return [];
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return textFiles(path);
      return /\.(md|ts|tsx|py|json|css|html)$/.test(name) && name !== 'package-lock.json' ? [path] : [];
    });
  }

  it('nessun trattino lungo nei file del progetto', () => {
    const offenders = textFiles(ROOT).filter((f) => readFileSync(f, 'utf8').includes(EM_DASH));
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });
});
