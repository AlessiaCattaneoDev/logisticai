import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AdminConversationRow, AdminFeedbackRow, AdminOverview, AdminUserRow } from '@logisticai/shared';
import { createQueryClient, routes } from '../../App';
import { sara, server, state } from '../../test/msw';

const admin = { id: 'a1', username: 'admin', role: 'ADMIN' as const };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => { state.user = admin; state.conversations = []; });

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<QueryClientProvider client={createQueryClient()}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
}

const day = (g: string, extra: Partial<AdminOverview['giornaliero'][number]> = {}) => ({
  giorno: g, costo_orchestratore: 0.1, costo_embedding: 0, costo_data_agent: 0.2, richieste: 3, latenza_media_s: 9.5, latenza_p95_s: 20, token_input: 1000, token_output: 200, feedback_positivi: 1, feedback_negativi: 0, ...extra,
});

const overview: AdminOverview = {
  da: '2026-10-11', a: '2026-10-12',
  kpi: {
    costoPeriodoEur: 0.81, costoOggiEur: 4.2, costoMeseEur: 0.81, budgetGiornalieroEur: 5, budgetMensileEur: 50, richieste: 42, conversazioni: 20,
    costoMedioRichiestaEur: 0.0193, costoMedioConversazioneEur: 0.0405, tokenInput: 600000, tokenOutput: 94000, latenzaMediaMs: 12400, latenzaP95Ms: 24000,
    feedbackTotali: 4, feedbackPositiviPct: 0.75, erroriPct: 0.02, utentiAttivi: 2, modelliSenzaPrezzo: ['openai:gpt-5.4'],
  },
  giornaliero: [day('2026-10-11'), day('2026-10-12')],
  decisioni: [{ strategia: 'Solo documenti', richieste: 10 }, { strategia: 'Documenti e dati', richieste: 8 }],
};

const conversations: AdminConversationRow[] = [
  { id: 'c1', titolo: 'Penale ModaNova?', utente: { id: 'u1', alias: 'Utente #2' }, aggiornata: '2026-10-12T09:00:00Z', messaggi: 2, costoEur: 0.02, strumenti: ['cerca_knowledge_base', 'analizza_dati'], feedbackNegativi: 1, errori: 0 },
];

describe('accesso', () => {
  it('un operatore viene rimandato alla home', async () => {
    state.user = sara;
    const router = renderAt('/admin');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });
});

