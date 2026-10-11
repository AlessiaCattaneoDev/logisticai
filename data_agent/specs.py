"""Spec di grafici e tabelle restituite al backend e renderizzate dai componenti React.

Deve restare equivalente allo schema zod in shared/types/src/artifacts.ts:
lo verificano le fixture condivise in shared/contracts/fixtures.
"""
from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

MAX_CHART_POINTS = 500
MAX_TABLE_ROWS = 1000

ChartType = Literal["bar", "line", "area", "pie", "scatter", "composed"]
ValueFormat = Literal["number", "integer", "percent", "currency_eur", "duration_min", "date", "string"]
Cell = Union[str, int, float, None]
Row = dict[str, Cell]


class _Model(BaseModel):
    # JSON in camelCase (come i tipi TS), attributi Python in snake_case.
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ChartSeries(_Model):
    key: str = Field(min_length=1)
    label: str = Field(min_length=1)
    type: Optional[Literal["bar", "line", "area"]] = None
    color: Optional[str] = None


class ReferenceLine(_Model):
    axis: Literal["x", "y"]
    value: float
    label: str


class ChartSpec(_Model):
    kind: Literal["chart"] = "chart"
    id: str = Field(min_length=1)
    type: ChartType
    title: str = Field(min_length=1)
    subtitle: Optional[str] = None
    x_key: str = Field(min_length=1)
    x_label: Optional[str] = None
    y_label: Optional[str] = None
    y_format: Optional[ValueFormat] = None
    series: list[ChartSeries] = Field(min_length=1)
    data: list[Row] = Field(min_length=1, max_length=MAX_CHART_POINTS)
    stacked: Optional[bool] = None
    horizontal: Optional[bool] = None
    reference_lines: Optional[list[ReferenceLine]] = None
    allowed_types: Optional[list[ChartType]] = None

    @model_validator(mode="after")
    def _coerenza(self) -> "ChartSpec":
        keys = {k for row in self.data for k in row}
        if self.x_key not in keys:
            raise ValueError(f'xKey "{self.x_key}" assente nei dati')
        missing = [s.key for s in self.series if s.key not in keys]
        if missing:
            raise ValueError(f"serie assenti nei dati: {missing}")
        if self.type == "pie" and len(self.series) != 1:
            raise ValueError("un grafico a torta ha esattamente una serie")
        if self.allowed_types is not None and self.type not in self.allowed_types:
            raise ValueError("allowedTypes deve includere il tipo corrente")
        return self


class TableColumn(_Model):
    key: str = Field(min_length=1)
    label: str = Field(min_length=1)
    format: Optional[ValueFormat] = None
    align: Optional[Literal["left", "right", "center"]] = None


class TableSort(_Model):
    key: str
    direction: Literal["asc", "desc"]


class TableSpec(_Model):
    kind: Literal["table"] = "table"
    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    columns: list[TableColumn] = Field(min_length=1)
    rows: list[Row] = Field(max_length=MAX_TABLE_ROWS)
    totals: Optional[Row] = None
    default_sort: Optional[TableSort] = None

    @model_validator(mode="after")
    def _coerenza(self) -> "TableSpec":
        if self.default_sort and self.default_sort.key not in {c.key for c in self.columns}:
            raise ValueError("defaultSort su colonna inesistente")
        return self


Artifact = Annotated[Union[ChartSpec, TableSpec], Field(discriminator="kind")]
