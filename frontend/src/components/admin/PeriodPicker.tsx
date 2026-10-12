import { PRESETS, usePeriod } from './period';

export function PeriodPicker() {
  const [period, setPreset, setCustom] = usePeriod();
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Periodo">
      <div className="inline-flex flex-wrap rounded-full bg-superficie p-1 shadow-[var(--shadow-card)]">
      {PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          aria-pressed={period.preset === p.id}
          onClick={() => setPreset(p.id)}
          className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${period.preset === p.id ? 'bg-primario text-white' : 'text-testo-2 hover:text-testo'}`}
        >
          {p.label}
        </button>
      ))}
      </div>
      <label className="ml-2 text-sm text-testo-2">
        Dal <input type="date" value={period.da ?? ''} onChange={(e) => setCustom({ da: e.target.value, a: period.a })} className="rounded-lg border border-bordo bg-superficie px-2 py-1 text-testo" />
      </label>
      <label className="text-sm text-testo-2">
        al <input type="date" value={period.a ?? ''} onChange={(e) => setCustom({ da: period.da, a: e.target.value })} className="rounded-lg border border-bordo bg-superficie px-2 py-1 text-testo" />
      </label>
    </div>
  );
}
