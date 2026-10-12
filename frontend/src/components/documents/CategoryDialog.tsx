import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { DocumentCategoryDto } from '@logisticai/shared';
import { categoriesApi } from '../../api/platform';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Field, Input, Textarea } from '../ui/Field';

/** Crea una categoria o, se riceve `category`, la rinomina (solo admin). */
export function CategoryDialog({ open, onClose, category }: { open: boolean; onClose: () => void; category?: DocumentCategoryDto }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? '');
    setDescription(category?.description ?? '');
  }, [open, category]);
  const save = useMutation({
    mutationFn: async () => {
      const body = { name: name.trim(), description: description.trim() };
      if (category) await categoriesApi.update(category.id, body);
      else await categoriesApi.create(body);
    },
    onSuccess: async () => {
      await Promise.all(['categories', 'documents'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      onClose();
    },
  });
  return (
    <Dialog open={open} title={category ? 'Rinomina la categoria' : 'Nuova categoria'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={80} required />
        </Field>
        <Field label="Descrizione" hint="Facoltativa: aiuta i colleghi a scegliere dove caricare.">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={2} />
        </Field>
        {save.error && (
          <p role="alert" className="rounded-[10px] bg-ko-chiaro px-3 py-2 text-sm text-ko">
            {save.error.message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" disabled={name.trim().length < 2 || save.isPending}>
            {category ? 'Salva' : 'Crea categoria'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
