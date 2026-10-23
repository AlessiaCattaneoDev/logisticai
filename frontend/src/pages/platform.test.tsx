import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ChatStreamEvent } from '@logisticai/shared';
import { createQueryClient, routes } from '../App';
import { chatHandler, doc, sara, server, state } from '../test/msw';

const admin = { id: 'a1', username: 'admin', role: 'ADMIN' as const };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  state.user = sara;
  state.conversations = [];
  state.details = {};
  state.documents = [doc()];
});

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<QueryClientProvider client={createQueryClient()}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
}
const menu = () => screen.getAllByRole('navigation', { name: 'Menu principale' })[0];

describe('home', () => {
  it("operatore: i suoi numeri, le conversazioni da riprendere e i documenti nuovi, senza l'area admin", async () => {
    state.conversations = [{ id: 'conv-9', title: 'Danni per vettore', updatedAt: new Date().toISOString() }];
    renderAt('/');
    const numeri = await screen.findByRole('region', { name: 'I tuoi numeri' });
    expect(within(numeri).getByText('Documenti disponibili').parentElement).toHaveTextContent('10');
    expect(within(numeri).getByText('in 6 categorie')).toBeInTheDocument();
    expect(within(numeri).getByText('90%')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Danni per vettore/ })).toHaveAttribute('href', '/chat/conv-9');
    const recenti = screen.getByRole('region', { name: 'Aggiunti di recente nella libreria' });
    expect(within(recenti).getByText('Nuova policy resi')).toBeInTheDocument();
    expect(within(recenti).getByText('In analisi')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Amministrazione' })).not.toBeInTheDocument();
    expect(within(menu()).queryByText('Amministrazione')).not.toBeInTheDocument();
  });

  it('admin: costo di oggi, segnalazioni da rivedere, servizi e menu di amministrazione', async () => {
    state.user = admin;
    renderAt('/');
    const area = await screen.findByRole('region', { name: 'Amministrazione' });
    expect(within(area).getByRole('meter', { name: 'Budget giornaliero' })).toHaveAttribute('aria-valuenow', '0.42');
    expect(within(area).getByText('1 non raggiungibili')).toBeInTheDocument();
    expect(within(area).getByRole('link', { name: /Risposte segnalate da rivedere/ })).toHaveAttribute('href', '/admin/feedback');
    expect(screen.getByRole('link', { name: 'Apri la dashboard' })).toHaveAttribute('href', '/admin');
    expect(within(menu()).getByText('Amministrazione')).toBeInTheDocument();
    expect(await within(menu()).findByLabelText('3 da rivedere')).toBeInTheDocument();
  });
});

