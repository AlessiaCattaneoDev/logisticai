"""Helper con cui l'agente crea grafici e tabelle: DataFrame -> ChartSpec / TableSpec validate.

Nessuna libreria grafica: le spec sono JSON renderizzati dai componenti React del frontend.
Il servizio restituisce SOLO gli artifact registrati qui (mai quanto "dichiarato" dall'LLM).
"""
from __future__ import annotations

import math
import uuid
from datetime import date, datetime
from typing import Any

import numpy as np
import pandas as pd
from pydantic import ValidationError

from specs import MAX_CHART_POINTS, MAX_TABLE_ROWS, ChartSpec, TableSpec

MAX_ARTIFACTS = 4

ALLOWED_TYPES = {
    "bar": ["bar", "line", "area"],
    "line": ["line", "bar", "area"],
    "area": ["area", "line", "bar"],
    "pie": ["pie", "bar"],
    "scatter": ["scatter"],
    "composed": ["composed", "bar", "line"],
}
NUMERIC_TOTAL_FORMATS = {"integer", "number", "currency_eur", "duration_min"}


def _cell(value: Any) -> str | int | float | None:
    if value is None or value is pd.NaT:
        return None
    if isinstance(value, (pd.Timestamp, datetime, date)):
        ts = pd.Timestamp(value)
        return ts.strftime("%Y-%m-%d") if ts == ts.normalize() else ts.strftime("%Y-%m-%d %H:%M")
    if isinstance(value, pd.Period):
        return str(value)
    if isinstance(value, (bool, np.bool_)):
        return "Sì" if value else "No"
    if isinstance(value, (int, np.integer)):
        return int(value)
    if isinstance(value, (float, np.floating)):
        return None if math.isnan(value) else round(float(value), 6)
    if pd.isna(value):
        return None
    return str(value)


def _records(df: pd.DataFrame, cols: list[str]) -> list[dict]:
    return [{c: _cell(v) for c, v in zip(cols, row)} for row in df[cols].itertuples(index=False, name=None)]


def _label(col: str, labels: dict[str, str] | None) -> str:
    return (labels or {}).get(col) or col.replace("_", " ").capitalize()


def _with_columns(df: pd.DataFrame, needed: list[str]) -> pd.DataFrame:
    if any(c not in df.columns for c in needed):
        df = df.reset_index()
    missing = [c for c in needed if c not in df.columns]
    if missing:
        raise ValueError(f"colonne inesistenti: {missing}. Colonne disponibili: {list(df.columns)}")
    return df


def _infer_format(s: pd.Series) -> str:
    if pd.api.types.is_bool_dtype(s):
        return "string"
    if pd.api.types.is_datetime64_any_dtype(s):
        return "date"
    if pd.api.types.is_integer_dtype(s):
        return "integer"
    if pd.api.types.is_float_dtype(s):
        return "number"
    return "string"


def _validation_error(kind: str, err: ValidationError) -> ValueError:
    details = "; ".join(e["msg"] for e in err.errors())
    return ValueError(f"{kind} non valido: {details}")


