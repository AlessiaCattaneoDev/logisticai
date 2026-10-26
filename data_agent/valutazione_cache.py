"""Valutazione della cache delle parafrasi su un insieme ampio di coppie etichettate.

Due insiemi:
- PARAFRASI: stessa domanda scritta in modo diverso -> la cache DEVE riusare la risposta (richiamo);
- DIVERSE:   domande simili ma con significato diverso -> la cache NON deve riusarla (risposte improprie).

Per ogni soglia si confrontano due strategie: solo similarità degli embedding e firma + similarità
(quella usata dal servizio). Il report dice quante parafrasi vengono riconosciute e, soprattutto,
quante risposte improprie si darebbero: l'obiettivo è zero risposte improprie.

Uso:  .venv/bin/python valutazione_cache.py     # embedding reali dal .env, scrive benchmark/CACHE_PARAFRASI.md
"""
from __future__ import annotations

import math
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from cache import normalizza
from firma import calcola_firma, confrontabile

SERVICE_DIR = Path(__file__).resolve().parent
OUTPUT = SERVICE_DIR / "benchmark" / "CACHE_PARAFRASI.md"
SOGLIE = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]

# (categoria, domanda già in cache, nuova domanda)
PARAFRASI: list[tuple[str, str, str]] = [
    ("margine", "Qual è il margine per cliente nel 2026?", "Quanto guadagniamo su ogni cliente nel 2026?"),
    ("margine", "Qual è il margine per cliente?", "margine di ciascun cliente"),
    ("margine", "Margine per cliente nel 2026", "Nel 2026 qual è la redditività di ogni cliente?"),
    ("margine", "Quali clienti sono in perdita?", "Ci sono clienti su cui perdiamo soldi?"),
    ("margine", "Margine di CasaViva Arredo nel 2026", "Quanto guadagniamo con CasaViva nel 2026?"),
    ("margine", "Qual è il margine per servizio?", "Che margine fa ogni servizio?"),
    ("ricavi", "Ricavi per cliente nel 2025", "Quanto fatturiamo con ciascun cliente nel 2025?"),
    ("ricavi", "Qual è il fatturato mensile del 2026?", "Ricavi mese per mese nel 2026"),
    ("costi", "Costo di trasporto per vettore", "Quanto spendiamo per ogni vettore?"),
    ("costi", "Costo medio per spedizione per servizio", "Per ogni servizio, quanto costa in media una spedizione?"),
    ("danni", "Qual è il tasso di danni per vettore nel 2026?", "Nel 2026 quanti danni fa ogni vettore, in percentuale?"),
    ("danni", "Tasso danni per vettore", "Percentuale di spedizioni danneggiate per corriere"),
    ("danni", "Quale vettore ha più danni nel 2026?", "Nel 2026 qual è il corriere con più danni?"),
    ("danni", "Danni di VLX mese per mese", "Andamento mensile dei danni di VLX"),
    ("danni", "Tasso danni per hub", "Percentuale di danni per ogni magazzino"),
    ("danni", "Quanti danni ha avuto ModaNova nel 2026?", "Numero di danni su ModaNova nel 2026"),
    ("penali", "ModaNova ha diritto a penali per settembre 2026?", "A settembre 2026 dobbiamo pagare penali a ModaNova?"),
    ("penali", "ModaNova ha diritto a penali per settembre 2026?", "Penale SLA di ModaNova a settembre 2026"),
    ("penali", "Quanto dobbiamo di penale a TechPoint per agosto 2026?", "Penale di TechPoint ad agosto 2026: a quanto ammonta?"),
    ("penali", "FarmaSalus rispetta lo SLA a luglio 2026?", "A luglio 2026 lo SLA di FarmaSalus è rispettato?"),
    ("puntualita", "Puntualità mensile per hub", "Mostrami la puntualità di ogni hub mese per mese"),
    ("puntualita", "Puntualità per cliente nel 2026", "Nel 2026 qual è la puntualità di ciascun cliente?"),
    ("puntualita", "Puntualità di HUB-VR negli ultimi 6 mesi", "Negli ultimi 6 mesi com'è la puntualità di HUB-VR?"),
    ("puntualita", "Qual è il vettore più puntuale?", "Quale corriere è il più puntuale?"),
    ("puntualita", "Puntualità del servizio Express 24h per area", "Per ogni area, puntualità dell'Express 24h"),
    ("puntualita", "Puntualità B2C per regione", "Per regione, puntualità delle consegne B2C"),
    ("ritardi", "Quali sono i motivi di ritardo più frequenti?", "Per quali cause arrivano più spesso in ritardo le spedizioni?"),
    ("ritardi", "Motivi di ritardo per area di destinazione", "Per ogni area di destinazione, perché arrivano in ritardo?"),
    ("ritardi", "Ritardo medio in giorni per vettore", "Di quanti giorni in media ritarda ogni vettore?"),
    ("ritardi", "Quante spedizioni in ritardo per Traffico nel 2026?", "Nel 2026 quante spedizioni sono arrivate tardi per Traffico?"),
    ("ritardi", "Ritardi per Meteo avverso mese per mese", "Andamento mensile dei ritardi per Meteo avverso"),
    ("giacenze", "Quante giacenze per Destinatario assente nel 2025?", "Nel 2025 quante giacenze ci sono state per Destinatario assente?"),
    ("giacenze", "Giacenze per mese nel 2026", "Andamento mensile delle giacenze nel 2026"),
    ("giacenze", "Tentativi di consegna medi per area", "In media quanti tentativi di consegna servono in ogni area?"),
    ("reclami", "Reclami per cliente nel 2026", "Nel 2026 quanti reclami ha fatto ogni cliente?"),
    ("reclami", "Importo totale dei reclami per vettore", "Totale dei rimborsi per ogni corriere"),
    ("reclami", "Reclami Accolto per vettore", "Per ogni vettore, i reclami con esito Accolto"),
    ("volumi", "Volumi per cliente nel 2026", "Volume di spedizioni di ciascun cliente nel 2026"),
    ("volumi", "Top 5 clienti per volume", "I 5 clienti con più volume"),
    ("volumi", "Volumi mensili di HUB-PC", "Volume di HUB-PC mese per mese"),
    ("volumi", "Volume per regione nel 2025", "Nel 2025 che volume ha avuto ogni regione?"),
    ("peso", "Peso medio per servizio", "Quanto pesa in media una spedizione per ogni servizio?"),
    ("peso", "Peso totale spedito per cliente nel 2026", "Nel 2026 quanti kg ha spedito in totale ogni cliente?"),
    ("qualifica", "Secondo la procedura di qualifica, qualche subvettore andrebbe sospeso?", "Ci sono subvettori da sospendere secondo la qualifica?"),
    ("qualifica", "Quali vettori vanno sospesi?", "Vettori da sospendere"),
    ("resa", "L'Express 24h verso il Sud rispetta i tempi di resa?", "Verso il Sud l'Express 24h rispetta i tempi di resa?"),
    ("resa", "Tempi di resa dello Standard 24/48h per area", "Per ogni area, tempi di resa dello Standard 24/48h"),
    ("smarrite", "Quante spedizioni Smarrita per vettore nel 2026?", "Nel 2026 quante spedizioni Smarrita ha ogni vettore?"),
    ("temperatura", "Tasso danni delle spedizioni a temperatura controllata", "Percentuale di danni sulle spedizioni a temperatura controllata"),
    ("forma", "Margine per cliente nel 2026", "MARGINE PER CLIENTE NEL 2026!!!"),
    ("forma", "Tasso danni per vettore nel 2026", "tasso di danni per vettore nel 2026?"),
    ("forma", "Puntualità di ModaNova a settembre 2026", "Puntualità ModaNova, settembre 2026"),
    ("forma", "Volumi per hub nel 2026", "volumi per hub 2026"),
    ("ordine", "Puntualità di ModaNova nel 2026 per mese", "Per mese, la puntualità 2026 di ModaNova"),
    ("ordine", "Danni per vettore nel 2026", "Nel 2026, danni per vettore"),
    ("ordine", "Margine 2026 per servizio", "Per servizio, il margine del 2026"),
    ("richiesta", "Margine per cliente nel 2026", "Fammi vedere il margine per cliente nel 2026"),
    ("richiesta", "Tasso danni per vettore", "Mi mostri il tasso danni per vettore?"),
    ("richiesta", "Puntualità per hub nel 2026", "Vorrei sapere la puntualità per hub nel 2026"),
    ("richiesta", "Volumi mensili 2026", "Puoi calcolarmi i volumi mensili del 2026?"),
]

