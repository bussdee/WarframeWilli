#!/usr/bin/env python3
"""WarframeWilli: Tests fuer Rechnung, Import, Datenbank und Server.

Aufruf:  python3 tests/test_alles.py     (kein Netzwerk noetig)
"""
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

BASIS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASIS))
sys.path.insert(0, str(BASIS / "tests"))

TEMP = tempfile.mkdtemp(prefix="wfw_test_")
os.environ["WFW_DATEN"] = TEMP
(Path(TEMP) / "items.json").write_bytes((BASIS / "daten" / "items.json").read_bytes())

import server  # noqa: E402
import wf_profil  # noqa: E402


def finde(name):
    return next(i for i in server.state["items"].values() if i["name"] == name)


class Rechnen(unittest.TestCase):
    def test_mastery_schwellen(self):
        self.assertEqual(wf_profil.mastery_xp_fuer_rang(1), 2500)
        self.assertEqual(wf_profil.mastery_xp_fuer_rang(30), 2250000)
        self.assertEqual(wf_profil.mastery_xp_fuer_rang(31), 2397500)
        self.assertEqual(wf_profil.mastery_xp_fuer_rang(36), 3135000)
        self.assertEqual(wf_profil.rang_fuer_mastery_xp(2249999), 29)
        self.assertEqual(wf_profil.rang_fuer_mastery_xp(2250000), 30)

    def test_item_rang(self):
        self.assertEqual(wf_profil.item_rang(450000, 3000), 30)
        self.assertEqual(wf_profil.item_rang(449999, 3000), 29)
        self.assertEqual(wf_profil.item_rang(900000, 6000), 30)
        self.assertEqual(wf_profil.item_rang(0, 6000), 0)
        self.assertEqual(wf_profil.item_rang(800000, 3000), 40)


class KeinKontozugriff(unittest.TestCase):
    def test_programm_ruft_keine_konto_schnittstellen_ab(self):
        """Projektregel: kein Abruf von Warframe-Konto- oder Profil-Schnittstellen."""
        for datei in ("server.py", "wf_profil.py", "wf_daten.py", "web/app.js", "web/rechnen.js"):
            text = (BASIS / datei).read_text(encoding="utf-8")
            for verboten in ("getProfileViewingData", "inventory.php?", "api.warframe.com", "nonce="):
                self.assertNotIn(verboten, text, "{} enthaelt {}".format(datei, verboten))
        self.assertFalse(hasattr(wf_profil, "abrufen"))


