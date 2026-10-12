// Tipi condivisi tra frontend e backend: unica fonte di verità per i contratti HTTP e SSE.
import type { Artifact } from './artifacts.js';

export * from './artifacts.js';

export type Role = 'OPERATOR' | 'ADMIN';

export interface AuthUser {
  id: string;
  username: string;
  role: Role;
}

export type ToolName = 'cerca_knowledge_base' | 'analizza_dati';

export interface Source {
  documento: string;
  sezione: string;
}

export interface ToolUsage {
  name: ToolName;
  args: Record<string, unknown>;
  durationMs: number;
  ok: boolean;
}

export interface DataAgentDetails {
  codice: string[];
  pulizia: string[];
  righeAnalizzate: number;
}

export interface ResponseUsage {
  inputTokens: number;
  outputTokens: number;
  costEur: number;
  latencyMs: number;
}

export interface ChatRequest {
  conversationId?: string;
  message: string;
  scope?: { type: 'document' | 'category'; id: string };
}

export interface ChatResponse {
  conversationId: string;
  messageId: string;
  reply: string;
  artifacts: Artifact[];
  sources: Source[];
  toolsUsed: ToolUsage[];
  dataAgent?: DataAgentDetails;
  usage: ResponseUsage;
}

// Eventi dello stream SSE di POST /api/chat
export type ChatStreamEvent =
  | { event: 'status'; data: { stage: 'thinking' } }
  | { event: 'tool_start'; data: { tool: ToolName; args: Record<string, unknown> } }
  | { event: 'tool_end'; data: { tool: ToolName; durationMs: number; ok: boolean } }
  | { event: 'artifact'; data: Artifact }
  | { event: 'delta'; data: { text: string } }
  | { event: 'done'; data: ChatResponse }
  | { event: 'error'; data: { message: string; retryable: boolean } };

export type FeedbackRating = 'up' | 'down';

export const FEEDBACK_REASONS = [
  'Risposta errata',
  'Numeri sbagliati',
  'Fonte non pertinente',
  'Incompleta',
  'Troppo lenta',
  'Altro',
] as const;

export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

export interface FeedbackRequest {
  rating: FeedbackRating;
  reason?: FeedbackReason;
  comment?: string;
}

export type ServiceStatus = 'ok' | 'degraded' | 'down';

export interface HealthResponse {
  status: ServiceStatus;
  services: Record<string, ServiceStatus>;
}

// Conversazioni salvate (sidebar e riapertura di una chat)
export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  scope?: import('./platform.js').ChatScope;
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'ok' | 'error';
  createdAt: string;
  artifacts: Artifact[];
  sources: Source[];
  toolsUsed: ToolUsage[];
  dataAgent?: DataAgentDetails;
  feedback?: FeedbackRating;
}

export interface ConversationDetail extends ConversationSummary {
  messages: StoredMessage[];
}
export * from './admin.js';
export * from './platform.js';
