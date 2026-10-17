#!/usr/bin/env python3
"""WarframeWilli: Server (nur Python-Standardbibliothek).

Liefert die Oberflaeche aus web/, speichert den Fortschritt, wertet eingefügte Profil- und
Inventardaten aus und baut die Item-Datenbank.

Zwei Betriebsarten:
  lokal    (Standard)  nur auf 127.0.0.1, ein Fortschritt in daten/zustand.json.
  familie  (--lan)     im Heimnetz erreichbar (z. B. auf einem Raspberry Pi), jeder Benutzer hat ein
                       eigenes Profil unter daten/profile/. Ohne Anmeldung, nur fuer vertrauenswuerdige Netze.

Start:  python3 server.py [--port 8765] [--oeffnen] [--lan]
"""
import argparse
import hashlib
import ipaddress
import json
import mimetypes
import os
import re
import shutil
import socket
import sys
import threading
import time
import unicodedata
import urllib.error
import urllib.request
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import wf_daten
import wf_profil

BASIS = Path(__file__).resolve().parent
WEB = BASIS / "web"
DATEN = Path(os.environ.get("WFW_DATEN") or (BASIS / "daten"))
ITEMS_DATEI = DATEN / "items.json"
ZUSTAND_DATEI = DATEN / "zustand.json"
PROFIL_DATEI = DATEN / "profil_roh.json"
PROFILE = DATEN / "profile"
GELOESCHT = DATEN / "geloeschte_profile"
BILDER = DATEN / "bilder"
SICHERUNGEN = DATEN / "sicherungen"
VERSION = "1.1.0"

MAX_KOERPER_LOKAL = 8 * 1024 * 1024
MAX_KOERPER_FAMILIE = 3 * 1024 * 1024
MAX_PROFILE = 30
STANDARD_PORT = 8765
NAME_MUSTER = re.compile(r"^[^\W_](?:[\w .\-]{0,22}[^\W_])?$")
SLUG_MUSTER = re.compile(r"^[a-z0-9][a-z0-9\-]{0,31}$")
WEB_ENDUNGEN = {".html", ".js", ".css", ".svg", ".png", ".ico", ".webmanifest", ".txt"}

mimetypes.add_type("application/manifest+json", ".webmanifest")

sperre = threading.Lock()
bild_ampel = threading.Semaphore(4)
bild_fehler = set()
aktualisierung = {"laeuft": False, "log": [], "fehler": None}
state = {"items": {}, "bp_index": {}, "teile_index": set(), "meta": {}, "bilder": set(), "mtime": None}
config = {"familie": False, "autoUpdateTage": 0}


class Konflikt(Exception):
    """Der gespeicherte Stand ist neuer als der, auf dem der Client aufgebaut hat."""

    def __init__(self, rev):
        Exception.__init__(self, "Konflikt")
        self.rev = rev


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
    try:
        mtime = ITEMS_DATEI.stat().st_mtime
    except OSError:
        mtime = None
    db = lese_json(ITEMS_DATEI, None)
    if not db:
        state.update(items={}, bp_index={}, teile_index=set(), meta={}, bilder=set(), mtime=None)
        return False
    index = {i["id"]: i for i in db["items"]}
    bp_index = {i["bpId"]: i["id"] for i in db["items"] if i.get("bpId")}
    teile = set()
    for i in db["items"]:
        if i.get("bpId"):
            teile.add(i["bpId"])
        if i.get("rezept"):
            teile_sammeln(i["rezept"].get("zutaten", []), teile)
    state.update(items=index, bp_index=bp_index, teile_index=teile, meta=db.get("meta", {}),
                 bilder={i["bild"] for i in db["items"] if i.get("bild")}, mtime=mtime)
    return True


def datenbank_pruefen():
    """Laedt die Datenbank neu, wenn sie von aussen (z. B. per Wochen-Timer) ersetzt wurde."""
    try:
        mtime = ITEMS_DATEI.stat().st_mtime
    except OSError:
        return
    if mtime != state.get("mtime"):
        datenbank_laden()


# ---------------------------------------------------------------- Zugriffsregeln

