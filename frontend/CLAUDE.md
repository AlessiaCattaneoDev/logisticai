# Frontend — React + TypeScript + Tailwind

Vedi anche: [../CLAUDE.md](../CLAUDE.md) (regole globali) e [../PROGETTO.md](../PROGETTO.md) §13–14.

## Ruolo
Single page app con login, chat (stream SSE, stati live, feedback 👍/👎) e dashboard admin. Visualizza grafici e tabelle a partire dalle spec JSON del data agent.

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

Le versioni installate sono recenti (react-router 8, TanStack Table 9, Recharts 3, Vite 8): prima di usare un'API controlla i tipi in `node_modules` invece di andare a memoria.

## Struttura
```
src/
├── main.tsx · App.tsx (router) · index.css
├── api/             ← client HTTP (credentials: 'include') + parser SSE (fetch + ReadableStream)
├── auth/            ← contesto utente, ProtectedRoute per ruolo
├── pages/           ← LoginPage, ChatPage, admin/*
├── components/
│   ├── chat/        ← ChatWindow, MessageBubble, LiveStatus, FeedbackButtons, Composer…
│   ├── artifacts/   ← ArtifactRenderer, DataChart, DataTable, format.ts
│   └── admin/
└── test/setup.ts    ← jest-dom + cleanup
```

## Regole
- **Grafici e tabelle solo con i componenti di `components/artifacts/`**, che ricevono `ChartSpec`/`TableSpec` da `@logisticai/shared`. Mai `<img>` di grafici, mai librerie grafiche diverse da Recharts. Gli stessi componenti servono chat e dashboard admin.
- Formattazione dei valori solo con `formatValue()` di `components/artifacts/format.ts` (locale `it-IT`).
- Il JWT sta in un cookie httpOnly: il front end non legge né salva token. Tutte le fetch usano `credentials: 'include'`.
- Testi dell'interfaccia in italiano. Accessibilità: ruoli e label corretti (servono anche ai test).
- Tailwind per lo stile; niente CSS custom se non nei token del tema in `index.css`.

## Test
- Vitest + Testing Library + jest-dom, file `*.test.tsx` accanto al componente.
- Cerca gli elementi per ruolo/label (`getByRole`), non per classi CSS.
- API simulate con MSW negli integration test delle pagine. Recharts in jsdom: verifica la presenza di titolo, legenda e controlli, non i pixel.