DIVERSE: list[tuple[str, str, str]] = [
    ("periodo", "ModaNova ha diritto a penali per settembre 2026?", "ModaNova ha diritto a penali per luglio 2026?"),
    ("periodo", "Qual è il margine per cliente nel 2026?", "Qual è il margine per cliente nel 2025?"),
    ("periodo", "Puntualità di HUB-VR negli ultimi 6 mesi", "Puntualità di HUB-VR negli ultimi 3 mesi"),
    ("periodo", "Danni per vettore a gennaio 2026", "Danni per vettore a febbraio 2026"),
    ("periodo", "Volumi per cliente nel 2026", "Volumi per cliente"),
    ("periodo", "Puntualità per hub negli ultimi 12 mesi", "Puntualità per hub nei primi 12 mesi"),
    ("periodo", "Ricavi del primo trimestre 2026", "Ricavi del secondo trimestre 2026"),
    ("periodo", "Giacenze nel 2026", "Giacenze nel 2025"),
    ("cliente", "ModaNova ha diritto a penali per settembre 2026?", "TechPoint ha diritto a penali per settembre 2026?"),
    ("cliente", "Margine di CasaViva Arredo", "Margine di GustoItaliano"),
    ("cliente", "Puntualità di FarmaSalus nel 2026", "Puntualità di KidsPlanet nel 2026"),
    ("cliente", "Volumi di SportLab per mese", "Volumi di LibriMondo per mese"),
    ("cliente", "Reclami di BellaPelle Cosmetici", "Reclami di BrianzaUtensili"),
    ("cliente", "Margine per cliente", "Margine di ModaNova"),
    ("vettore", "Tasso danni di VLX", "Tasso danni di SCG"),
    ("vettore", "Puntualità di PAD per area", "Puntualità di TRS per area"),
    ("vettore", "Tasso danni di VeloceExpress", "Tasso danni di SudCargo"),  # nomi non presenti nei dati
    ("vettore", "Tasso danni per vettore", "Tasso danni di VLX"),
    ("hub", "Puntualità di HUB-VR", "Puntualità di HUB-PC"),
    ("hub", "Volumi di HUB-PC nel 2026", "Volumi di tutti gli hub nel 2026"),
    ("filtro", "Puntualità B2C per regione", "Puntualità B2B per regione"),
    ("filtro", "Puntualità dell'Express 24h per area", "Puntualità dello Standard 24/48h per area"),
    ("filtro", "Ritardi per Traffico nel 2026", "Ritardi per Meteo avverso nel 2026"),
    ("filtro", "Spedizioni Smarrita per vettore", "Spedizioni Reso al mittente per vettore"),
    ("filtro", "Reclami Accolto per vettore", "Reclami Respinto per vettore"),
    ("filtro", "Puntualità verso il Sud", "Puntualità verso il Nord"),
    ("filtro", "Volumi verso la Sicilia", "Volumi verso la Sardegna"),
    ("filtro", "Tasso danni a temperatura controllata", "Tasso danni non a temperatura controllata"),
    ("filtro", "Margine del servizio Isole", "Margine del servizio Voluminoso"),
    ("direzione", "Quale vettore ha più danni nel 2026?", "Quale vettore ha meno danni nel 2026?"),
    ("direzione", "Qual è il vettore migliore per puntualità?", "Qual è il vettore peggiore per puntualità?"),
    ("direzione", "Cliente con il margine più alto", "Cliente con il margine più basso"),
    ("direzione", "Hub con più ritardi", "Hub con meno ritardi"),
    ("direzione", "Qual è il mese con più giacenze?", "Qual è il mese con meno giacenze?"),
    ("direzione", "Regione con il costo massimo", "Regione con il costo minimo"),
    ("negazione", "Quali clienti rispettano lo SLA?", "Quali clienti non rispettano lo SLA?"),
    ("negazione", "Spedizioni consegnate in ritardo per vettore", "Spedizioni consegnate non in ritardo per vettore"),
    ("negazione", "Vettori da sospendere", "Vettori da non sospendere"),
    ("numero", "Top 5 clienti per volume", "Top 3 clienti per volume"),
    ("numero", "Primi 10 clienti per margine", "Primi 5 clienti per margine"),
    ("numero", "Spedizioni con più di 2 tentativi di consegna", "Spedizioni con più di 3 tentativi di consegna"),
    ("numero", "Spedizioni oltre 30 kg per servizio", "Spedizioni oltre 50 kg per servizio"),
    ("metrica", "Qual è il margine per cliente?", "Qual è il ricavo per cliente?"),
    ("metrica", "Qual è il tasso di danni per vettore nel 2026?", "Qual è la puntualità per vettore nel 2026?"),
    ("metrica", "Ricavi per servizio", "Costi per servizio"),
    ("metrica", "Ritardi per vettore", "Danni per vettore"),
    ("metrica", "Giacenze per area", "Reclami per area"),
    ("metrica", "Volumi per cliente", "Margine per cliente"),
    ("metrica", "Peso per servizio", "Volume per servizio"),
    ("metrica", "Puntualità per hub", "Ritardi per hub"),
    ("misura", "Costo medio per vettore", "Costo totale per vettore"),
    ("misura", "Peso medio per cliente", "Peso totale per cliente"),
    ("misura", "Numero di danni per vettore", "Tasso di danni per vettore"),
    ("misura", "Ritardo medio per vettore", "Numero di ritardi per vettore"),
    ("misura", "Importo medio dei reclami", "Importo totale dei reclami"),
    ("raggruppamento", "Puntualità mensile per hub", "Puntualità mensile per vettore"),
    ("raggruppamento", "Tasso di danni per vettore", "Tasso di danni per cliente"),
    ("raggruppamento", "Margine per cliente", "Margine per servizio"),
    ("raggruppamento", "Volumi per regione", "Volumi per area"),
    ("raggruppamento", "Ritardi per mese", "Ritardi per settimana"),
    ("raggruppamento", "Puntualità per cliente", "Puntualità per cliente e per mese"),
    ("raggruppamento", "Danni per vettore", "Danni per vettore e per hub"),
    ("raggruppamento", "Giacenze per area", "Giacenze per tipo di destinatario"),
    ("raggruppamento", "Ricavi per anno", "Ricavi per trimestre"),
    ("raggruppamento", "Motivi di ritardo per area", "Motivi di ritardo per vettore"),
    ("ruoli", "Clienti serviti da ogni vettore", "Vettori usati da ogni cliente"),
    ("ruoli", "Danni dei vettori per hub", "Danni degli hub per vettore"),
    ("ruoli", "Puntualità di VLX verso il Sud", "Puntualità verso il Sud escluso VLX"),
    ("ruoli", "Ritardi da HUB-VR a ModaNova", "Ritardi di ModaNova esclusa HUB-VR"),
]


