import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../api/admin';
import { PageHeader, Panel, QueryState } from '../../components/admin/ui';
import { ServiceList } from '../../components/ui/Status';


export function SystemPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['admin', 'system'], queryFn: adminApi.system, refetchInterval: 30_000 });
  return (
    <>
      <PageHeader title="Stato del sistema" description="Servizi, knowledge base e qualità dei dati. Si aggiorna ogni 30 secondi." />
      <QueryState isLoading={isLoading} error={error}>
        {data && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Servizi">
              <ServiceList services={data.servizi} />
            </Panel>
            <Panel title="Knowledge base">
              {data.knowledgeBase ? (
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-testo-2">Documenti</dt><dd>{data.knowledgeBase.documenti}</dd>
                  <dt className="text-testo-2">Sezioni indicizzate</dt><dd>{data.knowledgeBase.chunk}</dd>
                  <dt className="text-testo-2">Modello di embedding</dt><dd className="font-mono">{data.knowledgeBase.modelloEmbedding}</dd>
                  <dt className="text-testo-2">Indicizzata il</dt><dd>{new Date(data.knowledgeBase.indicizzataIl).toLocaleString('it-IT')}</dd>
                </dl>
              ) : <p className="text-sm text-ko">Knowledge base non disponibile.</p>}
            </Panel>
            <Panel title="Qualità del dataset spedizioni">
              {data.qualitaDati ? (
                <ul className="list-disc space-y-1 pl-5 text-sm">{data.qualitaDati.descrizione.map((d) => <li key={d}>{d}</li>)}</ul>
              ) : <p className="text-sm text-testo-2">Report non disponibile.</p>}
            </Panel>
            <Panel title="Ultimi errori">
              {data.ultimiErrori.length ? (
                <ul className="space-y-2 text-sm">
                  {data.ultimiErrori.map((e) => <li key={e.quando}><span className="text-testo-2">{new Date(e.quando).toLocaleString('it-IT')}</span> {e.messaggio}</li>)}
                </ul>
              ) : <p className="text-sm text-testo-2">Nessun errore registrato.</p>}
            </Panel>
          </div>
        )}
      </QueryState>
    </>
  );
}
