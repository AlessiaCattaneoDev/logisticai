"""Confini del data agent: niente regole contrattuali (arrivano dal backend), niente librerie grafiche,
niente esecuzione di codice generato dal modello (le regole arrivano da documenti caricabili da chiunque)."""
from pathlib import Path

SERVICE = Path(__file__).resolve().parents[1]
SOURCES = [p for p in SERVICE.glob("*.py")]
FORBIDDEN = ["business_rules", "matplotlib", "seaborn", "plotly", "subprocess",
             "allow_dangerous_code", "langchain_experimental", "PythonAstREPLTool", "PythonREPL", "exec(", "eval(", ".query("]


def test_nessun_riferimento_vietato_nel_codice_del_servizio():
    offenders = [
        f"{p.name}: {word}"
        for p in SOURCES
        for word in FORBIDDEN
        if word in p.read_text(encoding="utf-8") and not (p.name == "agent.py" and word in {"matplotlib", "seaborn", "plotly"})
    ]
    assert offenders == []


def test_requirements_senza_librerie_grafiche_ne_agenti_che_eseguono_codice():
    req = (SERVICE / "requirements.txt").read_text(encoding="utf-8").lower()
    for lib in ["matplotlib", "seaborn", "plotly", "langchain-experimental"]:
        assert f"\n{lib}" not in req
