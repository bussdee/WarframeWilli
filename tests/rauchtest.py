#!/usr/bin/env python3
"""WarframeWilli: Rauchtest gegen einen laufenden Server (lokal oder auf dem Pi).

    python3 tests/rauchtest.py http://127.0.0.1:8100/                 nur lesend (auch fuer den Pi geeignet)
    python3 tests/rauchtest.py http://127.0.0.1:8100/ --schreibend    legt ein Probe-Profil an und loescht es wieder (nur lokal!)
    --admin-aus     erwartet, dass der Server dem Aufrufer keine Verwaltungsrechte gibt (Container: immer so)

Rueckgabewert 1, sobald ein Punkt rot ist. Die Version wird aus der Datei VERSION gelesen und muss der laufende Server melden.
Der lesende Lauf hinterlaesst keine Spuren und sendet keine Anmeldedaten.
"""
import http.client
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

BASIS = Path(__file__).resolve().parent.parent


class Pruefer:
    def __init__(self, basis):
        self.basis = basis.rstrip("/")
        u = urlparse(self.basis)
        self.host, self.port = u.hostname, u.port or 80
        self.fehler = []

    def hole(self, pfad, methode="GET", daten=None, header=None):
        h = {"Content-Type": "application/json"}
        h.update(header or {})
        anfrage = urllib.request.Request(self.basis + pfad, data=None if daten is None else json.dumps(daten).encode(),
                                         headers=h, method=methode)
        try:
            with urllib.request.urlopen(anfrage, timeout=15) as a:
                return a.status, a.read()
        except urllib.error.HTTPError as f:
            return f.code, f.read()

    def roh(self, pfad, methode="GET", header=None, koerper=None):
        """Eigener Aufruf mit frei gewaehltem Host-Kopf (urllib setzt ihn sonst selbst)."""
        verbindung = http.client.HTTPConnection(self.host, self.port, timeout=15)
        verbindung.putrequest(methode, pfad, skip_host=True)
        for k, v in (header or {}).items():
            verbindung.putheader(k, v)
        verbindung.putheader("Content-Length", str(len(koerper or b"")))
        verbindung.endheaders(koerper or b"")
        antwort = verbindung.getresponse()
        code = antwort.status
        antwort.read()
        verbindung.close()
        return code

    def pruefe(self, name, gut, zusatz=""):
        print("  {}  {}".format("ok  " if gut else "NEIN", name) + ("\n        " + zusatz if not gut and zusatz else ""))
        if not gut:
            self.fehler.append(name)


def lesend(p, erwartete_version, admin_aus=False):
    code, roh = p.hole("/api/info")
    info = json.loads(roh) if code == 200 else {}
    p.pruefe("Info antwortet", code == 200)
    p.pruefe("Version ist {}".format(erwartete_version), info.get("version") == erwartete_version, "gemeldet: {}".format(info.get("version")))
    p.pruefe("Familienmodus ist an", info.get("modus") == "familie", "gemeldet: {}".format(info.get("modus")))
    if admin_aus:
        p.pruefe("Der Aufrufer hat keine Verwaltungsrechte (Datenbank bauen ist gesperrt)", info.get("admin") is False,
                 "gemeldet: {}".format(info.get("admin")))

    for pfad, typ in (("/", "text/html"), ("/app.js", "javascript"), ("/style.css", "text/css"),
                      ("/manifest.webmanifest", "manifest+json"), ("/icons/icon-192.png", "image/png")):
        code, _ = p.hole(pfad)
        p.pruefe("Seite {} antwortet".format(pfad), code == 200)

    code, roh = p.hole("/api/daten")
    anzahl = len(json.loads(roh).get("items", [])) if code == 200 else 0
    p.pruefe("Item-Datenbank ist da (mindestens 700 Items)", anzahl >= 700, "gefunden: {}".format(anzahl))
    code, roh = p.hole("/api/profile")
    p.pruefe("Profilliste antwortet", code == 200 and "profile" in json.loads(roh))

    # Schutzregeln: jede muss ABLEHNEN. Ein Werkzeug, das nur gruen kann, beweist nichts.
    p.pruefe("Fremder Host-Name wird abgewiesen (403)", p.roh("/api/info", header={"Host": "beispiel-fremd.de"}) == 403)
    p.pruefe("Schreiben ohne Kennung wird abgewiesen (403)", p.hole("/api/profile", "POST", {"name": "X"})[0] == 403)
    p.pruefe("Pfadtrick wird abgewiesen (404)", p.roh("/../server.py", header={"Host": "{}:{}".format(p.host, p.port)}) == 404)
    p.pruefe("Unbekanntes Bild wird abgewiesen (404)", p.hole("/bild/GibtEsNichtImDatenbestand.png")[0] == 404)
    p.pruefe("Profil ohne Angabe liefert keinen Stand (400)", p.hole("/api/zustand")[0] == 400)


def schreibend(p):
    kopf = {"X-WFW": "1"}
    code, roh = p.hole("/api/profile", "POST", {"name": "Rauchtest"}, kopf)
    p.pruefe("Profil anlegen", code == 200, roh.decode("utf-8", "replace")[:120])
    if code != 200:
        return
    slug = json.loads(roh)["slug"]
    try:
        code, roh = p.hole("/api/zustand?profil=" + slug)
        stand = json.loads(roh)
        stand["items"]["/probe"] = {"s": 3}
        code, roh = p.hole("/api/zustand?profil=" + slug, "POST", stand, kopf)
        p.pruefe("Speichern", code == 200 and json.loads(roh).get("rev") == 1)
        stand["items"]["/andere"] = {"s": 2}
        code, _ = p.hole("/api/zustand?profil=" + slug, "POST", stand, kopf)     # alte Revision
        p.pruefe("Veralteter Stand wird abgelehnt (409)", code == 409)
        code, roh = p.hole("/api/zustand?profil=" + slug)
        p.pruefe("Gespeicherter Stand ist unveraendert", "/probe" in json.loads(roh)["items"] and "/andere" not in json.loads(roh)["items"])
    finally:
        code, _ = p.hole("/api/profile/loeschen", "POST", {"slug": slug}, kopf)
        p.pruefe("Probe-Profil wieder entfernt", code == 200)


def main(argv):
    args = [a for a in argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__)
        return 2
    version = (BASIS / "VERSION").read_text(encoding="utf-8").strip()
    p = Pruefer(args[0])
    print("Rauchtest gegen {} (erwartet Version {})".format(p.basis, version))
    try:
        lesend(p, version, "--admin-aus" in argv)
        if "--schreibend" in argv:
            schreibend(p)
    except (urllib.error.URLError, OSError) as fehler:
        print("  NEIN  Keine Verbindung: {}".format(fehler))
        return 1
    print("RAUCHTEST: {}".format("JA" if not p.fehler else "NEIN ({} Punkte rot)".format(len(p.fehler))))
    return 0 if not p.fehler else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
