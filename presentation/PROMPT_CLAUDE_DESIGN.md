# Prompt per Claude Design: presentazione della tesi LogisticAI

Copia tutto il testo sotto la riga e incollalo in Claude Design. Allega gli screenshot della cartella `presentation/screenshots/` indicati slide per slide.

---

Crea una presentazione di 22 slide in italiano, formato 16:9, da esportare in PDF.

## Contesto

È la presentazione del mio **progetto finale del Master in AI**, discusso davanti a una commissione di docenti. Chi parla sono io, Alessia Cattaneo, e racconto **un progetto che ho progettato e realizzato io**: perché l'ho scelto, quali scelte tecniche ho fatto, quali tecnologie ho usato, quali problemi ho incontrato e come li ho risolti, come ho verificato che funzioni.

Il progetto è LogisticAI: un copilota AI per il customer service e le operations di un'azienda di logistica (un operatore 3PL). L'azienda, i clienti, i vettori e tutti i dati sono **inventati da me** per il progetto. Non scrivere mai i nomi dei clienti o dell'azienda che compaiono negli screenshot: nelle slide parla di "un cliente", "l'azienda di logistica fittizia", "il dataset di prova". Gli screenshot mostrano dati dimostrativi e vanno usati così come sono.

Il taglio è quello di una tesi: **il prodotto è l'esempio, il lavoro è il centro**. Ogni slide deve rispondere a una domanda che farebbe un docente: qual era il problema, cosa hai scelto e perché, come lo hai costruito, come sai che funziona, cosa non funziona ancora. Tono professionale, sobrio, in prima persona singolare ("ho scelto", "ho costruito"). Niente toni da marketing, niente superlativi, niente vendita del prodotto.

## Direzione visiva (coerente con l'applicazione)

- Palette dell'applicazione. Sfondo Impure White `#FDFDFD`. Superfici e schede Warm Light Grey `#F7F3F3` con angoli arrotondati (16 px) e ombra leggerissima. Testo Coffee Black `#181010`, testo secondario `#6E6260`, bordi `#E6DEDD`.
- Nero caffè `#181010` come fondo per copertina, slide di chiusura e slide di sezione. Corallo `#FF6F59` come **unico** colore d'accento: numeri chiave, evidenziazioni, passo in corso, frecce dello schema. Sul corallo il testo è sempre nero caffè, mai bianco. Verde `#1C7A47` e rosso `#D93B3B` solo per esiti positivi e negativi (test superati, errori).
- Font: **Instrument Sans** per tutto (titoli bold, leggermente stretti), **IBM Plex Mono** solo per nomi tecnici, comandi e frammenti di codice.
- Logo: quadrato corallo arrotondato con due container bianchi impilati e un punto nero caffè; si vede in alto a sinistra in ogni screenshot, puoi riprodurlo in copertina.
- Gli screenshot sono materiale di prova del lavoro: mostrali grandi, con angoli arrotondati e un bordo sottile `#E6DEDD`, senza cornici di dispositivo né ombre pesanti.
- Evita: etichette in maiuscolo, il trattino lungo, frecce nei testi (le frecce sono ammesse solo negli schemi), icone decorative generiche, sfumature, schede tutte uguali, elenchi di più di 6 punti. Numeri grandi solo dove il numero è davvero il messaggio.
- Elemento ricorrente: una sottile timeline verticale a punti per i processi a passi. Una piccola numerazione di sezione in alto ("1 Contesto", "2 Progettazione", "3 Realizzazione", "4 Verifica", "5 Conclusioni") per far capire a che punto del discorso siamo.
- Ogni slide ha un titolo che è già la conclusione ("Ho separato i servizi per poter sostituire ogni pezzo"), non un'etichetta ("Architettura").

## Slide

### 1. Copertina
- Titolo: **LogisticAI**
- Sottotitolo: Un copilota AI ibrido per customer service e operations in logistica
- Riga sotto: Progetto finale del Master in AI | Alessia Cattaneo | Ottobre 2026
- Fondo nero caffè. Immagine: `01-home.png`, ritagliata a destra.

