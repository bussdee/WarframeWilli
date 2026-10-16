#!/usr/bin/env python3
"""WarframeWilli: lokaler Server (nur Python-Standardbibliothek).

Liefert die Oberflaeche aus web/, speichert den Fortschritt in daten/zustand.json,
wertet eingefügte Profil- und Inventardaten aus und baut die Item-Datenbank. Lauscht nur auf 127.0.0.1.

Start:  python3 server.py [--port 8765] [--oeffnen]
"""
import argparse
import json
import mimetypes
import os
import re
import shutil
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

import wf_daten
import wf_profil

BASIS = Path(__file__).resolve().parent
WEB = BASIS / "web"
DATEN = Path(os.environ.get("WFW_DATEN") or (BASIS / "daten"))
ITEMS_DATEI = DATEN / "items.json"
ZUSTAND_DATEI = DATEN / "zustand.json"
PROFIL_DATEI = DATEN / "profil_roh.json"
BILDER = DATEN / "bilder"
SICHERUNGEN = DATEN / "sicherungen"
VERSION = "1.0.0"

MAX_KOERPER = 8 * 1024 * 1024
STANDARD_PORT = 8765

sperre = threading.Lock()
bild_ampel = threading.Semaphore(4)
bild_fehler = set()
aktualisierung = {"laeuft": False, "log": [], "fehler": None}
state = {"items": {}, "bp_index": {}, "teile_index": set(), "meta": {}}


