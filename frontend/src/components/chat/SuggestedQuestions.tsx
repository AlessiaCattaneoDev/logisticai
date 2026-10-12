import { BarChart3, FileText, Layers, type LucideIcon } from 'lucide-react';
import type { ChatScope } from '@logisticai/shared';

const GROUPS: { label: string; icon: LucideIcon; questions: string[] }[] = [
  {
    label: 'Dai documenti',
    icon: FileText,
    questions: [
      'Il destinatario ha accettato un collo danneggiato senza firmare con riserva: possiamo ancora aprire un reclamo?',
      'Qual è il tempo di consegna garantito per un Express verso la Sardegna?',
    ],
  },
  {
    label: 'Dai dati delle spedizioni',
    icon: BarChart3,
    questions: ['Mostrami la puntualità mensile per hub negli ultimi 12 mesi.', 'Qual è il tasso di danni per vettore nel 2026?'],
  },
  {
    label: 'Documenti e dati insieme',
    icon: Layers,
    questions: ['ModaNova ha diritto a penali per settembre 2026? A quanto ammontano?', 'Secondo la procedura di qualifica, qualche subvettore andrebbe sospeso?'],
  },
];

const SCOPED = ['Riassumi i punti principali.', 'Quali tempi o scadenze sono indicati?', 'Ci sono penali, franchigie o responsabilità previste?'];

function QuestionButton({ q, onPick }: { q: string; onPick: (q: string) => void }) {
  return (
    <button type="button" onClick={() => onPick(q)} className="card w-full p-3.5 text-left text-sm leading-snug transition-colors hover:bg-primario-chiaro hover:text-primario-scuro">
      {q}
    </button>
  );
}

export function SuggestedQuestions({ onPick, scope }: { onPick: (q: string) => void; scope?: ChatScope | null }) {
  if (scope) {
    return (
      <section className="mx-auto max-w-3xl py-10" aria-labelledby="empty-title">
        <h2 id="empty-title" className="text-2xl font-bold">Cosa vuoi sapere da questo {scope.type === 'document' ? 'documento' : 'gruppo di documenti'}?</h2>
        <p className="mt-1 text-testo-2">Rispondo solo con il contenuto di "{scope.label}". Togli l'etichetta in alto per tornare a tutti i documenti e ai dati delle spedizioni.</p>
        <ul className="mt-6 grid gap-3 md:grid-cols-3">
          {SCOPED.map((q) => (
            <li key={q}>
              <QuestionButton q={q} onPick={onPick} />
            </li>
          ))}
        </ul>
      </section>
    );
  }
  return (
    <section className="mx-auto max-w-4xl py-10" aria-labelledby="empty-title">
      <h2 id="empty-title" className="text-2xl font-bold md:text-[28px]">Cosa ti serve sapere?</h2>
      <p className="mt-1 text-testo-2">Rispondo usando i documenti della libreria e lo storico delle spedizioni da ottobre 2024 a settembre 2026.</p>
      <div className="mt-7 grid gap-6 md:grid-cols-3">
        {GROUPS.map(({ label, icon: Icon, questions }) => (
          <div key={label}>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-primario-chiaro text-primario" aria-hidden>
                <Icon size={15} />
              </span>
              {label}
            </h3>
            <ul className="mt-3 space-y-2.5">
              {questions.map((q) => (
                <li key={q}>
                  <QuestionButton q={q} onPick={onPick} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