describe('documenti', () => {
  it('categorie a riquadri, poi elenco con stato e "Chiedi a questo documento"', async () => {
    renderAt('/documenti');
    await userEvent.click(await screen.findByRole('link', { name: /Reclami e giacenze/ }));
    const lista = await screen.findByRole('region', { name: 'Documenti di Reclami e giacenze' });
    expect(within(lista).getByText('Procedura reclami e danni')).toBeInTheDocument();
    expect(within(lista).getByText('Disponibile')).toBeInTheDocument();
    expect(within(lista).getByText(/6 sezioni/)).toBeInTheDocument();
    expect(within(lista).getByRole('link', { name: /Chiedi a questo documento/ })).toHaveAttribute('href', '/chat?documento=doc-1');
    // Documento iniziale, operatore non autore: niente pulsante di eliminazione.
    expect(within(lista).queryByRole('button', { name: /Elimina/ })).not.toBeInTheDocument();
  });

  it('caricamento: file trascinato o scelto, titolo proposto, poi lo stato passa da In analisi a Disponibile', async () => {
    let received: { categoryId: unknown; title: unknown; file: string } | undefined;
    const uploaded = doc({ id: 'doc-new', title: 'Policy resi 2027', fileName: 'policy_resi_2027.pdf', kind: 'pdf', origin: 'upload', uploadedBy: 'sara.operatrice', status: 'processing', sections: 0, canDelete: true });
    let listCalls = 0;
    server.use(
      http.post('*/api/documents', async ({ request }) => {
        const form = await request.formData();
        // jsdom perde il nome del file nella serializzazione: si controlla il contenuto.
        received = { categoryId: form.get('categoryId'), title: form.get('title'), file: await (form.get('file') as File).text() };
        state.documents = [uploaded, ...state.documents];
        return HttpResponse.json(uploaded, { status: 202 });
      }),
      http.get('*/api/documents', () => {
        listCalls++;
        const ready = listCalls > 1 ? { ...uploaded, status: 'ready' as const, sections: 4 } : uploaded;
        return HttpResponse.json([ready, doc()]);
      }),
    );
    const router = renderAt('/documenti?carica=1');
    const dialog = await screen.findByRole('dialog', { name: 'Carica un documento' });
    await userEvent.upload(within(dialog).getByLabelText('File da caricare'), new File(['%PDF-1.4'], 'policy_resi_2027.pdf', { type: 'application/pdf' }));
    expect(within(dialog).getByLabelText('Titolo')).toHaveValue('policy resi 2027');
    await userEvent.clear(within(dialog).getByLabelText('Titolo'));
    await userEvent.type(within(dialog).getByLabelText('Titolo'), 'Policy resi 2027');
    await userEvent.selectOptions(within(dialog).getByLabelText('Categoria'), 'cat-rec');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Carica' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/documenti/cat-rec'));
    expect(received).toEqual({ categoryId: 'cat-rec', title: 'Policy resi 2027', file: '%PDF-1.4' });
    const lista = await screen.findByRole('region', { name: 'Documenti di Reclami e giacenze' });
    expect(await within(lista).findByText('In analisi')).toBeInTheDocument();
    // La lista si aggiorna da sola finché c'è un documento in analisi.
    await waitFor(() => expect(within(lista).getAllByText('Disponibile')).toHaveLength(2), { timeout: 4000 });
    expect(within(lista).getByText(/4 sezioni/)).toBeInTheDocument();
  });

  it('formato non supportato: messaggio chiaro e nessun invio', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderAt('/documenti?carica=1');
    const dialog = await screen.findByRole('dialog', { name: 'Carica un documento' });
    await user.upload(within(dialog).getByLabelText('File da caricare'), new File(['x'], 'foto.png', { type: 'image/png' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Formato non supportato');
    expect(within(dialog).getByRole('button', { name: 'Carica' })).toBeDisabled();
  });

  it("errore del server sul caricamento (es. duplicato): resta aperta con il motivo", async () => {
    server.use(http.post('*/api/documents', () => HttpResponse.json({ error: 'Questo file è già presente nella categoria' }, { status: 409 })));
    renderAt('/documenti?carica=1');
    const dialog = await screen.findByRole('dialog', { name: 'Carica un documento' });
    await userEvent.upload(within(dialog).getByLabelText('File da caricare'), new File(['ciao'], 'note.txt', { type: 'text/plain' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Carica' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('già presente');
  });

  it("l'autore può eliminare il proprio documento dopo la conferma", async () => {
    let deleted: unknown;
    state.documents = [doc({ id: 'doc-mio', title: 'Mie note', origin: 'upload', uploadedBy: 'sara.operatrice', canDelete: true })];
    server.use(http.delete('*/api/documents/:id', ({ params }) => { deleted = params.id; state.documents = []; return new HttpResponse(null, { status: 204 }); }));
    renderAt('/documenti/cat-rec');
    await userEvent.click(await screen.findByRole('button', { name: 'Elimina "Mie note"' }));
    const dialog = screen.getByRole('dialog', { name: 'Eliminare il documento?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Elimina documento' }));
    await waitFor(() => expect(deleted).toBe('doc-mio'));
    expect(await screen.findByText('Ancora nessun documento')).toBeInTheDocument();
  });

  it("solo l'admin crea categorie", async () => {
    let created: unknown;
    server.use(http.post('*/api/categories', async ({ request }) => { created = await request.json(); return HttpResponse.json({}, { status: 201 }); }));
    renderAt('/documenti');
    await screen.findByRole('link', { name: /Reclami e giacenze/ });
    expect(screen.queryByRole('button', { name: 'Nuova categoria' })).not.toBeInTheDocument();

    state.user = admin;
    document.body.innerHTML = '';
    renderAt('/documenti');
    await userEvent.click(await screen.findByRole('button', { name: 'Nuova categoria' }));
    const dialog = screen.getByRole('dialog', { name: 'Nuova categoria' });
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Dogane');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crea categoria' }));
    await waitFor(() => expect(created).toEqual({ name: 'Dogane', description: '' }));
  });
});

describe('chat con ambito', () => {
  const events = (id: string): ChatStreamEvent[] => [
    { event: 'tool_start', data: { tool: 'cerca_knowledge_base', args: {} } },
    { event: 'tool_end', data: { tool: 'cerca_knowledge_base', durationMs: 400, ok: true } },
    { event: 'delta', data: { text: 'Entro 8 giorni dalla consegna.' } },
    {
      event: 'done',
      data: { conversationId: id, messageId: 'm1', reply: 'Entro 8 giorni dalla consegna.', artifacts: [], sources: [], toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1, costEur: 0, latencyMs: 1 } },
    },
  ];

  it('"Chiedi a questo documento": etichetta arancio, ambito inviato e conservato, poi rimovibile', async () => {
    let body: unknown;
    server.use(http.post('*/api/chat', chatHandler(events('conv-s'), (b) => (body = b))));
    const router = renderAt('/chat?documento=doc-1');
    expect(await screen.findByText('Stai chiedendo a: Procedura reclami e danni')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cosa vuoi sapere da questo documento?' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Scrivi una domanda'), 'Entro quando va segnalato un danno occulto?{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/chat/conv-s'));
    expect(body).toEqual({ message: 'Entro quando va segnalato un danno occulto?', scope: { type: 'document', id: 'doc-1' } });
    expect(await screen.findByText('Entro 8 giorni dalla consegna.')).toBeInTheDocument();
    expect(screen.getByText('Stai chiedendo a: Procedura reclami e danni')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: "Togli l'ambito e chiedi a tutta la piattaforma" }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/chat'));
    expect(screen.queryByText(/Stai chiedendo a/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cosa ti serve sapere?' })).toBeInTheDocument();
  });

  it('una conversazione salvata con ambito lo ripropone alla riapertura', async () => {
    state.details['conv-c'] = {
      id: 'conv-c', title: 'SLA', updatedAt: '2026-10-10T10:00:00Z', scope: { type: 'category', id: 'cat-sla', label: 'Contratti e SLA clienti' },
      messages: [{ id: 'm1', role: 'user', content: 'Soglie?', status: 'ok', createdAt: '', artifacts: [], sources: [], toolsUsed: [] }],
    };
    renderAt('/chat/conv-c');
    expect(await screen.findByText('Stai chiedendo a: Contratti e SLA clienti')).toBeInTheDocument();
  });
});
