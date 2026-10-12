# Prompt per Claude Design: presentazione LogisticAI

Copia tutto il testo sotto la riga e incollalo in Claude Design. Allega gli screenshot della cartella `presentation/screenshots/` indicati slide per slide. Prima di esportare il PDF sostituisci `[LINK GITHUB]` con l'indirizzo del repository.

---

Crea una presentazione di 16 slide in italiano, formato 16:9, da esportare in PDF.

## Contesto

È la presentazione finale di un progetto: un copilota AI per un'azienda di logistica. La presentazione simula un incontro con la **Direttrice Operations e Key Account di Padana Logistics S.r.l. (Paola Ferretti)**, cioè la persona che deve decidere se adottare lo strumento. Il tono è professionale e concreto: parla di problemi del reparto, soldi, tempi e rischi, e solo dopo di tecnologia. Niente toni da marketing né superlativi.

## Direzione visiva (coerente con l'applicazione)

- Concetto: "documento di trasporto". Fondo grigio cemento `#EEF0F2`, pannelli bianco carta `#FFFFFF`, testo blu ardesia `#1B2430`, testo secondario `#5B6676`, bordi `#D5DAE1`.
- Colore principale: blu container `#1F4E8C`. Giallo segnaletica `#E9B10C` usato **solo** per evidenziare soglie, numeri critici e il "passo in corso" (mai come decorazione). Verde `#2E7D4F` e rosso `#C2362B` solo per esiti positivi e negativi.
- Font: **Archivo** per tutto (titoli in versione semi-condensata, peso bold), **IBM Plex Mono** solo per frammenti di codice e nomi tecnici.
- Gli screenshot sono il materiale più importante: mostrali grandi, con un bordo sottile `#D5DAE1`, senza cornici di dispositivo né ombre pesanti.
- Evita: etichette in maiuscolo, il trattino lungo, frecce nei testi, icone decorative generiche, sfumature, schede tutte uguali. Usa numeri grandi solo dove il numero è davvero il messaggio (es. 1.700 €).
- Elemento ricorrente: una sottile timeline verticale a punti, come il tracking di una spedizione, da usare per i processi a passi (slide 9 e 13).

## Slide

### 1. Copertina
- Titolo: **LogisticAI**
- Sottotitolo: Il copilota AI per Customer Service e Operations di Padana Logistics
- Riga sotto: Progetto finale del Master in AI | Alessia Cattaneo | Ottobre 2026
- Immagine: `01-home.png` (schermata iniziale della chat), ridotta e inclinata leggermente oppure ritagliata a destra.

### 2. Il problema che vivete ogni giorno
Titolo: Ogni risposta al cliente richiede di cercare in un PDF o in un Excel
Tre blocchi brevi:
1. **10 clienti, 10 SLA diversi.** Soglie di puntualità, penali, esclusioni e massimali cambiano da contratto a contratto. Il customer service apre il PDF a ogni chiamata.
2. **Le penali si discutono senza numeri pronti.** Quando un cliente contesta il mese, servono giorni per ricostruire la puntualità dall'Excel. Si rischia di pagare penali non dovute o di perdere la discussione.
3. **I segnali arrivano tardi.** Un hub che rallenta o un vettore che danneggia la merce emergono nel report mensile, settimane dopo.

### 3. Cosa fa LogisticAI
Titolo: Una sola chat per documenti e dati
Tabella a tre righe:
| Chi chiede | Esempio | Cosa usa l'assistente |
|---|---|---|
| Customer service | "Il destinatario ha accettato un collo danneggiato senza riserva: possiamo ancora fare reclamo?" | I documenti aziendali, con la fonte citata |
| Operations | "Qual è il tasso di danni per vettore nel 2026?" | Lo storico di 12.240 spedizioni, con grafico |
| Direzione | "ModaNova ha diritto a penali per settembre?" | Prima le regole del contratto, poi i dati |
Frase sotto la tabella: L'assistente decide da solo quale fonte usare e in che ordine.

### 4. Un esempio che vale soldi
Titolo: ModaNova, settembre 2026: penale dovuta 1.700 €
- A sinistra numero grande in giallo segnaletica: **1.700,00 €**, sotto: puntualità 93,27% contro una soglia SLA del 95%, 1,7 punti sotto soglia, 1.000 € per punto.
- A destra immagine: `04-ibrida-penale-grafico.png` (puntualità mensile 2026 con la soglia del 95%).
- Riquadro in basso, titolo "Il caso di luglio": senza applicare le esclusioni del contratto la puntualità di luglio sembra 91,5% e farebbe scattare una penale. Con le esclusioni previste dallo SLA (destinatario assente, indirizzo errato, meteo avverso) è 95,6%: **nessuna penale dovuta**. LogisticAI applica le regole del contratto, non una media qualsiasi.

