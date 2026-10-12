// Loop ReAct: l'LLM ragiona, sceglie gli strumenti (anche in catena), osserva i risultati e risponde.
import { randomUUID } from 'node:crypto';
import type { Artifact, ChatScope, ChatStreamEvent, DataAgentDetails, Source, ToolName, ToolUsage } from '@logisticai/shared';
import type { LLMProvider, LLMUsage, NeutralMessage, ToolCallRequest } from '../llm/types.js';
import type { RetrievalResult } from '../rag/retriever.js';
import type { AnalyzeInput, AnalyzeOutput } from '../services/dataAgentClient.js';
import { TOOL_DEFINITIONS, toolArgs } from './tools.js';

export type OrchestratorEvent = Exclude<ChatStreamEvent, { event: 'done' } | { event: 'error' }>;

export interface LlmCallRecord {
  component: 'orchestrator' | 'embedding' | 'data_agent';
  provider: string;
  model: string;
  usage: LLMUsage;
  latencyMs: number;
  ok: boolean;
}

export interface ToolLogEntry {
  tool: ToolName;
  args: Record<string, unknown>;
  resultSummary: string;
  durationMs: number;
  ok: boolean;
  error?: string;
}

export interface OrchestratorOutcome {
  reply: string;
  artifacts: Artifact[];
  sources: Source[];
  toolsUsed: ToolUsage[];
  toolLog: ToolLogEntry[];
  dataAgent?: DataAgentDetails;
  llmCalls: LlmCallRecord[];
  stoppedBy: 'answer' | 'max_iterations' | 'refusal';
}

export interface OrchestratorDeps {
  llm: LLMProvider;
  model: string;
  systemPrompt: string;
  retriever: { search(query: string, opts: { cliente?: string; topK?: number; filtro?: { documentId?: string; categoryId?: string } }): Promise<RetrievalResult> };
  dataAgent: { analyze(input: AnalyzeInput, ctx: { userId: string; requestId?: string; signal?: AbortSignal }): Promise<AnalyzeOutput> };
  maxIterations?: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
}

export interface RunInput {
  history: NeutralMessage[];
  message: string;
  userId: string;
  requestId?: string;
  signal?: AbortSignal;
  /** Chat limitata a un documento o a una categoria: solo ricerca documentale filtrata. */
  scope?: ChatScope;
}

/** Istruzioni aggiunte al system prompt quando la chat ha un ambito (restano fisse per tutto il turno). */
export function scopeInstructions(scope: ChatScope): string {
  const cosa = scope.type === 'document' ? `il documento "${scope.label}"` : `i documenti della categoria "${scope.label}"`;
  return `\n\nAMBITO DI QUESTA CONVERSAZIONE: rispondi usando SOLO ${cosa}. La ricerca è già limitata a questo ambito. ` +
    `Se la risposta non è nell'ambito, dillo e suggerisci di togliere il filtro per cercare in tutta la knowledge base e nei dati.`;
}

const MAX_TOOL_RESULT_CHARS = 12_000;
const REFUSAL_REPLY = 'Non posso rispondere a questa richiesta. Posso aiutarti con spedizioni, SLA, procedure e analisi dei dati di Padana Logistics.';
const MAX_ITERATIONS_NOTE = 'Ho raggiunto il numero massimo di passaggi di analisi per questa domanda: prova a renderla più specifica.';

interface ToolExecution {
  message: NeutralMessage;
  log: ToolLogEntry;
  events: OrchestratorEvent[];
}

export class Orchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  async *run(input: RunInput): AsyncGenerator<OrchestratorEvent, OrchestratorOutcome> {
    const requestId = input.requestId ?? randomUUID();
    const messages: NeutralMessage[] = [...input.history, { role: 'user', content: input.message }];
    const outcome: OrchestratorOutcome = { reply: '', artifacts: [], sources: [], toolsUsed: [], toolLog: [], llmCalls: [], stoppedBy: 'answer' };
    const texts: string[] = [];
    const maxIterations = this.deps.maxIterations ?? 6;

