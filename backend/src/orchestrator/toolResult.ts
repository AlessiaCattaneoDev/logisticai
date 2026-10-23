// Risultati dei tool per l'LLM: sotto un limite di caratteri ma sempre JSON valido.
// Tagliare la stringa serializzata (slice) lascerebbe al modello un JSON incompleto.

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const MIN_TEXT = 200;
const MARK = ' [testo troncato]';

interface TextSlot {
  value: string;
  set: (s: string) => void;
}

/** Stringa più lunga (con il modo di sostituirla) e array più lungo dentro il valore. */
function largest(root: Json): { text?: TextSlot; list?: Json[] } {
  const found: { text?: TextSlot; list?: Json[] } = {};
  const visit = (v: Json, set: (s: string) => void) => {
    if (typeof v === 'string') {
      if (!found.text || v.length > found.text.value.length) found.text = { value: v, set };
    } else if (Array.isArray(v)) {
      if (!found.list || v.length > found.list.length) found.list = v;
      v.forEach((item, i) => visit(item, (s) => (v[i] = s)));
    } else if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) visit(v[k], (s) => (v[k] = s));
    }
  };
  visit(root, () => undefined);
  return found;
}

/**
 * Serializza `value` in al massimo `maxChars` caratteri: accorcia prima i testi più lunghi, poi toglie
 * gli ultimi elementi degli array più lunghi. Se ha dovuto tagliare, aggiunge `troncato: true`.
 */
export function fitJson(value: unknown, maxChars: number): string {
  const full = JSON.stringify(value);
  if (full.length <= maxChars) return full;
  const work = JSON.parse(full) as Json;
  const root: Json = work && typeof work === 'object' && !Array.isArray(work) ? { ...work, troncato: true } : { dati: work, troncato: true };
  for (let guard = 0; guard < 10_000; guard++) {
    const out = JSON.stringify(root);
    if (out.length <= maxChars) return out;
    const { text, list } = largest(root);
    if (text && text.value.length > MIN_TEXT + MARK.length) {
      const current = text.value.replace(MARK, '');
      text.set(current.slice(0, Math.max(MIN_TEXT, Math.floor(current.length / 2))) + MARK);
    } else if (list && list.length > 1) {
      list.pop();
    } else {
      break;
    }
  }
  return JSON.stringify({ troncato: true, nota: 'Risultato troppo grande per essere mostrato: restringi la richiesta.' });
}