### 5. Demo 1: una domanda sui documenti
Titolo: Risposte dalle procedure, con la fonte
- Immagine grande: `02-rag-reclamo.png`
- Didascalia: L'assistente consulta la procedura reclami e risponde in 5 secondi: reclamo ammesso solo per danno occulto, entro 8 giorni dalla consegna. Ogni risposta riporta documento e sezione.

### 6. Demo 2: una domanda sui dati
Titolo: Analisi dello storico con grafico interattivo
- Immagine principale: `03-dati-danni-vettore-dettaglio.png`; immagine secondaria piccola: `03-dati-danni-vettore-grafico.png`
- Didascalia: VeloceExpress (VLX) ha un tasso di danni del 3,48%, circa 4 volte la media. Il grafico è interattivo: cambio tipo, linea di riferimento, vista tabellare ed export CSV per Excel.

### 7. Demo 3: documenti e dati insieme
Titolo: La domanda che prima richiedeva giorni
- Immagini: `04-ibrida-penale-live.png` (piccola, a sinistra, mostra i passi in corso) e `04-ibrida-penale.png` (grande, a destra)
- Tre passi numerati, perché sono davvero una sequenza:
  1. Legge la scheda SLA di ModaNova e le regole comuni di misurazione.
  2. Passa quelle regole all'analista dati, che calcola puntualità e penale sulle 109 spedizioni del mese.
  3. Risponde con importo, dettaglio del calcolo e fonti contrattuali, in circa 15 secondi.

### 8. Come è costruito
Titolo: Quattro servizi indipendenti, una decisione al centro
Disegna uno schema orizzontale con questi blocchi e frecce:
- **Interfaccia React** (chat e dashboard) -> freccia "domanda" -> **Orchestratore Node.js**
- Al centro dell'orchestratore un nodo evidenziato in giallo segnaletica: **"L'LLM decide"**, con la scritta "quale strumento, in che ordine, con quali parametri".
- Dal nodo partono due frecce:
  - verso **Knowledge base (ChromaDB)**: "cerca nei documenti"
  - verso **Analista dati Python (pandas agent)**: "analizza le spedizioni", che a sua volta legge `spedizioni.csv`
- Freccia di ritorno all'interfaccia: "risposta, fonti, grafici".
- Sotto, in piccolo: Database delle conversazioni e dei costi (SQLite). Modello AI configurabile: OpenAI, Claude o modello locale, senza cambiare il codice.
Nota a piè di slide: I servizi comunicano solo via HTTP; l'analista dati accetta richieste solo dall'orchestratore, con un token che scade dopo 60 secondi.

### 9. Il ragionamento, passo per passo
Titolo: Ragiona, agisce, osserva, poi risponde
Timeline verticale (stile tracking) con quattro punti:
1. **Ragiona:** "Per sapere se c'è una penale mi servono le regole del contratto."
2. **Agisce:** cerca nella knowledge base la scheda SLA di ModaNova.
3. **Osserva e agisce di nuovo:** con soglia, penale ed esclusioni trovate, chiede l'analisi all'analista dati.
4. **Risponde:** importo, calcolo e fonti.
Frase finale: Se il modello prova a calcolare prima di aver letto le regole, il sistema glielo impedisce: la sequenza è garantita dal codice, non solo suggerita.

### 10. Dati e documenti
Titolo: Dati realistici, con gli errori dei dati veri
Due colonne:
- **Storico spedizioni:** 12.240 righe, ottobre 2024 - settembre 2026, 10 clienti, 5 vettori, 2 hub. Circa il 10% delle righe ha anomalie inserite apposta: duplicati, date in formati diversi, nomi scritti in modi diversi, numeri come testo, valori impossibili. La pulizia è automatica e tracciata: 240 duplicati rimossi, 477 date convertite, 76 vettori mancanti ricostruiti, 11.987 righe analizzabili.
- **Knowledge base:** 10 documenti, 16 pagine: schede SLA dei clienti, tempi di consegna, condizioni di trasporto, procedura reclami, giacenze, magazzino, merci pericolose, qualifica dei vettori, FAQ.
Riga in basso: Clienti, soglie e penali sono definiti in un unico file: test automatici verificano che dati e documenti dicano la stessa cosa.

### 11. Controllo dei costi e della qualità
Titolo: Sapete sempre quanto costa e quanto funziona
- Immagine principale: `05-admin-panoramica.png`; immagini piccole: `06-admin-costi.png` e `07-admin-trace.png`
- Tre numeri in evidenza: **0,016 €** costo medio per risposta | **13,5 s** tempo medio di risposta | **1,43 €** costo totale di tutte le prove fatte durante lo sviluppo
- Didascalia: La dashboard mostra costi per giorno e per modello, tempi di risposta, quali strumenti l'assistente ha usato, le risposte segnalate dagli utenti con 👎 e, per ogni risposta, il dettaglio tecnico di ogni chiamata.

