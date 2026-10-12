import { FileText, MessageSquare, Trash2 } from 'lucide-react';
import type { DocumentDto } from '@logisticai/shared';
import { StatusBadge } from '../ui/Badge';
import { ButtonLink, IconButton } from '../ui/Button';
import { documentMeta } from './meta';

export function DocumentRow({ doc, showCategory = false, onDelete }: { doc: DocumentDto; showCategory?: boolean; onDelete?: (doc: DocumentDto) => void }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-bordo-tenue px-5 py-4 first:border-t-0">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${doc.status === 'error' ? 'bg-ko-chiaro text-ko' : 'bg-primario-chiaro text-primario'}`} aria-hidden>
        <FileText size={18} />
      </span>
      <div className="min-w-0 flex-1 basis-60">
        <p className="truncate font-semibold">{doc.title}</p>
        <p className="mt-0.5 text-sm text-testo-2">
          {showCategory && <>{doc.category.name}. </>}
          {documentMeta(doc)}
        </p>
        {doc.status === 'error' && doc.errorMessage && <p className="mt-1 text-sm text-ko">{doc.errorMessage}</p>}
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status={doc.status} />
        {doc.status === 'ready' && (
          <ButtonLink to={`/chat?documento=${doc.id}`} variant="secondary" size="sm">
            <MessageSquare size={14} aria-hidden /> Chiedi a questo documento
          </ButtonLink>
        )}
        {doc.canDelete && onDelete && (
          <IconButton label={`Elimina "${doc.title}"`} onClick={() => onDelete(doc)} className="hover:bg-ko-chiaro hover:text-ko">
            <Trash2 size={16} aria-hidden />
          </IconButton>
        )}
      </div>
    </li>
  );
}