def host_erlaubt(kopf, lan):
    """Prueft den Host-Kopf (Schutz gegen DNS-Rebinding). Im LAN-Modus sind private Adressen und lokale Namen erlaubt."""
    host = (kopf or "").strip().lower()
    if host.startswith("["):
        host = host[1:].split("]")[0]
    else:
        host = host.split(":")[0]
    if host in ("127.0.0.1", "localhost", "::1"):
        return True
    if not lan or not host:
        return False
    extra = {h.strip().lower() for h in (os.environ.get("WFW_HOSTS") or "").split(",") if h.strip()}
    if host in extra:
        return True
    try:
        ip = ipaddress.ip_address(host)
        return ip.is_private or ip.is_loopback or ip.is_link_local
    except ValueError:
        pass
    return host.endswith((".local", ".lan", ".fritz.box", ".home.arpa")) or "." not in host


# ---------------------------------------------------------------- Profile und Fortschritt

def profil_name_pruefen(name):
    name = " ".join(str(name or "").split())
    if not NAME_MUSTER.match(name):
        raise ValueError("Der Name darf 1 bis 24 Zeichen lang sein (Buchstaben, Ziffern, Leerzeichen, Punkt, Bindestrich) "
                         "und muss mit einem Buchstaben oder einer Ziffer beginnen und enden.")
    return name


def profil_slug(name):
    s = unicodedata.normalize("NFKD", name.casefold()).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    if not s:
        s = "p-" + hashlib.sha1(name.casefold().encode("utf-8")).hexdigest()[:8]
    return s[:32].strip("-") or "p"


def zustand_pfad(slug):
    return PROFILE / (slug + ".json") if slug else ZUSTAND_DATEI


def sicherungs_ordner(slug):
    return SICHERUNGEN / slug if slug else SICHERUNGEN


def zustand_sichern(pfad, ordner):
    """Legt vor dem Ueberschreiben eine Sicherung an (hoechstens alle 15 Minuten, 40 Stueck)."""
    if not Path(pfad).exists():
        return
    ordner.mkdir(parents=True, exist_ok=True)
    vorhandene = sorted(ordner.glob("zustand_*.json"))
    if vorhandene and time.time() - vorhandene[-1].stat().st_mtime < 15 * 60:
        return
    name = "zustand_{}.json".format(datetime.now().strftime("%Y%m%d_%H%M%S"))
    shutil.copy2(pfad, ordner / name)
    for alt in sorted(ordner.glob("zustand_*.json"))[:-40]:
        alt.unlink()


def zustand_pruefen(daten):
    if not isinstance(daten, dict) or not isinstance(daten.get("items", {}), dict):
        raise ValueError("Der Spielstand muss ein JSON-Objekt mit dem Feld 'items' sein.")
    daten.setdefault("version", 1)
    daten.setdefault("items", {})
    daten.setdefault("spieler", {})
    daten.setdefault("einst", {})
    return daten


def zustand_speichern(slug, daten):
    """Speichert atomar. Wirft Konflikt, wenn ein anderes Geraet inzwischen gespeichert hat. Gibt die neue Revision zurueck."""
    pfad = zustand_pfad(slug)
    with sperre:
        alt = lese_json(pfad, None) if pfad.exists() else None
        alt_rev = int(alt.get("rev", 0) or 0) if isinstance(alt, dict) else 0
        try:
            client_rev = int(daten.get("rev", 0) or 0)
        except (TypeError, ValueError):
            client_rev = 0
        if alt is not None and client_rev != alt_rev:
            raise Konflikt(alt_rev)
        daten["rev"] = alt_rev + 1
        pfad.parent.mkdir(parents=True, exist_ok=True)
        zustand_sichern(pfad, sicherungs_ordner(slug))
        schreibe_json_atomar(pfad, daten)
    return daten["rev"]


