import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { AuthUser, ChatStreamEvent, ConversationDetail, ConversationSummary, DocumentCategoryDto, DocumentDto, HomeData } from '@logisticai/shared';

export const sara: AuthUser = { id: 'u1', username: 'sara.operatrice', role: 'OPERATOR' };

export function sseResponse(events: ChatStreamEvent[]) {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const e of events) c.enqueue(enc.encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`));
      c.close();
    },
  });
  return new HttpResponse(stream, { headers: { 'Content-Type': 'text/event-stream' } });
}

export const categories: DocumentCategoryDto[] = [
  { id: 'cat-sla', name: 'Contratti e SLA clienti', description: 'Schede SLA e penali', documents: 2, ready: 2 },
  { id: 'cat-rec', name: 'Reclami e giacenze', description: 'Procedure per danni e giacenze', documents: 1, ready: 1 },
];

export const doc = (over: Partial<DocumentDto> = {}): DocumentDto => ({
  id: 'doc-1', title: 'Procedura reclami e danni', fileName: '05_procedura_reclami_e_danni.md', kind: 'md', sizeBytes: 5120,
  category: { id: 'cat-rec', name: 'Reclami e giacenze' }, uploadedBy: 'Sistema', origin: 'seed', status: 'ready', errorMessage: null,
  sections: 6, createdAt: '2026-10-01T08:00:00Z', canDelete: false, ...over,
});

export function homeFor(user: AuthUser): HomeData {
  return {
    utente: { nome: user.username, ruolo: user.role },
    kpi: { documentiDisponibili: 10, categorie: 6, conversazioni: state.conversations.length, domandeMese: 12, risposteUtiliPct: 0.9 },
    domandePerTipo: [{ tipo: 'Solo documenti', domande: 5 }, { tipo: 'Solo dati', domande: 3 }, { tipo: 'Documenti e dati', domande: 2 }, { tipo: 'Nessuno strumento', domande: 0 }],
    domandeGiornaliere: [{ giorno: '2026-10-11', domande: 2 }, { giorno: '2026-10-12', domande: 4 }],
    conversazioniRecenti: state.conversations,
    documentiRecenti: [{ id: 'doc-2', title: 'Nuova policy resi', categoria: 'Reclami e giacenze', status: 'processing', createdAt: new Date().toISOString() }],
    ...(user.role === 'ADMIN' ? { admin: { costoOggiEur: 0.42, budgetGiornalieroEur: 5, segnalazioniDaRivedere: 3, servizi: { backend: 'ok', chroma: 'ok', dataAgent: 'down' } } } : {}),
  } as HomeData;
}

export const state: { user: AuthUser | null; conversations: ConversationSummary[]; details: Record<string, ConversationDetail>; documents: DocumentDto[] } = {
  user: null,
  conversations: [],
  details: {},
  documents: [doc()],
};

export const server = setupServer(
  http.get('*/api/auth/me', () => (state.user ? HttpResponse.json(state.user) : HttpResponse.json({ error: 'Autenticazione richiesta' }, { status: 401 }))),
  http.post('*/api/auth/logout', () => {
    state.user = null;
    return new HttpResponse(null, { status: 204 });
  }),
  http.get('*/api/home', () => (state.user ? HttpResponse.json(homeFor(state.user)) : HttpResponse.json({}, { status: 401 }))),
  http.get('*/api/categories', () => HttpResponse.json(categories)),
  http.get('*/api/documents', ({ request }) => {
    const cat = new URL(request.url).searchParams.get('categoria');
    return HttpResponse.json(state.documents.filter((d) => !cat || d.category.id === cat));
  }),
  http.get('*/api/documents/:id', ({ params }) => {
    const d = state.documents.find((x) => x.id === params.id);
    return d ? HttpResponse.json(d) : HttpResponse.json({ error: 'Documento non trovato' }, { status: 404 });
  }),
  http.get('*/api/conversations', () => HttpResponse.json(state.conversations)),
  http.get('*/api/conversations/:id', ({ params }) => {
    const d = state.details[params.id as string];
    return d ? HttpResponse.json(d) : HttpResponse.json({ error: 'Conversazione non trovata' }, { status: 404 });
  }),
);