### 2. Indice del percorso
Titolo: Dal problema alla verifica, in cinque tappe
Timeline orizzontale con le cinque sezioni: 1 Contesto e obiettivi (slide 3-5), 2 Progettazione (6-9), 3 Realizzazione (10-17), 4 Verifica (18-20), 5 Conclusioni (21-22). Niente altro testo.

### 3. Il contesto
Titolo: In logistica le risposte stanno in documenti e in tabelle diverse
Tre blocchi brevi:
1. **Il settore.** Un operatore 3PL gestisce la merce di molti clienti. Ogni cliente ha un contratto con soglie di puntualità, penali, esclusioni e massimali propri.
2. **Dove sono le informazioni.** Le regole sono in PDF e Word. I fatti (spedizioni, ritardi, danni) sono in un gestionale che si esporta in CSV o Excel. Per rispondere a una domanda spesso servono entrambi.
3. **Il costo dell'attesa.** Rispondere a un cliente richiede di aprire un documento, filtrare un foglio, rifare un calcolo a mano. Un errore sulle esclusioni può significare una penale pagata senza dovere.
Nota in piccolo: Il caso è realistico ma l'azienda e i dati sono fittizi, costruiti da me per il progetto.

### 4. Obiettivi e domande di progetto
Titolo: Volevo capire se un solo assistente può unire documenti e dati in modo affidabile
Colonna sinistra, "Obiettivo": costruire una piattaforma completa, non una demo: accesso con ruoli, libreria di documenti, chat, dashboard di controllo.
Colonna destra, "Domande a cui rispondere", tre domande numerate:
1. Un modello linguistico può scegliere da solo se cercare nei documenti, analizzare i dati o fare entrambe le cose, nell'ordine giusto?
2. Come si ottengono numeri che si possono usare per decidere (penali in euro) senza fidarsi di un calcolo inventato dal modello?
3. Come si progetta il sistema perché non dipenda da un singolo fornitore di AI?

### 5. Requisiti e vincoli che mi sono dato
Titolo: Ho fissato regole fin dall'inizio, e ho misurato il lavoro su queste
Sei punti brevi:
- Tre tipi di domanda: solo documenti, solo dati, documenti e dati insieme.
- Ogni risposta cita le fonti (documento e sezione).
- Grafici e tabelle sono componenti interattivi generati da una specifica JSON, mai immagini.
- Servizi separati che comunicano solo via HTTP.
- Il fornitore del modello AI si cambia da configurazione, senza toccare il codice.
- Ogni modifica arriva con i suoi test; i test non chiamano mai un modello reale.

### 6. Approccio scelto
Titolo: Ho combinato recupero di documenti, analisi di dati e un orchestratore che decide
Tre colonne affiancate, ognuna con una riga "cosa risolve" e una "cosa non risolve":
- **RAG (Retrieval-Augmented Generation).** Risolve: risposte da testi lunghi, con fonti. Non risolve: calcoli su migliaia di righe.
- **Agente di analisi dati.** Risolve: filtri, aggregazioni, grafici sul CSV. Non risolve: conoscere le regole del contratto.
- **Orchestratore ReAct.** Il modello ragiona, sceglie lo strumento, osserva il risultato e decide il passo dopo. Risolve: le domande che richiedono entrambe le fonti, nell'ordine corretto.
Frase sotto: L'approccio ibrido è la parte originale del progetto: le domande più utili sono quelle che mettono insieme regole e numeri.

### 7. Architettura
Titolo: Quattro servizi indipendenti, ognuno sostituibile
Disegna uno schema orizzontale con questi blocchi e frecce:
- **Frontend React** (home, documenti, chat, dashboard) -> freccia "domanda" -> **Backend Node.js** (orchestratore)
- Al centro del backend un nodo evidenziato in corallo: **"L'LLM decide"**, con la scritta "quale strumento, in che ordine, con quali parametri".
- Dal nodo partono due frecce: verso **ChromaDB** (database vettoriale della knowledge base) con "cerca nei documenti", e verso **Data agent Python** (FastAPI, agente pandas) con "analizza le spedizioni", che legge `spedizioni.csv`.
- Freccia di ritorno al frontend: "risposta, fonti, grafici".
- Sotto, in piccolo: database SQLite per utenti, documenti, conversazioni e costi.
Nota a piè di slide: I servizi comunicano solo via HTTP. Il data agent accetta richieste solo dal backend, con un token che scade dopo 60 secondi. Un test automatico verifica che non ci siano import di codice tra servizi.

