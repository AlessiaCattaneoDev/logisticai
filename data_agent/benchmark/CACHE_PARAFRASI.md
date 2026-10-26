# Valutazione della cache delle parafrasi

Generato da `data_agent/valutazione_cache.py` il 2026-10-26 con il modello di embedding `openai:text-embedding-3-small`.
60 coppie di **parafrasi** (la cache deve riusare la risposta) e 69 coppie di domande **simili ma con significato diverso** (la cache non deve riusarla: sarebbe una risposta impropria), usate per mettere a punto il lessico, più un insieme di controllo di 30 + 30 coppie mai usato per modificarlo (sezione finale). Le coppie sono in `valutazione_cache.py`.

## Conclusione sulla soglia

- Su entrambi gli insiemi, con la firma le risposte improprie sono **0 su 99** a tutte le soglie misurate (0.5-0.95): a separare le domande è la firma. Con la sola similarità, alla soglia 0.6, sarebbero 92 su 99.
- La soglia decide solo quante parafrasi si riconoscono: alla soglia del servizio (0.6) 79 su 90; a 0.5 sarebbero 83, a 0.8 50.
- Il servizio tiene 0.6 come margine prudenziale contro casi che la firma non conosce: sotto questo valore le coppie hanno poco in comune e il guadagno di richiamo è piccolo.

## Riconoscimento per soglia

| Soglia | Solo similarità: parafrasi riconosciute | Solo similarità: risposte improprie | Firma + similarità: parafrasi riconosciute | Firma + similarità: risposte improprie |
|---:|---:|---:|---:|---:|
| 0.50 | 59/60 (98%) | 67/69 (97%) | 59/60 (98%) | 0/69 (0%) |
| 0.55 | 57/60 (95%) | 67/69 (97%) | 57/60 (95%) | 0/69 (0%) |
| 0.60 **(servizio)** | 56/60 (93%) | 64/69 (93%) | 56/60 (93%) | 0/69 (0%) |
| 0.65 | 56/60 (93%) | 62/69 (90%) | 56/60 (93%) | 0/69 (0%) |
| 0.70 | 49/60 (82%) | 53/69 (77%) | 49/60 (82%) | 0/69 (0%) |
| 0.75 | 47/60 (78%) | 42/69 (61%) | 47/60 (78%) | 0/69 (0%) |
| 0.80 | 35/60 (58%) | 37/69 (54%) | 35/60 (58%) | 0/69 (0%) |
| 0.85 | 19/60 (32%) | 32/69 (46%) | 19/60 (32%) | 0/69 (0%) |
| 0.90 | 3/60 (5%) | 22/69 (32%) | 3/60 (5%) | 0/69 (0%) |
| 0.95 | 2/60 (3%) | 5/69 (7%) | 2/60 (3%) | 0/69 (0%) |

Similarità delle parafrasi: da 0.44 a 1.00 (mediana 0.82). Similarità delle domande diverse: da 0.46 a 0.98 (mediana 0.83). Gli intervalli si sovrappongono: nessuna soglia sulla sola similarità separa i due insiemi.

## Risposte improprie alla soglia del servizio (0.6)

Nessuna.

## Parafrasi non riconosciute alla soglia del servizio (4)

Sono domande che il servizio rianalizza: costano tempo, non danno risposte sbagliate.

- [danni] "Tasso danni per vettore" / "Percentuale di spedizioni danneggiate per corriere" (similarità bassa, 0.44)
- [danni] "Tasso danni per hub" / "Percentuale di danni per ogni magazzino" (similarità bassa, 0.53)
- [puntualita] "Qual è il vettore più puntuale?" / "Quale corriere è il più puntuale?" (similarità bassa, 0.57)
- [reclami] "Importo totale dei reclami per vettore" / "Totale dei rimborsi per ogni corriere" (similarità bassa, 0.55)

## Domande diverse bloccate dalla firma nonostante la similarità alta

Con la sola similarità alla soglia del servizio queste coppie avrebbero ricevuto la stessa risposta.

