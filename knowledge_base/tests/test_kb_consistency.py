"""La knowledge base deve dire esattamente ciò che c'è in data/business_rules.json.

Se questi test falliscono, dati e documenti non sono più allineati e le domande ibride
(RAG + dati) darebbero risposte sbagliate.
"""
import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
RULES = json.loads((ROOT / "data" / "business_rules.json").read_text(encoding="utf-8"))
SOURCE = ROOT / "knowledge_base" / "source"


def doc(prefix: str) -> str:
    [path] = SOURCE.glob(f"{prefix}_*.md")
    return path.read_text(encoding="utf-8")


def eur(n: float) -> str:
    return f"{n:,.0f}".replace(",", ".") + " €"


def pct(x: float) -> str:
    return f"{x * 100:g}%".replace(".", ",")


def section(text: str, title: str) -> str:
    match = re.search(rf"^## {re.escape(title)}\n(.*?)(?=^## |\Z)", text, re.S | re.M)
    assert match, f"sezione '## {title}' mancante"
    return match.group(1)


def test_dieci_documenti_con_titolo():
    files = sorted(SOURCE.glob("*.md"))
    assert len(files) == 10
    for f in files:
        assert f.read_text(encoding="utf-8").startswith("# "), f.name


@pytest.mark.parametrize("cliente", list(RULES["clienti"]))
def test_scheda_sla_cliente(cliente):
    regole = RULES["clienti"][cliente]
    testo = section(doc("04"), cliente)
    assert regole["hub"] in testo
    assert f"**Soglia di puntualità:** {pct(regole['soglia_puntualita'])}" in testo
    assert f"{eur(regole['penale_per_punto_eur'])} per ogni punto" in testo
    assert f"**Tetto penale mensile:** {eur(regole['tetto_penale_mensile_eur'])}" in testo


def test_clausola_picco_kidsplanet():
    assert "la soglia scende al **90%**" in section(doc("04"), "KidsPlanet")


def test_regole_comuni_sla():
    testo = section(doc("04"), "Regole comuni di misurazione dello SLA")
    non_imputabili = [m for m, v in RULES["motivi_ritardo"].items() if not v["imputabile_a_padana"]]
    for motivo in non_imputabili:
        assert f"**{motivo}**" in testo
    assert f"**{RULES['misurazione_sla']['volume_minimo_mensile']} spedizioni**" in testo
    assert "data di consegna prevista" in testo


def test_tempi_di_resa():
    testo = doc("02")
    for servizio, dati in RULES["servizi"].items():
        riga = re.search(rf"^\| {re.escape(servizio)} \|(.+)\|$", testo, re.M)
        assert riga, servizio
        celle = [c.strip() for c in riga.group(1).split("|")]
        for area, cella in zip(["Nord", "Centro", "Sud", "Isole"], celle):
            atteso = dati["tempi_resa_giorni_lavorativi"].get(area)
            if atteso is None:
                assert not cella.isdigit(), (servizio, area)
            else:
                assert cella == str(atteso), (servizio, area)


def test_orario_limite():
    assert RULES["orario_limite_ritiro"] in doc("02")
    assert RULES["orario_limite_ritiro"] in doc("01")


def test_assegnazione_vettori():
    testo = doc("02")
    for servizio, per_area in RULES["assegnazione_vettori"].items():
        riga = re.search(rf"^\| {re.escape(servizio)} \|(.+)\|$", testo.split("## Vettori per servizio e area")[1], re.M)
        for codice in per_area.values():
            assert codice in riga.group(1), (servizio, codice)


def test_motivi_di_ritardo():
    testo = doc("02")
    for motivo, info in RULES["motivi_ritardo"].items():
        riga = re.search(rf"^\| {re.escape(motivo)} \| (Sì|No) \|", testo, re.M)
        assert riga, motivo
        assert (riga.group(1) == "Sì") == info["imputabile_a_padana"], motivo


def test_vettori_in_qualifica():
    testo = doc("09")
    for codice, info in RULES["vettori"].items():
        assert f"| {codice} | {info['nome']} |" in testo


def test_soglie_qualifica_subvettori():
    testo = doc("09")
    q = RULES["qualifica_subvettori"]
    assert f"**{pct(q['puntualita_minima'])}**" in testo
    assert f"**sopra l'{pct(q['tasso_danni_piano_miglioramento'])}**" in testo
    assert f"**sopra il {pct(q['tasso_danni_sospensione'])} per {q['mesi_consecutivi_per_sospensione']} mesi consecutivi**" in testo


def test_reclami_e_massimali():
    r = RULES["reclami_danni"]
    for testo in (doc("03"), doc("05")):
        assert f"{r['massimale_eur_per_kg']} € per kg" in testo
        assert f"{r['massimale_eur_per_spedizione']} € per spedizione" in testo
    assert f"**{r['danni_occulti_giorni']} giorni**" in doc("05")
    assert f"**{r['risposta_entro_giorni_lavorativi']} giorni lavorativi**" in doc("05")
    assert "0,5% del valore dichiarato" in doc("03")


def test_giacenze():
    g = RULES["giacenze"]
    testo = doc("06")
    assert f"**{g['tentativi_di_consegna']} tentativi di consegna**" in testo
    assert f"{g['durata_giacenza_giorni_lavorativi']} giorni lavorativi" in testo
    assert f"{g['costo_apertura_giacenza_eur']} € per l'apertura" in testo
    assert f"{g['costo_giornaliero_giacenza_eur']} € per ogni giorno" in testo
    assert "1° marzo 2025" in testo


def test_faq_coerenti():
    testo = doc("10")
    assert "8 giorni" in testo and "10 € per kg" in testo and "500 €" in testo
    assert "3 giorni lavorativi" in testo


def test_pdf_aggiornato_rispetto_alle_sorgenti():
    from pypdf import PdfReader

    from build_pdf import PDF_PATH, sources_hash

    assert PDF_PATH.exists(), "esegui: python build_pdf.py"
    keywords = PdfReader(PDF_PATH).metadata.get("/Keywords", "")
    assert keywords == f"sources-sha256:{sources_hash()}", "PDF non aggiornato: esegui python build_pdf.py"


def test_pdf_contiene_le_regole_chiave():
    from pypdf import PdfReader

    from build_pdf import PDF_PATH

    testo = " ".join(page.extract_text() for page in PdfReader(PDF_PATH).pages)
    for frase in ["Schede SLA per cliente", "ModaNova", "Destinatario assente", "IsolExpress"]:
        assert frase in testo
