import { useQuery } from '@tanstack/react-query';
import type { AdminOverview, ChartSpec } from '@logisticai/shared';
import { adminApi } from '../../api/admin';
import { DataChart } from '../../components/artifacts/DataChart';
import { formatValue } from '../../components/artifacts/format';
import { usePeriod } from '../../components/admin/period';
import { PeriodPicker } from '../../components/admin/PeriodPicker';
import { BudgetBar, PageHeader, QueryState } from '../../components/admin/ui';
import { StatCard } from '../../components/ui/Card';

function charts(o: AdminOverview): ChartSpec[] {
  const data = o.giornaliero;
  return [
    {
      kind: 'chart', id: 'costi', type: 'bar', title: 'Costo AI giornaliero', subtitle: 'Per componente del sistema',
      xKey: 'giorno', yFormat: 'currency_eur', stacked: true, data,
      series: [
        { key: 'costo_orchestratore', label: 'Orchestratore' },
        { key: 'costo_data_agent', label: 'Data agent' },
        { key: 'costo_embedding', label: 'Embedding' },
      ],
      allowedTypes: ['bar', 'area'],
    },
    {
      kind: 'chart', id: 'decisioni', type: 'pie', title: "Decisioni dell'agente", subtitle: 'Strumenti usati per rispondere',
      xKey: 'strategia', yFormat: 'integer', data: o.decisioni, series: [{ key: 'richieste', label: 'Richieste' }], allowedTypes: ['pie', 'bar'],
    },
    {
      kind: 'chart', id: 'richieste', type: 'line', title: 'Richieste al giorno', xKey: 'giorno', yFormat: 'integer', data,
      series: [{ key: 'richieste', label: 'Richieste' }], allowedTypes: ['line', 'bar'],
    },
    {
      kind: 'chart', id: 'latenza', type: 'line', title: 'Tempo di risposta', subtitle: 'Secondi, media e 95° percentile', xKey: 'giorno', yFormat: 'number', data,
      series: [{ key: 'latenza_media_s', label: 'Media' }, { key: 'latenza_p95_s', label: '95° percentile' }], allowedTypes: ['line', 'bar'],
    },
    {
      kind: 'chart', id: 'token', type: 'area', title: 'Token elaborati', xKey: 'giorno', yFormat: 'integer', data, stacked: true,
      series: [{ key: 'token_input', label: 'Input' }, { key: 'token_output', label: 'Output' }], allowedTypes: ['area', 'bar'],
    },
    {
      kind: 'chart', id: 'feedback', type: 'bar', title: 'Valutazioni degli utenti', xKey: 'giorno', yFormat: 'integer', data, stacked: true,
      series: [{ key: 'feedback_positivi', label: 'Utili', color: '#14a38b' }, { key: 'feedback_negativi', label: 'Da migliorare', color: '#e0457b' }],
    },
  ];
}

export function OverviewPage() {
  const [period] = usePeriod();
  const { data, isLoading, error } = useQuery({ queryKey: ['admin', 'overview', period.da, period.a], queryFn: () => adminApi.overview(period) });
  const k = data?.kpi;
  const eur = (v: number) => formatValue(v, 'currency_eur');
  const pct = (v: number | null) => (v === null ? 'nessuna' : formatValue(v, 'percent'));

  return (
    <>
      <PageHeader title="Dashboard" description="Quanto costa l'assistente, quanto viene usato e quanto bene risponde." actions={<PeriodPicker />} />
      <QueryState isLoading={isLoading} error={error}>
        {k && data && (
          <>
            {k.modelliSenzaPrezzo.length > 0 && (
              <p role="alert" className="mb-4 rounded-xl bg-accento-chiaro px-4 py-2.5 text-sm text-accento-scuro">
                Modelli senza listino, quindi con costo non calcolato: {k.modelliSenzaPrezzo.join(', ')}. Aggiungi il prezzo in Costi e modelli.
              </p>
            )}
            <section aria-label="Costi" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Costo del periodo" value={eur(k.costoPeriodoEur)} tone="primary" hint={`Dal ${formatValue(data.da, 'date')} al ${formatValue(data.a, 'date')}`} />
              <StatCard label="Costo di oggi" value={eur(k.costoOggiEur)}>
                <BudgetBar used={k.costoOggiEur} budget={k.budgetGiornalieroEur} label="Budget giornaliero" />
              </StatCard>
              <StatCard label="Costo del mese" value={eur(k.costoMeseEur)}>
                <BudgetBar used={k.costoMeseEur} budget={k.budgetMensileEur} label="Budget mensile" />
              </StatCard>
              <StatCard label="Costo per richiesta" value={eur(k.costoMedioRichiestaEur)} hint={`${eur(k.costoMedioConversazioneEur)} per conversazione`} />
            </section>
            <section aria-label="Uso e qualità" className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
              <StatCard label="Richieste" value={formatValue(k.richieste, 'integer')} hint={`${k.conversazioni} conversazioni, ${k.utentiAttivi === 1 ? '1 utente attivo' : `${k.utentiAttivi} utenti attivi`}`} />
              <StatCard label="Tempo medio di risposta" value={`${formatValue(k.latenzaMediaMs / 1000)} s`} hint={`95° percentile ${formatValue(k.latenzaP95Ms / 1000)} s`} />
              <StatCard label="Risposte utili" value={pct(k.feedbackPositiviPct)} hint={`${k.feedbackTotali} valutazioni`} />
              <StatCard label="Risposte con errore" value={pct(k.erroriPct)} hint={`Token: ${formatValue(k.tokenInput, 'integer')} in input, ${formatValue(k.tokenOutput, 'integer')} in output`} />
            </section>
            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              {charts(data).map((spec, i) => (
                <div key={spec.id} className={i === 0 ? 'xl:col-span-2' : ''}>
                  <DataChart spec={spec} />
                </div>
              ))}
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}