def profile_liste():
    liste = []
    if PROFILE.exists():
        for datei in sorted(PROFILE.glob("*.json")):
            z = lese_json(datei, None)
            if not isinstance(z, dict):
                continue
            items = z.get("items") or {}
            liste.append({
                "slug": datei.stem,
                "name": (z.get("profil") or {}).get("name") or datei.stem,
                "geaendert": datetime.fromtimestamp(datei.stat().st_mtime).strftime("%Y-%m-%d %H:%M"),
                "mr": (z.get("spieler") or {}).get("mr") or 0,
                "gebaut": sum(1 for e in items.values() if (e.get("s") or 0) >= 2),
                "rang30": sum(1 for e in items.values() if (e.get("s") or 0) >= 3),
            })
    liste.sort(key=lambda p: p["name"].casefold())
    return liste


def profil_anlegen(name):
    name = profil_name_pruefen(name)
    slug = profil_slug(name)
    with sperre:
        PROFILE.mkdir(parents=True, exist_ok=True)
        if len(list(PROFILE.glob("*.json"))) >= MAX_PROFILE:
            raise ValueError("Es gibt schon {} Profile, das ist die Obergrenze.".format(MAX_PROFILE))
        pfad = zustand_pfad(slug)
        if pfad.exists():
            raise FileExistsError("Ein Profil mit diesem Namen gibt es schon.")
        schreibe_json_atomar(pfad, {
            "version": 1, "rev": 0, "profil": {"name": name, "erstellt": datetime.now().strftime("%Y-%m-%d %H:%M")},
            "spieler": {"name": "", "mr": 0, "mrXp": None}, "items": {}, "einst": {},
        })
    return slug, name


def profil_loeschen(slug):
    pfad = zustand_pfad(slug)
    with sperre:
        if not pfad.exists():
            raise FileNotFoundError("Dieses Profil gibt es nicht.")
        GELOESCHT.mkdir(parents=True, exist_ok=True)
        pfad.replace(GELOESCHT / "{}_{}.json".format(slug, datetime.now().strftime("%Y%m%d_%H%M%S")))


# ---------------------------------------------------------------- Datenbank und Bilder

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


def auto_aktualisierung_starten(tage, pause=6 * 3600):
    """Optional: prueft regelmaessig, ob die Datenbank aelter als `tage` Tage ist, und baut sie dann im Hintergrund neu.

    Standard ist aus. Ein Fehlschlag (kein Internet) laesst die alte Datenbank stehen und wird nach der Pause erneut versucht.
    Gibt ein Ereignis zurueck, mit dem man die Schleife anhalten kann (fuer Tests).
    """
    stopp = threading.Event()

    def schleife():
        while not stopp.wait(pause):
            try:
                alter = time.time() - ITEMS_DATEI.stat().st_mtime
            except OSError:
                alter = None
            if alter is None or alter > tage * 86400:
                aktualisierung_starten()

    threading.Thread(target=schleife, daemon=True).start()
    return stopp


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
    """Liefert (bytes, mime) aus dem Zwischenspeicher oder aus dem Netz. None, wenn nicht verfuegbar.

    Nur Bilder, die in der Item-Datenbank vorkommen, werden geladen (sonst koennte jemand im Netz den Speicher fuellen).
    """
    if not re.match(r"^[A-Za-z0-9_.\-]{1,120}\.(png|jpg|jpeg|webp)$", name):
        return None
    if state["bilder"] and name not in state["bilder"]:
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


# ---------------------------------------------------------------- HTTP

