import { PRESETS, usePeriod } from './period';

export function PeriodPicker() {
  const [period, setPreset, setCustom] = usePeriod();
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Periodo">
      {PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          aria-pressed={period.preset === p.id}
          onClick={() => setPreset(p.id)}
          className={`rounded px-2.5 py-1 text-sm ${period.preset === p.id ? 'bg-container text-white' : 'border border-bordo bg-carta hover:border-container'}`}
        >
          {p.label}
        </button>
      ))}
      <label className="ml-2 text-sm text-ardesia">
        Dal <input type="date" value={period.da ?? ''} onChange={(e) => setCustom({ da: e.target.value, a: period.a })} className="rounded border border-bordo px-1.5 py-0.5 text-inchiostro" />
      </label>
      <label className="text-sm text-ardesia">
        al <input type="date" value={period.a ?? ''} onChange={(e) => setCustom({ da: period.da, a: e.target.value })} className="rounded border border-bordo px-1.5 py-0.5 text-inchiostro" />
      </label>
    </div>
  );
}
