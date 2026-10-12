import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, FileText, MessageSquare, Plus, Upload } from 'lucide-react';
import { Link } from 'react-router';
import type { HomeData } from '@logisticai/shared';
import { homeApi } from '../api/platform';
import { formatValue } from '../components/artifacts/format';
import { MiniBarChart } from '../components/artifacts/MiniBarChart';
import { seriesColor } from '../components/artifacts/palette';
import { Page } from '../components/layout/AppShell';
import { StatusBadge } from '../components/ui/Badge';
import { ButtonLink } from '../components/ui/Button';
import { EmptyState, PageHeader, Section, StatCard } from '../components/ui/Card';
import { BudgetBar, QueryState, ServiceList } from '../components/ui/Status';
import { greeting, longDate, relativeDay } from '../lib/time';

/** Nomi dal punto di vista di chi chiede, non degli strumenti interni. */
const TIPO_LABEL: Record<string, string> = { 'Nessuno strumento': 'Risposta diretta' };

const dayLabel = (v: unknown) => new Date(`${v as string}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

/** Ripartizione delle risposte per strumenti usati, come barra segmentata con legenda. */
function SplitBar({ items }: { items: HomeData['domandePerTipo'] }) {
  const shown = items.filter((i) => i.domande > 0);
  const total = shown.reduce((s, i) => s + i.domande, 0);
  if (!total) return <p className="text-sm text-testo-2">Ancora nessuna risposta negli ultimi 30 giorni.</p>;
  return (
    <div>
      <div className="flex h-3 gap-1 overflow-hidden rounded-full" aria-hidden>
        {shown.map((i, k) => (
          <div key={i.tipo} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(i.domande / total) * 100}%`, background: seriesColor(k) }} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {shown.map((i, k) => (
          <li key={i.tipo} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: seriesColor(k) }} aria-hidden />
            <span className="flex-1 text-testo-2">{TIPO_LABEL[i.tipo] ?? i.tipo}</span>
            <span className="font-semibold tabular-nums">{Math.round((i.domande / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AdminStrip({ admin }: { admin: NonNullable<HomeData['admin']> }) {
  const down = Object.values(admin.servizi).filter((s) => s !== 'ok').length;
  return (
    <section aria-label="Amministrazione" className="mt-6 grid gap-4 lg:grid-cols-3">
      <StatCard label="Costo AI di oggi" value={formatValue(admin.costoOggiEur, 'currency_eur')} tone="primary">
        <BudgetBar used={admin.costoOggiEur} budget={admin.budgetGiornalieroEur} label="Budget giornaliero" inverse />
      </StatCard>
      <Link to="/admin/feedback" className="card group block p-4 transition-colors hover:bg-primario-chiaro/40">
        <p className="flex items-center justify-between text-sm text-testo-2">
          Risposte segnalate da rivedere <ArrowUpRight size={16} className="text-testo-2 group-hover:text-primario" aria-hidden />
        </p>
        <p className={`mt-1 text-[28px] font-bold leading-tight tabular-nums ${admin.segnalazioniDaRivedere ? 'text-accento-scuro' : ''}`}>{admin.segnalazioniDaRivedere}</p>
        <p className="mt-1 text-xs text-testo-2">{admin.segnalazioniDaRivedere ? 'Gli utenti hanno indicato risposte da migliorare' : 'Nessuna segnalazione aperta'}</p>
      </Link>
      <div className="card p-4">
        <p className="mb-3 flex items-center justify-between text-sm text-testo-2">
          Stato dei servizi
          <span className={`text-xs font-semibold ${down ? 'text-ko' : 'text-ok'}`}>{down ? `${down} non raggiungibili` : 'Tutto attivo'}</span>
        </p>
        <ServiceList services={admin.servizi} />
      </div>
    </section>
  );
}

export function HomePage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['home'], queryFn: homeApi.get, staleTime: 30_000 });
  const processing = data?.documentiRecenti.filter((d) => d.status === 'processing').length ?? 0;
  return (
    <Page>
      <QueryState isLoading={isLoading} error={error}>
        {data && (
          <>
            <PageHeader
              title={`${greeting()}, ${data.utente.nome}`}
              description={`${longDate()}. ${processing ? `${processing} documenti in analisi nella libreria.` : 'Tutti i documenti della libreria sono pronti per le tue domande.'}`}
              actions={
                <>
                  {data.admin && (
                    <ButtonLink to="/admin" variant="secondary">
                      Apri la dashboard
                    </ButtonLink>
                  )}
                  <ButtonLink to="/documenti?carica=1" variant="secondary">
                    <Upload size={16} aria-hidden /> Carica un documento
                  </ButtonLink>
                  <ButtonLink to="/chat">
                    <Plus size={16} aria-hidden /> Nuova conversazione
                  </ButtonLink>
                </>
              }
            />
            <section aria-label="I tuoi numeri" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Documenti disponibili" value={data.kpi.documentiDisponibili} hint={`in ${data.kpi.categorie} categorie`} />
              <StatCard label="Le tue conversazioni" value={data.kpi.conversazioni} />
              <StatCard label="Domande questo mese" value={data.kpi.domandeMese} />
              <StatCard
                label="Risposte che hai trovato utili"
                value={data.kpi.risposteUtiliPct === null ? 'nessuna' : formatValue(data.kpi.risposteUtiliPct, 'percent')}
                hint={data.kpi.risposteUtiliPct === null ? 'Valuta le risposte con il pollice' : undefined}
              />
            </section>
            {data.admin && <AdminStrip admin={data.admin} />}
            <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
              <Section title="Riprendi una conversazione" action={<Link to="/chat" className="text-sm font-semibold text-primario hover:underline">Tutte</Link>}>
                {data.conversazioniRecenti.length ? (
                  <ul className="-mx-2">
                    {data.conversazioniRecenti.map((c) => (
                      <li key={c.id}>
                        <Link to={`/chat/${c.id}`} className="flex items-center gap-3 rounded-[10px] px-2 py-2.5 hover:bg-fondo">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primario-chiaro text-primario" aria-hidden>
                            <MessageSquare size={15} />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.title}</span>
                          <span className="shrink-0 text-xs text-testo-2">{relativeDay(c.updatedAt)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="Nessuna conversazione" description="Fai la prima domanda: contratti, procedure o numeri delle spedizioni." action={<ButtonLink to="/chat" size="sm">Inizia</ButtonLink>} />
                )}
              </Section>
              <Section title="Le tue domande, ultime due settimane">
                <MiniBarChart data={data.domandeGiornaliere} xKey="giorno" yKey="domande" label="Domande al giorno" fmtX={dayLabel} height={150} />
                <p className="mb-2 mt-5 text-sm font-semibold">Come ho risposto negli ultimi 30 giorni</p>
                <SplitBar items={data.domandePerTipo} />
              </Section>
            </div>
            <Section className="mt-4" title="Aggiunti di recente nella libreria" action={<Link to="/documenti" className="text-sm font-semibold text-primario hover:underline">Vai ai documenti</Link>}>
              {data.documentiRecenti.length ? (
                <ul className="-mx-2">
                  {data.documentiRecenti.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 rounded-[10px] px-2 py-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-fondo text-testo-2" aria-hidden>
                        <FileText size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{d.title}</span>
                        <span className="block text-xs text-testo-2">{d.categoria}, {relativeDay(d.createdAt)}</span>
                      </span>
                      <StatusBadge status={d.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="La libreria è vuota" description="Carica contratti, procedure e manuali: l'assistente li userà per rispondere." />
              )}
            </Section>
          </>
        )}
      </QueryState>
    </Page>
  );
}