    yield { event: 'status', data: { stage: 'thinking' } };
    for (let iteration = 0; ; iteration++) {
      let result;
      for await (const ev of this.deps.llm.chatStream({
        model: this.deps.model,
        system: input.scope ? this.deps.systemPrompt + scopeInstructions(input.scope) : this.deps.systemPrompt,
        messages,
        tools: input.scope ? TOOL_DEFINITIONS.filter((t) => t.name === 'cerca_knowledge_base') : TOOL_DEFINITIONS,
        reasoningEffort: this.deps.reasoningEffort,
        signal: input.signal,
      })) {
        if (ev.type === 'text_delta') yield { event: 'delta', data: { text: ev.text } };
        else result = ev.result;
      }
      if (!result) throw new Error('Il modello non ha restituito una risposta');
      outcome.llmCalls.push({ component: 'orchestrator', provider: this.deps.llm.id, model: result.model, usage: result.usage, latencyMs: result.latencyMs, ok: true });
      if (result.text.trim()) texts.push(result.text.trim());

      if (result.stopReason === 'refusal') {
        outcome.stoppedBy = 'refusal';
        if (!result.text.trim()) {
          texts.push(REFUSAL_REPLY);
          yield { event: 'delta', data: { text: REFUSAL_REPLY } };
        }
        break;
      }
      if (result.toolCalls.length === 0) break;
      if (iteration + 1 >= maxIterations) {
        outcome.stoppedBy = 'max_iterations';
        texts.push(MAX_ITERATIONS_NOTE);
        yield { event: 'delta', data: { text: `\n\n${MAX_ITERATIONS_NOTE}` } };
        break;
      }

      messages.push({ role: 'assistant', content: result.text, toolCalls: result.toolCalls, providerState: result.providerState });
      for (const call of result.toolCalls) {
        yield { event: 'tool_start', data: { tool: call.name as ToolName, args: call.args } };
      }
      // Catena garantita: se nello stesso passaggio il modello chiede sia le regole sia l'analisi,
      // l'analisi viene rinviata finché non ha letto le regole (altrimenti calcolerebbe senza esclusioni).
      const needsRulesFirst = result.toolCalls.some((c) => c.name === 'cerca_knowledge_base');
      // Le altre chiamate di uno stesso passaggio sono indipendenti: si eseguono in parallelo.
      const executions = await Promise.all(
        result.toolCalls.map((call) =>
          needsRulesFirst && call.name === 'analizza_dati' ? Promise.resolve(this.defer(call)) : this.execute(call, input, requestId, outcome),
        ),
      );
      for (const exec of executions) {
        yield* exec.events;
        messages.push(exec.message);
        outcome.toolLog.push(exec.log);
        outcome.toolsUsed.push({ name: exec.log.tool, args: exec.log.args, durationMs: exec.log.durationMs, ok: exec.log.ok });
      }
    }
    outcome.reply = texts.join('\n\n');
    return outcome;
  }

  private defer(call: ToolCallRequest): ToolExecution {
    const content =
      'Analisi rinviata: prima leggi i risultati di cerca_knowledge_base, poi richiama analizza_dati ' +
      'riportando in regole_da_applicare i valori concreti trovati (soglie, formule, esclusioni, tetti).';
    return {
      message: { role: 'tool', toolCallId: call.id, name: call.name, content, isError: true },
      log: { tool: 'analizza_dati', args: call.args, resultSummary: 'rinviata in attesa delle regole', durationMs: 0, ok: false, error: 'rinviata' },
      events: [{ event: 'tool_end', data: { tool: 'analizza_dati', durationMs: 0, ok: false } }],
    };
  }

  private async execute(call: ToolCallRequest, input: RunInput, requestId: string, outcome: OrchestratorOutcome): Promise<ToolExecution> {
    const started = performance.now();
    const events: OrchestratorEvent[] = [];
    const tool = call.name as ToolName;
    const finish = (ok: boolean, content: string, summary: string, error?: string): ToolExecution => {
      const durationMs = Math.round(performance.now() - started);
      events.push({ event: 'tool_end', data: { tool, durationMs, ok } });
      return {
        message: { role: 'tool', toolCallId: call.id, name: call.name, content: content.slice(0, MAX_TOOL_RESULT_CHARS), isError: !ok },
        log: { tool, args: call.args, resultSummary: summary, durationMs, ok, ...(error ? { error } : {}) },
        events,
      };
    };

    if (!(call.name in toolArgs)) return finish(false, `Strumento sconosciuto: ${call.name}`, 'strumento sconosciuto', 'strumento sconosciuto');
    if (call.argsError) return finish(false, `Argomenti non validi (${call.argsError}): riprova con JSON valido.`, 'argomenti non validi', call.argsError);
    const parsed = toolArgs[tool].safeParse(call.args);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      return finish(false, `Argomenti non validi: ${detail}. Correggi e riprova.`, 'argomenti non validi', detail);
    }

    try {
      if (tool === 'cerca_knowledge_base') {
        const args = toolArgs.cerca_knowledge_base.parse(call.args);
        const filtro = input.scope ? (input.scope.type === 'document' ? { documentId: input.scope.id } : { categoryId: input.scope.id }) : undefined;
        const res = await this.deps.retriever.search(args.query, { cliente: input.scope?.type === 'document' ? undefined : args.cliente, topK: args.top_k, ...(filtro ? { filtro } : {}) });
        outcome.llmCalls.push({
          component: 'embedding', provider: res.embedding.provider, model: res.embedding.model,
          usage: { inputTokens: res.embedding.inputTokens, outputTokens: 0, cachedInputTokens: 0 }, latencyMs: res.embedding.latencyMs, ok: true,
        });
        for (const r of res.risultati) {
          if (!outcome.sources.some((s) => s.documento === r.documento && s.sezione === r.sezione)) {
            outcome.sources.push({ documento: r.documento, sezione: r.sezione });
          }
        }
        const content = res.trovato
          ? JSON.stringify({ trovato: true, risultati: res.risultati.map(({ documento, sezione, cliente, testo }) => ({ documento, sezione, cliente, testo })) })
          : JSON.stringify({ trovato: false, nota: 'Nessun documento pertinente: dillo all’utente, non inventare.' });
        return finish(true, content, res.trovato ? `${res.risultati.length} estratti` : 'nessun estratto pertinente');
      }

      if (input.scope) {
        return finish(false, "In questa conversazione puoi consultare solo l'ambito selezionato: l'analisi dei dati non è disponibile.", 'non disponibile nell’ambito', 'ambito');
      }
      const args = toolArgs.analizza_dati.parse(call.args);
      const res = await this.deps.dataAgent.analyze(args, { userId: input.userId, requestId, signal: input.signal });
      for (const u of res.usage) {
        outcome.llmCalls.push({
          component: 'data_agent', provider: u.provider, model: u.model,
          usage: { inputTokens: u.input_tokens, outputTokens: u.output_tokens, cachedInputTokens: 0 }, latencyMs: u.latency_ms, ok: true,
        });
      }
      for (const a of res.artifacts) {
        outcome.artifacts.push(a);
        events.push({ event: 'artifact', data: a });
      }
      outcome.dataAgent = {
        codice: [...(outcome.dataAgent?.codice ?? []), ...res.codice_eseguito],
        pulizia: res.pulizia.length ? res.pulizia : (outcome.dataAgent?.pulizia ?? []),
        righeAnalizzate: res.righe_analizzate,
      };
      // All'LLM va solo il riepilogo: i dati dei grafici restano fuori dal contesto (token e affidabilità).
      const content = JSON.stringify({
        sintesi: res.sintesi,
        grafici_e_tabelle_gia_mostrati_all_utente: res.artifacts_riepilogo,
        pulizia_dati: res.pulizia,
        righe_analizzate: res.righe_analizzate,
      });
      return finish(true, content, `${res.artifacts.length} grafici/tabelle`);
    } catch (err) {
      if (input.signal?.aborted) throw err;
      const message = err instanceof Error ? err.message : String(err);
      return finish(false, `Errore dello strumento: ${message}. Spiega all'utente cosa non è stato possibile fare.`, 'errore', message);
    }
  }
}