class ArtifactRegistry:
    def __init__(self) -> None:
        self.artifacts: list[ChartSpec | TableSpec] = []

    def _register(self, spec: ChartSpec | TableSpec) -> None:
        # Stesso tipo e stesso titolo = correzione: sostituisce la versione precedente.
        for i, existing in enumerate(self.artifacts):
            if existing.kind == spec.kind and existing.title == spec.title:
                self.artifacts[i] = spec
                return
        if len(self.artifacts) >= MAX_ARTIFACTS:
            raise ValueError(f"hai già creato {MAX_ARTIFACTS} grafici/tabelle: non crearne altri, scrivi la sintesi")
        self.artifacts.append(spec)

    def crea_grafico(
        self,
        df: pd.DataFrame,
        tipo: str,
        x: str,
        y: str | list[str],
        titolo: str,
        *,
        etichette: dict[str, str] | None = None,
        sottotitolo: str | None = None,
        formato_y: str | None = None,
        etichetta_x: str | None = None,
        etichetta_y: str | None = None,
        impilato: bool = False,
        orizzontale: bool = False,
        linee_riferimento: list[dict] | None = None,
        tipi_serie: dict[str, str] | None = None,
        gruppo: str | None = None,
    ) -> str:
        """Registra un grafico. tipo: bar | line | area | pie | scatter | composed.

        gruppo: colonna da trasformare in serie separate (dati "lunghi", es. una riga per mese e hub ->
        una linea per hub). In questo caso y deve essere una sola colonna.
        """
        ys = [y] if isinstance(y, str) else list(y)
        if gruppo:
            if len(ys) != 1:
                raise ValueError("con gruppo indica una sola colonna y")
            df = _with_columns(df, [x, ys[0], gruppo])
            wide = df.pivot_table(index=x, columns=gruppo, values=ys[0], aggfunc="first").reset_index()
            wide.columns = [str(c) for c in wide.columns]
            labels = {str(v): str(v) for v in df[gruppo].dropna().unique()}
            etichette = {**labels, **(etichette or {})}
            df, ys = wide, [c for c in wide.columns if c != x]
        df = _with_columns(df, [x, *ys])
        if len(df) > MAX_CHART_POINTS:
            raise ValueError(
                f"{len(df)} punti sono troppi (massimo {MAX_CHART_POINTS}): aggrega i dati (es. per mese o settimana) prima di creare il grafico"
            )
        try:
            spec = ChartSpec(
                id=str(uuid.uuid4()),
                type=tipo,
                title=titolo,
                subtitle=sottotitolo,
                x_key=x,
                x_label=etichetta_x,
                y_label=etichetta_y,
                y_format=formato_y,
                series=[{"key": c, "label": _label(c, etichette), "type": (tipi_serie or {}).get(c)} for c in ys],
                data=_records(df, [x, *ys]),
                stacked=impilato or None,
                horizontal=orizzontale or None,
                reference_lines=[
                    {"axis": r.get("asse", "y"), "value": r["valore"], "label": r.get("etichetta", "")}
                    for r in (linee_riferimento or [])
                ] or None,
                allowed_types=ALLOWED_TYPES.get(tipo),
            )
        except ValidationError as err:
            raise _validation_error("grafico", err) from None
        self._register(spec)
        return f"Grafico registrato: '{titolo}' ({tipo}, {len(spec.data)} punti)"

    def crea_tabella(
        self,
        df: pd.DataFrame,
        titolo: str,
        *,
        colonne: list[str] | None = None,
        etichette: dict[str, str] | None = None,
        formati: dict[str, str] | None = None,
        totali: bool = False,
        ordina_per: str | None = None,
        crescente: bool = False,
    ) -> str:
        """Registra una tabella. formati: integer | number | percent | currency_eur | duration_min | date | string."""
        cols = list(colonne) if colonne else None
        df = _with_columns(df, cols or []) if cols else df.reset_index() if df.index.name else df
        cols = cols or list(df.columns)
        if len(df) > MAX_TABLE_ROWS:
            raise ValueError(f"{len(df)} righe sono troppe (massimo {MAX_TABLE_ROWS}): filtra o aggrega i dati")
        formats = {c: (formati or {}).get(c) or _infer_format(df[c]) for c in cols}
        totals = None
        if totali:
            totals = {cols[0]: "Totale"}
            for c in cols[1:]:
                totals[c] = _cell(df[c].sum()) if formats[c] in NUMERIC_TOTAL_FORMATS else None
        try:
            spec = TableSpec(
                id=str(uuid.uuid4()),
                title=titolo,
                columns=[
                    {"key": c, "label": _label(c, etichette), "format": formats[c],
                     "align": "left" if formats[c] in ("string", "date") else "right"}
                    for c in cols
                ],
                rows=_records(df, cols),
                totals=totals,
                default_sort={"key": ordina_per, "direction": "asc" if crescente else "desc"} if ordina_per else None,
            )
        except ValidationError as err:
            raise _validation_error("tabella", err) from None
        self._register(spec)
        return f"Tabella registrata: '{titolo}' ({len(spec.rows)} righe)"

    def riepilogo(self) -> list[str]:
        """Descrizione compatta per l'LLM: niente dati, solo cosa è stato prodotto."""
        out = []
        for a in self.artifacts:
            if isinstance(a, ChartSpec):
                out.append(f"grafico {a.type}: '{a.title}' ({len(a.data)} punti)")
            else:
                out.append(f"tabella: '{a.title}' ({len(a.rows)} righe, {len(a.columns)} colonne)")
        return out

    def as_json(self) -> list[dict]:
        return [a.model_dump(by_alias=True, exclude_none=True) for a in self.artifacts]
