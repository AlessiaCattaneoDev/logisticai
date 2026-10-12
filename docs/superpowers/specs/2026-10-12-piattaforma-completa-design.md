# LogisticAI come piattaforma completa: design

Data: 12/10/2026. Stato: approvato (scelte prese con l'utente in brainstorming, mockup in `.superpowers/brainstorm/`).

## Obiettivo

Trasformare LogisticAI da "chat con dashboard" a piattaforma completa e moderna, credibile come prodotto vendibile:
- home dopo il login, che fa anche da dashboard personale;
- libreria documenti per categorie, con caricamento da parte di tutti gli utenti e indicizzazione automatica nel RAG;
- chat generale e chat limitata a un documento o a una categoria;
- nuova identità visiva "Cargo" con logo, applicata a tutte le pagine, ai grafici e alla dashboard admin.

Restano invariati: microservizi (frontend, backend, data agent, ChromaDB), orchestratore ReAct, data agent, autenticazione, telemetria.

## Decisioni prese

| Tema | Scelta |
|---|---|
| Chi carica | Tutti gli utenti; il documento è subito disponibile per tutti |
| Chi elimina | L'admin oppure l'autore del documento |
| Categorie | 6 predefinite; l'admin può crearne e rinominarle |
| Chat e documenti | Chat generale + "Chiedi a questo documento" (ambito documento o categoria) |
| Elaborazione dei file | Nel backend Node (strada A), nessun nuovo microservizio |
| Stile | "Cargo": blu cobalto, arancio container, menu blu notte, font Instrument Sans, logo a container impilati |

## Identità visiva Cargo

- Colori: blu notte `#1C1A4A` (menu), cobalto `#3B5BFD` (primario), arancio container `#FF7A1A` (solo per ciò che conta: soglie, notifiche, ambito attivo), fondo `#F5F6FA`, superfici bianche, testo `#14123A`, testo secondario `#6A6E91`, bordi `#DDE1F0`, verde `#1C7A47` / rosso `#D93B3B` per esiti.
- Forme: raggio 14 px per schede e campi, 10 px per pulsanti, pillole per chip e filtri; ombre leggerissime.
- Font: Instrument Sans (tutta l'interfaccia), IBM Plex Mono solo per codice.
- Logo: quadrato cobalto arrotondato con due container bianchi impilati e un punto arancio (destinazione). Componente React + favicon SVG.
- Grafici: barre arrotondate, griglia orizzontale leggera, tooltip a scheda, legenda a pillole, palette che parte dal cobalto; soglie in arancio tratteggiato.

## Struttura della piattaforma

Menu laterale fisso (a scomparsa su tablet): Home, Chat, Documenti; per l'admin la sezione Amministrazione (Dashboard, Conversazioni, Segnalazioni, Costi e modelli, Utenti, Sistema, Registro accessi). In basso utente e uscita.

- **Home** (`/`): saluto, azioni rapide (nuova conversazione, carica documento), indicatori personali (documenti disponibili, conversazioni, domande del mese, risposte trovate utili), riprendi conversazione, grafico delle proprie domande negli ultimi 30 giorni per tipo, documenti aggiunti di recente. Per l'admin in più: costo AI di oggi con budget, segnalazioni da rivedere, stato dei servizi, collegamento alla dashboard.
- **Chat** (`/chat`, `/chat/:id`): elenco conversazioni nella colonna della chat, etichetta arancio "Stai chiedendo a: ..." quando c'è un ambito, rimovibile.
- **Documenti** (`/documenti`, `/documenti/:categoriaId`): riquadri delle categorie con conteggio; elenco documenti con stato (In analisi, Disponibile, Errore), autore, data, sezioni, "Chiedi a questo documento", eliminazione se permessa; finestra di caricamento con trascinamento; gestione categorie per l'admin.
- **Amministrazione**: pagine esistenti ridisegnate nello stile Cargo, dentro lo stesso guscio.
- **Login**: pagina in due parti, pannello di marca blu notte con logo e messaggio, modulo a destra.

## Documenti nel backend

**Modello dati** (Prisma):
- `DocumentCategory`: id, nome, descrizione, ordine, creata.
- `Document`: id, titolo, nomeFile, tipo (pdf, docx, txt, md), dimensione, checksum, percorso su disco, categoria, autore (utente o sistema), stato (`processing`, `ready`, `error`), messaggio di errore, numero di sezioni, origine (`seed` o `upload`), date.
- `Conversation`: campi opzionali `scopeType` (`document` o `category`) e `scopeId`.

**Caricamento** (`POST /api/documents`, multipart): controlli su categoria esistente, estensione ammessa e firma reale del file (PDF `%PDF`, DOCX archivio zip), dimensione massima 15 MB, duplicato per checksum nella stessa categoria (409). Il file è salvato in `backend/storage/documents/<uuid>.<ext>` (escluso da git), la riga nasce in stato `processing`, la risposta è 202.

**Elaborazione** (coda sequenziale nel processo del backend): estrazione testo (PDF con `unpdf`, DOCX con `mammoth` convertito in titoli e paragrafi, TXT e MD diretti), divisione in sezioni (titoli Markdown se presenti, altrimenti blocchi di paragrafi), embedding, scrittura in Chroma con metadati `documentId`, `categoryId`, `documento`, `sezione`, `categoria` e, per le schede SLA, `cliente`. Esito: `ready` con numero di sezioni, oppure `error` con motivo leggibile (es. PDF scansionato senza testo). All'avvio i documenti rimasti in `processing` vengono rielaborati.

**Eliminazione** (`DELETE /api/documents/:id`, admin o autore): rimozione delle sezioni da Chroma, del file e della riga.

**Altre API**: `GET /api/categories` (con conteggi), `POST /api/categories` e `PATCH /api/categories/:id` (admin), `GET /api/documents?categoria=&q=`, `GET /api/documents/:id`, `GET /api/home`.

**Ingestion**: `npm run db:seed` registra i 10 documenti della knowledge base come documenti di sistema nelle loro categorie; `npm run ingest` ricrea la collection da tutti i documenti del database (seed e caricati).

**Chat con ambito**: `POST /api/chat` accetta `scope` (`{ type, id }`), valido solo se il documento è disponibile o la categoria esiste. Con un ambito: l'orchestratore offre solo lo strumento documentale, il retriever filtra per `documentId` o `categoryId`, il system prompt dichiara l'ambito. L'ambito si salva sulla conversazione e si ripropone alla riapertura.

## Test

- Backend: estrazione reale da file di esempio PDF, DOCX, TXT, MD; divisione in sezioni senza titoli; API documenti (permessi, formati, firma falsa, dimensione, duplicati, stati, eliminazione); categorie (solo admin); ricerca filtrata per ambito; chat con ambito (solo strumento documentale, ambito salvato); API home per operatore e admin.
- Frontend: home operatore e admin, libreria e caricamento, aggiornamento dello stato, chat con etichetta di ambito, logo e guscio con menu per ruolo; i test esistenti restano verdi.
- Valutazione dal vivo: una domanda con ambito su un documento caricato al momento.
