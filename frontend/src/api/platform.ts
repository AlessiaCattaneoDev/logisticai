import type { DocumentCategoryDto, DocumentDto, HomeData } from '@logisticai/shared';
import { api, apiUrl, ApiError } from './http';

export const homeApi = { get: () => api<HomeData>('/api/home') };

export const categoriesApi = {
  list: () => api<DocumentCategoryDto[]>('/api/categories'),
  create: (body: { name: string; description?: string }) => api<DocumentCategoryDto>('/api/categories', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { name?: string; description?: string }) => api<void>(`/api/categories/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
};

export const documentsApi = {
  list: (filter: { categoria?: string; q?: string } = {}) => {
    const params = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as [string, string][]);
    return api<DocumentDto[]>(`/api/documents${params.size ? `?${params}` : ''}`);
  },
  get: (id: string) => api<DocumentDto>(`/api/documents/${id}`),
  remove: (id: string) => api<void>(`/api/documents/${id}`, { method: 'DELETE' }),
  /** Multipart: niente Content-Type esplicito, lo imposta il browser con il boundary. */
  upload: async (input: { file: File; categoryId: string; title?: string }) => {
    const form = new FormData();
    form.append('categoryId', input.categoryId);
    if (input.title) form.append('title', input.title);
    form.append('file', input.file, input.file.name);
    const res = await fetch(apiUrl('/api/documents'), { method: 'POST', credentials: 'include', body: form });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(res.status, body.error ?? 'Caricamento non riuscito. Riprova.');
    }
    return (await res.json()) as DocumentDto;
  },
};

export const ACCEPTED_FILES = '.pdf,.docx,.txt,.md';
export const MAX_UPLOAD_MB = 15;
