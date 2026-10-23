from cache import CacheAnalisi, impronta_file, normalizza


def test_normalizza_ignora_maiuscole_accenti_punteggiatura_e_spazi():
    assert normalizza("  Qual è il MARGINE per cliente?? ") == normalizza("qual e il margine, per cliente")
    assert normalizza("Soglia 95% e tetto 5.000 €") == "soglia 95% e tetto 5 000 €"
    assert normalizza(None) == ""


def test_chiave_distingue_grafico_regole_e_dati():
    c = CacheAnalisi(impronta_dati="a")
    base = c.chiave("margine per cliente", False, None)
    assert base == c.chiave("Margine per cliente?", False, None)
    assert base != c.chiave("margine per cliente", True, None)
    assert base != c.chiave("margine per cliente", False, "soglia 95%")
    assert base != CacheAnalisi(impronta_dati="b").chiave("margine per cliente", False, None)


def test_hit_miss_e_copie_indipendenti():
    c = CacheAnalisi()
    assert c.get("k") is None
    valore = {"artifacts": [{"id": "1"}]}
    c.put("k", valore)
    valore["artifacts"].clear()
    letto = c.get("k")
    assert letto == {"artifacts": [{"id": "1"}]}
    letto["artifacts"].clear()
    assert c.get("k") == {"artifacts": [{"id": "1"}]}
    assert c.stato() == {"attiva": True, "voci": 1, "hit": 2, "miss": 1, "ttl_s": 3600}


def test_scadenza():
    ora = [0.0]
    c = CacheAnalisi(ttl_s=60, clock=lambda: ora[0])
    c.put("k", {"x": 1})
    ora[0] = 59
    assert c.get("k") == {"x": 1}
    ora[0] = 61
    assert c.get("k") is None and c.stato()["voci"] == 0


def test_limite_di_voci_lru():
    c = CacheAnalisi(max_voci=2)
    c.put("a", {})
    c.put("b", {})
    c.get("a")
    c.put("c", {})
    assert c.get("b") is None and c.get("a") == {} and c.get("c") == {}


def test_disattivabile():
    c = CacheAnalisi(ttl_s=0)
    c.put("k", {"x": 1})
    assert c.get("k") is None and not c.stato()["attiva"]


def test_impronta_cambia_con_il_contenuto(tmp_path):
    f = tmp_path / "d.csv"
    f.write_text("a,b\n1,2\n")
    prima = impronta_file(f)
    f.write_text("a,b\n1,3\n")
    assert impronta_file(f) != prima