- 0.98 [periodo] "Puntualità di HUB-VR negli ultimi 6 mesi" / "Puntualità di HUB-VR negli ultimi 3 mesi"
- 0.98 [numero] "Spedizioni con più di 2 tentativi di consegna" / "Spedizioni con più di 3 tentativi di consegna"
- 0.98 [periodo] "ModaNova ha diritto a penali per settembre 2026?" / "ModaNova ha diritto a penali per luglio 2026?"
- 0.96 [numero] "Spedizioni oltre 30 kg per servizio" / "Spedizioni oltre 50 kg per servizio"
- 0.96 [periodo] "Qual è il margine per cliente nel 2026?" / "Qual è il margine per cliente nel 2025?"
- 0.94 [filtro] "Puntualità B2C per regione" / "Puntualità B2B per regione"
- 0.94 [filtro] "Tasso danni a temperatura controllata" / "Tasso danni non a temperatura controllata"
- 0.94 [periodo] "Danni per vettore a gennaio 2026" / "Danni per vettore a febbraio 2026"
- 0.94 [direzione] "Quale vettore ha più danni nel 2026?" / "Quale vettore ha meno danni nel 2026?"
- 0.93 [direzione] "Cliente con il margine più alto" / "Cliente con il margine più basso"
- 0.93 [negazione] "Spedizioni consegnate in ritardo per vettore" / "Spedizioni consegnate non in ritardo per vettore"
- 0.93 [periodo] "Ricavi del primo trimestre 2026" / "Ricavi del secondo trimestre 2026"
- 0.93 [filtro] "Reclami Accolto per vettore" / "Reclami Respinto per vettore"
- 0.93 [numero] "Top 5 clienti per volume" / "Top 3 clienti per volume"
- 0.92 [numero] "Primi 10 clienti per margine" / "Primi 5 clienti per margine"
- 0.92 [negazione] "Quali clienti rispettano lo SLA?" / "Quali clienti non rispettano lo SLA?"
- 0.92 [negazione] "Vettori da sospendere" / "Vettori da non sospendere"
- 0.92 [periodo] "Giacenze nel 2026" / "Giacenze nel 2025"
- 0.92 [filtro] "Puntualità verso il Sud" / "Puntualità verso il Nord"
- 0.91 [ruoli] "Ritardi da HUB-VR a ModaNova" / "Ritardi di ModaNova esclusa HUB-VR"
- 0.90 [misura] "Costo medio per vettore" / "Costo totale per vettore"
- 0.90 [ruoli] "Puntualità di VLX verso il Sud" / "Puntualità verso il Sud escluso VLX"
- 0.89 [direzione] "Hub con più ritardi" / "Hub con meno ritardi"
- 0.88 [hub] "Volumi di HUB-PC nel 2026" / "Volumi di tutti gli hub nel 2026"
- 0.88 [misura] "Importo medio dei reclami" / "Importo totale dei reclami"
- 0.88 [direzione] "Qual è il mese con più giacenze?" / "Qual è il mese con meno giacenze?"
- 0.87 [filtro] "Volumi verso la Sicilia" / "Volumi verso la Sardegna"
- 0.86 [raggruppamento] "Puntualità per cliente" / "Puntualità per cliente e per mese"
- 0.86 [ruoli] "Danni dei vettori per hub" / "Danni degli hub per vettore"
- 0.86 [direzione] "Regione con il costo massimo" / "Regione con il costo minimo"
- 0.85 [direzione] "Qual è il vettore migliore per puntualità?" / "Qual è il vettore peggiore per puntualità?"
- 0.85 [misura] "Peso medio per cliente" / "Peso totale per cliente"
- 0.84 [raggruppamento] "Ricavi per anno" / "Ricavi per trimestre"
- 0.83 [vettore] "Puntualità di PAD per area" / "Puntualità di TRS per area"
- 0.83 [misura] "Numero di danni per vettore" / "Tasso di danni per vettore"
- 0.81 [periodo] "Volumi per cliente nel 2026" / "Volumi per cliente"
- 0.81 [raggruppamento] "Margine per cliente" / "Margine per servizio"
- 0.79 [periodo] "Puntualità per hub negli ultimi 12 mesi" / "Puntualità per hub nei primi 12 mesi"
- 0.79 [filtro] "Spedizioni Smarrita per vettore" / "Spedizioni Reso al mittente per vettore"
- 0.78 [filtro] "Puntualità dell'Express 24h per area" / "Puntualità dello Standard 24/48h per area"
- 0.78 [raggruppamento] "Danni per vettore" / "Danni per vettore e per hub"
- 0.78 [cliente] "ModaNova ha diritto a penali per settembre 2026?" / "TechPoint ha diritto a penali per settembre 2026?"
- 0.74 [metrica] "Puntualità per hub" / "Ritardi per hub"
- 0.74 [raggruppamento] "Ritardi per mese" / "Ritardi per settimana"
- 0.73 [filtro] "Ritardi per Traffico nel 2026" / "Ritardi per Meteo avverso nel 2026"
- 0.72 [raggruppamento] "Tasso di danni per vettore" / "Tasso di danni per cliente"
- 0.72 [hub] "Puntualità di HUB-VR" / "Puntualità di HUB-PC"
- 0.72 [vettore] "Tasso danni per vettore" / "Tasso danni di VLX"
- 0.71 [raggruppamento] "Volumi per regione" / "Volumi per area"
- 0.71 [vettore] "Tasso danni di VLX" / "Tasso danni di SCG"
- 0.71 [misura] "Ritardo medio per vettore" / "Numero di ritardi per vettore"
- 0.70 [metrica] "Volumi per cliente" / "Margine per cliente"
- 0.70 [metrica] "Ritardi per vettore" / "Danni per vettore"
- 0.70 [metrica] "Qual è il margine per cliente?" / "Qual è il ricavo per cliente?"
- 0.69 [raggruppamento] "Motivi di ritardo per area" / "Motivi di ritardo per vettore"
- 0.68 [vettore] "Tasso danni di VeloceExpress" / "Tasso danni di SudCargo"
- 0.68 [metrica] "Qual è il tasso di danni per vettore nel 2026?" / "Qual è la puntualità per vettore nel 2026?"
- 0.68 [raggruppamento] "Puntualità mensile per hub" / "Puntualità mensile per vettore"
- 0.68 [cliente] "Volumi di SportLab per mese" / "Volumi di LibriMondo per mese"
- 0.67 [metrica] "Ricavi per servizio" / "Costi per servizio"
- 0.66 [ruoli] "Clienti serviti da ogni vettore" / "Vettori usati da ogni cliente"
- 0.65 [metrica] "Peso per servizio" / "Volume per servizio"
- 0.64 [cliente] "Puntualità di FarmaSalus nel 2026" / "Puntualità di KidsPlanet nel 2026"
- 0.62 [cliente] "Reclami di BellaPelle Cosmetici" / "Reclami di BrianzaUtensili"