describe('panoramica', () => {
  it('KPI, budget, avviso sui modelli senza prezzo e grafici', async () => {
    server.use(http.get('*/api/admin/overview', () => HttpResponse.json(overview)));
    renderAt('/admin');
    const costi = await screen.findByRole('region', { name: 'Costi' });
    expect(within(costi).getByText('Costo del periodo')).toBeInTheDocument();
    expect(within(costi).getByRole('meter', { name: 'Budget giornaliero' })).toHaveAttribute('aria-valuenow', '4.2');
    expect(within(costi).getByText('84% del budget')).toBeInTheDocument();
    const uso = screen.getByRole('region', { name: 'Uso e qualità' });
    expect(within(uso).getByText('42')).toBeInTheDocument();
    expect(within(uso).getByText('75%')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('openai:gpt-5.4');
    for (const t of ['Costo AI giornaliero', "Decisioni dell'agente", 'Tempo di risposta', 'Valutazioni degli utenti']) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
  });

  it('il periodo scelto finisce nella richiesta', async () => {
    const urls: string[] = [];
    server.use(http.get('*/api/admin/overview', ({ request }) => { urls.push(request.url); return HttpResponse.json(overview); }));
    renderAt('/admin');
    await screen.findByText('Costo del periodo');
    await userEvent.click(screen.getByRole('button', { name: 'Oggi' }));
    await waitFor(() => expect(urls.length).toBe(2));
    const u = new URL(urls[1]);
    expect(u.searchParams.get('da')).toBe(u.searchParams.get('a'));
  });
});

describe('conversazioni', () => {
  it('pseudonimi di default, nomi reali su richiesta, filtro segnalazioni', async () => {
    const urls: string[] = [];
    server.use(
      http.get('*/api/admin/conversations', ({ request }) => { urls.push(request.url); return HttpResponse.json(conversations); }),
      http.post('*/api/admin/reveal-names', () => HttpResponse.json({ u1: 'sara.operatrice' })),
    );
    renderAt('/admin/conversazioni');
    expect(await screen.findByText('Utente #2')).toBeInTheDocument();
    expect(screen.queryByText(/sara\.operatrice/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mostra nomi' }));
    expect(await screen.findByText('sara.operatrice (Utente #2)')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Solo con risposte segnalate'));
    await waitFor(() => expect(new URL(urls.at(-1)!).searchParams.get('feedback')).toBe('down'));
    expect(screen.getByRole('link', { name: 'Penale ModaNova?' })).toHaveAttribute('href', '/admin/conversazioni/c1');
  });
});

describe('risposte segnalate', () => {
  it('revisione con stato e nota', async () => {
    const fb: AdminFeedbackRow = {
      id: 'f1', rating: 'down', motivo: 'Numeri sbagliati', commento: 'il totale non torna', stato: 'new', notaAdmin: null, creato: '2026-10-12T09:00:00Z',
      messageId: 'm1', conversationId: 'c1', domanda: 'Penale ModaNova?', risposta: 'Penale 5.000 €', utente: { id: 'u1', alias: 'Utente #2' },
    };
    let patch: unknown;
    server.use(
      http.get('*/api/admin/feedback', () => HttpResponse.json([fb])),
      http.patch('*/api/admin/feedback/:id', async ({ request, params }) => { patch = { id: params.id, ...((await request.json()) as object) }; return new HttpResponse(null, { status: 204 }); }),
    );
    renderAt('/admin/feedback');
    const card = await screen.findByRole('article', { name: 'Segnalazione: Penale ModaNova?' });
    expect(within(card).getByText('Numeri sbagliati')).toBeInTheDocument();
    await userEvent.selectOptions(within(card).getByLabelText('Stato'), 'resolved');
    await userEvent.type(within(card).getByLabelText('Nota interna'), 'Aggiunta funzione deterministica');
    await userEvent.click(within(card).getByRole('button', { name: 'Salva revisione' }));
    expect(await within(card).findByRole('status')).toHaveTextContent('Revisione salvata.');
    expect(patch).toEqual({ id: 'f1', stato: 'resolved', notaAdmin: 'Aggiunta funzione deterministica' });
  });
});

describe('utenti', () => {
  it('crea un utente e disattiva un operatore, ma non se stessi', async () => {
    const users: AdminUserRow[] = [
      { id: 'a1', alias: 'Utente #1', username: 'admin', ruolo: 'ADMIN', attivo: true, creato: '', ultimoAccesso: null, richieste: 0, costoEur: 0 },
      { id: 'u1', alias: 'Utente #2', username: 'sara.operatrice', ruolo: 'OPERATOR', attivo: true, creato: '', ultimoAccesso: '2026-10-12T09:00:00Z', richieste: 40, costoEur: 0.8 },
    ];
    const calls: unknown[] = [];
    server.use(
      http.get('*/api/admin/users', () => HttpResponse.json(users)),
      http.post('*/api/admin/users', async ({ request }) => { calls.push(['create', await request.json()]); return HttpResponse.json({}, { status: 201 }); }),
      http.patch('*/api/admin/users/:id', async ({ request, params }) => { calls.push(['patch', params.id, await request.json()]); return new HttpResponse(null, { status: 204 }); }),
    );
    renderAt('/admin/utenti');
    const saraRow = (await screen.findByText('sara.operatrice')).closest('tr')!;
    const adminRow = screen.getByText('admin', { selector: 'td' }).closest('tr')!;
    expect(within(adminRow).queryByRole('button', { name: 'Disattiva' })).not.toBeInTheDocument();
    await userEvent.click(within(saraRow).getByRole('button', { name: 'Disattiva' }));
    await userEvent.type(screen.getByLabelText('Nome utente'), 'luca.ops');
    await userEvent.type(screen.getByLabelText('Password', { selector: 'input[type=password]:not([placeholder])' }), 'Password!2026');
    await userEvent.click(screen.getByRole('button', { name: 'Crea utente' }));
    await waitFor(() => expect(calls).toEqual([
      ['patch', 'u1', { attivo: false }],
      ['create', { username: 'luca.ops', password: 'Password!2026', ruolo: 'OPERATOR' }],
    ]));
  });
});