# Insieme di CONTROLLO: scritto dopo la messa a punto del lessico e mai usato per modificarlo.
# Misura quanto il risultato regge su domande nuove (rischio di aver adattato il lessico ai casi sopra).
PARAFRASI_CONTROLLO: list[tuple[str, str, str]] = [
    ("margine", "Margine per hub nel 2026", "Nel 2026 quanto guadagna ciascun hub?"),
    ("margine", "Quale servizio ha il margine più basso?", "Su quale servizio guadagniamo meno?"),
    ("ricavi", "Ricavi totali per vettore nel 2025", "Fatturato complessivo di ogni vettore nel 2025"),
    ("costi", "Costi di trasporto mensili nel 2026", "Mese per mese, quanto abbiamo speso in trasporto nel 2026?"),
    ("danni", "Tasso danni per servizio", "Percentuale di danni per ogni servizio"),
    ("danni", "Quale hub ha più danni?", "Il magazzino con più danni qual è?"),
    ("danni", "Danni di SCG nel 2025", "Nel 2025 quanti danni ha fatto SCG?"),
    ("penali", "GustoItaliano ha diritto a penali per giugno 2026?", "A giugno 2026 GustoItaliano può chiederci penali?"),
    ("penali", "Penale di KidsPlanet a maggio 2026", "Quanto vale la penale di KidsPlanet per maggio 2026?"),
    ("puntualita", "Puntualità per area nel 2026", "Nel 2026 qual è la puntualità di ogni area?"),
    ("puntualita", "Puntualità mensile di SportLab", "Andamento della puntualità di SportLab mese per mese"),
    ("puntualita", "Puntualità del servizio Isole", "Quanto è puntuale il servizio Isole?"),
    ("ritardi", "Ritardo medio per area", "In media quanti giorni di ritardo ci sono in ogni area?"),
    ("ritardi", "Quante spedizioni in ritardo per Mezzo guasto?", "Numero di ritardi dovuti a Mezzo guasto"),
    ("ritardi", "Motivi di ritardo di TRS", "Per quali motivi TRS consegna in ritardo?"),
    ("giacenze", "Giacenze per cliente nel 2026", "Nel 2026 quante giacenze ha avuto ciascun cliente?"),
    ("giacenze", "Giacenze per Indirizzo errato per area", "Per ogni area, le giacenze per Indirizzo errato"),
    ("reclami", "Reclami per mese nel 2025", "Andamento mensile dei reclami nel 2025"),
    ("reclami", "Reclami Respinto per cliente", "Per ogni cliente, i reclami con esito Respinto"),
    ("volumi", "Volumi per servizio nel 2026", "Nel 2026 che volume ha fatto ciascun servizio?"),
    ("volumi", "Volumi verso la Lombardia per mese", "Volume mese per mese verso la Lombardia"),
    ("peso", "Peso medio per area", "In media quanto pesano le spedizioni in ogni area?"),
    ("qualifica", "Quali subvettori sono da sospendere?", "Subvettori da sospendere"),
    ("forma", "Puntualità per vettore nel 2026", "PUNTUALITÀ PER VETTORE NEL 2026"),
    ("richiesta", "Margine per servizio", "Mi fai vedere il margine per servizio?"),
    ("richiesta", "Danni per hub nel 2026", "Vorrei vedere i danni per hub nel 2026"),
    ("ordine", "Volumi 2026 per area", "Per area, i volumi del 2026"),
    ("ordine", "Puntualità di TechPoint per mese nel 2026", "Nel 2026, per mese, la puntualità di TechPoint"),
    ("smarrite", "Spedizioni Smarrita per hub", "Per ogni hub, le spedizioni Smarrita"),
    ("temperatura", "Ritardi delle spedizioni a temperatura controllata", "Spedizioni a temperatura controllata in ritardo"),
]
DIVERSE_CONTROLLO: list[tuple[str, str, str]] = [
    ("periodo", "GustoItaliano ha diritto a penali per giugno 2026?", "GustoItaliano ha diritto a penali per giugno 2025?"),
    ("periodo", "Margine per hub nel 2026", "Margine per hub a marzo 2026"),
    ("periodo", "Puntualità per area negli ultimi 3 mesi", "Puntualità per area negli ultimi 9 mesi"),
    ("periodo", "Reclami di ottobre 2025", "Reclami di novembre 2025"),
    ("cliente", "Penale di KidsPlanet a maggio 2026", "Penale di SportLab a maggio 2026"),
    ("cliente", "Giacenze di LibriMondo", "Giacenze di FarmaSalus"),
    ("vettore", "Danni di SCG nel 2025", "Danni di PAD nel 2025"),
    ("vettore", "Motivi di ritardo di TRS", "Motivi di ritardo di ISX"),
    ("hub", "Margine di HUB-PC", "Margine di HUB-VR"),
    ("filtro", "Puntualità del servizio Isole", "Puntualità del servizio Voluminoso"),
    ("filtro", "Volumi verso la Lombardia", "Volumi verso il Veneto"),
    ("filtro", "Giacenze per Indirizzo errato", "Giacenze per Destinatario assente"),
    ("filtro", "Reclami Respinto per cliente", "Reclami In corso per cliente"),
    ("filtro", "Ritardi verso le Isole", "Ritardi verso il Centro"),
    ("filtro", "Puntualità B2B nel 2026", "Puntualità nel 2026"),
    ("direzione", "Quale hub ha più danni?", "Quale hub ha meno danni?"),
    ("direzione", "Servizio con il margine più basso", "Servizio con il margine più alto"),
    ("direzione", "Il cliente più puntuale", "Il cliente meno puntuale"),
    ("direzione", "Area peggiore per ritardi", "Area migliore per ritardi"),
    ("negazione", "Spedizioni a temperatura controllata in ritardo", "Spedizioni non a temperatura controllata in ritardo"),
    ("negazione", "Clienti che hanno diritto a penali", "Clienti che non hanno diritto a penali"),
    ("numero", "Top 10 vettori per volume", "Top 2 vettori per volume"),
    ("numero", "Spedizioni con più di 5 colli", "Spedizioni con più di 10 colli"),
    ("metrica", "Margine per hub", "Costi per hub"),
    ("metrica", "Reclami per mese", "Giacenze per mese"),
    ("metrica", "Peso medio per area", "Ritardo medio per area"),
    ("misura", "Ricavo medio per servizio", "Ricavo totale per servizio"),
    ("raggruppamento", "Volumi per servizio", "Volumi per hub"),
    ("raggruppamento", "Reclami per mese", "Reclami per anno"),
    ("raggruppamento", "Puntualità per area", "Puntualità per area e per vettore"),
]


