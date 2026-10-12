# Frontend - React + TypeScript + Tailwind

Vedi anche: [../CLAUDE.md](../CLAUDE.md) (regole globali) e [../PROGETTO.md](../PROGETTO.md) §13–14.

## Ruolo
Single page app della piattaforma: login, home (dashboard personale, con indicatori in più per l'admin), libreria documenti per categorie con caricamento, chat (stream SSE, stati live, feedback 👍/👎, ambito documento o categoria) e amministrazione. Visualizza grafici e tabelle a partire dalle spec JSON del data agent.

## Comandi
```bash
npm run dev          # Vite su :5173, proxy /api → :3001
npm test             # vitest run (jsdom)
npm run test:watch
npm run typecheck
npm run build
```

## Stack
React 19 · Vite · Tailwind CSS v4 (`@tailwindcss/vite`, config in `src/index.css`) · react-router · TanStack Query · **Recharts** (tutti i grafici) · **TanStack Table** (tutte le tabelle) · react-markdown + remark-gfm · lucide-react.

Le versioni installate sono recenti (react-router 8, Recharts 3, Vite 8): prima di usare un'API controlla i tipi in `node_modules` invece di andare a memoria. TanStack Table è fissato alla **v8** (`useReactTable`): la v9 ha un'API nuova e ancora poco documentata.

## Struttura
```
src/
├── main.tsx, App.tsx (router), index.css (token del tema Cargo)
├── api/             ← client HTTP (credentials: 'include'), parser SSE, platform.ts (home, categorie, documenti, upload multipart)
├── auth/            ← useMe/useLogin/useLogout, ProtectedRoute per ruolo
├── lib/time.ts      ← saluto, data estesa, "oggi / ieri / 3 giorni fa"
├── pages/           ← LoginPage, HomePage, DocumentsPage, CategoryPage, ChatPage, admin/* (Overview, Conversations, ConversationDetail, Feedback, Costs, Users, System, Audit)
├── chat/            ← state.ts (reducer puro della chat) e useChat.ts (stream SSE, cache, retry, feedback, ambito)
├── components/
│   ├── brand/       ← Logo e LogoMark (anche public/favicon.svg)
│   ├── layout/      ← AppShell (menu laterale per ruolo, a scomparsa sotto lg) e Page
│   ├── ui/          ← Button, Card/Section/PageHeader/StatCard/EmptyState, Badge/StatusBadge, Dialog, Field, Status (servizi, budget, QueryState)
│   ├── documents/   ← UploadDialog (trascinamento), CategoryDialog, DeleteDialog, DocumentRow, meta.ts
│   ├── chat/        ← AssistantMessage, TrackingTimeline (stati live), FeedbackButtons, Composer, ConversationSidebar, SuggestedQuestions
│   ├── artifacts/   ← ArtifactRenderer, DataChart, DataTable, MiniBarChart, chartTheme.tsx, palette.ts, format.ts
│   └── admin/       ← ui.tsx (Panel + riesportazioni), PeriodPicker, useNames (pseudonimi)
└── test/            ← setup.ts, msw.ts (API simulate: auth, chat SSE, home, categorie, documenti)
```

## Rotte
`/login`; dentro `AppShell`: `/` (home), `/chat`, `/chat/:id`, `/chat?documento=ID` e `/chat?categoria=ID` (chat con ambito), `/documenti` (`?carica=1` apre il caricamento), `/documenti/:categoriaId`, `/admin/*` (solo ADMIN). Le rotte sconosciute portano alla home.

## Regole
- **Grafici e tabelle solo con i componenti di `components/artifacts/`**, che ricevono `ChartSpec`/`TableSpec` da `@logisticai/shared`. Mai `<img>` di grafici, mai librerie grafiche diverse da Recharts. Gli stessi componenti servono chat e dashboard admin.
- Formattazione dei valori solo con `formatValue()` di `components/artifacts/format.ts` (locale `it-IT`).
- Il JWT sta in un cookie httpOnly: il front end non legge né salva token. Tutte le fetch usano `credentials: 'include'`.
- Testi dell'interfaccia in italiano. Accessibilità: ruoli e label corretti (servono anche ai test).
- Tailwind per lo stile; niente CSS custom se non nei token del tema in `index.css`.
- Direzione visiva "Cargo" (spec in `docs/superpowers/specs/2026-10-12-piattaforma-completa-design.md`): menu blu notte (`notte`), cobalto come colore principale (`primario`), arancio container (`accento`) SOLO per ciò che conta (soglie, notifiche, ambito attivo, documenti in analisi). Superfici bianche su `fondo`, testo `testo`/`testo-2`, esiti `ok`/`ko`. Font Instrument Sans, IBM Plex Mono solo per codice. Schede con la utility `card`; pulsanti e campi dai componenti di `components/ui/`, non classi ripetute.
- Niente maiuscolo per le etichette, niente frecce nei bottoni, niente trattino lungo, niente punto centrale come separatore.
- Grafici: tema comune in `artifacts/chartTheme.tsx` (griglia leggera, assi senza linee, tooltip a scheda, barre arrotondate); palette in `palette.ts` che parte dal cobalto; soglie arancio tratteggiate.

## Test
- Vitest + Testing Library + jest-dom, file `*.test.tsx` accanto al componente.
- Cerca gli elementi per ruolo/label (`getByRole`), non per classi CSS.
- API simulate con MSW (`src/test/msw.ts`, con `sseResponse()` per lo stream della chat) negli integration test delle pagine. Recharts in jsdom: verifica titolo, legenda e controlli, non i pixel (passa `initialDimension`).

## Documenti e ambito della chat
- Le liste documenti si ricaricano ogni 2 s finché c'è un documento `processing` (`pollWhileProcessing`).
- Dopo caricamento o eliminazione si invalidano le query `documents`, `categories` e `home`.
- "Chiedi a questo documento" porta a `/chat?documento=ID`: `ChatPage` risolve il nome, `useChat` invia `scope` solo alla prima domanda; le conversazioni esistenti mostrano l'ambito salvato. L'etichetta arancio si toglie con la X e riporta a `/chat`.

## Dashboard admin
- Rotte `/admin/*` dentro il guscio comune, protette da `ProtectedRoute role="ADMIN"`; il periodo sta nella query string (`?periodo=7g`, `da`, `a`).
- I grafici della panoramica sono `ChartSpec` costruite dai dati dell'API e disegnate con lo stesso `DataChart` della chat.
- Gli utenti si mostrano con pseudonimo (`Utente #n`); "Mostra nomi" chiama `/api/admin/reveal-names`, che il backend registra nell'audit.
