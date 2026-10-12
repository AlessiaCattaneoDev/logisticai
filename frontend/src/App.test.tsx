import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ChartSpec, ChatResponse, ChatStreamEvent } from '@logisticai/shared';
import { createQueryClient, routes } from './App';
import { doc, sara, server, sseResponse, state } from './test/msw';

const chart = JSON.parse(readFileSync(resolve(__dirname, '../../shared/contracts/fixtures/valid/chart_line_sla.json'), 'utf8')) as ChartSpec;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  state.user = null;
  state.conversations = [];
  state.details = {};
  state.documents = [doc()];
});

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const done: ChatResponse = {
  conversationId: 'conv-1',
  messageId: 'msg-1',
  reply: 'Sì: a settembre la puntualità è **93,3%**, sotto la soglia del 95%. Penale: 1.700,00 €.',
  artifacts: [chart],
  sources: [{ documento: 'Schede SLA per cliente', sezione: 'ModaNova' }],
  toolsUsed: [
    { name: 'cerca_knowledge_base', args: {}, durationMs: 600, ok: true },
    { name: 'analizza_dati', args: {}, durationMs: 8200, ok: true },
  ],
  dataAgent: { codice: ['d = pulisci_dataset()'], pulizia: ['Rimosse 240 righe duplicate'], righeAnalizzate: 11987 },
  usage: { inputTokens: 1, outputTokens: 1, costEur: 0.01, latencyMs: 9000 },
};

const streamEvents: ChatStreamEvent[] = [
  { event: 'status', data: { stage: 'thinking' } },
  { event: 'tool_start', data: { tool: 'cerca_knowledge_base', args: {} } },
  { event: 'tool_end', data: { tool: 'cerca_knowledge_base', durationMs: 600, ok: true } },
  { event: 'tool_start', data: { tool: 'analizza_dati', args: {} } },
  { event: 'artifact', data: chart },
  { event: 'tool_end', data: { tool: 'analizza_dati', durationMs: 8200, ok: true } },
  { event: 'delta', data: { text: done.reply } },
  { event: 'done', data: done },
];