class Handler(BaseHTTPRequestHandler):
    server_version = "WarframeWilli/" + VERSION
    protocol_version = "HTTP/1.0"
    timeout = 20   # traege oder haengende Verbindungen im Heimnetz fallen nach 20 Sekunden ab

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

    def _fehler(self, code, text, extra=None):
        antwort = {"ok": False, "fehler": text}
        antwort.update(extra or {})
        self._senden(code, antwort)

    def _ist_lokal(self):
        """Kommt der Aufruf vom Rechner, auf dem der Server laeuft?"""
        return self.client_address[0] in ("127.0.0.1", "::1", "::ffff:127.0.0.1")

    def _host_ok(self):
        return host_erlaubt(self.headers.get("Host"), config["familie"])

    def _schreib_ok(self):
        """Schreibende Aufrufe nur von der eigenen Seite (Schutz gegen fremde Webseiten)."""
        if self.headers.get("X-WFW") != "1":
            return False
        herkunft = self.headers.get("Origin")
        if herkunft:
            return host_erlaubt(urlparse(herkunft).netloc, config["familie"])
        return True

    def _slug(self):
        """Das Profil aus dem Aufruf. Im lokalen Modus None, im Familienmodus Pflicht."""
        if not config["familie"]:
            return None
        wert = (parse_qs(urlparse(self.path).query).get("profil") or [""])[0]
        if not SLUG_MUSTER.match(wert):
            raise ValueError("Es ist kein gültiges Profil gewählt.")
        return wert

    def _koerper_lesen(self):
        laenge = int(self.headers.get("Content-Length") or 0)
        if laenge > (MAX_KOERPER_FAMILIE if config["familie"] else MAX_KOERPER_LOKAL):
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
            datenbank_pruefen()
            if pfad == "/api/info":
                return self._senden(200, {
                    "version": VERSION, "datenbank": state["meta"], "hatProfil": PROFIL_DATEI.exists() and not config["familie"],
                    "modus": "familie" if config["familie"] else "lokal", "admin": self._ist_lokal(),
                    "autoUpdateTage": config["autoUpdateTage"],
                    "aktualisierung": {"laeuft": aktualisierung["laeuft"], "log": aktualisierung["log"][-30:],
                                       "fehler": aktualisierung["fehler"]},
                })
            if pfad == "/api/daten":
                if not ITEMS_DATEI.exists():
                    return self._fehler(404, "Keine Datenbank vorhanden. Bitte aktualisieren.")
                return self._senden(200, ITEMS_DATEI.read_bytes())
            if pfad == "/api/profile":
                if not config["familie"]:
                    return self._fehler(404, "Profile gibt es nur im Familienmodus.")
                return self._senden(200, {"ok": True, "profile": profile_liste()})
            if pfad == "/api/zustand":
                slug = self._slug()
                ziel = zustand_pfad(slug)
                if slug and not ziel.exists():
                    return self._fehler(404, "Dieses Profil gibt es nicht (mehr).")
                return self._senden(200, lese_json(ziel, {"version": 1, "rev": 0, "items": {}, "spieler": {}, "einst": {}}))
            if pfad == "/api/profil":
                roh = None if config["familie"] else lese_json(PROFIL_DATEI, None)
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
        except ValueError as fehler:
            return self._fehler(400, str(fehler))
        except Exception as fehler:  # noqa: BLE001
            return self._fehler(500, "Interner Fehler: {}".format(fehler))

    def _statisch(self, pfad):
        if pfad in ("", "/"):
            pfad = "/index.html"
        ziel = (WEB / pfad.lstrip("/")).resolve()
        if WEB.resolve() not in ziel.parents or not ziel.is_file():
            return self._fehler(404, "Nicht gefunden.")
        if ziel.suffix.lower() not in WEB_ENDUNGEN:
            return self._fehler(404, "Nicht gefunden.")   # nur echte Web-Dateien, nichts anderes aus dem Ordner
        typ = mimetypes.guess_type(str(ziel))[0] or "application/octet-stream"
        if typ.startswith("text/") or typ in ("application/javascript", "image/svg+xml", "application/manifest+json"):
            typ += "; charset=utf-8"
        return self._senden(200, ziel.read_bytes(), typ)

    def do_PUT(self):
        self.do_POST()

    def do_POST(self):
        if not self._host_ok() or not self._schreib_ok():
            return self._fehler(403, "Nicht erlaubt.")
        pfad = urlparse(self.path).path
        try:
            datenbank_pruefen()
            daten = self._koerper_lesen()
            if pfad == "/api/zustand":
                slug = self._slug()
                if slug and not zustand_pfad(slug).exists():
                    return self._fehler(404, "Dieses Profil gibt es nicht (mehr).")
                try:
                    rev = zustand_speichern(slug, zustand_pruefen(daten))
                except Konflikt as k:
                    return self._fehler(409, "Der Stand wurde inzwischen auf einem anderen Gerät oder in einem anderen Fenster geändert.",
                                        {"rev": k.rev})
                return self._senden(200, {"ok": True, "rev": rev})
            if pfad == "/api/profile":
                if not config["familie"]:
                    return self._fehler(404, "Profile gibt es nur im Familienmodus.")
                try:
                    slug, name = profil_anlegen(daten.get("name"))
                except FileExistsError as f:
                    return self._fehler(409, str(f))
                return self._senden(200, {"ok": True, "slug": slug, "name": name})
            if pfad == "/api/profile/loeschen":
                if not config["familie"]:
                    return self._fehler(404, "Profile gibt es nur im Familienmodus.")
                slug = str(daten.get("slug") or "")
                if not SLUG_MUSTER.match(slug):
                    return self._fehler(400, "Ungültiges Profil.")
                try:
                    profil_loeschen(slug)
                except FileNotFoundError as f:
                    return self._fehler(404, str(f))
                return self._senden(200, {"ok": True})
            if pfad == "/api/db/aktualisieren":
                if config["familie"] and not self._ist_lokal():
                    return self._fehler(403, "Die Datenbank wird auf dem Server selbst aktualisiert (automatisch jede Woche).")
                gestartet = aktualisierung_starten()
                return self._senden(200, {"ok": True, "gestartet": gestartet})
            if pfad == "/api/profil/einlesen":
                try:
                    roh = json.loads(daten.get("text", ""))
                except ValueError:
                    return self._fehler(400, "Das ist kein gültiger JSON-Text. Bitte den kompletten Text einfügen.")
                erg = wf_profil.auswerten(roh, state["items"], state["bp_index"], state["teile_index"])
                if erg["quelle"] == "profil" and not config["familie"]:
                    with sperre:
                        schreibe_json_atomar(PROFIL_DATEI, roh)
                erg.update(ok=True, vorhanden=not config["familie"])
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


