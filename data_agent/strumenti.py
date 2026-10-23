"""Strumenti dell'analista dati: calcoli tipizzati e validati, NESSUNA esecuzione di codice.

L'LLM sceglie lo strumento e i parametri (filtri, raggruppamenti, soglie); i calcoli sono le funzioni
deterministiche di kpi.py e grafici e tabelle passano da artifacts.py. Gli argomenti arrivano dal
modello (e indirettamente dai documenti caricati), quindi si validano con pydantic: colonne e
operazioni sono elenchi chiusi e i valori dei filtri si confrontano per uguaglianza. Niente query
string, eval o codice: un testo malevolo può al massimo chiedere un calcolo diverso.
"""
from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Annotated, Any, Literal

import pandas as pd
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from artifacts import ArtifactRegistry, _records
from kpi import MOTIVI_NOTI, _aggregate, calcola_puntualita, margine, tasso_danni, valuta_subvettori, verifica_sla_mensile
from specs import ChartType, ValueFormat

COLONNE_FILTRO = ("cliente", "hub_partenza", "servizio", "vettore", "regione_destinazione", "area_destinazione",
                  "tipo_destinatario", "stato", "motivo_ritardo", "esito_reclamo")
COLONNE_GRUPPO = (*COLONNE_FILTRO, "mese_previsto", "anno", "tentativi_consegna")
COLONNE_NUMERICHE = ("peso_kg", "valore_merce_eur", "importo_reclamo_eur", "costo_trasporto_eur", "ricavo_eur",
                     "num_colli", "tentativi_consegna", "giorni_ritardo")
OPERAZIONI = {"somma": "sum", "media": "mean", "mediana": "median", "minimo": "min", "massimo": "max"}
MESE = r"^\d{4}-(0[1-9]|1[0-2])$"
ANTEPRIMA_RIGHE = 25

ColonnaFiltro = Literal[COLONNE_FILTRO]
ColonnaGruppo = Literal[COLONNE_GRUPPO]
ColonnaNumerica = Literal[COLONNE_NUMERICHE]
Motivo = Literal[tuple(sorted(MOTIVI_NOTI))]
IdRisultato = Annotated[str, Field(pattern=r"^R\d+$", description="Id restituito da uno strumento di calcolo (es. 'R1').")]


