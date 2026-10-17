import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileUp, X } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import type { DocumentCategoryDto, DocumentDto } from '@logisticai/shared';
import { ACCEPTED_FILES, documentsApi, MAX_UPLOAD_MB } from '../../api/platform';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Field, Input, Select } from '../ui/Field';
import { formatSize, titleFromFile } from './meta';

const ALLOWED = /\.(pdf|docx|txt|md)$/i;

export function UploadDialog({ open, onClose, categories, defaultCategoryId, onUploaded }: {
  open: boolean;
  onClose: () => void;
  categories: DocumentCategoryDto[];
  defaultCategoryId?: string;
  onUploaded?: (doc: DocumentDto) => void;
}) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setTitle('');
    setProblem(null);
    setCategoryId(defaultCategoryId ?? categories[0]?.id ?? '');
  }, [open, defaultCategoryId, categories]);

  const upload = useMutation({
    mutationFn: documentsApi.upload,
    onSuccess: async (doc) => {
      await Promise.all(['documents', 'categories', 'home'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      onUploaded?.(doc);
      onClose();
    },
    onError: (err) => setProblem(err.message),
  });

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!ALLOWED.test(f.name)) return setProblem('Formato non supportato. Puoi caricare PDF, Word (.docx), testo (.txt) o Markdown (.md).');
    if (f.size > MAX_UPLOAD_MB * 1024 * 1024) return setProblem(`Il file supera il limite di ${MAX_UPLOAD_MB} MB.`);
    setProblem(null);
    setFile(f);
    setTitle(titleFromFile(f.name));
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files[0]);
  };

  return (
    <Dialog open={open} title="Carica un documento" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (file && categoryId) upload.mutate({ file, categoryId, title: title.trim() || undefined });
        }}
      >
        {file ? (
          <div className="flex items-center gap-3 rounded-2xl bg-primario-chiaro p-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primario text-testo" aria-hidden>
              <FileUp size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{file.name}</p>
              <p className="text-xs text-testo-2">{formatSize(file.size)}</p>
            </div>
            <button type="button" aria-label="Scegli un altro file" onClick={() => setFile(null)} className="rounded-lg p-1.5 text-testo-2 hover:bg-superficie">
              <X size={16} aria-hidden />
            </button>
          </div>
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center rounded-2xl border-2 border-dashed px-6 py-9 text-center transition-colors ${dragging ? 'border-primario bg-primario-chiaro' : 'border-bordo bg-fondo'}`}
          >
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-superficie text-primario shadow-[var(--shadow-card)]" aria-hidden>
              <FileUp size={22} />
            </span>
            <p className="mt-3 font-semibold">Trascina qui il file</p>
            <p className="mt-1 text-sm text-testo-2">PDF, Word, testo o Markdown, fino a {MAX_UPLOAD_MB} MB</p>
            <Button variant="secondary" size="sm" className="mt-4" onClick={() => input.current?.click()}>
              Scegli dal computer
            </Button>
            <input ref={input} type="file" accept={ACCEPTED_FILES} className="sr-only" aria-label="File da caricare" onChange={(e) => pick(e.target.files?.[0])} />
          </div>
        )}
        <Field label="Categoria">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Titolo" hint="È il nome che vedranno i colleghi e che comparirà nelle fonti delle risposte.">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Titolo del documento" />
        </Field>
        {problem && (
          <p role="alert" className="rounded-[10px] bg-ko-chiaro px-3 py-2 text-sm text-ko">
            {problem}
          </p>
        )}
        <p className="text-xs text-testo-2">Il documento sarà subito visibile a tutti gli utenti e l'assistente lo userà per rispondere appena finita l'analisi.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" disabled={!file || !categoryId || upload.isPending}>
            {upload.isPending ? 'Caricamento...' : 'Carica'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