### 8. Stack tecnologico e motivazioni
Titolo: Ogni tecnologia ha una ragione precisa
Tabella a tre colonne, Tecnologia | Dove la uso | Perché l'ho scelta. Righe:
| Tecnologia | Dove | Perché |
|---|---|---|
| React, Vite, TypeScript, Tailwind | Interfaccia | Componenti riusabili e tipi condivisi con il backend |
| Recharts, TanStack Table | Grafici e tabelle | Interattivi e generati da una specifica JSON |
| Node.js, Express, Prisma, SQLite | Backend e database | Un solo linguaggio con il frontend; schema e migrazioni versionati |
| zod e pydantic | Contratti tra servizi | Gli stessi dati sono validati in TypeScript e in Python |
| Python, FastAPI, LangChain, pandas | Data agent | L'ecosistema dell'analisi dati e degli agenti è in Python |
| ChromaDB, text-embedding-3-small | Ricerca nei documenti | Database vettoriale leggero, avviabile in locale |
| OpenAI gpt-5.4-mini (Responses API) | Modello AI | Buon rapporto qualità e costo; sostituibile da configurazione |
| Vitest, pytest, MSW | Test | Test sui tre livelli senza chiamare un modello reale |
Frase sotto: Nessun SDK di fornitore fuori da una cartella di adattatori; il data agent usa `init_chat_model` di LangChain.

### 9. Contratti e indipendenza dal fornitore
Titolo: Ho reso il modello AI una dipendenza intercambiabile
Due blocchi:
- **Adattatori LLM.** Un'interfaccia unica; un adattatore per ogni fornitore (OpenAI, Anthropic, modelli locali). Cambiare modello significa cambiare il file `.env`.
- **Contratti condivisi.** `ChartSpec` e `TableSpec` sono definiti una volta come schema zod, modello pydantic e fixture JSON. I test falliscono se le tre versioni divergono.
Frase sotto: Ho scelto di far produrre al modello solo una specifica dichiarativa, non codice di grafica. Il rendering resta deterministico.

### 10. La knowledge base e la pipeline RAG
Titolo: Dal documento alla risposta citata, in cinque passi
Timeline verticale a passi:
1. **Estrazione del testo** da PDF, Word, TXT e Markdown, con controllo del tipo reale del file e della dimensione.
2. **Suddivisione per titoli** in sezioni di circa 600 token con una piccola sovrapposizione.
3. **Embedding** di ogni sezione e scrittura in ChromaDB con i metadati (documento, sezione, categoria).
4. **Ricerca** per similarità con una soglia di distanza: sotto soglia il sistema dice che non trova l'informazione.
5. **Risposta** con le fonti: ogni affermazione porta documento e sezione.
Immagine piccola a lato: `02-documenti-categoria.png`.

### 11. Il data agent
Titolo: L'analisi sui dati è un agente separato, con dati puliti e tracciati
Due colonne:
- **Come funziona.** Un agente LangChain con pandas riceve la domanda e le regole del contratto, scrive ed esegue il codice di analisi, restituisce testo e specifiche di grafici o tabelle.
- **Pulizia dei dati.** Il dataset contiene anomalie inserite da me: duplicati, date in formati diversi, nomi scritti in modi diversi, numeri come testo, valori impossibili. La pulizia è automatica e tracciata nella risposta.
Sotto: I calcoli che diventano soldi (puntualità, penali) usano funzioni fisse e testate, non codice scritto al momento dal modello.

