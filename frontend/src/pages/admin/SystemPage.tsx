import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../api/admin';
import { PageHeader, Panel, QueryState } from '../../components/admin/ui';

const SERVICE_LABEL: Record<string, string> = { backend: 'Backend', database: 'Database', chroma: 'Knowledge base (ChromaDB)', dataAgent: 'Analista dati (Python)' };

export function SystemPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['admin', 'system'], queryFn: adminApi.system, refetchInterval: 30_000 });
  return (
    <>
      <PageHeader title="Stato del sistema" description="Servizi, knowledge base e qualità dei dati. Si aggiorna ogni 30 secondi." />
      <QueryState isLoading={isLoading} error={error}>
        {data && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Servizi">
              <ul className="space-y-2">
                {Object.entries(data.servizi).map(([k, v]) => (
                  <li key={k} className="flex items-center gap-2 text-sm">
                    <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${v === 'ok' ? 'bg-esito-ok' : 'bg-esito-ko'}`} />
                    {SERVICE_LABEL[k] ?? k}: <span className={v === 'ok' ? '' : 'font-semibold text-esito-ko'}>{v === 'ok' ? 'attivo' : 'non raggiungibile'}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Knowledge base">
              {data.knowledgeBase ? (
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-ardesia">Documenti</dt><dd>{data.knowledgeBase.documenti}</dd>
                  <dt className="text-ardesia">Sezioni indicizzate</dt><dd>{data.knowledgeBase.chunk}</dd>
                  <dt className="text-ardesia">Modello di embedding</dt><dd className="font-mono">{data.knowledgeBase.modelloEmbedding}</dd>
                  <dt className="text-ardesia">Indicizzata il</dt><dd>{new Date(data.knowledgeBase.indicizzataIl).toLocaleString('it-IT')}</dd>
                </dl>
              ) : <p className="text-sm text-esito-ko">Knowledge base non disponibile.</p>}
            </Panel>
            <Panel title="Qualità del dataset spedizioni">
              {data.qualitaDati ? (
                <ul className="list-disc space-y-1 pl-5 text-sm">{data.qualitaDati.descrizione.map((d) => <li key={d}>{d}</li>)}</ul>
              ) : <p className="text-sm text-ardesia">Report non disponibile.</p>}
            </Panel>
            <Panel title="Ultimi errori">
              {data.ultimiErrori.length ? (
                <ul className="space-y-2 text-sm">
                  {data.ultimiErrori.map((e) => <li key={e.quando}><span className="text-ardesia">{new Date(e.quando).toLocaleString('it-IT')}</span> {e.messaggio}</li>)}
                </ul>
              ) : <p className="text-sm text-ardesia">Nessun errore registrato.</p>}
            </Panel>
          </div>
        )}
      </QueryState>
    </>
  );
}
