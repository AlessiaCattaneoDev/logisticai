import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, MessageSquare, Pencil, Upload } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { DocumentDto } from '@logisticai/shared';
import { categoriesApi, documentsApi } from '../api/platform';
import { useMe } from '../auth/useAuth';
import { CategoryDialog } from '../components/documents/CategoryDialog';
import { DeleteDialog } from '../components/documents/DeleteDialog';
import { DocumentRow } from '../components/documents/DocumentRow';
import { UploadDialog } from '../components/documents/UploadDialog';
import { Page } from '../components/layout/AppShell';
import { Button, ButtonLink } from '../components/ui/Button';
import { EmptyState, PageHeader } from '../components/ui/Card';
import { QueryState } from '../components/ui/Status';
import { pollWhileProcessing } from './DocumentsPage';

export function CategoryPage() {
  const { categoriaId = '' } = useParams();
  const { data: user } = useMe();
  const [upload, setUpload] = useState(false);
  const [rename, setRename] = useState(false);
  const [toDelete, setToDelete] = useState<DocumentDto | null>(null);
  const cats = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list });
  const docs = useQuery({
    queryKey: ['documents', { categoria: categoriaId }],
    queryFn: () => documentsApi.list({ categoria: categoriaId }),
    refetchInterval: (query) => pollWhileProcessing(query.state.data),
  });
  const category = cats.data?.find((c) => c.id === categoriaId);

  return (
    <Page>
      <Link to="/documenti" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-testo-2 hover:text-primario">
        <ChevronLeft size={16} aria-hidden /> Tutte le categorie
      </Link>
      <QueryState isLoading={cats.isLoading || docs.isLoading} error={cats.error ?? docs.error}>
        {!category ? (
          <EmptyState title="Categoria non trovata" description="Potrebbe essere stata rinominata o rimossa." action={<ButtonLink to="/documenti" size="sm">Torna ai documenti</ButtonLink>} />
        ) : (
          <>
            <PageHeader
              title={category.name}
              description={category.description || undefined}
              actions={
                <>
                  {user?.role === 'ADMIN' && (
                    <Button variant="ghost" onClick={() => setRename(true)}>
                      <Pencil size={15} aria-hidden /> Rinomina
                    </Button>
                  )}
                  {category.ready > 0 && (
                    <ButtonLink to={`/chat?categoria=${category.id}`} variant="secondary">
                      <MessageSquare size={16} aria-hidden /> Chiedi a questa categoria
                    </ButtonLink>
                  )}
                  <Button onClick={() => setUpload(true)}>
                    <Upload size={16} aria-hidden /> Carica qui
                  </Button>
                </>
              }
            />
            <section aria-label={`Documenti di ${category.name}`} className="card overflow-hidden">
              {docs.data?.length ? (
                <ul>
                  {docs.data.map((d) => (
                    <DocumentRow key={d.id} doc={d} onDelete={setToDelete} />
                  ))}
                </ul>
              ) : (
                <div className="p-5">
                  <EmptyState title="Ancora nessun documento" description="Carica il primo: sarà subito disponibile per tutti." action={<Button size="sm" onClick={() => setUpload(true)}>Carica un documento</Button>} />
                </div>
              )}
            </section>
            <CategoryDialog open={rename} onClose={() => setRename(false)} category={category} />
          </>
        )}
      </QueryState>
      <UploadDialog open={upload} onClose={() => setUpload(false)} categories={cats.data ?? []} defaultCategoryId={categoriaId} />
      <DeleteDialog doc={toDelete} onClose={() => setToDelete(null)} />
    </Page>
  );
}