@dataclass
class Esito:
    categoria: str
    a: str
    b: str
    firma_uguale: bool
    similarita: float


def _coseno(a: list[float], b: list[float]) -> float:
    num = sum(x * y for x, y in zip(a, b))
    return num / (math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)))


def valuta(coppie: Iterable[tuple[str, str, str]], embed_batch: Callable[[list[str]], list[list[float]]],
           entita: Iterable[str] | Mapping[str, str] = ()) -> list[Esito]:
    coppie = list(coppie)
    mappa = dict(entita) if isinstance(entita, Mapping) else {e: e for e in entita}
    entita = {normalizza(k): normalizza(v) for k, v in mappa.items()}  # come CacheAnalisi
    testi = sorted({normalizza(t) for _, a, b in coppie for t in (a, b)})
    vettori = dict(zip(testi, embed_batch(testi)))
    esiti = []
    for cat, a, b in coppie:
        na, nb = normalizza(a), normalizza(b)
        fa, fb = calcola_firma(na, entita), calcola_firma(nb, entita)
        # Come CacheAnalisi.cerca: si confronta solo se la nuova domanda è confrontabile.
        esiti.append(Esito(cat, a, b, fa == fb and confrontabile(fb), _coseno(vettori[na], vettori[nb])))
    return esiti