## Verifica su casi nuovi

30 parafrasi e 30 domande diverse scritte DOPO la messa a punto del lessico e mai usate per modificarlo: misurano quanto il risultato regge su domande che il sistema non ha mai visto.

| Strategia (soglia del servizio) | Parafrasi riconosciute | Risposte improprie |
|---|---:|---:|
| Solo similarità | 28/30 (93%) | 28/30 (93%) |
| Firma + similarità | 23/30 (77%) | 0/30 (0%) |

Risposte improprie:

- nessuna

Parafrasi non riconosciute:

- [margine] "Quale servizio ha il margine più basso?" / "Su quale servizio guadagniamo meno?" (firma diversa, 0.66)
- [penali] "GustoItaliano ha diritto a penali per giugno 2026?" / "A giugno 2026 GustoItaliano può chiederci penali?" (firma diversa, 0.84)
- [penali] "Penale di KidsPlanet a maggio 2026" / "Quanto vale la penale di KidsPlanet per maggio 2026?" (firma diversa, 0.85)
- [ritardi] "Ritardo medio per area" / "In media quanti giorni di ritardo ci sono in ogni area?" (firma diversa, 0.56)
- [ritardi] "Quante spedizioni in ritardo per Mezzo guasto?" / "Numero di ritardi dovuti a Mezzo guasto" (firma diversa, 0.80)
- [ritardi] "Motivi di ritardo di TRS" / "Per quali motivi TRS consegna in ritardo?" (firma diversa, 0.75)
- [peso] "Peso medio per area" / "In media quanto pesano le spedizioni in ogni area?" (similarità bassa, 0.58)
