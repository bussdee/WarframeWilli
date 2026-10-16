#!/usr/bin/env python3
"""WarframeWilli: Tests fuer Rechnung, Import, Datenbank und Server.

Aufruf:  python3 tests/test_alles.py     (kein Netzwerk noetig)
"""
import json
import os
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

    def test_schreibschutz(self):
        self.assertEqual(self.hole("/api/zustand", {"items": {}}, methode="POST")[0], 403)
        self.assertEqual(self.hole("/api/zustand", {"items": {}}, {"X-WFW": "1", "Origin": "http://evil.example"}, "POST")[0], 403)
        self.assertEqual(self.hole("/api/info", header={"Host": "evil.example"})[0], 403)

    def test_zustand_kreislauf(self):
        zustand = {"version": 1, "spieler": {"name": "T", "mr": 12}, "items": {"/x": {"s": 2, "w": True}}, "einst": {}}
        self.assertEqual(self.hole("/api/zustand", zustand, {"X-WFW": "1"}, "POST")[0], 200)
        code, roh = self.hole("/api/zustand")
        self.assertEqual(json.loads(roh)["items"]["/x"]["s"], 2)
        # zweiter Schreibvorgang legt die Sicherung an
        zustand["items"]["/x"]["s"] = 3
        self.hole("/api/zustand", zustand, {"X-WFW": "1"}, "POST")
        self.assertTrue(list((Path(TEMP) / "sicherungen").glob("zustand_*.json")))
        self.assertEqual(self.hole("/api/zustand", {"items": "kaputt"}, {"X-WFW": "1"}, "POST")[0], 400)

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


class Regeln(unittest.TestCase):
    def test_keine_gedankenstriche_und_kein_gendern(self):
        """Projektregel: weder Gedankenstrich noch Gender-Sternchen in Dateien."""
        verboten = ["—", "–", "*innen", ":innen", "_innen", "/innen", "·innen"]
        fehler = []
        for pfad in BASIS.rglob("*"):
            if not pfad.is_file() or pfad.suffix not in (".py", ".js", ".css", ".html", ".md", ".json", ".sh", ".desktop", ".svg"):
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
