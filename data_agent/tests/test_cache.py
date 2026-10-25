from cache import CacheAnalisi, impronta_file, normalizza


def vettori(mappa: dict[str, list[float]], chiamate: list[str] | None = None):
    """Embedder finto: vettori decisi dal test per ogni domanda normalizzata."""
    def embed(testo: str) -> list[float]:
        if chiamate is not None:
            chiamate.append(testo)
        return mappa.get(testo, [0.0, 0.0, 1.0])
    return embed


MARGINE = "Qual è il margine per cliente nel 2026?"
GUADAGNO = "Quanto guadagniamo su ogni cliente nel 2026?"
EMB = {normalizza(MARGINE): [1.0, 0.0, 0.0], normalizza(GUADAGNO): [0.8, 0.6, 0.0]}  # coseno 0,8


def test_normalizza_ignora_maiuscole_accenti_punteggiatura_e_spazi():
    assert normalizza("  Qual è il MARGINE per cliente?? ") == normalizza("qual e il margine, per cliente")
    assert normalizza("Soglia 95% e tetto 5.000 €") == "soglia 95% e tetto 5 000 €"
    assert normalizza(None) == ""


def test_domanda_uguale_senza_embedding():
    c = CacheAnalisi()
    assert c.cerca("margine per cliente", False, None).valore is None
    r = c.cerca("margine per cliente", False, None)
    c.salva(r, "margine per cliente", {"sintesi": "x"})
    hit = c.cerca("  Margine per CLIENTE? ", False, None)
    assert hit.valore == {"sintesi": "x"} and hit.tipo == "uguale" and hit.domanda_originale == "margine per cliente"


def test_parafrasi_riconosciuta_con_firma_uguale_e_similarita_sopra_soglia():
    c = CacheAnalisi(embedder=vettori(EMB), soglia=0.6)
    r = c.cerca(MARGINE, False, None)
    assert r.valore is None and r.vettore == [1.0, 0.0, 0.0] and r.embedding_ms is not None
    c.salva(r, MARGINE, {"sintesi": "CasaViva in perdita"})
    hit = c.cerca(GUADAGNO, False, None)
    assert hit.valore == {"sintesi": "CasaViva in perdita"}
    assert hit.tipo == "parafrasi" and hit.domanda_originale == MARGINE and hit.similarita == 0.8
    assert c.stato()["hit_parafrasi"] == 1


def test_parafrasi_sotto_soglia_e_una_domanda_nuova():
    c = CacheAnalisi(embedder=vettori(EMB), soglia=0.9)
    c.salva(c.cerca(MARGINE, False, None), MARGINE, {"sintesi": "x"})
    assert c.cerca(GUADAGNO, False, None).valore is None


def test_firma_diversa_mai_riusata_anche_con_embedding_identici():
    """Gli embedding scambiano settembre e luglio (0,976): decide la firma."""
    c = CacheAnalisi(embedder=lambda t: [1.0, 0.0], soglia=0.6, entita=["ModaNova"])
    sett = "ModaNova ha diritto a penali per settembre 2026?"
    c.salva(c.cerca(sett, False, None), sett, {"sintesi": "1.700 €"})
    assert c.cerca("ModaNova ha diritto a penali per luglio 2026?", False, None).valore is None
    assert c.cerca("A settembre 2026 dobbiamo pagare penali a ModaNova?", False, None).valore == {"sintesi": "1.700 €"}


def test_parafrasi_solo_con_stesse_regole_e_stessa_richiesta_di_grafico():
    c = CacheAnalisi(embedder=lambda t: [1.0, 0.0])
    c.salva(c.cerca(MARGINE, False, "soglia 95%"), MARGINE, {"sintesi": "x"})
    assert c.cerca(GUADAGNO, True, "soglia 95%").valore is None
    assert c.cerca(GUADAGNO, False, "soglia 90%").valore is None
    assert c.cerca(GUADAGNO, False, "Soglia 95%").valore == {"sintesi": "x"}


def test_niente_embedding_senza_metrica_riconosciuta():
    chiamate: list[str] = []
    c = CacheAnalisi(embedder=vettori({}, chiamate))
    r = c.cerca("come stanno andando le cose?", False, None)
    assert chiamate == [] and r.vettore is None and r.embedding_ms is None


def test_embedding_in_errore_resta_la_cache_esatta():
    def rotto(_):
        raise RuntimeError("quota esaurita")

    c = CacheAnalisi(embedder=rotto)
    r = c.cerca(MARGINE, False, None)
    assert r.valore is None and r.vettore is None
    c.salva(r, MARGINE, {"sintesi": "x"})
    assert c.cerca(GUADAGNO, False, None).valore is None
    assert c.cerca(MARGINE, False, None).tipo == "uguale"


def test_chiave_distingue_grafico_regole_e_dati():
    c = CacheAnalisi(impronta_dati="a")
    base = c.chiave("margine per cliente", False, None)
    assert base == c.chiave("Margine per cliente?", False, None)
    assert base != c.chiave("margine per cliente", True, None)
    assert base != c.chiave("margine per cliente", False, "soglia 95%")
    assert base != CacheAnalisi(impronta_dati="b").chiave("margine per cliente", False, None)


def test_copie_indipendenti_e_statistiche():
    c = CacheAnalisi()
    valore = {"artifacts": [{"id": "1"}]}
    c.salva(c.cerca("k", False, None), "k", valore)
    valore["artifacts"].clear()
    letto = c.cerca("k", False, None).valore
    assert letto == {"artifacts": [{"id": "1"}]}
    letto["artifacts"].clear()
    assert c.cerca("k", False, None).valore == {"artifacts": [{"id": "1"}]}
    assert c.stato() == {"attiva": True, "parafrasi": False, "voci": 1, "hit_uguali": 2, "hit_parafrasi": 0, "miss": 1, "ttl_s": 3600, "soglia": 0.6}


def test_scadenza_anche_per_le_parafrasi():
    ora = [0.0]
    c = CacheAnalisi(ttl_s=60, embedder=lambda t: [1.0, 0.0], clock=lambda: ora[0])
    c.salva(c.cerca(MARGINE, False, None), MARGINE, {"x": 1})
    ora[0] = 59
    assert c.cerca(GUADAGNO, False, None).valore == {"x": 1}
    ora[0] = 61
    assert c.cerca(GUADAGNO, False, None).valore is None and c.cerca(MARGINE, False, None).valore is None


def test_limite_di_voci_lru():
    c = CacheAnalisi(max_voci=2)
    for k in ["a", "b"]:
        c.salva(c.cerca(k, False, None), k, {})
    c.cerca("a", False, None)
    c.salva(c.cerca("c", False, None), "c", {})
    assert c.cerca("b", False, None).valore is None
    assert c.cerca("a", False, None).valore == {} and c.cerca("c", False, None).valore == {}


def test_disattivabile():
    c = CacheAnalisi(ttl_s=0, embedder=lambda t: [1.0])
    c.salva(c.cerca(MARGINE, False, None), MARGINE, {"x": 1})
    assert c.cerca(MARGINE, False, None).valore is None and not c.stato()["attiva"]


def test_impronta_cambia_con_il_contenuto(tmp_path):
    f = tmp_path / "d.csv"
    f.write_text("a,b\n1,2\n")
    prima = impronta_file(f)
    f.write_text("a,b\n1,3\n")
    assert impronta_file(f) != prima
