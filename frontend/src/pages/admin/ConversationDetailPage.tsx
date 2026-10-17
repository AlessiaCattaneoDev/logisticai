import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { adminApi } from '../../api/admin';
import { formatValue } from '../../components/artifacts/format';
import { PageHeader, QueryState } from '../../components/admin/ui';
import { AssistantMessage } from '../../components/chat/AssistantMessage';

const COMPONENT_LABEL: Record<string, string> = { orchestrator: 'Orchestratore', embedding: 'Embedding', data_agent: 'Data agent' };

export function ConversationDetailPage() {
  const { id } = useParams();
  const { data, isLoading, error } = useQuery({ queryKey: ['admin', 'conversation', id], queryFn: () => adminApi.conversation(id!) });
  const eur = (v: number) => formatValue(v, 'currency_eur');

  return (
    <>
      <Link to="/admin/conversazioni" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primario"><ArrowLeft size={14} aria-hidden /> Tutte le conversazioni</Link>
      <QueryState isLoading={isLoading} error={error}>
        {data && (
          <>
            <PageHeader title={data.title} description={`${data.utente.alias}, ultimo aggiornamento ${new Date(data.updatedAt).toLocaleString('it-IT')}. Questa apertura è stata registrata.`} />
            <div className="space-y-5">
              {data.messages.map((m) => {
                if (m.role === 'user') {
                  return <p key={m.id} className="ml-auto max-w-[80%] whitespace-pre-wrap rounded-[18px] rounded-br-md bg-primario px-4 py-2.5 text-testo">{m.content}</p>;
                }
                const t = data.trace[m.id];
                return (
                  <div key={m.id} className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
                    <AssistantMessage message={m} />
                    {t && (
                      <aside aria-label="Dettaglio tecnico della risposta" className="rounded-2xl bg-superficie p-4 text-sm">
                        <p className="font-semibold">Dettaglio tecnico</p>
                        <p className="mt-1 text-testo-2">Costo {eur(t.costoEur)}{t.latenzaMs !== null && `, tempo ${formatValue(t.latenzaMs / 1000)} s`}</p>
                        <table className="mt-3 w-full">
                          <thead className="text-left text-testo-2"><tr><th className="font-medium">Chiamata</th><th className="text-right font-medium">Token</th><th className="text-right font-medium">Costo</th><th className="text-right font-medium">Tempo</th></tr></thead>
                          <tbody>
                            {t.chiamate.map((c, i) => (
                              <tr key={i} className="border-t border-bordo-tenue hover:bg-fondo/60" title={`${c.provider}:${c.modello}`}>
                                <td className="py-1">{COMPONENT_LABEL[c.componente] ?? c.componente}</td>
                                <td className="py-1 text-right tabular-nums">{formatValue(c.tokenInput + c.tokenCache, 'integer')} / {formatValue(c.tokenOutput, 'integer')}</td>
                                <td className="py-1 text-right tabular-nums">{formatValue(c.costoEur, 'currency_eur')}</td>
                                <td className="py-1 text-right tabular-nums">{formatValue(c.latenzaMs / 1000)} s</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {t.strumenti.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <p className="font-medium">Strumenti</p>
                            {t.strumenti.map((s, i) => (
                              <details key={i} className="rounded-lg border border-bordo-tenue px-2.5 py-1.5">
                                <summary className="cursor-pointer">
                                  <span className={s.ok ? '' : 'text-ko'}>{s.tool}</span> <span className="text-testo-2">{s.resultSummary ?? s.error}</span>
                                </summary>
                                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-xs">{JSON.stringify(s.args, null, 2)}</pre>
                              </details>
                            ))}
                          </div>
                        )}
                      </aside>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}