### 12. Dati e documenti di prova
Titolo: Ho generato dati realistici con errori realistici
Due colonne:
- **Storico spedizioni.** 12.240 righe da ottobre 2024 a settembre 2026, 10 clienti, 5 vettori, 2 hub. Circa il 10% delle righe ha anomalie volute. Il generatore è uno script riproducibile.
- **Knowledge base.** 10 documenti in 6 categorie (schede SLA dei clienti, tempi di consegna, condizioni di trasporto, procedura reclami, giacenze, magazzino, qualifica dei vettori, FAQ), più i documenti che si caricano dall'applicazione.
Riga in basso: Clienti, soglie e penali sono definiti in un solo file. Test automatici verificano che dati e documenti dicano la stessa cosa.

### 13. L'interfaccia
Titolo: Una piattaforma per lavorare, non una finestra di chat
Tre immagini affiancate con didascalia breve:
- `01-home.png`: **Home.** Indicatori personali, conversazioni da riprendere, documenti recenti.
- `02-documenti.png`: **Libreria.** Documenti divisi in categorie; il caricamento li indicizza in pochi secondi.
- `03-chiedi-documento.png`: **Chat con ambito.** La chat si limita a un documento o a una categoria, segnalata da un'etichetta corallo.
Frase sotto: Se l'informazione non è nel documento scelto, l'assistente lo dice e propone di cercare ovunque.

### 14. Esempio 1: domanda sui documenti
Titolo: Risposte dalle procedure, con la fonte
- Immagine grande: `04-rag-reclamo.png`
- Didascalia: Una domanda su un reclamo per merce danneggiata. L'assistente consulta la procedura reclami e risponde citando documento e sezione. Un solo strumento usato: la ricerca nei documenti.

### 15. Esempio 2: domanda sui dati
Titolo: Analisi dello storico con grafico interattivo
- Immagine principale: `05-dati-danni-vettore-dettaglio.png`; immagine secondaria: `05-dati-danni-vettore-grafico.png`
- Didascalia: Il tasso di danni per vettore sul 2026. Un vettore è circa quattro volte la media. Il grafico è un componente React: cambio tipo, linea di riferimento, vista tabellare, export CSV.

### 16. Esempio 3: documenti e dati insieme
Titolo: Il caso che giustifica l'approccio ibrido: una penale contrattuale
- Immagini: `06-ibrida-penale-live.png` (piccola, mostra i passi in corso) e `06-ibrida-penale.png` (grande)
- Tre passi numerati, perché sono davvero una sequenza:
  1. Legge la scheda SLA del cliente e le regole comuni di misurazione.
  2. Passa quelle regole al data agent, che calcola puntualità e penale sulle spedizioni del mese.
  3. Risponde con importo, dettaglio del calcolo e fonti contrattuali.
- Numero in evidenza, in corallo: **1.700,00 €** (puntualità 93,27% contro soglia 95%, 1.000 € per punto sotto soglia).
Frase sotto: Senza le regole del contratto il calcolo sarebbe sbagliato: qui l'ordine dei passi è parte del risultato.

### 17. Controllo di costi e qualità
Titolo: Ho reso misurabile quanto costa e come lavora l'assistente
- Immagine principale: `08-admin-dashboard.png`; immagini piccole: `07-admin-home.png`, `09-admin-costi.png`, `10-admin-trace.png`
- Due numeri in evidenza: circa **0,02 €** per richiesta | circa **12 s** di tempo medio di risposta
- Didascalia: La dashboard mostra costi per giorno e per modello, tempi, strumenti usati, risposte segnalate dagli utenti e, per ogni risposta, il dettaglio di ogni chiamata al modello. Gli utenti compaiono con pseudonimi.

### 18. Sicurezza e privacy
Titolo: Ho trattato la sicurezza come requisito, non come aggiunta
Sei punti brevi:
- Accesso con utente e password (cifrate con argon2), ruoli operatore e amministratore, tentativi di accesso limitati.
- Sessione in un cookie non leggibile dagli script.
- Ogni servizio interno accetta solo richieste firmate dal backend (token di 60 secondi).
- File caricati controllati per tipo reale, dimensione e duplicati.
- Nessun dato personale dei destinatari nel dataset; in dashboard gli utenti sono pseudonimi e ogni accesso ai nomi è registrato.
- Il fornitore AI si cambia da configurazione, anche verso soluzioni con dati in Europa.

