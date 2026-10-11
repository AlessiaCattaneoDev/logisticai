const GROUPS = [
  {
    label: 'Dai documenti',
    questions: [
      'Il destinatario ha accettato un collo danneggiato senza firmare con riserva: possiamo ancora aprire un reclamo?',
      'Qual è il tempo di consegna garantito per un Express verso la Sardegna?',
    ],
  },
  {
    label: 'Dai dati delle spedizioni',
    questions: ['Mostrami la puntualità mensile per hub negli ultimi 12 mesi.', 'Qual è il tasso di danni per vettore nel 2026?'],
  },
  {
    label: 'Documenti e dati insieme',
    questions: ['ModaNova ha diritto a penali per settembre 2026? A quanto ammontano?', 'Secondo la procedura di qualifica, qualche subvettore andrebbe sospeso?'],
  },
];

export function SuggestedQuestions({ onPick }: { onPick: (q: string) => void }) {
  return (
    <section className="mx-auto max-w-3xl py-10" aria-labelledby="empty-title">
      <h2 id="empty-title" className="text-2xl font-bold">Cosa ti serve sapere?</h2>
      <p className="mt-1 text-ardesia">Rispondo usando i documenti di Padana Logistics e lo storico delle spedizioni da ottobre 2024 a settembre 2026.</p>
      <div className="mt-6 grid gap-6 md:grid-cols-3">
        {GROUPS.map((g) => (
          <div key={g.label}>
            <h3 className="text-sm font-semibold text-ardesia">{g.label}</h3>
            <ul className="mt-2 space-y-2">
              {g.questions.map((q) => (
                <li key={q}>
                  <button type="button" onClick={() => onPick(q)} className="w-full rounded-md border border-bordo bg-carta p-3 text-left text-sm hover:border-container">
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
