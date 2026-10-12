import { useSearchParams } from 'react-router';
import type { Period } from '../../api/admin';

const iso = (d: Date) => d.toISOString().slice(0, 10);

export const PRESETS = [
  { id: 'oggi', label: 'Oggi', range: (now: Date) => ({ da: iso(now), a: iso(now) }) },
  { id: '7g', label: 'Ultimi 7 giorni', range: (now: Date) => ({ da: iso(new Date(now.getTime() - 6 * 86_400_000)), a: iso(now) }) },
  { id: 'mese', label: 'Mese corrente', range: (now: Date) => ({ da: `${iso(now).slice(0, 7)}-01`, a: iso(now) }) },
  { id: '30g', label: 'Ultimi 30 giorni', range: (now: Date) => ({ da: iso(new Date(now.getTime() - 29 * 86_400_000)), a: iso(now) }) },
] as const;

/** Periodo nella query string: link condivisibili e stato che sopravvive al refresh. */
export function usePeriod(): [Period & { preset: string }, (presetId: string) => void, (p: Period) => void] {
  const [params, setParams] = useSearchParams();
  const preset = params.get('periodo') ?? '30g';
  const custom = { da: params.get('da') ?? undefined, a: params.get('a') ?? undefined };
  const period = preset === 'personalizzato' ? custom : PRESETS.find((p) => p.id === preset)?.range(new Date()) ?? PRESETS[3].range(new Date());
  const setPreset = (id: string) => setParams((prev) => { const n = new URLSearchParams(prev); n.set('periodo', id); n.delete('da'); n.delete('a'); return n; });
  const setCustom = (p: Period) => setParams((prev) => { const n = new URLSearchParams(prev); n.set('periodo', 'personalizzato'); if (p.da) n.set('da', p.da); if (p.a) n.set('a', p.a); return n; });
  return [{ ...period, preset }, setPreset, setCustom];
}
