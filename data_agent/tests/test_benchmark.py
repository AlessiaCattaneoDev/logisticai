"""Il benchmark vero gira a mano (benchmark.py); qui si verifica solo che funzioni su un campione piccolo."""
from benchmark import Misura, Risultati, decisione, esegui, report_markdown, scala


def test_scala_replica_con_id_unici(raw_df):
    df = scala(raw_df.head(100), 3)
    assert len(df) == 300
    assert df["id_spedizione"].nunique() == 3 * raw_df.head(100)["id_spedizione"].nunique()


def test_esegue_tutte_le_operazioni_e_scrive_il_report(raw_df):
    ris = esegui(raw_df.sample(3000, random_state=1), [1, 2], ripetizioni=1, log=lambda _: None)
    assert ris.righe() == [3000, 6000]
    operazioni = {m.operazione for m in ris.misure}
    assert {"Caricamento CSV", "Validazione colonne e tipi", "Pulizia dati", "Puntualità mensile per cliente", "Qualifica subvettori"} <= operazioni
    assert all(m.secondi >= 0 and m.picco_mb > 0 for m in ris.misure)
    # RSS del processo: cresce dagli import all'avvio e non cala (è un picco).
    for rss in ris.rss_mb.values():
        assert 0 < rss["import"] <= rss["avvio"] <= rss["analisi"]
    md = report_markdown(ris, 1)
    assert "## Memoria effettiva del processo" in md and "repliche dello storico reale" in md
    assert "## Come leggere questi numeri" in md and "Stima" not in md.split("## Decisione")[0]
    assert "| Operazione | 3.000 righe | 6.000 righe |" in md
    assert "## Decisione" in md and "DuckDB" in md


def test_decisione_indica_la_prima_dimensione_oltre_soglia():
    ris = Risultati(misure=[
        Misura("Pulizia dati", "avvio", 10_000, 1.0, 50),
        Misura("Margine per cliente", "analisi", 10_000, 0.1, 10),
        Misura("Pulizia dati", "avvio", 500_000, 40.0, 900),
        Misura("Margine per cliente", "analisi", 500_000, 1.5, 300),
    ])
    righe = decisione(ris)
    assert righe[0].startswith("- **Da 500.000 righe** la singola analisi più lenta supera 1 s")
    assert righe[1].startswith("- **Da 500.000 righe** l'avvio")
    # 900 MB a 500.000 righe, soglia 1.024 MB: stima lineare ~570.000 righe.
    assert righe[2].startswith("- Fino a 500.000 righe: nessun caso") and "circa **570.000 righe**" in righe[2]