class Auswertung(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server.datenbank_laden()

    def test_profil(self):
        rhino = finde("Rhino")
        soma = finde("Soma Prime")
        lato = finde("Lato")
        profil = {"Results": [{"DisplayName": "Test", "PlayerLevel": 29, "XPInfo": [
            {"ItemType": rhino["id"], "XP": 900000},
            {"ItemType": soma["id"], "XP": 112500},   # Rang 15
            {"ItemType": lato["id"], "XP": 0},
            {"ItemType": "/Lotus/Unbekannt/Ding", "XP": 5000},
        ]}]}
        erg = wf_profil.auswerten(profil, server.state["items"], server.state["bp_index"], server.state["teile_index"])
        self.assertEqual(erg["name"], "Test")
        self.assertEqual(erg["mr"], 29)
        nach = {i["id"]: i for i in erg["items"]}
        self.assertEqual(nach[rhino["id"]]["s"], 3)
        self.assertEqual(nach[soma["id"]]["s"], 2)
        self.assertEqual(nach[soma["id"]]["rang"], 15)
        self.assertNotIn(lato["id"], nach)
        self.assertEqual(erg["anzahlNichtZugeordnet"], 1)

    def test_inventar_mit_bau_und_teilen(self):
        rhino = finde("Rhino")
        teil = next(z for z in rhino["rezept"]["zutaten"] if z["art"] == "teil")
        inv = {"Suits": [{"ItemType": finde("Excalibur")["id"], "XP": 900000}],
               "PendingRecipes": [{"ItemType": rhino["bpId"]}],
               "MiscItems": [{"ItemType": teil["id"], "ItemCount": 1}],
               "Recipes": [{"ItemType": teil["bp"], "ItemCount": 2}]}
        erg = wf_profil.auswerten(inv, server.state["items"], server.state["bp_index"], server.state["teile_index"])
        self.assertEqual(erg["quelle"], "inventar")
        nach = {i["id"]: i for i in erg["items"]}
        self.assertEqual(nach[finde("Excalibur")["id"]]["s"], 3)
        self.assertEqual(nach[rhino["id"]]["s"], 1)
        self.assertEqual(erg["besitz"][teil["id"]], 1)
        self.assertEqual(erg["besitz"][teil["bp"]], 2)

    def test_kein_profil(self):
        with self.assertRaises(wf_profil.ImportFehler):
            wf_profil.auswerten({"foo": 1}, server.state["items"])
        with self.assertRaises(wf_profil.ImportFehler):
            wf_profil.auswerten([1, 2], server.state["items"])


class Datenbank(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = json.loads((BASIS / "daten" / "items.json").read_text(encoding="utf-8"))

    def test_grundregeln(self):
        ids = [i["id"] for i in self.db["items"]]
        self.assertEqual(len(ids), len(set(ids)), "doppelte Item-IDs")
        self.assertGreater(len(ids), 700)
        for i in self.db["items"]:
            self.assertIn(i["xp"], (3000, 6000), i["name"])
            self.assertIn(i["kat"], self.db["meta"]["kategorien"], i["name"])
            self.assertIsInstance(i["mr"], int, i["name"])

    def test_bekannte_items(self):
        namen = {i["name"] for i in self.db["items"]}
        for n in ("Rhino", "Rhino Prime", "Braton", "Soma Prime", "Skana", "Carrier", "Odonata", "Lato", "Bonewidow", "Catchmoon"):
            self.assertIn(n, namen)

    def test_rezept_baum_ist_voll(self):
        rhino = next(i for i in self.db["items"] if i["name"] == "Rhino")
        self.assertEqual(rhino["rezept"]["kosten"], 25000)
        teile = [z for z in rhino["rezept"]["zutaten"] if z["art"] == "teil"]
        self.assertEqual(len(teile), 3)
        for t in teile:
            self.assertIn("rezept", t)
            self.assertTrue(t["rezept"]["zutaten"])

    def test_rohstoffe_haben_namen(self):
        for rid, r in self.db["res"].items():
            self.assertTrue(r["name"], rid)


class Serverlauf(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server.datenbank_laden()
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        cls.url = "http://127.0.0.1:%d" % cls.port

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def hole(self, pfad, daten=None, header=None, methode=None):
        h = {"Content-Type": "application/json"}
        h.update(header or {})
        anfrage = urllib.request.Request(self.url + pfad, data=None if daten is None else json.dumps(daten).encode(),
                                         headers=h, method=methode)
        try:
            with urllib.request.urlopen(anfrage, timeout=10) as a:
                return a.status, a.read()
        except urllib.error.HTTPError as f:
            return f.code, f.read()

    def test_seiten_und_daten(self):
        for pfad in ("/", "/app.js", "/rechnen.js", "/style.css", "/favicon.svg"):
            self.assertEqual(self.hole(pfad)[0], 200, pfad)
        code, roh = self.hole("/api/daten")
        self.assertEqual(code, 200)
        self.assertGreater(len(json.loads(roh)["items"]), 700)
        self.assertEqual(self.hole("/api/info")[0], 200)

    def test_pfadtricks(self):
        self.assertEqual(self.hole("/../server.py")[0], 404)
        self.assertEqual(self.hole("/%2e%2e/server.py")[0], 404)
        self.assertEqual(self.hole("/bild/..%2Fitems.json")[0], 404)
        self.assertEqual(self.hole("/bild/x.txt")[0], 404)
        self.assertEqual(self.hole("/icons/erzeugen.py")[0], 404, "Werkzeug-Dateien im Webordner werden nicht ausgeliefert")

    def test_schreibschutz(self):
        self.assertEqual(self.hole("/api/zustand", {"items": {}}, methode="POST")[0], 403)
        self.assertEqual(self.hole("/api/zustand", {"items": {}}, {"X-WFW": "1", "Origin": "http://evil.example"}, "POST")[0], 403)
        self.assertEqual(self.hole("/api/info", header={"Host": "evil.example"})[0], 403)

    def test_zustand_kreislauf(self):
        zustand = {"version": 1, "spieler": {"name": "T", "mr": 12}, "items": {"/x": {"s": 2, "w": True}}, "einst": {}}
        code, roh = self.hole("/api/zustand", zustand, {"X-WFW": "1"}, "POST")
        self.assertEqual(code, 200)
        rev = json.loads(roh)["rev"]
        code, roh = self.hole("/api/zustand")
        self.assertEqual(json.loads(roh)["items"]["/x"]["s"], 2)
        self.assertEqual(json.loads(roh)["rev"], rev)
        # zweiter Schreibvorgang mit der neuen Revision legt die Sicherung an
        zustand["items"]["/x"]["s"] = 3
        zustand["rev"] = rev
        self.assertEqual(self.hole("/api/zustand", zustand, {"X-WFW": "1"}, "POST")[0], 200)
        # veralteter Stand (alte Revision) wird abgelehnt, nichts wird ueberschrieben
        zustand["items"]["/x"]["s"] = 0
        zustand["rev"] = rev
        code, roh = self.hole("/api/zustand", zustand, {"X-WFW": "1"}, "POST")
        self.assertEqual(code, 409)
        self.assertEqual(json.loads(self.hole("/api/zustand")[1])["items"]["/x"]["s"], 3)
        self.assertTrue(list((Path(TEMP) / "sicherungen").glob("zustand_*.json")))
        self.assertEqual(self.hole("/api/zustand", {"items": "kaputt"}, {"X-WFW": "1"}, "POST")[0], 400)
        self.assertEqual(self.hole("/api/profile")[0], 404, "Profile gibt es nur im Familienmodus")
        self.assertEqual(self.hole("/api/profile", {"name": "X"}, {"X-WFW": "1"}, "POST")[0], 404)

    def test_einlesen(self):
        rhino = finde("Rhino")
        profil = {"Results": [{"DisplayName": "Z", "PlayerLevel": 5, "XPInfo": [{"ItemType": rhino["id"], "XP": 900000}]}]}
        code, roh = self.hole("/api/profil/einlesen", {"text": json.dumps(profil)}, {"X-WFW": "1"}, "POST")
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(roh)["items"][0]["s"], 3)
        code, roh = self.hole("/api/profil")
        self.assertTrue(json.loads(roh)["vorhanden"])
        self.assertEqual(self.hole("/api/profil/abrufen", {"accountId": "x"}, {"X-WFW": "1"}, "POST")[0], 404)
        self.assertEqual(self.hole("/api/profil/einlesen", {"text": "Quatsch"}, {"X-WFW": "1"}, "POST")[0], 400)


class Zugriffsregeln(unittest.TestCase):
    def test_host_im_lokalen_modus(self):
        self.assertTrue(server.host_erlaubt("127.0.0.1:8765", False))
        self.assertTrue(server.host_erlaubt("localhost", False))
        self.assertTrue(server.host_erlaubt("[::1]:8765", False))
        self.assertFalse(server.host_erlaubt("192.168.1.10:8765", False))
        self.assertFalse(server.host_erlaubt("raspberrypi.local", False))
        self.assertFalse(server.host_erlaubt("", False))

    def test_host_im_lan_modus(self):
        for ok in ("192.168.1.10:8765", "10.0.0.5", "172.16.3.4:80", "raspberrypi", "raspberrypi.local:8765",
                   "pi.fritz.box", "pi.lan", "127.0.0.1", "[fe80::1]:8765"):
            self.assertTrue(server.host_erlaubt(ok, True), ok)
        for schlecht in ("evil.example", "evil.example:8765", "8.8.8.8", "1.2.3.4:8765", "meine-seite.de", ""):
            self.assertFalse(server.host_erlaubt(schlecht, True), schlecht)

    def test_name_und_slug(self):
        self.assertEqual(server.profil_name_pruefen("  Papa  "), "Papa")
        self.assertEqual(server.profil_name_pruefen("Anna Lena"), "Anna Lena")
        self.assertEqual(server.profil_slug("Zoë"), "zoe")
        self.assertEqual(server.profil_slug("Anna Lena"), "anna-lena")
        self.assertTrue(server.SLUG_MUSTER.match(server.profil_slug("日本語")), "Namen ohne ASCII bekommen einen Hash")
        for schlecht in ("", " ", "../x", "a/b", "x" * 25, "-a", "a-", "<b>", "a\\nb"):
            with self.assertRaises(ValueError, msg=repr(schlecht)):
                server.profil_name_pruefen(schlecht)


class Familienmodus(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server.datenbank_laden()
        server.config["familie"] = True
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        cls.url = "http://127.0.0.1:%d" % cls.httpd.server_address[1]
        cls.kopf = {"X-WFW": "1"}

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        server.config["familie"] = False

    def hole(self, pfad, daten=None, header=None, methode=None):
        h = {"Content-Type": "application/json"}
        h.update(header or {})
        anfrage = urllib.request.Request(self.url + pfad, data=None if daten is None else json.dumps(daten).encode(),
                                         headers=h, method=methode)
        try:
            with urllib.request.urlopen(anfrage, timeout=10) as a:
                return a.status, json.loads(a.read() or b"{}")
        except urllib.error.HTTPError as f:
            try:
                return f.code, json.loads(f.read() or b"{}")
            except ValueError:
                return f.code, {}

    def test_1_modus_und_leere_liste(self):
        code, info = self.hole("/api/info")
        self.assertEqual(info["modus"], "familie")
        self.assertEqual(self.hole("/api/profile")[1]["profile"], [])
        self.assertEqual(self.hole("/api/zustand")[0], 400, "ohne Profil gibt es keinen Stand")

    def test_2_profile_anlegen_und_trennen(self):
        code, papa = self.hole("/api/profile", {"name": "Papa"}, self.kopf, "POST")
        self.assertEqual((code, papa["slug"]), (200, "papa"))
        self.assertEqual(self.hole("/api/profile", {"name": "papa"}, self.kopf, "POST")[0], 409, "gleicher Name")
        self.assertEqual(self.hole("/api/profile", {"name": "../x"}, self.kopf, "POST")[0], 400)
        self.assertEqual(self.hole("/api/profile", {"name": "Zoë"}, self.kopf, "POST")[1]["slug"], "zoe")
        self.assertEqual([p["name"] for p in self.hole("/api/profile")[1]["profile"]], ["Papa", "Zoë"])

        stand = self.hole("/api/zustand?profil=papa")[1]
        stand["items"]["/a"] = {"s": 3}
        stand["spieler"]["mr"] = 22
        code, antwort = self.hole("/api/zustand?profil=papa", stand, self.kopf, "POST")
        self.assertEqual((code, antwort["rev"]), (200, 1))
        self.assertEqual(self.hole("/api/zustand?profil=zoe")[1]["items"], {}, "Profile sind getrennt")
        liste = {p["slug"]: p for p in self.hole("/api/profile")[1]["profile"]}
        self.assertEqual((liste["papa"]["mr"], liste["papa"]["rang30"]), (22, 1))

    def test_3_konflikt_zwischen_geraeten(self):
        a = self.hole("/api/zustand?profil=zoe")[1]
        b = json.loads(json.dumps(a))
        a["items"]["/a"] = {"s": 2}
        self.assertEqual(self.hole("/api/zustand?profil=zoe", a, self.kopf, "POST")[0], 200)
        b["items"]["/b"] = {"s": 3}   # Geraet B kennt die neue Revision noch nicht
        code, antwort = self.hole("/api/zustand?profil=zoe", b, self.kopf, "POST")
        self.assertEqual(code, 409)
        self.assertEqual(antwort["rev"], 1)
        self.assertNotIn("/b", self.hole("/api/zustand?profil=zoe")[1]["items"])

    def test_4_ungueltige_und_fremde_profile(self):
        for schlecht in ("../../etc/passwd", "..%2F..%2Fdaten", "a/b", "", "X", "a" * 40):
            self.assertEqual(self.hole("/api/zustand?profil=" + schlecht)[0], 400, schlecht)
        self.assertEqual(self.hole("/api/zustand?profil=nichtda")[0], 404)
        self.assertEqual(self.hole("/api/zustand?profil=nichtda", {"items": {}}, self.kopf, "POST")[0], 404)
        self.assertFalse((Path(TEMP) / "profile" / "nichtda.json").exists())

    def test_5_nur_lokal_darf_die_datenbank_bauen(self):
        original = server.Handler._ist_lokal
        try:
            server.Handler._ist_lokal = lambda self: False
            self.assertEqual(self.hole("/api/info")[1]["admin"], False)
            self.assertEqual(self.hole("/api/db/aktualisieren", {}, self.kopf, "POST")[0], 403)
        finally:
            server.Handler._ist_lokal = original
        self.assertEqual(self.hole("/api/info")[1]["admin"], True)

    def test_6_einlesen_speichert_nichts_auf_dem_server(self):
        roh = Path(TEMP) / "profil_roh.json"
        if roh.exists():
            roh.unlink()
        profil = {"Results": [{"DisplayName": "Z", "PlayerLevel": 5, "XPInfo": [{"ItemType": finde("Rhino")["id"], "XP": 900000}]}]}
        code, antwort = self.hole("/api/profil/einlesen", {"text": json.dumps(profil)}, self.kopf, "POST")
        self.assertEqual(code, 200)
        self.assertEqual(antwort["items"][0]["s"], 3)
        self.assertFalse(roh.exists(), "im Familienmodus wird kein fremdes Profil abgelegt")
        self.assertFalse(self.hole("/api/profil")[1]["vorhanden"])

    def test_7_bilder_nur_aus_der_datenbank(self):
        self.assertEqual(self.hole("/bild/GibtEsNicht.png")[0], 404)
        self.assertEqual(self.hole("/bild/..%2Fitems.json")[0], 404)

    def test_8_zu_grosse_daten(self):
        groß = {"items": {"/x": {"n": "a" * (server.MAX_KOERPER_FAMILIE + 10)}}}
        try:
            code, _ = self.hole("/api/zustand?profil=papa", groß, self.kopf, "POST")
            self.assertEqual(code, 400)
        except (urllib.error.URLError, OSError):
            pass   # der Server bricht zu grosse Anfragen ab, bevor sie ganz gesendet sind
        self.assertNotIn("/x", self.hole("/api/zustand?profil=papa")[1]["items"])

    def test_9_loeschen_verschiebt_nur(self):
        self.assertEqual(self.hole("/api/profile/loeschen", {"slug": "zoe"}, self.kopf, "POST")[0], 200)
        self.assertEqual(self.hole("/api/zustand?profil=zoe")[0], 404)
        self.assertTrue(list((Path(TEMP) / "geloeschte_profile").glob("zoe_*.json")), "Sicherungskopie bleibt")
        self.assertEqual(self.hole("/api/profile/loeschen", {"slug": "zoe"}, self.kopf, "POST")[0], 404)
        self.assertEqual(self.hole("/api/profile/loeschen", {"slug": "../x"}, self.kopf, "POST")[0], 400)


class Versionen(unittest.TestCase):
    def test_version_ueberall_gleich(self):
        datei = (BASIS / "VERSION").read_text(encoding="utf-8").strip()
        self.assertEqual(datei, server.VERSION)
        self.assertIn("1.1.0" if server.VERSION == "1.1.0" else server.VERSION, (BASIS / "docs" / "START-HIER.md").read_text(encoding="utf-8"))
        self.assertRegex((BASIS / "Dockerfile").read_text(encoding="utf-8"), r"COPY .*\bVERSION\b")


class AutoUpdate(unittest.TestCase):
    def test_baut_nur_bei_alter_datenbank(self):
        aufrufe = []
        original = server.aktualisierung_starten
        server.aktualisierung_starten = lambda: aufrufe.append(1) or True
        alt = os.stat(server.ITEMS_DATEI).st_mtime
        try:
            os.utime(server.ITEMS_DATEI, (alt - 10 * 86400, alt - 10 * 86400))
            stopp = server.auto_aktualisierung_starten(7, pause=0.05)
            time.sleep(0.4)
            stopp.set()
            self.assertGreaterEqual(len(aufrufe), 1, "eine 10 Tage alte Datenbank wird erneuert")
            aufrufe.clear()
            os.utime(server.ITEMS_DATEI, None)
            stopp = server.auto_aktualisierung_starten(7, pause=0.05)
            time.sleep(0.4)
            stopp.set()
            self.assertEqual(aufrufe, [], "eine frische Datenbank bleibt in Ruhe")
        finally:
            server.aktualisierung_starten = original
            os.utime(server.ITEMS_DATEI, (alt, alt))


class DatenbankBau(unittest.TestCase):
    """Der Bau laeuft hier ohne Netz mit erfundenen Quelldaten, damit auch der Umbau der Ladereihenfolge abgesichert ist."""

    def test_bau_aus_erfundenen_quellen(self):
        import wf_daten
        ziel = Path(tempfile.mkdtemp(prefix="wfw_bau_"))
        bp = "/Lotus/Types/Recipes/Weapons/TestBlueprint"
        fer = "/Lotus/Types/Items/MiscItems/Ferrite"
        daten = {
            "Primary": [{"uniqueName": "/Lotus/Weapons/Test/Gewehr", "name": "Testgewehr", "masterable": True, "type": "Rifle",
                         "masteryReq": 3, "buildPrice": 1000, "buildTime": 60, "buildQuantity": 1, "tags": ["Tenno"],
                         "components": [{"uniqueName": bp, "itemCount": 1}, {"uniqueName": fer, "itemCount": 100}]}],
            "Components": [{"uniqueName": bp, "name": "Blueprint", "drops": [{"location": "Venus/Fossa (Assassination)", "chance": 20, "rarity": "Common"}]}],
            "Resources": [{"uniqueName": fer, "name": "Ferrite", "drops": [{"location": "Erde", "chance": 10}]}],
            "Relics": [{"name": "Lith A1 Intact", "vaulted": False}],
        }
        original = (wf_daten.lade_wfcd, wf_daten.lade_pe, wf_daten.DATEN, wf_daten.ITEMS_DATEI)
        wf_daten.lade_wfcd = lambda name, log: daten.get(name, [])
        wf_daten.lade_pe = lambda log: (None, None)
        wf_daten.DATEN, wf_daten.ITEMS_DATEI = ziel, ziel / "items.json"
        try:
            meta = wf_daten.baue(lambda s: None)
        finally:
            wf_daten.lade_wfcd, wf_daten.lade_pe, wf_daten.DATEN, wf_daten.ITEMS_DATEI = original
        erg = json.loads((ziel / "items.json").read_text(encoding="utf-8"))
        self.assertEqual(meta["anzahl"], 1)
        item = erg["items"][0]
        self.assertEqual((item["name"], item["kat"], item["xp"], item["mr"]), ("Testgewehr", "primary", 3000, 3))
        self.assertEqual(item["bpQuellen"][0]["ort"], "Venus/Fossa (Assassination)")
        self.assertEqual(item["rezept"]["zutaten"][0]["id"], fer)
        self.assertFalse(meta["rezepteVollstaendig"])
        shutil.rmtree(ziel)


class Rauchtest(unittest.TestCase):
    """Der Rauchtest wird gegen die Wirklichkeit getestet: gruen bei einem gesunden Server, rot bei einem kaputten."""

    @classmethod
    def setUpClass(cls):
        import rauchtest
        cls.rauchtest = rauchtest
        server.datenbank_laden()
        server.config["familie"] = True
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        cls.basis = "http://127.0.0.1:%d/" % cls.httpd.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        server.config["familie"] = False

    def lauf(self, schreibend=False):
        p = self.rauchtest.Pruefer(self.basis)
        import io
        import contextlib
        with contextlib.redirect_stdout(io.StringIO()):
            self.rauchtest.lesend(p, (BASIS / "VERSION").read_text(encoding="utf-8").strip())   # wie das echte Werkzeug
            if schreibend:
                self.rauchtest.schreibend(p)
        return p.fehler

    def test_gruen_bei_gesundem_server(self):
        self.assertEqual(self.lauf(schreibend=True), [])

    def test_rot_wenn_host_pruefung_fehlt(self):
        original = server.host_erlaubt
        server.host_erlaubt = lambda kopf, lan: True
        try:
            fehler = self.lauf()
        finally:
            server.host_erlaubt = original
        self.assertTrue(any("Host" in f for f in fehler), fehler)

    def test_rot_wenn_version_nicht_passt(self):
        original = server.VERSION
        server.VERSION = "0.0.1"
        try:
            fehler = self.lauf()
        finally:
            server.VERSION = original
        self.assertTrue(any("Version" in f for f in fehler), fehler)

    def test_rot_wenn_schreibschutz_fehlt(self):
        original = server.Handler._schreib_ok
        server.Handler._schreib_ok = lambda self: True
        try:
            fehler = self.lauf()
        finally:
            server.Handler._schreib_ok = original
        self.assertTrue(any("ohne Kennung" in f for f in fehler), fehler)


def compose_als_json():
    if not shutil.which("docker"):
        raise unittest.SkipTest("docker fehlt")
    env = dict(os.environ, BIND_ADDR="192.168.1.20", APP_PORT="8100", PUID="1000", PGID="1000")
    r = subprocess.run(["docker", "compose", "--project-directory", str(BASIS), "-f", str(BASIS / "compose.yaml"),
                        "config", "--format", "json"], env=env, capture_output=True, text=True)
    if r.returncode != 0:
        raise unittest.SkipTest("docker compose config nicht nutzbar: " + r.stderr[:200])
    return json.loads(r.stdout)


def pi_regeln_verstoesse(cfg, projektordner):
    """Die Regeln aus der Pi-Anleitung (Abschnitt Pi-tauglich machen) als Pruefung. Gibt die Verstoesse zurueck."""
    v = []
    for name, d in cfg["services"].items():
        s = "Dienst " + name + ": "
        if not str(d.get("container_name", "")).startswith("warframewilli-"):
            v.append(s + "container_name muss mit warframewilli- beginnen")
        if d.get("network_mode"):
            v.append(s + "network_mode ist verboten")
        if d.get("privileged"):
            v.append(s + "privileged ist verboten")
        if d.get("cap_add"):
            v.append(s + "cap_add ist verboten")
        if d.get("restart") != "unless-stopped":
            v.append(s + "restart muss unless-stopped sein")
        if not d.get("healthcheck"):
            v.append(s + "healthcheck fehlt")
        if (d.get("environment") or {}).get("TZ") != "Europe/Berlin":
            v.append(s + "TZ muss Europe/Berlin sein")
        if "no-new-privileges:true" not in (d.get("security_opt") or []):
            v.append(s + "no-new-privileges fehlt")
        if not d.get("read_only"):
            v.append(s + "read_only fehlt")
        if not d.get("user"):
            v.append(s + "user fehlt")
        if not d.get("mem_limit") or int(str(d["mem_limit"])) > 1024 * 1024 * 1024:
            v.append(s + "mem_limit fehlt oder ist groesser als 1 GiB")
        if not d.get("cpus") or float(str(d["cpus"])) > 2:
            v.append(s + "cpus fehlt oder ist groesser als 2")
        for vol in d.get("volumes") or []:
            quelle = str(vol.get("source", ""))
            if vol.get("type") != "bind" or "docker.sock" in quelle or not quelle.startswith(str(projektordner) + "/"):
                v.append(s + "nur Bind-Mounts unterhalb des Projektordners erlaubt: " + quelle)
        for port in d.get("ports") or []:
            pub = int(str(port["published"]))
            if not 8100 <= pub <= 8199:
                v.append(s + "Host-Port {} liegt nicht in 8100 bis 8199".format(pub))
            if port.get("host_ip") in (None, "", "0.0.0.0", "::"):
                v.append(s + "Port muss an die LAN-Adresse gebunden sein")
        for n in (d.get("networks") or {}):
            if n != "warframewilli-net":
                v.append(s + "fremdes Netz " + n)
    for netz, n in (cfg.get("networks") or {}).items():
        if netz != "warframewilli-net" or n.get("name") != "warframewilli-net":
            v.append("Netz {} hat nicht den festen Namen warframewilli-net".format(netz))
    return v


class PiRegeln(unittest.TestCase):
    def test_compose_haelt_alle_regeln_ein(self):
        self.assertEqual(pi_regeln_verstoesse(compose_als_json(), BASIS), [])

    def test_ohne_bind_adresse_startet_nichts(self):
        if not shutil.which("docker"):
            self.skipTest("docker fehlt")
        env = {k: v for k, v in os.environ.items() if k != "BIND_ADDR"}
        r = subprocess.run(["docker", "compose", "--project-directory", str(BASIS), "-f", str(BASIS / "compose.yaml"), "config"],
                           env=env, capture_output=True, text=True)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("BIND_ADDR", r.stderr)

    def test_gegenproben_jeder_verstoss_wird_gefunden(self):
        gut = compose_als_json()
        dienst = lambda c: c["services"]["app"]
        faelle = {
            "network_mode": lambda c: dienst(c).update(network_mode="host"),
            "privileged": lambda c: dienst(c).update(privileged=True),
            "cap_add": lambda c: dienst(c).update(cap_add=["NET_ADMIN"]),
            "restart": lambda c: dienst(c).update(restart="always"),
            "healthcheck": lambda c: dienst(c).pop("healthcheck"),
            "TZ": lambda c: dienst(c)["environment"].update(TZ="UTC"),
            "no-new-privileges": lambda c: dienst(c).update(security_opt=[]),
            "read_only": lambda c: dienst(c).update(read_only=False),
            "user": lambda c: dienst(c).pop("user"),
            "mem_limit": lambda c: dienst(c).pop("mem_limit"),
            "cpus": lambda c: dienst(c).pop("cpus"),
            "container_name": lambda c: dienst(c).update(container_name="app"),
            "Docker-Socket": lambda c: dienst(c)["volumes"].append({"type": "bind", "source": "/var/run/docker.sock", "target": "/s"}),
            "Fremder Ordner": lambda c: dienst(c)["volumes"].append({"type": "bind", "source": "/home/pi/docker", "target": "/d"}),
            "Port 8081": lambda c: dienst(c)["ports"][0].update(published="8081"),
            "Port 80": lambda c: dienst(c)["ports"][0].update(published="80"),
            "Bindung 0.0.0.0": lambda c: dienst(c)["ports"][0].update(host_ip="0.0.0.0"),
            "fremdes Netz": lambda c: dienst(c)["networks"].update({"docker_default": None}),
            "Netzname": lambda c: c["networks"]["warframewilli-net"].update(name="egal"),
        }
        for name, aendern in faelle.items():
            kopie = json.loads(json.dumps(gut))
            aendern(kopie)
            self.assertNotEqual(pi_regeln_verstoesse(kopie, BASIS), [], "Verstoss nicht erkannt: " + name)


class PiSkripte(unittest.TestCase):
    """Die Skripte fuer den Pi laufen hier gegen Attrappen von docker, rsync und ssh. Nichts verlaesst den Rechner."""

    def attrappen(self, ordner):
        bin_ = ordner / "bin"
        bin_.mkdir()
        protokoll = ordner / "aufrufe.log"
        for name, antwort in (("docker", 'case "$*" in "inspect"*) echo healthy;; esac'), ("rsync", ""), ("ssh", "")):
            f = bin_ / name
            f.write_text('#!/bin/sh\necho "{} $*" >> "{}"\n{}\nexit 0\n'.format(name, protokoll, antwort))
            f.chmod(f.stat().st_mode | stat.S_IXUSR)
        return dict(os.environ, PATH=str(bin_) + os.pathsep + os.environ["PATH"]), protokoll

    def projektkopie(self, ordner):
        ziel = ordner / "projekt"
        (ziel / "pi").mkdir(parents=True)
        for datei in ("compose.yaml", "VERSION"):
            shutil.copy2(BASIS / datei, ziel / datei)
        for datei in ("pi-start.sh", "sichern.sh"):
            shutil.copy2(BASIS / "pi" / datei, ziel / "pi" / datei)
        return ziel

    def lauf(self, ziel, env, *args):
        return subprocess.run(["bash", str(ziel / "pi" / "pi-start.sh")] + list(args), cwd=ziel, env=env, capture_output=True, text=True)

    def test_pi_start_lehnt_falsche_angaben_ab(self):
        ordner = Path(tempfile.mkdtemp(prefix="wfw_pi_"))
        env, protokoll = self.attrappen(ordner)
        ziel = self.projektkopie(ordner)
        for args in (("0.0.0.0", "8100"), ("meinpi.local", "8100"), ("192.168.1.20", "8081"), ("192.168.1.20", "80"),
                     ("192.168.1.20", "8200"), ("192.168.1.20", ""), ("", "")):
            r = self.lauf(ziel, env, *args)
            self.assertEqual(r.returncode, 1, args)
            self.assertIn("FEHLER", r.stdout)
        self.assertFalse(protokoll.exists(), "bei falschen Angaben darf kein docker-Aufruf passieren")
        self.assertFalse((ziel / "data").exists())
        shutil.rmtree(ordner)

    def test_pi_start_legt_alles_an_und_ruft_nur_dieses_projekt_auf(self):
        ordner = Path(tempfile.mkdtemp(prefix="wfw_pi_"))
        env, protokoll = self.attrappen(ordner)
        ziel = self.projektkopie(ordner)
        r = self.lauf(ziel, env, "192.168.1.20", "8100")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        for d in ("profile", "sicherungen", "bilder", "geloeschte_profile"):
            self.assertTrue((ziel / "data" / d).is_dir(), d)
        env_text = (ziel / ".env").read_text()
        self.assertIn("BIND_ADDR=192.168.1.20", env_text)
        self.assertIn("APP_PORT=8100", env_text)
        self.assertEqual(oct((ziel / ".env").stat().st_mode & 0o777), "0o600")
        aufrufe = protokoll.read_text()
        self.assertIn("docker compose up -d --build", aufrufe)
        for verboten in ("prune", "down", " rm ", "stop", "restart", "system", "volume", "run ", "exec", "-v "):
            self.assertNotIn(verboten, aufrufe, verboten)
        # zweiter Lauf mit gleicher .env geht, mit abweichender wird verweigert, ohne dass docker aufgerufen wird
        self.assertEqual(self.lauf(ziel, env, "192.168.1.20", "8100").returncode, 0)
        protokoll.unlink()
        r = self.lauf(ziel, env, "192.168.1.20", "8101")
        self.assertEqual(r.returncode, 1)
        self.assertFalse(protokoll.exists())
        shutil.rmtree(ordner)

    def test_sichern_prueft_die_kopie(self):
        ordner = Path(tempfile.mkdtemp(prefix="wfw_sichern_"))
        ziel = self.projektkopie(ordner)
        skript = ["bash", str(ziel / "pi" / "sichern.sh")]
        r = subprocess.run(skript, cwd=ziel, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0)
        self.assertIn("Nichts zu sichern", r.stdout)
        profile = ziel / "data" / "profile"
        profile.mkdir(parents=True)
        (profile / "papa.json").write_text(json.dumps({"items": {"/a": {"s": 3}}, "rev": 1}))
        (profile / "lena.json").write_text(json.dumps({"items": {}, "rev": 0}))
        r = subprocess.run(skript, cwd=ziel, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("2 Profile gueltig", r.stdout)
        self.assertEqual(len(list((ziel / "backup").glob("profile-*.tgz"))), 1)
        (profile / "kaputt.json").write_text("{ das ist kein json")
        r = subprocess.run(skript, cwd=ziel, capture_output=True, text=True)
        self.assertNotEqual(r.returncode, 0, "ein beschaedigtes Profil darf die Pruefung nicht bestehen")
        shutil.rmtree(ordner)


class MakeDeploy(unittest.TestCase):
    """Der Deploy ist durch zwei Rueckfragen geschuetzt, die nur der Projektinhaber beantwortet. Hier wird NIE geantwortet."""

    def lauf(self, *ziele, stdin=subprocess.DEVNULL):
        ordner = Path(tempfile.mkdtemp(prefix="wfw_make_"))
        bin_ = ordner / "bin"
        bin_.mkdir()
        protokoll = ordner / "aufrufe.log"
        for name in ("rsync", "ssh", "docker"):
            f = bin_ / name
            f.write_text('#!/bin/sh\necho "{} $*" >> "{}"\nexit 0\n'.format(name, protokoll))
            f.chmod(f.stat().st_mode | stat.S_IXUSR)
        env = dict(os.environ, PATH=str(bin_) + os.pathsep + os.environ["PATH"])
        r = subprocess.run(["make", "-C", str(BASIS)] + list(ziele), env=env, stdin=stdin, capture_output=True, text=True)
        aufrufe = protokoll.read_text() if protokoll.exists() else ""
        shutil.rmtree(ordner)
        return r, aufrufe

    def test_ohne_antwort_passiert_nichts(self):
        r, aufrufe = self.lauf("deploy", "PI_HOST=pi@192.168.1.20")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("Abgebrochen", r.stdout)
        self.assertEqual(aufrufe, "", "ohne die zwei Antworten darf weder rsync noch ssh laufen")

    def test_ohne_pi_host_wird_nichts_geraten(self):
        for ziel in ("deploy", "deploy-trocken", "pi-status"):
            r, aufrufe = self.lauf(ziel)
            self.assertNotEqual(r.returncode, 0, ziel)
            self.assertIn("PI_HOST fehlt", r.stdout + r.stderr)
            self.assertEqual(aufrufe, "")
        r, aufrufe = self.lauf("deploy-trocken", "PI_HOST=pi@meinpi.local")
        self.assertNotEqual(r.returncode, 0, "ein Name statt der LAN-IP wird abgelehnt")
        self.assertEqual(aufrufe, "")

    def test_trockenlauf_verlangt_dry_run_und_haelt_daten_zurueck(self):
        r, aufrufe = self.lauf("deploy-trocken", "PI_HOST=pi@192.168.1.20")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("--dry-run", aufrufe)
        self.assertIn("--itemize-changes", aufrufe)
        for ausgeschlossen in ("--exclude /data", "--exclude /backup", "--exclude /daten", "--exclude .env", "--exclude .env.*",
                               "--exclude .git", "--exclude /.local", "--exclude /tests", "--exclude /start.sh",
                               "--exclude WarframeWilli.desktop*", "--exclude /web/icons/erzeugen.py"):
            self.assertIn(ausgeschlossen, aufrufe, ausgeschlossen)
        self.assertNotIn("ssh ", aufrufe)

    def test_in_der_deploy_regel_stehen_die_fragen_vor_dem_uebertragen(self):
        text = (BASIS / "Makefile").read_text(encoding="utf-8")
        regel = text[text.index("\ndeploy: "):text.index("\npi-status:")]
        erste_frage, zweite_frage = regel.index("BESTAETIGUNG 1/2"), regel.index("BESTAETIGUNG 2/2")
        uebertragen = min(regel.index("_rsync PI_HOST"), regel.index("ssh $(PI_HOST)"))
        self.assertLess(erste_frage, zweite_frage)
        self.assertLess(zweite_frage, uebertragen)
        self.assertEqual(text.count("read -p"), 2)
        self.assertNotIn("-v", " ".join(l for l in text.splitlines() if "docker compose down" in l).replace("--", ""))


class Regeln(unittest.TestCase):
    def test_keine_gedankenstriche_und_kein_gendern(self):
        """Projektregel: weder Gedankenstrich noch Gender-Sternchen in Dateien."""
        verboten = ["—", "–", "*innen", ":innen", "_innen", "/innen", "·innen"]
        fehler = []
        for pfad in BASIS.rglob("*"):
            if not pfad.is_file() or pfad.suffix not in (".py", ".js", ".css", ".html", ".md", ".json", ".sh", ".desktop", ".svg", ".vorlage", ".webmanifest", ".yaml", ".example"):
                continue
            if any(t in pfad.parts for t in ("bilder", "sicherungen", "__pycache__")) or pfad.name in ("zustand.json", "profil_roh.json", "test_alles.py"):
                continue
            text = pfad.read_text(encoding="utf-8", errors="replace")
            for v in verboten:
                if v in text:
                    fehler.append("{} enthaelt {!r}".format(pfad.relative_to(BASIS), v))
        self.assertEqual(fehler, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
