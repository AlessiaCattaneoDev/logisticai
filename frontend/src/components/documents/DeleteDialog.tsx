import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DocumentDto } from '@logisticai/shared';
import { documentsApi } from '../../api/platform';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';

export function DeleteDialog({ doc, onClose }: { doc: DocumentDto | null; onClose: () => void }) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => documentsApi.remove(id),
    onSuccess: async () => {
      await Promise.all(['documents', 'categories', 'home'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      onClose();
    },
  });
  return (
    <Dialog open={!!doc} title="Eliminare il documento?" onClose={onClose}>
      <p className="text-testo-2">
        "{doc?.title}" sparirà dalla libreria e l'assistente non lo userà più per rispondere. Le risposte già date restano nelle conversazioni.
      </p>
      {remove.error && (
        <p role="alert" className="mt-3 rounded-[10px] bg-ko-chiaro px-3 py-2 text-sm text-ko">
          {remove.error.message}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Annulla
        </Button>
        <Button variant="danger" disabled={remove.isPending} onClick={() => doc && remove.mutate(doc.id)}>
          Elimina documento
        </Button>
      </div>
    </Dialog>
  );
}