def conteggi(parafrasi: list[Esito], diverse: list[Esito], soglia: float, con_firma: bool) -> tuple[int, int]:
    """(parafrasi riconosciute, risposte improprie) a una soglia."""
    riusa = lambda e: e.similarita >= soglia and (e.firma_uguale or not con_firma)  # noqa: E731
    return sum(map(riusa, parafrasi)), sum(map(riusa, diverse))


def conclusione(parafrasi: list[Esito], diverse: list[Esito], soglia: float,
                controllo: tuple[list[Esito], list[Esito]] | None) -> list[str]:
    insiemi = [(parafrasi, diverse)] + ([controllo] if controllo else [])
    improprie_firma = {s: sum(conteggi(p, d, s, True)[1] for p, d in insiemi) for s in SOGLIE}
    improprie_sim = sum(conteggi(p, d, soglia, False)[1] for p, d in insiemi)
    tot_d = sum(len(d) for _, d in insiemi)
    tot_p = sum(len(p) for p, _ in insiemi)
    riconosciute = {s: sum(conteggi(p, d, s, True)[0] for p, d in insiemi) for s in SOGLIE}
    out = []
    if all(v == 0 for v in improprie_firma.values()):
        out.append(f"- Su entrambi gli insiemi, con la firma le risposte improprie sono **0 su {tot_d}** a tutte le soglie misurate ({SOGLIE[0]:g}-{SOGLIE[-1]:g}): "
                   f"a separare le domande è la firma. Con la sola similarità, alla soglia {soglia:g}, sarebbero {improprie_sim} su {tot_d}.")
    else:
        sicure = [s for s, v in improprie_firma.items() if v == 0]
        out.append(f"- Con la firma ci sono risposte improprie sotto la soglia {min(sicure) if sicure else '-'}: "
                   + ", ".join(f"{s:g}: {v}" for s, v in improprie_firma.items() if v))
    out.append(f"- La soglia decide solo quante parafrasi si riconoscono: alla soglia del servizio ({soglia:g}) "
               f"{riconosciute.get(soglia, 0)} su {tot_p}; a {SOGLIE[0]:g} sarebbero {riconosciute[SOGLIE[0]]}, a 0.8 {riconosciute.get(0.8, 0)}.")
    out.append(f"- Il servizio tiene {soglia:g} come margine prudenziale contro casi che la firma non conosce: sotto questo valore "
               "le coppie hanno poco in comune e il guadagno di richiamo è piccolo.")
    return out