class _Args(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Filtri(_Args):
    valori: dict[ColonnaFiltro, list[str]] = Field(
        default_factory=dict,
        description="Tiene le righe con uno dei valori indicati, es. {'cliente': ['ModaNova'], 'stato': ['Consegnata']}.",
    )
    da_mese: str | None = Field(None, pattern=MESE, description="Primo mese incluso (AAAA-MM), sulla data di consegna prevista.")
    a_mese: str | None = Field(None, pattern=MESE, description="Ultimo mese incluso (AAAA-MM).")
    danno: bool | None = Field(None, description="true: solo spedizioni con danno; false: solo senza danno.")
    temperatura_controllata: bool | None = None


class _Ordinamento(_Args):
    ordina_per: str | None = Field(None, description="Colonna del risultato su cui ordinare.")
    crescente: bool = False
    limite: int | None = Field(None, ge=1, le=1000, description="Tiene solo le prime N righe dopo l'ordinamento (classifiche).")


class _Calcolo(_Ordinamento):
    filtri: Filtri = Field(default_factory=Filtri)
    raggruppa_per: list[ColonnaGruppo] = Field(default_factory=list, max_length=3)


class PuntualitaArgs(_Calcolo):
    cause_escluse: list[Motivo] = Field(default_factory=list, description="Motivi di ritardo esclusi dal calcolo (dalle regole contrattuali).")


class DanniArgs(_Calcolo):
    pass


class MargineArgs(_Calcolo):
    pass


class Misura(_Args):
    operazione: Literal["conteggio", "somma", "media", "mediana", "minimo", "massimo"]
    colonna: ColonnaNumerica | None = Field(None, description="Obbligatoria tranne che per 'conteggio'.")

    @model_validator(mode="after")
    def _colonna(self) -> "Misura":
        if self.operazione != "conteggio" and self.colonna is None:
            raise ValueError(f"l'operazione '{self.operazione}' richiede una colonna")
        return self


class AggregaArgs(_Calcolo):
    misure: list[Misura] = Field(min_length=1, max_length=6)
    quota: bool = Field(False, description="Aggiunge la colonna 'quota' (frazione 0-1 del totale delle spedizioni). Richiede 'conteggio'.")


class SlaArgs(_Args):
    cliente: str
    mese: str = Field(pattern=MESE)
    soglia: float = Field(gt=0, description="Frazione (0.95) o percentuale (95).")
    penale_per_punto: float = Field(ge=0)
    tetto: float = Field(ge=0)
    volume_minimo: int = Field(0, ge=0)
    cause_escluse: list[Motivo] = Field(default_factory=list)


class SubvettoriArgs(_Ordinamento):
    soglia_piano: float = Field(gt=0)
    soglia_sospensione: float = Field(gt=0)
    mesi_consecutivi: int = Field(ge=1, le=24)
    da_mese: str | None = Field(None, pattern=MESE)
    a_mese: str | None = Field(None, pattern=MESE)


class LineaRiferimento(_Args):
    valore: float
    etichetta: str = ""
    asse: Literal["x", "y"] = "y"


class GraficoArgs(_Args):
    risultato: IdRisultato
    tipo: ChartType
    x: str
    y: str | list[str]
    titolo: str = Field(min_length=1, max_length=200)
    sottotitolo: str | None = Field(None, max_length=300)
    formato_y: ValueFormat | None = None
    etichetta_x: str | None = None
    etichetta_y: str | None = None
    etichette: dict[str, str] | None = None
    impilato: bool = False
    orizzontale: bool = False
    linee_riferimento: list[LineaRiferimento] = Field(default_factory=list, max_length=5)
    tipi_serie: dict[str, Literal["bar", "line", "area"]] | None = None
    gruppo: str | None = Field(None, description="Colonna da trasformare in serie separate (una riga per mese e per vettore -> una linea per vettore).")


class TabellaArgs(_Args):
    risultato: IdRisultato
    titolo: str = Field(min_length=1, max_length=200)
    colonne: list[str] | None = None
    etichette: dict[str, str] | None = None
    formati: dict[str, ValueFormat] | None = None
    totali: bool = False
    ordina_per: str | None = None
    crescente: bool = False


@dataclass
class Sessione:
    """Stato di UNA richiesta: dati puliti (sola lettura), risultati intermedi e artifact registrati."""

    dati: pd.DataFrame
    registry: ArtifactRegistry = field(default_factory=ArtifactRegistry)
    risultati: dict[str, pd.DataFrame] = field(default_factory=dict)

    def esegui(self, nome: str, args: Any) -> str:
        """Esegue uno strumento e restituisce SEMPRE un testo per l'LLM (anche in caso di errore)."""
        strumento = STRUMENTI.get(nome)
        if strumento is None:
            return f"Strumento sconosciuto: {nome}. Strumenti disponibili: {', '.join(STRUMENTI)}."
        try:
            parsed = strumento.args.model_validate(args if isinstance(args, dict) else {})
        except ValidationError as err:
            dettagli = "; ".join(f"{'.'.join(map(str, e['loc'])) or 'argomenti'}: {e['msg']}" for e in err.errors())
            return f"Argomenti non validi per {nome}: {dettagli}. Correggi e riprova."
        try:
            return strumento.esegui(self, parsed)
        except (ValueError, KeyError, TypeError) as err:
            return f"Errore in {nome}: {err}. Correggi i parametri e riprova."

    def registra(self, df: pd.DataFrame, ordinamento: _Ordinamento | None = None) -> str:
        if ordinamento and ordinamento.ordina_per:
            if ordinamento.ordina_per not in df.columns:
                raise ValueError(f"ordina_per '{ordinamento.ordina_per}' non è tra le colonne {list(df.columns)}")
            df = df.sort_values(ordinamento.ordina_per, ascending=ordinamento.crescente, na_position="last")
        if ordinamento and ordinamento.limite:
            df = df.head(ordinamento.limite)
        df = df.reset_index(drop=True)
        rid = f"R{len(self.risultati) + 1}"
        self.risultati[rid] = df
        cols = [str(c) for c in df.columns]
        return json.dumps({
            "risultato": rid,
            "righe": len(df),
            "colonne": cols,
            "anteprima": _records(df.head(ANTEPRIMA_RIGHE), cols),
            **({"nota": f"mostrate le prime {ANTEPRIMA_RIGHE} righe su {len(df)}"} if len(df) > ANTEPRIMA_RIGHE else {}),
        }, ensure_ascii=False)

    def risultato(self, rid: str) -> pd.DataFrame:
        if rid not in self.risultati:
            disponibili = ", ".join(self.risultati) or "nessuno"
            raise ValueError(f"risultato {rid} inesistente (disponibili: {disponibili}): calcolalo prima")
        return self.risultati[rid]


def prepara_dati(pulito: pd.DataFrame) -> pd.DataFrame:
    """Colonne derivate usate da filtri e misure (il DataFrame pulito resta invariato)."""
    d = pulito.copy()
    d["anno"] = d["mese_previsto"].str[:4]
    consegnata = d["stato"] == "Consegnata"
    ritardo = (d["data_consegna_effettiva"].dt.normalize() - d["data_consegna_prevista"]).dt.days
    d["giorni_ritardo"] = ritardo.where(consegnata).astype("Float64")
    return d


def valori_ammessi(d: pd.DataFrame, col: str) -> list[str]:
    return sorted(str(v) for v in d[col].dropna().unique())


def _filtra(d: pd.DataFrame, f: Filtri) -> pd.DataFrame:
    for col, valori in f.valori.items():
        sconosciuti = sorted(set(valori) - set(valori_ammessi(d, col)))
        if sconosciuti:
            raise ValueError(f"valori sconosciuti per {col}: {sconosciuti}. Valori ammessi: {valori_ammessi(d, col)}")
        d = d[d[col].isin(valori)]
    if f.da_mese:
        d = d[d["mese_previsto"] >= f.da_mese]
    if f.a_mese:
        d = d[d["mese_previsto"] <= f.a_mese]
    if f.danno is not None:
        d = d[d["danno"] == f.danno]
    if f.temperatura_controllata is not None:
        d = d[d["temperatura_controllata"] == f.temperatura_controllata]
    if d.empty:
        raise ValueError("nessuna spedizione con questi filtri")
    return d


def _puntualita(s: Sessione, a: PuntualitaArgs) -> str:
    return s.registra(calcola_puntualita(_filtra(s.dati, a.filtri), a.cause_escluse, list(a.raggruppa_per)), a)


def _danni(s: Sessione, a: DanniArgs) -> str:
    return s.registra(tasso_danni(_filtra(s.dati, a.filtri), list(a.raggruppa_per)), a)


def _margine(s: Sessione, a: MargineArgs) -> str:
    return s.registra(margine(_filtra(s.dati, a.filtri), list(a.raggruppa_per)), a)


def _aggrega(s: Sessione, a: AggregaArgs) -> str:
    aggs: dict[str, tuple[str, str]] = {}
    for m in a.misure:
        if m.operazione == "conteggio":
            aggs["spedizioni"] = ("id_spedizione", "size")
        else:
            aggs[f"{m.operazione}_{m.colonna}"] = (m.colonna, OPERAZIONI[m.operazione])
    out = _aggregate(_filtra(s.dati, a.filtri), list(a.raggruppa_per), **aggs)
    if a.quota:
        if "spedizioni" not in out:
            raise ValueError("quota richiede la misura 'conteggio'")
        out["quota"] = out["spedizioni"] / out["spedizioni"].sum()
    return s.registra(out, a)


def _sla(s: Sessione, a: SlaArgs) -> str:
    clienti = valori_ammessi(s.dati, "cliente")
    if a.cliente not in clienti:
        raise ValueError(f"cliente '{a.cliente}' sconosciuto. Clienti: {clienti}")
    esito = verifica_sla_mensile(s.dati, a.cliente, a.mese, a.soglia, a.penale_per_punto, a.tetto, a.volume_minimo, a.cause_escluse)
    return json.dumps(esito, ensure_ascii=False)


def _subvettori(s: Sessione, a: SubvettoriArgs) -> str:
    return s.registra(valuta_subvettori(s.dati, a.soglia_piano, a.soglia_sospensione, a.mesi_consecutivi, a.da_mese, a.a_mese), a)


def _grafico(s: Sessione, a: GraficoArgs) -> str:
    return s.registry.crea_grafico(
        s.risultato(a.risultato), a.tipo, a.x, a.y, a.titolo,
        etichette=a.etichette, sottotitolo=a.sottotitolo, formato_y=a.formato_y, etichetta_x=a.etichetta_x,
        etichetta_y=a.etichetta_y, impilato=a.impilato, orizzontale=a.orizzontale,
        linee_riferimento=[r.model_dump() for r in a.linee_riferimento], tipi_serie=a.tipi_serie, gruppo=a.gruppo,
    )


def _tabella(s: Sessione, a: TabellaArgs) -> str:
    return s.registry.crea_tabella(
        s.risultato(a.risultato), a.titolo, colonne=a.colonne, etichette=a.etichette, formati=a.formati,
        totali=a.totali, ordina_per=a.ordina_per, crescente=a.crescente,
    )


@dataclass(frozen=True)
class Strumento:
    descrizione: str
    args: type[_Args]
    esegui: Callable[[Sessione, Any], str]


STRUMENTI: dict[str, Strumento] = {
    "calcola_puntualita": Strumento(
        "Puntualità secondo la definizione SLA (In transito escluse in automatico). "
        "Colonne: [gruppi..., spedizioni, escluse, misurate, puntuali, puntualita] (puntualita = frazione 0-1).",
        PuntualitaArgs, _puntualita),
    "calcola_tasso_danni": Strumento(
        "Tasso danni = spedizioni con danno / consegnate. Colonne: [gruppi..., consegnate, danni, tasso_danni] (frazione 0-1).",
        DanniArgs, _danni),
    "calcola_margine": Strumento(
        "Ricavi, costi di trasporto e margine. Colonne: [gruppi..., spedizioni, ricavo_eur, costo_eur, margine_eur, margine_pct].",
        MargineArgs, _margine),
    "aggrega": Strumento(
        "Conteggi e statistiche (somma, media, mediana, minimo, massimo) per volumi, pesi, costi, reclami, tentativi di "
        "consegna, giorni di ritardo. Colonne: [gruppi..., spedizioni | <operazione>_<colonna>..., quota].",
        AggregaArgs, _aggrega),
    "verifica_sla_mensile": Strumento(
        "OBBLIGATORIO per le PENALI SLA: verifica un cliente in un mese (AAAA-MM). Restituisce spedizioni, escluse, misurate, "
        "puntuali, puntualita, punti_sotto_soglia, penale_eur, applicata, nota.",
        SlaArgs, _sla),
    "valuta_subvettori": Strumento(
        "OBBLIGATORIO per SOSPENSIONE / QUALIFICA dei subvettori: tasso danni mensile per vettore. Colonne: vettore, esito, "
        "mesi_consecutivi_sopra_sospensione, mesi_sopra_soglia_piano, tasso_danni_medio, tasso_danni_massimo, mese_peggiore.",
        SubvettoriArgs, _subvettori),
    "crea_grafico": Strumento(
        "Crea un grafico da un risultato già calcolato (id 'R1', 'R2', ...). Con dati 'lunghi' (una riga per mese e per vettore) "
        "usa gruppo='vettore'. Stesso titolo = sostituisce il grafico precedente.",
        GraficoArgs, _grafico),
    "crea_tabella": Strumento(
        "Crea una tabella da un risultato già calcolato. formati: integer | number | percent | currency_eur | duration_min | date | string.",
        TabellaArgs, _tabella),
}


def definizioni_tool() -> list[dict]:
    """Schemi JSON degli strumenti nel formato tool calling accettato da tutti i provider di init_chat_model."""
    from langchain_core.utils.function_calling import convert_to_openai_tool

    tools = []
    for nome, s in STRUMENTI.items():
        tool = convert_to_openai_tool(s.args)
        tool["function"].update(name=nome, description=s.descrizione)
        tools.append(tool)
    return tools