def eigene_adressen(port):
    """Adressen, unter denen andere Geraete im Heimnetz den Server erreichen (Hinweis fuer die Anzeige)."""
    adressen = []
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))   # sendet nichts, waehlt nur die Route
            adressen.append("http://{}:{}/".format(s.getsockname()[0], port))
    except OSError:
        pass
    name = socket.gethostname()
    if name:
        adressen.append("http://{}.local:{}/".format(name, port))
    return adressen


def main():
    ap = argparse.ArgumentParser(description="WarframeWilli Server")
    ap.add_argument("--port", type=int, default=int(os.environ.get("WFW_PORT", STANDARD_PORT)))
    ap.add_argument("--oeffnen", action="store_true", help="Browser automatisch öffnen")
    ap.add_argument("--lan", action="store_true", default=os.environ.get("WFW_LAN") == "1",
                    help="Familienmodus: im Heimnetz erreichbar, jeder Benutzer hat ein eigenes Profil")
    ap.add_argument("--auto-aktualisieren", type=int, metavar="TAGE", default=int(os.environ.get("WFW_AUTO_UPDATE_TAGE") or 0),
                    help="Datenbank alle TAGE Tage selbst erneuern (0 = aus, Standard)")
    args = ap.parse_args()

    config["familie"] = args.lan
    config["autoUpdateTage"] = max(0, args.auto_aktualisieren)
    DATEN.mkdir(parents=True, exist_ok=True)
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
    httpd = ThreadingHTTPServer(("0.0.0.0" if args.lan else "127.0.0.1", port), Handler)
    url = "http://127.0.0.1:{}/".format(port)
    print("WarframeWilli {} läuft im {}modus.".format(VERSION, "Familien" if args.lan else "lokalen "))
    print("Auf diesem Rechner: " + url)
    if args.lan:
        for a in eigene_adressen(port):
            print("Im Heimnetz:        " + a)
        print("Es gibt keine Anmeldung. Den Port nie ins Internet freigeben.")
    if config["autoUpdateTage"]:
        print("Die Datenbank wird automatisch alle {} Tage erneuert (Internet nötig).".format(config["autoUpdateTage"]))
        auto_aktualisierung_starten(config["autoUpdateTage"])
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
