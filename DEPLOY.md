# Pubblicare LogisticAI online

Architettura online (gli stessi 4 microservizi del progetto, più il database gestito):

| Pezzo | Dove | Indirizzo |
|---|---|---|
| Frontend React | **Vercel** | `https://logisticai.vercel.app` (o il nome che scegli) |
| Backend Node | **Railway**, servizio `backend` | `https://logisticai-api.up.railway.app` |
| Data agent Python | **Railway**, servizio `data-agent` | solo rete privata: `http://data-agent.railway.internal:8001` |
| ChromaDB | **Railway**, servizio `chroma` | solo rete privata: `http://chroma.railway.internal:8000` |
| Database PostgreSQL | **Neon** | stringa `postgresql://...` |

Il browser parla solo con Vercel: Vercel inoltra `/api/*` al backend su Railway (`frontend/vercel.json`), così il cookie di sessione resta sullo stesso indirizzo e il login funziona. Data agent e ChromaDB non sono raggiungibili da internet.

**Costi:** Vercel e Neon gratuiti. Railway dà 5 $ di prova, poi il piano Hobby costa 5 $ al mese (con 5 $ di consumo inclusi): per questa demo il consumo stimato è di 5-8 $ al mese. A questo si aggiunge l'uso di OpenAI (circa 1,5 centesimi a risposta).

Tempo: circa 45 minuti la prima volta.

---

## 0. Prima di iniziare

- Il codice deve essere su GitHub (`https://github.com/AlessiaCattaneoDev/logisticai`), aggiornato.
- Tieni aperto il tuo file `.env` locale: da lì copierai chiavi e segreti.
- Imposta un limite di spesa su **platform.openai.com → Settings → Limits** (es. 10 $). Meglio ancora: crea una chiave OpenAI nuova solo per il sito.

## 1. Database su Neon

1. Vai su **neon.tech** → **Sign up** con l'account GitHub.
2. **Create project**:
   - Project name: `logisticai`
   - Postgres version: 17
   - Region: **AWS Europe Central 1 (Frankfurt)**
3. Nella dashboard del progetto clicca **Connect**.
4. **Disattiva "Connection pooling"** (serve la connessione diretta per le migrazioni) e copia la stringa: inizia con `postgresql://` e finisce con `?sslmode=require`. È il tuo `DATABASE_URL` online.

Le tabelle non vanno create a mano: le crea il backend al primo avvio.

## 2. Progetto su Railway

1. Vai su **railway.com** → **Login** con GitHub.
2. **New Project → Deploy from GitHub repo** → autorizza Railway a leggere il repository → scegli `logisticai`.
3. Railway crea un primo servizio: lo trasformiamo in `chroma` (punto 3). Gli altri due li aggiungi dal pulsante **+ Create → GitHub Repo → logisticai** nella stessa schermata del progetto.

Per ognuno dei tre servizi, nelle **Settings**, si impostano: nome, file di configurazione, eventuale volume e variabili. Il file di configurazione dice a Railway quale Dockerfile usare.

### 3. Servizio `chroma`

1. **Settings → Service Name**: `chroma` (esattamente così: è il nome usato nella rete privata).
2. **Settings → Config-as-code → Railway Config File**: `/vector_db/railway.json`
3. **Variables → New Variable**: `PORT` = `8000`
4. **Volume:** tasto destro sul servizio (o **+ Create → Volume**) → collega a `chroma` → **Mount path**: `/data`
5. **Non** generare un dominio pubblico.
6. **Deploy** (o attendi il deploy automatico). Nei log deve comparire che Chroma è in ascolto sulla porta 8000.

### 4. Servizio `data-agent`

1. **Service Name**: `data-agent`
2. **Railway Config File**: `/data_agent/railway.json`
3. **Variables → Raw Editor**, incolla e completa con i valori del tuo `.env`:

```
PORT=8001
OPENAI_API_KEY=sk-...
DATA_LLM_PROVIDER=openai
DATA_LLM_MODEL=gpt-5.4-mini
INTERNAL_SERVICE_SECRET=lo-stesso-del-.env
```

4. Niente volume, **niente dominio pubblico**.

### 5. Servizio `backend`

1. **Service Name**: `backend`
2. **Railway Config File**: `/backend/railway.json`
3. **Volume** collegato a `backend`, **Mount path**: `/app/backend/storage` (qui restano i documenti caricati dagli utenti).
4. **Variables → Raw Editor**, incolla e completa:

