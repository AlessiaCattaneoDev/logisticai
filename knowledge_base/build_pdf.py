"""Genera il PDF ufficiale della knowledge base dalle sorgenti Markdown.

Uso:  ../data_agent/.venv/bin/python build_pdf.py

Il PDF è la versione "consegnata" e leggibile; l'ingestion RAG legge le sorgenti .md.
L'hash delle sorgenti viene salvato nei metadati (keywords): il test verifica che il PDF
sia aggiornato.
"""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from pathlib import Path

import markdown
from fpdf import FPDF
from fpdf.fonts import FontFace

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "source"
PDF_PATH = HERE / "Manuale_Operativo_Padana_Logistics.pdf"
FONT_CANDIDATES = [
    Path("/System/Library/Fonts/Supplemental"),          # macOS
    Path("/usr/share/fonts/truetype/msttcorefonts"),     # Linux (ttf-mscorefonts)
]


def sources() -> list[Path]:
    return sorted(SOURCE.glob("*.md"))


def sources_hash() -> str:
    digest = hashlib.sha256()
    for path in sources():
        digest.update(path.name.encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def _font_dir() -> Path:
    for d in FONT_CANDIDATES:
        if (d / "Arial.ttf").exists():
            return d
    raise SystemExit("Font Arial non trovato: installa Arial o aggiungi un percorso in FONT_CANDIDATES")


class ManualPDF(FPDF):
    def footer(self) -> None:
        if self.page_no() == 1:
            return
        self.set_y(-12)
        self.set_font("Arial", size=8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 8, f"Padana Logistics S.r.l. — Manuale operativo — pag. {self.page_no()}", align="C", new_x="LMARGIN", new_y="NEXT")


def _to_html(md_text: str) -> str:
    html = markdown.markdown(md_text, extensions=["tables"])
    # fpdf2 non gestisce <code> con font proporzionali Unicode: lo rendiamo in corsivo.
    html = re.sub(r"</?code>", lambda m: m.group(0).replace("code", "i"), html)
    # fpdf2 non accetta tag annidati nelle celle di tabella: teniamo solo il testo.
    return re.sub(
        r"(<t[dh](?:\s[^>]*)?>)(.*?)(</t[dh]>)",
        lambda m: m.group(1) + re.sub(r"<[^>]+>", "", m.group(2)) + m.group(3),
        html,
        flags=re.S,
    )


def build() -> Path:
    fonts = _font_dir()
    pdf = ManualPDF(format="A4")
    pdf.set_margins(18, 18, 18)
    pdf.set_auto_page_break(True, margin=18)
    pdf.add_font("Arial", "", fonts / "Arial.ttf")
    pdf.add_font("Arial", "B", fonts / "Arial Bold.ttf")
    pdf.add_font("Arial", "I", fonts / "Arial Italic.ttf")
    pdf.add_font("Arial", "BI", fonts / "Arial Bold.ttf")
    pdf.set_title("Manuale operativo — Padana Logistics S.r.l.")
    pdf.set_author("Padana Logistics S.r.l.")
    pdf.set_keywords(f"sources-sha256:{sources_hash()}")
    pdf.set_creation_date(datetime(2026, 1, 1, tzinfo=timezone.utc))  # data fissa: build riproducibile

    # Copertina
    pdf.add_page()
    pdf.set_font("Arial", "B", 26)
    pdf.ln(70)
    pdf.multi_cell(0, 12, "Manuale operativo", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Arial", "", 15)
    pdf.multi_cell(0, 9, "Padana Logistics S.r.l.\nCustomer Service e Operations", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(20)
    pdf.set_font("Arial", "", 11)
    for path in sources():
        title = path.read_text(encoding="utf-8").splitlines()[0].lstrip("# ")
        pdf.cell(0, 7, f"• {title}", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(15)
    pdf.set_font("Arial", "I", 9)
    pdf.multi_cell(0, 5, "Documento interno riservato. Azienda e contenuti fittizi, realizzati per il progetto LogisticAI.", align="C", new_x="LMARGIN", new_y="NEXT")

    styles = {
        "h1": FontFace(family="Arial", emphasis="BOLD", size_pt=18, color=(15, 40, 80)),
        "h2": FontFace(family="Arial", emphasis="BOLD", size_pt=13, color=(30, 64, 120)),
        "h3": FontFace(family="Arial", emphasis="BOLD", size_pt=11),
    }
    for path in sources():
        pdf.add_page()
        pdf.set_font("Arial", "", 10)
        pdf.write_html(_to_html(path.read_text(encoding="utf-8")), tag_styles=styles, font_family="Arial")

    pdf.output(str(PDF_PATH))
    return PDF_PATH


if __name__ == "__main__":
    out = build()
    print(f"{out.name}: generato")
