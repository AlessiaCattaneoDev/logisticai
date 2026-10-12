import type {
  AdminAuditRow,
  AdminConversationDetail,
  AdminConversationRow,
  AdminCosts,
  AdminFeedbackRow,
  AdminOverview,
  AdminSystem,
  AdminUserRow,
  FeedbackStatus,
  Role,
} from '@logisticai/shared';
import { api } from './http';

const qs = (params: Record<string, string | undefined | boolean>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== false && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export interface Period {
  da?: string;
  a?: string;
}

export const adminApi = {
  overview: (p: Period) => api<AdminOverview>(`/api/admin/overview${qs({ ...p })}`),
  conversations: (f: Period & { feedback?: 'down'; errori?: boolean; q?: string }) => api<AdminConversationRow[]>(`/api/admin/conversations${qs({ ...f })}`),
  conversation: (id: string) => api<AdminConversationDetail>(`/api/admin/conversations/${id}`),
  feedback: (stato?: FeedbackStatus) => api<AdminFeedbackRow[]>(`/api/admin/feedback${qs({ stato })}`),
  updateFeedback: (id: string, body: { stato?: FeedbackStatus; notaAdmin?: string }) => api<void>(`/api/admin/feedback/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  costs: (p: Period) => api<AdminCosts>(`/api/admin/costs${qs({ ...p })}`),
  addPricing: (body: { provider: string; modello: string; inputPer1M: number; outputPer1M: number; cachedInputPer1M: number | null; validoDal: string }) =>
    api<unknown>('/api/admin/pricing', { method: 'POST', body: JSON.stringify(body) }),
  users: () => api<AdminUserRow[]>('/api/admin/users'),
  createUser: (body: { username: string; password: string; ruolo: Role }) => api<unknown>('/api/admin/users', { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (id: string, body: { attivo?: boolean; ruolo?: Role; password?: string }) => api<void>(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  revealNames: () => api<Record<string, string>>('/api/admin/reveal-names', { method: 'POST' }),
  system: () => api<AdminSystem>('/api/admin/system'),
  audit: () => api<AdminAuditRow[]>('/api/admin/audit'),
};