def report_markdown(parafrasi: list[Esito], diverse: list[Esito], soglia_servizio: float, modello: str,
                    controllo: tuple[list[Esito], list[Esito]] | None = None) -> str:
    np_, nd = len(parafrasi), len(diverse)
    out = [
        "# Valutazione della cache delle parafrasi", "",
        f"Generato da `data_agent/valutazione_cache.py` il {date.today().isoformat()} con il modello di embedding `{modello}`.",
        f"{np_} coppie di **parafrasi** (la cache deve riusare la risposta) e {nd} coppie di domande **simili ma con significato "
        "diverso** (la cache non deve riusarla: sarebbe una risposta impropria), usate per mettere a punto il lessico, "
        "più un insieme di controllo di 30 + 30 coppie mai usato per modificarlo (sezione finale). Le coppie sono in `valutazione_cache.py`.", "",
        "## Conclusione sulla soglia", "",
        *conclusione(parafrasi, diverse, soglia_servizio, controllo), "",
        "## Riconoscimento per soglia", "",
        "| Soglia | Solo similarità: parafrasi riconosciute | Solo similarità: risposte improprie | Firma + similarità: parafrasi riconosciute | Firma + similarità: risposte improprie |",
        "|---:|---:|---:|---:|---:|",
    ]
    for s in SOGLIE:
        pe, de = conteggi(parafrasi, diverse, s, False)
        pf, df = conteggi(parafrasi, diverse, s, True)
        segno = " **(servizio)**" if abs(s - soglia_servizio) < 1e-9 else ""
        out.append(f"| {s:.2f}{segno} | {pe}/{np_} ({pe / np_:.0%}) | {de}/{nd} ({de / nd:.0%}) | {pf}/{np_} ({pf / np_:.0%}) | {df}/{nd} ({df / nd:.0%}) |")
    simp = sorted(e.similarita for e in parafrasi)
    sdiv = sorted(e.similarita for e in diverse)
    out += ["", f"Similarità delle parafrasi: da {simp[0]:.2f} a {simp[-1]:.2f} (mediana {simp[len(simp) // 2]:.2f}). "
            f"Similarità delle domande diverse: da {sdiv[0]:.2f} a {sdiv[-1]:.2f} (mediana {sdiv[len(sdiv) // 2]:.2f}). "
            "Gli intervalli si sovrappongono: nessuna soglia sulla sola similarità separa i due insiemi.", ""]

    improprie = [e for e in diverse if e.firma_uguale and e.similarita >= soglia_servizio]
    mancate = [e for e in parafrasi if not (e.firma_uguale and e.similarita >= soglia_servizio)]
    out += [f"## Risposte improprie alla soglia del servizio ({soglia_servizio:g})", ""]
    out += [f"- [{e.categoria}] \"{e.a}\" / \"{e.b}\" (similarità {e.similarita:.2f})" for e in improprie] or ["Nessuna."]
    out += ["", f"## Parafrasi non riconosciute alla soglia del servizio ({len(mancate)})", "",
            "Sono domande che il servizio rianalizza: costano tempo, non danno risposte sbagliate.", ""]
    out += [f"- [{e.categoria}] \"{e.a}\" / \"{e.b}\" ({'firma diversa' if not e.firma_uguale else 'similarità bassa'}, {e.similarita:.2f})" for e in mancate] or ["Nessuna."]
    out += ["", "## Domande diverse bloccate dalla firma nonostante la similarità alta", "",
            "Con la sola similarità alla soglia del servizio queste coppie avrebbero ricevuto la stessa risposta.", ""]
    salvate = sorted((e for e in diverse if not e.firma_uguale and e.similarita >= soglia_servizio), key=lambda e: -e.similarita)
    out += [f"- {e.similarita:.2f} [{e.categoria}] \"{e.a}\" / \"{e.b}\"" for e in salvate] or ["Nessuna."]
    out.append("")
    if controllo:
        cp, cd = controllo
        pf, df = conteggi(cp, cd, soglia_servizio, True)
        pe, de = conteggi(cp, cd, soglia_servizio, False)
        out += ["## Verifica su casi nuovi", "",
                f"{len(cp)} parafrasi e {len(cd)} domande diverse scritte DOPO la messa a punto del lessico e mai usate per modificarlo: "
                "misurano quanto il risultato regge su domande che il sistema non ha mai visto.", "",
                "| Strategia (soglia del servizio) | Parafrasi riconosciute | Risposte improprie |", "|---|---:|---:|",
                f"| Solo similarità | {pe}/{len(cp)} ({pe / len(cp):.0%}) | {de}/{len(cd)} ({de / len(cd):.0%}) |",
                f"| Firma + similarità | {pf}/{len(cp)} ({pf / len(cp):.0%}) | {df}/{len(cd)} ({df / len(cd):.0%}) |", ""]
        improprie = [e for e in cd if e.firma_uguale and e.similarita >= soglia_servizio]
        mancate = [e for e in cp if not (e.firma_uguale and e.similarita >= soglia_servizio)]
        out += ["Risposte improprie:", ""] + ([f"- [{e.categoria}] \"{e.a}\" / \"{e.b}\" ({e.similarita:.2f})" for e in improprie] or ["- nessuna"])
        out += ["", "Parafrasi non riconosciute:", ""] + ([
            f"- [{e.categoria}] \"{e.a}\" / \"{e.b}\" ({'firma diversa' if not e.firma_uguale else 'similarità bassa'}, {e.similarita:.2f})"
            for e in mancate] or ["- nessuna"])
        out.append("")
    return "\n".join(out)


