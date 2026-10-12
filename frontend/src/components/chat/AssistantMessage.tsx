import { FileText, RotateCcw } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { FeedbackRating } from '@logisticai/shared';
import type { UiMessage } from '../../chat/state';
import { ArtifactRenderer } from '../artifacts/ArtifactRenderer';
import { FeedbackButtons } from './FeedbackButtons';
import { stepsFromTools, TrackingTimeline } from './TrackingTimeline';

interface Props {
  message: UiMessage;
  onRetry?: (m: UiMessage) => void;
  onFeedback?: (messageId: string, rating: FeedbackRating, reason?: string, comment?: string) => Promise<void>;
}

export function AssistantMessage({ message, onRetry, onFeedback }: Props) {
  const steps = message.steps ?? stepsFromTools(message.toolsUsed);
  const thinking = message.streaming && !message.content && !steps.some((s) => s.status === 'running');
  const saved = !message.streaming && message.status === 'ok' && !message.id.endsWith('-a');

  return (
    <article className="rounded-[18px] rounded-tl-md bg-superficie px-5 py-4 shadow-[var(--shadow-card)]" aria-label="Risposta di LogisticAI" aria-busy={message.streaming}>
      <TrackingTimeline steps={steps} thinking={thinking} />
      {message.status === 'error' ? (
        <div role="alert" className="text-ko">
          <p>{message.content}</p>
          {message.retryable && message.question && onRetry && (
            <button type="button" onClick={() => onRetry(message)} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-ko/30 px-3 py-1.5 text-sm font-semibold hover:bg-ko-chiaro">
              <RotateCcw size={14} aria-hidden /> Riprova
            </button>
          )}
        </div>
      ) : (
        message.content && (
          <div className="prose max-w-none text-testo prose-headings:text-testo prose-strong:text-testo prose-p:my-2 prose-a:text-primario prose-table:text-sm prose-th:bg-fondo prose-th:px-3 prose-th:py-2 prose-td:px-3">
            <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
          </div>
        )
      )}
      {message.artifacts.length > 0 && (
        <div className="mt-4 space-y-4">
          {message.artifacts.map((a) => (
            <ArtifactRenderer key={a.id} artifact={a} />
          ))}
        </div>
      )}
      {message.sources.length > 0 && (
        <div className="mt-4 border-t border-bordo-tenue pt-3">
          <p className="text-sm font-semibold">Fonti</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {message.sources.map((s) => (
              <li key={`${s.documento}/${s.sezione}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-primario-chiaro px-3 py-1 text-xs text-primario-scuro">
                <FileText size={13} className="shrink-0" aria-hidden />
                <span className="truncate"><span className="font-semibold">{s.documento}</span>, sezione "{s.sezione}"</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {message.dataAgent && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium text-primario">Come sono stati calcolati i numeri</summary>
          <div className="mt-2 space-y-3">
            <p>Righe analizzate: {message.dataAgent.righeAnalizzate.toLocaleString('it-IT')}</p>
            {message.dataAgent.pulizia.length > 0 && (
              <ul className="list-disc pl-5 text-testo-2">
                {message.dataAgent.pulizia.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            {message.dataAgent.codice.map((code, i) => (
              <pre key={i} className="overflow-x-auto rounded-xl bg-notte p-4 font-mono text-xs leading-relaxed text-[#e4e6ff]">
                {code}
              </pre>
            ))}
          </div>
        </details>
      )}
      {saved && onFeedback && <FeedbackButtons current={message.feedback} onSubmit={(rating, reason, comment) => onFeedback(message.id, rating, reason, comment)} />}
      {!onFeedback && message.feedback && <p className="mt-3 text-sm text-testo-2">Valutazione dell'utente: {message.feedback === 'up' ? 'utile' : 'da migliorare'}</p>}
    </article>
  );
}
