import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../api/admin';
import { DataTable } from '../../components/artifacts/DataTable';
import { PageHeader, QueryState } from '../../components/admin/ui';

const AZIONI: Record<string, string> = {
  apertura_conversazione: 'Apertura di una conversazione',
  visualizzazione_nomi: 'Visualizzazione dei nomi degli utenti',
  revisione_feedback: 'Revisione di una segnalazione',
  nuovo_listino: 'Nuovo listino prezzi',
  creazione_utente: 'Creazione utente',
  modifica_utente: 'Modifica utente',
  reset_password: 'Reimpostazione password',
};

export function AuditPage() {
  const { data = [], isLoading, error } = useQuery({ queryKey: ['admin', 'audit'], queryFn: adminApi.audit });
  return (
    <>
      <PageHeader title="Registro accessi" description="Ogni accesso degli amministratori a conversazioni e dati degli utenti, come previsto dalla policy privacy." />
      <QueryState isLoading={isLoading} error={error}>
        <DataTable
          spec={{
            kind: 'table', id: 'audit', title: 'Ultime 200 azioni',
            columns: [{ key: 'quando', label: 'Quando' }, { key: 'admin', label: 'Amministratore' }, { key: 'azione', label: 'Azione' }, { key: 'oggetto', label: 'Oggetto' }],
            rows: data.map((r) => ({ quando: new Date(r.quando).toLocaleString('it-IT'), admin: r.admin, azione: AZIONI[r.azione] ?? r.azione, oggetto: r.oggetto })),
          }}
        />
      </QueryState>
    </>
  );
}