```
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://...la-stringa-di-Neon...?sslmode=require
OPENAI_API_KEY=sk-...
LLM_PROVIDER=openai
LLM_MODEL=gpt-5.4-mini
LLM_REASONING_EFFORT=medium
DATA_LLM_PROVIDER=openai
DATA_LLM_MODEL=gpt-5.4-mini
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
JWT_SECRET=lo-stesso-del-.env-o-uno-nuovo-di-64-caratteri
INTERNAL_SERVICE_SECRET=lo-stesso-del-.env
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=una-password-nuova-lunga
SEED_OPERATOR_USERNAME=sara.operatrice
SEED_OPERATOR_PASSWORD=un-altra-password-nuova-lunga
CHROMA_URL=http://chroma.railway.internal:8000
DATA_AGENT_URL=http://data-agent.railway.internal:8001
AUTO_INGEST=true
TRUST_PROXY=2
FRONTEND_ORIGIN=https://logisticai.vercel.app
DAILY_BUDGET_EUR=5
MONTHLY_BUDGET_EUR=50
```

   - Le password demo vanno **cambiate**: quelle del README sono pubbliche.
   - `INTERNAL_SERVICE_SECRET` deve essere **identico** in `backend` e `data-agent`.
   - `AUTO_INGEST=true`: al primo avvio il backend indicizza da solo i 10 documenti in ChromaDB.
   - `FRONTEND_ORIGIN`: per ora lascialo così, lo correggi al punto 7 se Vercel ti dà un indirizzo diverso.
5. **Settings → Networking → Generate Domain** → porta **3001** → modifica il nome in `logisticai-api` → l'indirizzo diventa `https://logisticai-api.up.railway.app`.
   - Se il nome è già preso scegline un altro e **aggiorna la riga `destination`** in `frontend/vercel.json` con il nuovo indirizzo (poi commit e push).
6. Attendi il deploy. Nei log devi vedere, in ordine: migrazioni applicate, `The seed command has been executed`, `Knowledge base indicizzata all'avvio: 10 documenti`, `Backend in ascolto`.
7. Prova: apri `https://logisticai-api.up.railway.app/api/health` → deve rispondere `"status":"ok"` con `database`, `chroma` e `dataAgent` a `ok`.

## 6. Frontend su Vercel

1. Vai su **vercel.com** → **Sign up** con GitHub.
2. **Add New → Project** → importa `logisticai`.
3. **Root Directory**: `frontend` (clicca **Edit** e scegli la cartella).
4. Framework: **Vite** (rilevato da solo). Install e build sono già in `frontend/vercel.json`: non toccare gli altri campi, non servono variabili.
5. **Deploy**. Alla fine Vercel mostra l'indirizzo (es. `https://logisticai.vercel.app` o `https://logisticai-xxxx.vercel.app`).
   - Per un nome più pulito: **Settings → Domains** → modifica il dominio `.vercel.app`.

## 7. Collegamento finale

Se l'indirizzo di Vercel non è esattamente `https://logisticai.vercel.app`: su Railway → `backend` → **Variables** → aggiorna `FRONTEND_ORIGIN` con l'indirizzo vero (Railway riavvia il backend da solo).

## 8. Prova completa

Apri l'indirizzo di Vercel e verifica:
1. login con le **nuove** password;
2. una domanda sui documenti ("Entro quanto va segnalato un danno occulto?");
3. una domanda sui dati ("Qual è il tasso di danni per vettore nel 2026?"): compaiono stati live e grafico;
4. caricamento di un documento in **Documenti** e "Chiedi a questo documento";
5. con l'utente admin, la **Dashboard**.

Se qualcosa non va: Railway → servizio → **Deployments → View logs**.

## Aggiornamenti

Ogni `git push` su `main` aggiorna da solo:
- Vercel (frontend);
- su Railway solo i servizi i cui file sono cambiati (`watchPatterns` nei `railway.json`).

Le migrazioni del database e i nuovi utenti demo si applicano da soli all'avvio del backend.

## Problemi frequenti

| Sintomo | Causa e soluzione |
|---|---|
| Login che "non tiene" (torna sempre al login) | `NODE_ENV=production` senza HTTPS, oppure stai aprendo il backend di Railway invece del sito Vercel. Usa sempre l'indirizzo di Vercel. |
| 404 o errore su `/api/...` dal sito | La riga `destination` di `frontend/vercel.json` non corrisponde al dominio del backend. |
| `/api/health` con `chroma` o `dataAgent` a `down` | Nome del servizio diverso da `chroma` / `data-agent`, oppure `PORT` mancante nel servizio. |
| Il backend si ferma con "Knowledge base non indicizzata" | Manca `AUTO_INGEST=true`. |
| Analisi dati sempre in errore | `INTERNAL_SERVICE_SECRET` diverso tra `backend` e `data-agent`. |
| Errore di migrazione al primo avvio | Stringa di Neon con pooling: copia quella con "Connection pooling" disattivato. |
