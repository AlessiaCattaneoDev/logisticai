import { useQuery } from '@tanstack/react-query';
import type { AdminOverview, ChartSpec } from '@logisticai/shared';
import { adminApi } from '../../api/admin';
import { DataChart } from '../../components/artifacts/DataChart';
import { formatValue } from '../../components/artifacts/format';
import { usePeriod } from '../../components/admin/period';
import { PeriodPicker } from '../../components/admin/PeriodPicker';
import { BudgetBar, PageHeader, QueryState } from '../../components/admin/ui';

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
      series: [{ key: 'feedback_positivi', label: 'Utili', color: '#2e7d4f' }, { key: 'feedback_negativi', label: 'Da migliorare', color: '#c2362b' }],
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
      <PageHeader title="Panoramica" description="Quanto costa l'assistente, quanto viene usato e quanto bene risponde." actions={<PeriodPicker />} />
      <QueryState isLoading={isLoading} error={error}>
        {k && data && (
          <>
            {k.modelliSenzaPrezzo.length > 0 && (
              <p role="alert" className="mb-4 rounded-md border border-segnale bg-segnale-chiaro px-4 py-2 text-sm">
                Modelli senza listino, quindi con costo non calcolato: {k.modelliSenzaPrezzo.join(', ')}. Aggiungi il prezzo in Costi e modelli.
              </p>
            )}
            <dl className="grid grid-cols-2 divide-bordo overflow-hidden rounded-md border border-bordo bg-carta md:grid-cols-4 md:divide-x xl:grid-cols-8">
              {[
                ['Costo del periodo', eur(k.costoPeriodoEur)],
                ['Costo di oggi', eur(k.costoOggiEur), <BudgetBar key="g" used={k.costoOggiEur} budget={k.budgetGiornalieroEur} label="Budget giornaliero" />],
                ['Costo del mese', eur(k.costoMeseEur), <BudgetBar key="m" used={k.costoMeseEur} budget={k.budgetMensileEur} label="Budget mensile" />],
                ['Richieste', formatValue(k.richieste, 'integer'), <p key="c" className="mt-1 text-xs text-ardesia">{k.conversazioni} conversazioni, {k.utentiAttivi} utenti</p>],
                ['Costo per richiesta', eur(k.costoMedioRichiestaEur), <p key="cc" className="mt-1 text-xs text-ardesia">{eur(k.costoMedioConversazioneEur)} per conversazione</p>],
                ['Tempo medio di risposta', `${formatValue(k.latenzaMediaMs / 1000)} s`, <p key="l" className="mt-1 text-xs text-ardesia">95° percentile {formatValue(k.latenzaP95Ms / 1000)} s</p>],
                ['Risposte utili', pct(k.feedbackPositiviPct), <p key="f" className="mt-1 text-xs text-ardesia">{k.feedbackTotali} valutazioni</p>],
                ['Risposte con errore', pct(k.erroriPct)],
              ].map(([label, value, extra]) => (
                <div key={label as string} className="border-b border-bordo px-4 py-3 md:border-b-0">
                  <dt className="text-sm text-ardesia">{label}</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
                  {extra}
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-ardesia">
              Token elaborati: {formatValue(k.tokenInput, 'integer')} in input, {formatValue(k.tokenOutput, 'integer')} in output. Periodo dal {formatValue(data.da, 'date')} al {formatValue(data.a, 'date')}.
            </p>
            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              {charts(data).map((spec) => (
                <DataChart key={spec.id} spec={spec} />
              ))}
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}