def lese_json(pfad, standard):
    try:
        return json.loads(Path(pfad).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return standard


def schreibe_json_atomar(pfad, daten):
    pfad = Path(pfad)
    tmp = pfad.with_suffix(pfad.suffix + ".tmp")
    tmp.write_text(json.dumps(daten, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(pfad)


def teile_sammeln(zutaten, ziel):
    for z in zutaten:
        if z.get("art") == "teil":
            ziel.add(z["id"])
            if z.get("bp"):
                ziel.add(z["bp"])
        if z.get("rezept"):
            teile_sammeln(z["rezept"].get("zutaten", []), ziel)


def datenbank_laden():
    db = lese_json(ITEMS_DATEI, None)
    if not db:
        state.update(items={}, bp_index={}, teile_index=set(), meta={})
        return False
    index = {i["id"]: i for i in db["items"]}
    bp_index = {i["bpId"]: i["id"] for i in db["items"] if i.get("bpId")}
    teile = set()
    for i in db["items"]:
        if i.get("bpId"):
            teile.add(i["bpId"])
        if i.get("rezept"):
            teile_sammeln(i["rezept"].get("zutaten", []), teile)
    state.update(items=index, bp_index=bp_index, teile_index=teile, meta=db.get("meta", {}))
    return True


def zustand_sichern():
    """Legt vor dem Ueberschreiben eine Sicherung an (hoechstens alle 15 Minuten, 40 Stueck)."""
    if not ZUSTAND_DATEI.exists():
        return
    SICHERUNGEN.mkdir(exist_ok=True)
    vorhandene = sorted(SICHERUNGEN.glob("zustand_*.json"))
    if vorhandene and time.time() - vorhandene[-1].stat().st_mtime < 15 * 60:
        return
    name = "zustand_{}.json".format(datetime.now().strftime("%Y%m%d_%H%M%S"))
    shutil.copy2(ZUSTAND_DATEI, SICHERUNGEN / name)
    for alt in sorted(SICHERUNGEN.glob("zustand_*.json"))[:-40]:
        alt.unlink()


def zustand_pruefen(daten):
    if not isinstance(daten, dict) or not isinstance(daten.get("items", {}), dict):
        raise ValueError("Der Spielstand muss ein JSON-Objekt mit dem Feld 'items' sein.")
    daten.setdefault("version", 1)
    daten.setdefault("items", {})
    daten.setdefault("spieler", {})
    daten.setdefault("einst", {})
    return daten


def aktualisierung_starten():
    with sperre:
        if aktualisierung["laeuft"]:
            return False
        aktualisierung.update(laeuft=True, log=[], fehler=None)

    def arbeit():
        try:
            wf_daten.baue(lambda s: aktualisierung["log"].append(s))
            datenbank_laden()
        except Exception as fehler:  # noqa: BLE001
            aktualisierung["fehler"] = str(fehler)
        finally:
            aktualisierung["laeuft"] = False

    threading.Thread(target=arbeit, daemon=True).start()
    return True


def verkleinern(roh):
    """Haelt den Zwischenspeicher klein, falls Pillow vorhanden ist. Ohne Pillow bleibt das Original."""
    try:
        import io
        from PIL import Image
        bild = Image.open(io.BytesIO(roh))
        bild.thumbnail((128, 128))
        puffer = io.BytesIO()
        bild.save(puffer, "PNG", optimize=True)
        return puffer.getvalue()
    except Exception:  # noqa: BLE001 jede Panne hier ist unkritisch
        return roh


def bild_holen(name):
    """Liefert (bytes, mime) aus dem Zwischenspeicher oder vom Wiki. None, wenn nicht verfuegbar."""
    if not re.match(r"^[A-Za-z0-9_.\-]{1,120}\.(png|jpg|jpeg|webp)$", name):
        return None
    pfad = BILDER / name
    if pfad.exists():
        return pfad.read_bytes(), mimetypes.guess_type(name)[0] or "image/png"
    if name in bild_fehler:
        return None
    with bild_ampel:
        if pfad.exists():
            return pfad.read_bytes(), mimetypes.guess_type(name)[0] or "image/png"
        for url in ("https://raw.githubusercontent.com/wfcd/warframe-items/master/data/img/" + name,
                    "https://wiki.warframe.com/images/" + name):
            try:
                anfrage = urllib.request.Request(url, headers={"User-Agent": wf_daten.UA})
                with urllib.request.urlopen(anfrage, timeout=15) as antwort:
                    typ = antwort.headers.get("Content-Type", "")
                    roh = antwort.read(3 * 1024 * 1024)
                if typ.startswith("image/") and roh:
                    roh = verkleinern(roh)
                    BILDER.mkdir(exist_ok=True)
                    pfad.write_bytes(roh)
                    return roh, typ
            except (urllib.error.URLError, TimeoutError, OSError):
                continue
    bild_fehler.add(name)
    return None


class Handler(BaseHTTPRequestHandler):
    server_version = "WarframeWilli/" + VERSION
    protocol_version = "HTTP/1.0"

    def log_message(self, fmt, *args):  # ruhig bleiben
        pass

    # ---- Hilfen
    def _senden(self, code, koerper, typ="application/json; charset=utf-8", extra=None):
        if isinstance(koerper, (dict, list)):
            koerper = json.dumps(koerper, ensure_ascii=False).encode("utf-8")
        elif isinstance(koerper, str):
            koerper = koerper.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", typ)
        self.send_header("Content-Length", str(len(koerper)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(koerper)

    def _fehler(self, code, text):
        self._senden(code, {"ok": False, "fehler": text})

    def _host_ok(self):
        host = (self.headers.get("Host") or "").split(":")[0].lower()
        return host in ("127.0.0.1", "localhost", "[::1]")

    def _schreib_ok(self):
        """Schreibende Aufrufe nur von der eigenen Seite (Schutz gegen fremde Webseiten)."""
        if self.headers.get("X-WFW") != "1":
            return False
        herkunft = self.headers.get("Origin")
        if herkunft:
            host = urlparse(herkunft).hostname or ""
            return host in ("127.0.0.1", "localhost", "::1")
        return True

    def _koerper_lesen(self):
        laenge = int(self.headers.get("Content-Length") or 0)
        if laenge > MAX_KOERPER:
            raise ValueError("Die Daten sind zu groß.")
        roh = self.rfile.read(laenge) if laenge else b""
        return json.loads(roh.decode("utf-8")) if roh else {}

    # ---- Verteiler
    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        if not self._host_ok():
            return self._fehler(403, "Ungültiger Host.")
        pfad = unquote(urlparse(self.path).path)
        try:
            if pfad == "/api/info":
                return self._senden(200, {
                    "version": VERSION, "datenbank": state["meta"], "hatProfil": PROFIL_DATEI.exists(),
                    "aktualisierung": {"laeuft": aktualisierung["laeuft"], "log": aktualisierung["log"][-30:],
                                       "fehler": aktualisierung["fehler"]},
                })
            if pfad == "/api/daten":
                if not ITEMS_DATEI.exists():
                    return self._fehler(404, "Keine Datenbank vorhanden. Bitte aktualisieren.")
                return self._senden(200, ITEMS_DATEI.read_bytes())
            if pfad == "/api/zustand":
                return self._senden(200, lese_json(ZUSTAND_DATEI, {"version": 1, "items": {}, "spieler": {}, "einst": {}}))
            if pfad == "/api/profil":
                roh = lese_json(PROFIL_DATEI, None)
                if roh is None:
                    return self._senden(200, {"ok": True, "vorhanden": False})
                erg = wf_profil.auswerten(roh, state["items"], state["bp_index"], state["teile_index"])
                erg.update(ok=True, vorhanden=True)
                return self._senden(200, erg)
            if pfad.startswith("/bild/"):
                treffer = bild_holen(pfad[len("/bild/"):])
                if treffer is None:
                    return self._senden(404, b"", "text/plain")
                return self._senden(200, treffer[0], treffer[1], {"Cache-Control": "max-age=604800"})
            return self._statisch(pfad)
        except wf_profil.ImportFehler as fehler:
            return self._fehler(400, str(fehler))
        except Exception as fehler:  # noqa: BLE001
            return self._fehler(500, "Interner Fehler: {}".format(fehler))

    def _statisch(self, pfad):
        if pfad in ("", "/"):
            pfad = "/index.html"
        ziel = (WEB / pfad.lstrip("/")).resolve()
        if WEB.resolve() not in ziel.parents or not ziel.is_file():
            return self._fehler(404, "Nicht gefunden.")
        typ = mimetypes.guess_type(str(ziel))[0] or "application/octet-stream"
        if typ.startswith("text/") or typ in ("application/javascript", "image/svg+xml"):
            typ += "; charset=utf-8"
        return self._senden(200, ziel.read_bytes(), typ)

    def do_PUT(self):
        self.do_POST()

    def do_POST(self):
        if not self._host_ok() or not self._schreib_ok():
            return self._fehler(403, "Nicht erlaubt.")
        pfad = urlparse(self.path).path
        try:
            daten = self._koerper_lesen()
            if pfad == "/api/zustand":
                daten = zustand_pruefen(daten)
                with sperre:
                    DATEN.mkdir(exist_ok=True)
                    zustand_sichern()
                    schreibe_json_atomar(ZUSTAND_DATEI, daten)
                return self._senden(200, {"ok": True})
            if pfad == "/api/db/aktualisieren":
                gestartet = aktualisierung_starten()
                return self._senden(200, {"ok": True, "gestartet": gestartet})
            if pfad == "/api/profil/einlesen":
                try:
                    roh = json.loads(daten.get("text", ""))
                except ValueError:
                    return self._fehler(400, "Das ist kein gültiger JSON-Text. Bitte den kompletten Text einfügen.")
                erg = wf_profil.auswerten(roh, state["items"], state["bp_index"], state["teile_index"])
                if erg["quelle"] == "profil":
                    with sperre:
                        schreibe_json_atomar(PROFIL_DATEI, roh)
                erg.update(ok=True, vorhanden=True)
                return self._senden(200, erg)
            return self._fehler(404, "Unbekannter Aufruf.")
        except wf_profil.ImportFehler as fehler:
            return self._fehler(400, str(fehler))
        except ValueError as fehler:
            return self._fehler(400, str(fehler))
        except Exception as fehler:  # noqa: BLE001
            return self._fehler(500, "Interner Fehler: {}".format(fehler))


def port_frei(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) != 0


def laeuft_schon(port):
    try:
        with urllib.request.urlopen("http://127.0.0.1:{}/api/info".format(port), timeout=1) as a:
            return b'"datenbank"' in a.read()
    except (urllib.error.URLError, OSError, ValueError):
        return False


def main():
    ap = argparse.ArgumentParser(description="WarframeWilli Server")
    ap.add_argument("--port", type=int, default=int(os.environ.get("WFW_PORT", STANDARD_PORT)))
    ap.add_argument("--oeffnen", action="store_true", help="Browser automatisch öffnen")
    args = ap.parse_args()

    DATEN.mkdir(exist_ok=True)
    if laeuft_schon(args.port):
        url = "http://127.0.0.1:{}/".format(args.port)
        print("WarframeWilli läuft bereits: " + url)
        if args.oeffnen:
            webbrowser.open(url)
        return 0
    port = args.port
    while not port_frei(port) and port < args.port + 20:
        port += 1
    if not datenbank_laden():
        print("Keine Datenbank gefunden, baue sie jetzt (dauert etwa 10 Sekunden) ...")
        try:
            wf_daten.baue(print)
            datenbank_laden()
        except Exception as fehler:  # noqa: BLE001
            print("Achtung: Datenbank konnte nicht gebaut werden: {}".format(fehler))
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    url = "http://127.0.0.1:{}/".format(port)
    print("WarframeWilli {} läuft: {}".format(VERSION, url))
    print("Beenden mit Strg+C.")
    if args.oeffnen:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nBeendet.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
