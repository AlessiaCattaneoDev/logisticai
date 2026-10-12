import { useQuery } from '@tanstack/react-query';
import { FolderPlus, Search, Upload } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { DocumentDto } from '@logisticai/shared';
import { categoriesApi, documentsApi } from '../api/platform';
import { useMe } from '../auth/useAuth';
import { CategoryDialog } from '../components/documents/CategoryDialog';
import { DeleteDialog } from '../components/documents/DeleteDialog';
import { DocumentRow } from '../components/documents/DocumentRow';
import { categoryIcon } from '../components/documents/meta';
import { UploadDialog } from '../components/documents/UploadDialog';
import { Page } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';
import { EmptyState, PageHeader } from '../components/ui/Card';
import { QueryState } from '../components/ui/Status';

/** Mentre un documento è in analisi la lista si aggiorna da sola. */
export const pollWhileProcessing = (docs: DocumentDto[] | undefined) => (docs?.some((d) => d.status === 'processing') ? 2000 : false);

export function DocumentsPage() {
  const { data: user } = useMe();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [newCategory, setNewCategory] = useState(false);
  const [toDelete, setToDelete] = useState<DocumentDto | null>(null);
  const uploadOpen = params.get('carica') === '1';
  const setUpload = (open: boolean) => setParams(open ? { carica: '1' } : {}, { replace: true });

  const cats = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list });
  const search = useQuery({
    queryKey: ['documents', { q }],
    queryFn: () => documentsApi.list({ q }),
    enabled: q.trim().length >= 2,
    refetchInterval: (query) => pollWhileProcessing(query.state.data),
  });
  const total = cats.data?.reduce((s, c) => s + c.ready, 0) ?? 0;
  const processing = cats.data?.reduce((s, c) => s + (c.documents - c.ready), 0) ?? 0;

  return (
    <Page>
      <PageHeader
        title="Documenti"
        description={cats.data ? `${total} documenti in ${cats.data.length} categorie, tutti consultabili dall'assistente.` : undefined}
        actions={
          <>
            {user?.role === 'ADMIN' && (
              <Button variant="secondary" onClick={() => setNewCategory(true)}>
                <FolderPlus size={16} aria-hidden /> Nuova categoria
              </Button>
            )}
            <Button onClick={() => setUpload(true)}>
              <Upload size={16} aria-hidden /> Carica un documento
            </Button>
          </>
        }
      />
      <label className="relative mb-6 block max-w-md">
        <span className="sr-only">Cerca nei documenti</span>
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-testo-2" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca un documento per titolo"
          className="h-11 w-full rounded-full border border-bordo bg-superficie pl-10 pr-4 text-sm focus:border-primario focus:outline-none focus:ring-4 focus:ring-primario/10"
        />
      </label>
      <QueryState isLoading={cats.isLoading} error={cats.error}>
        {q.trim().length >= 2 ? (
          <section aria-label="Risultati della ricerca" className="card overflow-hidden">
            {search.data?.length ? (
              <ul>
                {search.data.map((d) => (
                  <DocumentRow key={d.id} doc={d} showCategory onDelete={setToDelete} />
                ))}
              </ul>
            ) : (
              !search.isLoading && <div className="p-5"><EmptyState title="Nessun documento trovato" description={`Nessun titolo contiene "${q.trim()}".`} /></div>
            )}
          </section>
        ) : (
          <>
            {processing > 0 && <p className="mb-4 text-sm text-accento-scuro">{processing === 1 ? '1 documento in analisi' : `${processing} documenti in analisi`}: saranno disponibili tra pochi secondi.</p>}
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {cats.data?.map((c) => {
                const Icon = categoryIcon(c.name);
                return (
                  <li key={c.id}>
                    <Link to={`/documenti/${c.id}`} className="card group flex h-full flex-col p-5 transition-shadow hover:shadow-[var(--shadow-pop)]">
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-primario-chiaro text-primario transition-colors group-hover:bg-primario group-hover:text-white" aria-hidden>
                        <Icon size={20} />
                      </span>
                      <span className="mt-4 font-semibold">{c.name}</span>
                      {c.description && <span className="mt-1 line-clamp-2 text-sm text-testo-2">{c.description}</span>}
                      <span className="mt-auto flex items-center gap-2 pt-4 text-sm">
                        <span className="font-semibold tabular-nums">{c.ready === 1 ? '1 documento' : `${c.ready} documenti`}</span>
                        {c.documents > c.ready && <span className="text-accento-scuro">, {c.documents - c.ready} in analisi o con errore</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </QueryState>
      <UploadDialog open={uploadOpen} onClose={() => setUpload(false)} categories={cats.data ?? []} onUploaded={(d) => navigate(`/documenti/${d.category.id}`)} />
      <CategoryDialog open={newCategory} onClose={() => setNewCategory(false)} />
      <DeleteDialog doc={toDelete} onClose={() => setToDelete(null)} />
    </Page>
  );
}