### 12. Sicurezza e privacy
Titolo: Pronto per un'azienda vera
Elenco di sei punti brevi:
- Accesso con utente e password, ruoli operatore e amministratore.
- Password cifrate, sessione in un cookie non leggibile dagli script, tentativi di accesso limitati.
- Ogni servizio interno accetta solo richieste firmate dall'orchestratore.
- Nessun dato personale dei destinatari nel dataset.
- In dashboard gli utenti sono pseudonimi; mostrare i nomi o aprire una conversazione viene registrato nel registro accessi.
- Il fornitore AI si cambia da configurazione, anche verso soluzioni con dati in Europa.

### 13. Le sfide tecniche e come le ho risolte
Titolo: Il bug più istruttivo: una penale di 5.000 € invece di 1.700 €
Timeline verticale con quattro cause, ognuna con "Problema" e "Soluzione":
1. **Il modello calcolava prima di leggere il contratto.** Chiedeva documenti e dati in parallelo e il calcolo partiva senza esclusioni (89,8% invece di 93,3%). Soluzione: l'orchestratore rinvia l'analisi finché le regole non sono state lette.
2. **L'analista non vedeva i propri risultati.** Lo strumento Python di LangChain restituiva solo l'output dell'ultima istruzione: il modello, senza numeri, li inventava. Soluzione: uno strumento che cattura tutto l'output, con test di regressione.
3. **Il ragionamento era spento.** Con gli strumenti attivi, l'API Chat Completions di OpenAI disattiva il ragionamento del modello. Soluzione: un nuovo adattatore sulla Responses API, senza toccare il resto del sistema.
4. **Una soglia scritta come 95 invece di 0,95.** Soluzione: le funzioni che calcolano penali accettano entrambe le forme e rifiutano valori impossibili.
Frase finale in evidenza: I numeri che diventano soldi non dipendono dal codice scritto dall'AI: si calcolano con funzioni fisse e testate.

### 14. Altre sfide affrontate
Titolo: Problemi trovati provando il sistema dal vivo
Tabella a due colonne, Problema | Soluzione:
| Problema | Soluzione |
|---|---|
| "Ultimi 12 mesi" interpretato come i primi 12 mesi dello storico | Periodo dei dati esplicitato all'analista, con esempio |
| Grafico costruito sulla colonna sbagliata | Nomi delle colonne documentati, mai la posizione |
| Grafici duplicati nella stessa risposta | Un grafico con lo stesso titolo sostituisce il precedente, massimo 4 |
| Risposte senza i numeri chiave | Istruzione di citare sempre valori e casi critici |
| Domande fuori ambito ("capitale della Francia") | L'assistente non risponde nel merito e riporta al suo ruolo |
| Grafici come immagini statiche | Grafici React interattivi generati da una specifica JSON: una scelta di prodotto rispetto alle immagini matplotlib suggerite dal brief |

### 15. Qualità misurata
Titolo: Non "sembra funzionare": lo misuriamo
- Numero grande: **17/17** domande di prova superate con il modello reale (documenti 4/4, dati 4/4, documenti e dati 6/6, robustezza 3/3).
- Percorso in una riga: prima prova 13/16, dopo le correzioni 16/16, dopo la nuova domanda di regressione 17/17.
- Secondo numero: **366 test automatici** su tutti i servizi (interfaccia, orchestratore, analista dati, dataset, knowledge base), eseguiti a ogni modifica.
- Frase: Ogni cambio di prompt o di modello AI si verifica rilanciando la stessa suite.

### 16. Valore e prossimi passi
Titolo: Cosa cambia per Padana Logistics
Colonna sinistra, "Valore":
- Risposte su contratti e procedure in pochi secondi, anche per chi è appena arrivato.
- Penali verificate con le regole del contratto prima di discuterle con il cliente.
- Vettori critici individuati subito, non a fine mese.
- Costo dell'AI visibile e sotto controllo: circa 2 centesimi a risposta.
Colonna destra, "Prossimi passi":
- Collegamento diretto al gestionale trasporti al posto del CSV.
- Report SLA mensile automatico per ogni cliente.
- Smistamento delle email di reclamo con bozza di risposta.
- Accesso con gli account aziendali Microsoft o Google.
In fondo: **Repository:** [LINK GITHUB] | Grazie

## Note finali per la generazione
- Mantieni ogni slide leggibile in 30 secondi: titoli brevi, testo dove serve, screenshot grandi.
- Non inventare numeri o funzionalità non presenti in questo testo.
- Esporta in PDF.