describe('accesso', () => {
  it('senza sessione porta al login', async () => {
    renderAt('/chat');
    expect(await screen.findByRole('heading', { name: 'Accedi' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nome utente')).toBeInTheDocument();
  });

  it('credenziali errate: messaggio chiaro', async () => {
    server.use(http.post('*/api/auth/login', () => HttpResponse.json({ error: 'Credenziali non valide' }, { status: 401 })));
    renderAt('/login');
    await userEvent.type(await screen.findByLabelText('Nome utente'), 'sara');
    await userEvent.type(screen.getByLabelText('Password'), 'sbagliata');
    await userEvent.click(screen.getByRole('button', { name: 'Accedi' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nome utente o password non corretti.');
  });

  it('login riuscito: si apre la home con il saluto e il menu', async () => {
    server.use(http.post('*/api/auth/login', () => { state.user = sara; return HttpResponse.json(sara); }));
    renderAt('/login');
    await userEvent.type(await screen.findByLabelText('Nome utente'), 'sara.operatrice');
    await userEvent.type(screen.getByLabelText('Password'), 'SaraDemo!2026');
    await userEvent.click(screen.getByRole('button', { name: 'Accedi' }));
    expect(await screen.findByRole('heading', { name: /, sara\.operatrice$/ })).toBeInTheDocument();
    const nav = screen.getAllByRole('navigation', { name: 'Menu principale' })[0];
    expect(within(nav).getByText('sara.operatrice')).toBeInTheDocument();
    expect(within(nav).queryByText('Amministrazione')).not.toBeInTheDocument();
  });
});

describe('chat', () => {
  beforeEach(() => {
    state.user = sara;
  });

  it('domanda ibrida: timeline, risposta, grafico, fonti e dettagli del calcolo', async () => {
    let body: unknown;
    server.use(http.post('*/api/chat', async ({ request }) => { body = await request.json(); return sseResponse(streamEvents); }));
    const router = renderAt('/chat');
    await userEvent.click(await screen.findByRole('button', { name: /ModaNova ha diritto a penali/ }));
    // Nuova conversazione: l'URL diventa /chat/:id e la vista si rimonta usando la cache.
    await waitFor(() => expect(router.state.location.pathname).toBe('/chat/conv-1'));
    // Si attende la risposta salvata (con i pulsanti di valutazione) prima di leggerne il contenuto.
    await screen.findByRole('button', { name: 'Risposta utile' });
    const answer = screen.getByRole('article', { name: 'Risposta di LogisticAI' });
    expect(within(answer).getByText('93,3%')).toBeInTheDocument();
    expect(body).toEqual({ message: 'ModaNova ha diritto a penali per settembre 2026? A quanto ammontano?' });
    const timeline = within(answer).getByRole('list', { name: "Passaggi dell'assistente" });
    expect(timeline).toHaveTextContent('Documenti aziendali consultati');
    expect(timeline).toHaveTextContent('Storico spedizioni analizzato');
    expect(timeline).toHaveTextContent('8,2 s');
    expect(within(answer).getByText(chart.title)).toBeInTheDocument();
    expect(within(answer).getByText('Fonti').nextElementSibling).toHaveTextContent('Schede SLA per cliente, sezione "ModaNova"');
    await userEvent.click(within(answer).getByText('Come sono stati calcolati i numeri'));
    expect(within(answer).getByText('Rimosse 240 righe duplicate')).toBeVisible();
  });

  it('feedback negativo con motivo e commento', async () => {
    let feedback: unknown;
    server.use(
      http.post('*/api/chat', () => sseResponse(streamEvents)),
      http.post('*/api/messages/:id/feedback', async ({ request, params }) => {
        feedback = { id: params.id, ...((await request.json()) as object) };
        return HttpResponse.json({ rating: 'down' });
      }),
    );
    const router = renderAt('/chat');
    await userEvent.type(await screen.findByLabelText('Scrivi una domanda'), 'Penale ModaNova?{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/chat/conv-1'));
    await screen.findByRole('button', { name: 'Risposta da migliorare' });
    const answer = screen.getByRole('article', { name: 'Risposta di LogisticAI' });
    await userEvent.click(within(answer).getByRole('button', { name: 'Risposta da migliorare' }));
    await userEvent.click(within(answer).getByText('Numeri sbagliati'));
    await userEvent.type(within(answer).getByLabelText('Commento (facoltativo)'), 'il totale non torna');
    await userEvent.click(within(answer).getByRole('button', { name: 'Invia segnalazione' }));
    expect(await within(answer).findByRole('status')).toHaveTextContent('Grazie, valutazione registrata.');
    expect(feedback).toEqual({ id: 'msg-1', rating: 'down', reason: 'Numeri sbagliati', comment: 'il totale non torna' });
    expect(within(answer).getByRole('button', { name: 'Risposta da migliorare' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('errore del server: messaggio e Riprova che reinvia la stessa domanda', async () => {
    let calls = 0;
    server.use(
      http.post('*/api/chat', () => {
        calls++;
        return calls === 1
          ? sseResponse([{ event: 'status', data: { stage: 'thinking' } }, { event: 'error', data: { message: 'Si è verificato un errore durante la risposta.', retryable: true } }])
          : sseResponse(streamEvents);
      }),
    );
    const router = renderAt('/chat');
    await userEvent.type(await screen.findByLabelText('Scrivi una domanda'), 'Penale ModaNova?{Enter}');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Si è verificato un errore');
    await userEvent.click(within(alert).getByRole('button', { name: 'Riprova' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/chat/conv-1'));
    expect(await screen.findByText('93,3%')).toBeInTheDocument();
    expect(calls).toBe(2);
    expect(screen.getAllByText('Penale ModaNova?')).toHaveLength(1);
  });

  it('riapre una conversazione salvata dalla sidebar', async () => {
    state.conversations = [{ id: 'conv-9', title: 'Danni per vettore', updatedAt: '2026-10-10T10:00:00Z' }];
    state.details['conv-9'] = {
      id: 'conv-9', title: 'Danni per vettore', updatedAt: '2026-10-10T10:00:00Z',
      messages: [
        { id: 'm1', role: 'user', content: 'Tasso danni per vettore?', status: 'ok', createdAt: '', artifacts: [], sources: [], toolsUsed: [] },
        { id: 'm2', role: 'assistant', content: 'VeloceExpress è al 3,5%.', status: 'ok', createdAt: '', artifacts: [], sources: [], toolsUsed: [{ name: 'analizza_dati', args: {}, durationMs: 5000, ok: true }], feedback: 'up' },
      ],
    };
    renderAt('/chat');
    await userEvent.click(await screen.findByRole('link', { name: 'Danni per vettore' }));
    expect(await screen.findByText('VeloceExpress è al 3,5%.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Risposta utile' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Storico spedizioni analizzato')).toBeInTheDocument();
  });

  it('conversazione inesistente: messaggio chiaro', async () => {
    renderAt('/chat/non-esiste');
    expect(await screen.findByText('Questa conversazione non esiste o è stata archiviata.')).toBeInTheDocument();
  });
});
