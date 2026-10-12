// npm run eval: interroga il sistema IN ESECUZIONE (backend + data agent + Chroma + LLM reale) con le
// domande demo e verifica routing, numeri, fonti e grafici. Costa qualche centesimo di API.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import type { ChatRequest, ChatResponse, DocumentCategoryDto, DocumentDto } from '@logisticai/shared';
import { CASES, type EvalCase } from './cases.js';

loadDotenv({ path: resolve(import.meta.dirname, '../../.env'), quiet: true });
const BASE = process.env.EVAL_BASE_URL ?? `http://localhost:${process.env.BACKEND_PORT ?? 3001}`;

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.SEED_OPERATOR_USERNAME ?? 'sara.operatrice', password: process.env.SEED_OPERATOR_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login fallito (${res.status}): avvia il backend ed esegui npm run db:seed`);
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

/** Converte l'ambito del caso (titolo del documento o nome della categoria) negli id del sistema in esecuzione. */
async function resolveScope(cookie: string, ambito: EvalCase['ambito']): Promise<ChatRequest['scope']> {
  if (!ambito) return undefined;
  const get = async <T>(path: string) => (await (await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } })).json()) as T;
  if ('documento' in ambito) {
    const docs = await get<DocumentDto[]>(`/api/documents?q=${encodeURIComponent(ambito.documento)}`);
    const d = docs.find((x) => x.title === ambito.documento && x.status === 'ready');
    if (!d) throw new Error(`Documento "${ambito.documento}" non disponibile: esegui npm run ingest`);
    return { type: 'document', id: d.id };
  }
  const c = (await get<DocumentCategoryDto[]>('/api/categories')).find((x) => x.name === ambito.categoria);
  if (!c) throw new Error(`Categoria "${ambito.categoria}" non trovata`);
  return { type: 'category', id: c.id };
}

async function ask(cookie: string, domanda: string, scope?: ChatRequest['scope']): Promise<ChatResponse> {
  const res = await fetch(`${BASE}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ message: domanda, ...(scope ? { scope } : {}) }) });
  const text = await res.text();
  for (const block of text.trim().split('\n\n')) {
    const [ev, data] = block.split('\n');
    if (ev === 'event: done') return JSON.parse(data.slice(6)) as ChatResponse;
    if (ev === 'event: error') throw new Error(JSON.parse(data.slice(6)).message);
  }
  throw new Error('Nessuna risposta finale');
}

function check(c: EvalCase, r: ChatResponse): string[] {
  const problems: string[] = [];
  const used = r.toolsUsed.filter((t) => t.ok).map((t) => t.name);
  if (c.nessunoStrumento && r.toolsUsed.length) problems.push(`non doveva usare strumenti, ha usato ${used.join(', ')}`);
  if (c.ambito && r.toolsUsed.some((t) => t.name === 'analizza_dati')) problems.push('con un ambito non deve analizzare i dati');
  let pos = 0;
  for (const t of c.strumenti) {
    const i = used.indexOf(t, pos);
    if (i === -1) problems.push(`strumento mancante o fuori ordine: ${t} (usati: ${used.join(' > ') || 'nessuno'})`);
    else pos = i + 1;
  }
  for (const re of c.deveContenere) if (!re.test(r.reply)) problems.push(`manca ${re}`);
  for (const re of c.nonDeveContenere ?? []) if (re.test(r.reply)) problems.push(`contiene ${re}`);
  if (c.fonte && !r.sources.some((s) => c.fonte!.test(`${s.documento} ${s.sezione}`))) problems.push(`fonte attesa ${c.fonte} non citata`);
  if ((c.minArtifact ?? 0) > r.artifacts.length) problems.push(`attesi almeno ${c.minArtifact} grafici/tabelle, ricevuti ${r.artifacts.length}`);
  return problems;
}

const only = process.argv.slice(2);
const cases = only.length ? CASES.filter((c) => only.includes(c.id)) : CASES;
const cookie = await login();
const rows: { id: string; categoria: string; ok: boolean; problemi: string[]; secondi: number; costEur: number; strumenti: string; risposta: string }[] = [];
for (const c of cases) {
  const started = Date.now();
  try {
    const r = await ask(cookie, c.domanda, await resolveScope(cookie, c.ambito));
    const problemi = check(c, r);
    rows.push({ id: c.id, categoria: c.categoria, ok: problemi.length === 0, problemi, secondi: (Date.now() - started) / 1000, costEur: r.usage.costEur, strumenti: r.toolsUsed.map((t) => t.name + (t.ok ? '' : '(rinviato/errore)')).join(' > '), risposta: r.reply });
  } catch (err) {
    rows.push({ id: c.id, categoria: c.categoria, ok: false, problemi: [String(err)], secondi: (Date.now() - started) / 1000, costEur: 0, strumenti: '', risposta: '' });
  }
  const last = rows.at(-1)!;
  console.log(`${last.ok ? 'OK  ' : 'KO  '} ${c.id.padEnd(28)} ${last.secondi.toFixed(1).padStart(5)}s  ${last.problemi.join('; ')}`);
}

const passed = rows.filter((r) => r.ok).length;
const categorie = [...new Set(rows.map((r) => r.categoria))];
const byCat = categorie.map((k) => {
  const v = rows.filter((r) => r.categoria === k);
  return `${k} ${v.filter((r) => r.ok).length}/${v.length}`;
});
console.log(`\nRisultato: ${passed}/${rows.length} (${byCat.join(', ')})`);

const outDir = resolve(import.meta.dirname, 'results');
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const md = [
  `# Valutazione LogisticAI - ${new Date().toLocaleString('it-IT')}`,
  '',
  `Modello: ${process.env.LLM_PROVIDER}:${process.env.LLM_MODEL} (data agent ${process.env.DATA_LLM_PROVIDER}:${process.env.DATA_LLM_MODEL}).`,
  `Risultato: **${passed}/${rows.length}** (${byCat.join(', ')}). Tempo medio ${(rows.reduce((s, r) => s + r.secondi, 0) / rows.length).toFixed(1)} s.`,
  '',
  '| Caso | Esito | Strumenti | Tempo | Problemi |',
  '|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.id} | ${r.ok ? 'OK' : 'KO'} | ${r.strumenti || '-'} | ${r.secondi.toFixed(1)} s | ${r.problemi.join('; ').replace(/\|/g, '/') || '-'} |`),
  '',
  '## Risposte',
  ...rows.flatMap((r) => ['', `### ${r.id}`, '', r.risposta || '(nessuna risposta)']),
].join('\n');
writeFileSync(resolve(outDir, `eval-${stamp}.md`), md);
console.log(`Report: evals/results/eval-${stamp}.md`);
process.exit(passed === rows.length ? 0 : 1);