### 19. Le sfide tecniche
Titolo: Il bug più istruttivo: una penale di 5.000 € invece di 1.700 €
Timeline verticale con quattro cause, ognuna con "Problema" e "Soluzione":
1. **Il modello calcolava prima di leggere il contratto.** Chiedeva documenti e dati in parallelo e il calcolo partiva senza le esclusioni. Soluzione: l'orchestratore rinvia l'analisi finché le regole non sono state lette.
2. **L'analista non vedeva i propri risultati.** Lo strumento Python di LangChain restituiva solo l'ultima istruzione e il modello inventava i numeri. Soluzione: uno strumento che cattura tutto l'output, con test di regressione.
3. **Il ragionamento era spento.** Con gli strumenti attivi, l'API Chat Completions disattiva il ragionamento. Soluzione: un adattatore sulla Responses API, senza toccare il resto.
4. **Una soglia scritta come 95 invece di 0,95.** Soluzione: le funzioni accettano entrambe le forme e rifiutano valori impossibili.
Frase finale in evidenza: I numeri che diventano soldi non dipendono dal codice scritto dal modello.

### 20. Altre sfide e metodo di lavoro
Titolo: Ho trovato i problemi provando il sistema dal vivo e li ho trasformati in test
Tabella a due colonne, Problema | Soluzione:
| Problema | Soluzione |
|---|---|
| "Ultimi 12 mesi" interpretato come i primi 12 mesi dello storico | Periodo dei dati esplicitato all'agente, con esempio |
| Grafico costruito sulla colonna sbagliata o con assi scambiati | Nomi delle colonne documentati; validazione della specifica |
| Grafici duplicati nella stessa risposta | Un grafico con lo stesso titolo sostituisce il precedente, massimo 4 |
| Domande fuori ambito | L'assistente non risponde nel merito e riporta al suo ruolo |
| Grafici come immagini statiche | Componenti React interattivi da specifica JSON |
Frase sotto: Ho lavorato scrivendo i test prima del codice, dove possibile, e correggendo ogni errore trovato con un test che lo riproduce.

### 21. Verifica e risultati
Titolo: Non "sembra funzionare": l'ho misurato
- Numero grande: **417 test automatici** su tutti i servizi (interfaccia, backend, libreria documenti, data agent, dataset, knowledge base), eseguiti a ogni modifica. Test a tre livelli: unitari, di contratto tra servizi, di architettura.
- Numero grande: **20 domande di prova** con il modello reale, divise per tipo: documenti, dati, documenti e dati, chat con ambito, robustezza. Nell'ultima esecuzione completa un solo caso su 20 è fallito, ed è passato in 2 riesecuzioni su 2: è variabilità del modello, ed è il motivo per cui la suite si rilancia a ogni cambio di prompt o di modello.
- Percorso in una riga: prima prova 13/16, dopo le correzioni 16/16, poi nuove domande fino a 20.

### 22. Limiti, sviluppi futuri e conclusioni
Titolo: Cosa ho imparato, cosa manca
Colonna sinistra, "Cosa ho imparato":
- L'orchestrazione conta quanto il modello: l'ordine dei passi cambia il risultato.
- Per i numeri che contano servono funzioni deterministiche, non codice generato.
- Un agente va misurato con domande reali e ripetute, non con una prova felice.
Colonna centrale, "Limiti attuali": dati fittizi e dimensioni contenute; risposte che variano tra una esecuzione e l'altra; un solo fornitore di modello provato dal vivo.
Colonna destra, "Sviluppi": collegamento diretto al gestionale al posto del CSV; report mensili automatici; smistamento delle email di reclamo; accesso con account aziendali.
In fondo, su fondo nero caffè: **Repository:** github.com/AlessiaCattaneoDev/logisticai | Grazie

## Note finali per la generazione
- Mantieni ogni slide leggibile in 30 secondi: titoli che sono conclusioni, poco testo, screenshot grandi.
- Non inventare numeri o funzionalità non presenti in questo testo e non citare i nomi fittizi di clienti o azienda.
- Aggiungi in ogni slide la numerazione di sezione in alto e il numero di pagina in basso.
- Esporta in PDF.