def main() -> None:
    from dotenv import load_dotenv

    from config import Settings
    from main import entita_della_cache

    load_dotenv(SERVICE_DIR.parent / ".env")
    s = Settings.from_env()
    if not s.embedding_id:
        raise SystemExit("EMBEDDING_PROVIDER / EMBEDDING_MODEL non configurati nel .env")
    from langchain.embeddings import init_embeddings

    from dataset import load_raw
    from cleaning import pulisci_dataset

    emb = init_embeddings(s.embedding_id)
    entita = entita_della_cache(pulisci_dataset(load_raw(s.csv_path))[0])
    par = valuta(PARAFRASI, emb.embed_documents, entita)
    div = valuta(DIVERSE, emb.embed_documents, entita)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    controllo = (valuta(PARAFRASI_CONTROLLO, emb.embed_documents, entita), valuta(DIVERSE_CONTROLLO, emb.embed_documents, entita))
    OUTPUT.write_text(report_markdown(par, div, s.cache_soglia, s.embedding_id, controllo), encoding="utf-8")
    for nome, (p, d) in {"messa a punto": (par, div), "controllo": controllo}.items():
        pf, df = conteggi(p, d, s.cache_soglia, True)
        print(f"{nome}: soglia {s.cache_soglia}, parafrasi riconosciute {pf}/{len(p)}, risposte improprie {df}/{len(d)}")
    print(f"Report: {OUTPUT}")


if __name__ == "__main__":
    main()
