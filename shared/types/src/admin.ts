// Contratti dell'API della dashboard admin (/api/admin/*).
import type { ConversationDetail, Role } from './index.js';

export interface Pseudonym {
  id: string;
  /** "Utente #3": il nome reale si mostra solo su richiesta esplicita (registrata nell'audit). */
  alias: string;
}

export interface AdminOverview {
  da: string;
  a: string;
  kpi: {
    costoPeriodoEur: number;
    costoOggiEur: number;
    costoMeseEur: number;
    budgetGiornalieroEur: number;
    budgetMensileEur: number;
    richieste: number;
    conversazioni: number;
    costoMedioRichiestaEur: number;
    costoMedioConversazioneEur: number;
    tokenInput: number;
    tokenOutput: number;
    latenzaMediaMs: number;
    latenzaP95Ms: number;
    feedbackTotali: number;
    feedbackPositiviPct: number | null;
    erroriPct: number;
    utentiAttivi: number;
    modelliSenzaPrezzo: string[];
  };
  giornaliero: {
    giorno: string;
    costo_orchestratore: number;
    costo_embedding: number;
    costo_data_agent: number;
    richieste: number;
    latenza_media_s: number;
    latenza_p95_s: number;
    token_input: number;
    token_output: number;
    feedback_positivi: number;
    feedback_negativi: number;
  }[];
  decisioni: { strategia: string; richieste: number }[];
}

export interface AdminConversationRow {
  id: string;
  titolo: string;
  utente: Pseudonym;
  aggiornata: string;
  messaggi: number;
  costoEur: number;
  strumenti: string[];
  feedbackNegativi: number;
  errori: number;
}

export interface AdminTraceStep {
  componente: string;
  provider: string;
  modello: string;
  tokenInput: number;
  tokenOutput: number;
  tokenCache: number;
  costoEur: number;
  latenzaMs: number;
}

export interface AdminConversationDetail extends ConversationDetail {
  utente: Pseudonym;
  trace: Record<string, { costoEur: number; latenzaMs: number | null; chiamate: AdminTraceStep[]; strumenti: { tool: string; ok: boolean; durationMs: number; resultSummary: string | null; error: string | null; args: unknown }[] }>;
}

export type FeedbackStatus = 'new' | 'reviewing' | 'resolved';

export interface AdminFeedbackRow {
  id: string;
  rating: 'up' | 'down';
  motivo: string | null;
  commento: string | null;
  stato: FeedbackStatus;
  notaAdmin: string | null;
  creato: string;
  messageId: string;
  conversationId: string;
  domanda: string;
  risposta: string;
  utente: Pseudonym;
}

export interface AdminCosts {
  perModello: { provider: string; modello: string; componente: string; chiamate: number; tokenInput: number; tokenOutput: number; costoEur: number }[];
  perUtente: { utente: Pseudonym; richieste: number; costoEur: number }[];
  listini: { id: string; provider: string; modello: string; inputPer1M: number; outputPer1M: number; cachedInputPer1M: number | null; validoDal: string }[];
  modelliAttivi: { orchestratore: string; dataAgent: string; embedding: string };
  budget: { giornalieroEur: number; mensileEur: number; cambioUsdEur: number };
}

export interface AdminUserRow {
  id: string;
  alias: string;
  username: string;
  ruolo: Role;
  attivo: boolean;
  creato: string;
  ultimoAccesso: string | null;
  richieste: number;
  costoEur: number;
}

export interface AdminSystem {
  servizi: Record<string, 'ok' | 'down'>;
  knowledgeBase: { chunk: number; documenti: string; modelloEmbedding: string; indicizzataIl: string } | null;
  qualitaDati: { righe_iniziali: number; righe_finali: number; descrizione: string[] } | null;
  ultimiErrori: { quando: string; conversationId: string; messaggio: string }[];
}

export interface AdminAuditRow {
  id: string;
  quando: string;
  admin: string;
  azione: string;
  oggetto: string;
}
