import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { TableSpec } from '@logisticai/shared';
import { adminApi } from '../../api/admin';
import { ApiError } from '../../api/http';
import { DataTable } from '../../components/artifacts/DataTable';
import { usePeriod } from '../../components/admin/period';
import { PeriodPicker } from '../../components/admin/PeriodPicker';
import { PageHeader, Panel, QueryState } from '../../components/admin/ui';

function PricingForm() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ provider: 'openai', modello: '', inputPer1M: '', outputPer1M: '', cachedInputPer1M: '', validoDal: new Date().toISOString().slice(0, 10) });
  const add = useMutation({
    mutationFn: () =>
      adminApi.addPricing({
        provider: form.provider, modello: form.modello, validoDal: form.validoDal,
        inputPer1M: Number(form.inputPer1M.replace(',', '.')), outputPer1M: Number(form.outputPer1M.replace(',', '.')),
        cachedInputPer1M: form.cachedInputPer1M ? Number(form.cachedInputPer1M.replace(',', '.')) : null,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'costs'] }),
  });
  const field = (key: keyof typeof form, label: string, type = 'text') => (
    <label className="text-sm">
      {label}
      <input type={type} required={key !== 'cachedInputPer1M'} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="mt-1 block w-32 rounded-[10px] border border-bordo bg-superficie px-3 py-1.5 focus:border-primario focus:outline-none" />
    </label>
  );
  return (
    <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(e: FormEvent) => { e.preventDefault(); add.mutate(); }}>
      {field('provider', 'Provider')}
      {field('modello', 'Modello')}
      {field('inputPer1M', 'Input $/1M')}
      {field('cachedInputPer1M', 'Cache $/1M')}
      {field('outputPer1M', 'Output $/1M')}
      {field('validoDal', 'Valido dal', 'date')}
      <button type="submit" disabled={add.isPending} className="h-9 rounded-[10px] bg-primario px-4 text-sm font-semibold text-white hover:bg-primario-scuro disabled:opacity-50">Aggiungi listino</button>
      {add.isSuccess && <span role="status" className="text-sm text-ok">Listino aggiunto.</span>}
      {add.error && <span role="alert" className="text-sm text-ko">{add.error instanceof ApiError ? add.error.message : 'Listino non salvato.'}</span>}
    </form>
  );
}

const COMPONENTE: Record<string, string> = { orchestrator: 'Orchestratore', data_agent: 'Data agent', embedding: 'Embedding' };
/** I listini vanno mostrati esatti (es. 0,075), non arrotondati a due decimali. */
const price = (v: number | null) => (v === null ? null : v.toLocaleString('it-IT', { maximumFractionDigits: 4 }));

export function CostsPage() {
  const [period] = usePeriod();
  const { data, isLoading, error } = useQuery({ queryKey: ['admin', 'costs', period.da, period.a], queryFn: () => adminApi.costs(period) });
  const perModello: TableSpec | null = !data ? null : {
    kind: 'table', id: 'per-modello', title: 'Costi per modello e componente',
    columns: [
      { key: 'componente', label: 'Componente' }, { key: 'modello', label: 'Modello' }, { key: 'chiamate', label: 'Chiamate', format: 'integer' },
      { key: 'tokenInput', label: 'Token input', format: 'integer' }, { key: 'tokenOutput', label: 'Token output', format: 'integer' }, { key: 'costoEur', label: 'Costo', format: 'currency_eur' },
    ],
    rows: data.perModello.map((r) => ({ ...r, componente: COMPONENTE[r.componente] ?? r.componente })), defaultSort: { key: 'costoEur', direction: 'desc' },
  };
  const perUtente: TableSpec | null = !data ? null : {
    kind: 'table', id: 'per-utente', title: 'Costi per utente',
    columns: [{ key: 'utente', label: 'Utente' }, { key: 'richieste', label: 'Richieste', format: 'integer' }, { key: 'costoEur', label: 'Costo', format: 'currency_eur' }],
    rows: data.perUtente.map((u) => ({ utente: u.utente.alias, richieste: u.richieste, costoEur: u.costoEur })),
  };
  const listini: TableSpec | null = !data ? null : {
    kind: 'table', id: 'listini', title: 'Listini (USD per milione di token)',
    columns: [
      { key: 'provider', label: 'Provider' }, { key: 'modello', label: 'Modello' }, { key: 'inputPer1M', label: 'Input', align: 'right' },
      { key: 'cachedInputPer1M', label: 'Input in cache', align: 'right' }, { key: 'outputPer1M', label: 'Output', align: 'right' }, { key: 'validoDal', label: 'Valido dal', format: 'date' },
    ],
    rows: data.listini.map(({ id: _id, ...r }) => ({ ...r, inputPer1M: price(r.inputPer1M), cachedInputPer1M: price(r.cachedInputPer1M), outputPer1M: price(r.outputPer1M) })),
  };
  return (
    <>
      <PageHeader title="Costi e modelli" description="Ripartizione della spesa AI e listini usati per calcolarla. I modelli si cambiano dal file .env." actions={<PeriodPicker />} />
      <QueryState isLoading={isLoading} error={error}>
        {data && perModello && perUtente && listini && (
          <div className="space-y-6">
            <Panel title="Modelli attivi">
              <dl className="grid gap-2 text-sm md:grid-cols-3">
                <div><dt className="text-testo-2">Orchestratore</dt><dd className="font-mono">{data.modelliAttivi.orchestratore}</dd></div>
                <div><dt className="text-testo-2">Data agent</dt><dd className="font-mono">{data.modelliAttivi.dataAgent}</dd></div>
                <div><dt className="text-testo-2">Embedding</dt><dd className="font-mono">{data.modelliAttivi.embedding}</dd></div>
              </dl>
              <p className="mt-3 text-sm text-testo-2">
                Budget: {data.budget.giornalieroEur} € al giorno, {data.budget.mensileEur} € al mese. Cambio USD/EUR {data.budget.cambioUsdEur}.
              </p>
            </Panel>
            <DataTable spec={perModello} />
            <DataTable spec={perUtente} />
            <div>
              <DataTable spec={listini} />
              <PricingForm />
            </div>
          </div>
        )}
      </QueryState>
    </>
  );
}
