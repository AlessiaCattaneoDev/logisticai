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
  onRetry: (m: UiMessage) => void;
  onFeedback: (messageId: string, rating: FeedbackRating, reason?: string, comment?: string) => Promise<void>;
}

export function AssistantMessage({ message, onRetry, onFeedback }: Props) {
  const steps = message.steps ?? stepsFromTools(message.toolsUsed);
  const thinking = message.streaming && !message.content && !steps.some((s) => s.status === 'running');
  const saved = !message.streaming && message.status === 'ok' && !message.id.endsWith('-a');

  return (
    <article className="rounded-md border border-bordo bg-carta px-5 py-4" aria-label="Risposta di LogisticAI" aria-busy={message.streaming}>
      <TrackingTimeline steps={steps} thinking={thinking} />
      {message.status === 'error' ? (
        <div role="alert" className="text-esito-ko">
          <p>{message.content}</p>
          {message.retryable && message.question && (
            <button type="button" onClick={() => onRetry(message)} className="mt-2 inline-flex items-center gap-1 rounded border border-esito-ko px-3 py-1 text-sm">
              <RotateCcw size={14} aria-hidden /> Riprova
            </button>
          )}
        </div>
      ) : (
        message.content && (
          <div className="prose prose-slate max-w-none prose-p:my-2 prose-table:text-sm prose-th:bg-cemento prose-th:px-3 prose-td:px-3">
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
        <div className="mt-4 border-t border-bordo pt-3">
          <p className="text-sm font-medium">Fonti</p>
          <ul className="mt-1 space-y-1">
            {message.sources.map((s) => (
              <li key={`${s.documento}/${s.sezione}`} className="flex items-center gap-2 text-sm text-ardesia">
                <FileText size={14} aria-hidden /> {s.documento}, sezione "{s.sezione}"
              </li>
            ))}
          </ul>
        </div>
      )}
      {message.dataAgent && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-container">Come sono stati calcolati i numeri</summary>
          <div className="mt-2 space-y-3">
            <p>Righe analizzate: {message.dataAgent.righeAnalizzate.toLocaleString('it-IT')}</p>
            {message.dataAgent.pulizia.length > 0 && (
              <ul className="list-disc pl-5 text-ardesia">
                {message.dataAgent.pulizia.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            {message.dataAgent.codice.map((code, i) => (
              <pre key={i} className="overflow-x-auto rounded bg-inchiostro p-3 font-mono text-xs text-white">
                {code}
              </pre>
            ))}
          </div>
        </details>
      )}
      {saved && <FeedbackButtons current={message.feedback} onSubmit={(rating, reason, comment) => onFeedback(message.id, rating, reason, comment)} />}
    </article>
  );
}
