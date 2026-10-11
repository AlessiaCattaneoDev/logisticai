import { Check, X } from 'lucide-react';
import type { ToolName, ToolUsage } from '@logisticai/shared';
import type { Step } from '../../chat/state';

const LABELS: Record<ToolName, { running: string; done: string }> = {
  cerca_knowledge_base: { running: 'Consulto i documenti aziendali', done: 'Documenti aziendali consultati' },
  analizza_dati: { running: 'Analizzo lo storico spedizioni', done: 'Storico spedizioni analizzato' },
};

const seconds = (ms?: number) => (ms === undefined ? '' : `${(ms / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} s`);

/** I passaggi dell'agente mostrati come la timeline di tracking di una spedizione. */
export function TrackingTimeline({ steps, thinking }: { steps: Step[]; thinking?: boolean }) {
  const rows = [...steps.map((s) => ({ ...s, label: s.status === 'running' ? LABELS[s.tool].running : LABELS[s.tool].done }))];
  if (thinking) rows.push({ tool: 'cerca_knowledge_base', status: 'running', label: steps.length ? 'Preparo la risposta' : 'Valuto la domanda' });
  if (!rows.length) return null;
  return (
    <ol className="relative mb-3 space-y-2 border-l-2 border-bordo pl-5" aria-label="Passaggi dell'assistente">
      {rows.map((r, i) => (
        <li key={i} className="relative text-sm" aria-live={r.status === 'running' ? 'polite' : undefined}>
          <span
            aria-hidden
            className={`absolute -left-[27px] top-0.5 grid h-3.5 w-3.5 place-items-center rounded-full ring-4 ring-carta ${
              r.status === 'running' ? 'animate-pulse bg-segnale' : r.status === 'ok' ? 'bg-esito-ok text-white' : 'bg-esito-ko text-white'
            }`}
          >
            {r.status === 'ok' && <Check size={10} strokeWidth={3} />}
            {r.status === 'error' && <X size={10} strokeWidth={3} />}
          </span>
          <span className={r.status === 'running' ? 'font-medium' : 'text-ardesia'}>{r.label}</span>
          {r.status === 'error' && <span className="text-esito-ko"> non riuscito</span>}
          {r.durationMs !== undefined && <span className="ml-2 tabular-nums text-ardesia">{seconds(r.durationMs)}</span>}
        </li>
      ))}
    </ol>
  );
}

export const stepsFromTools = (tools: ToolUsage[]): Step[] => tools.map((t) => ({ tool: t.name, status: t.ok ? 'ok' : 'error', durationMs: t.durationMs }));
