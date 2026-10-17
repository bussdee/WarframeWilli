# WarframeWilli: Einstieg

Stand: 17.10.2026, Version 1.1.0 (inoffizielles Fan-Werkzeug, nicht mit Digital Extremes verbunden)

**Betriebsstand:** Version 1.1.0 läuft seit dem 17.10.2026 im Familienmodus als Docker-Container auf dem Raspberry Pi des Projektinhabers (Port 8100, nur Heimnetz). Auf GitHub ist 1.1.0
veröffentlicht (Release `v1.1.0` am 17.10.2026, Verlauf in `CHANGELOG.md`). Tag und Release gibt es nur auf Ansage und erst, wenn die Fassung auf dem Pi läuft. Einzelheiten und Offenes: `docs/UEBERGABE-1.1.0.md`.

## Zweck

Hilfswerkzeug, um den Mastery Rank (MR) in Warframe schneller zu steigern.
Es zeigt, welche Items (Warframes, Waffen, Begleiter, Archwings, K-Drives, Necramechs ...)
schon gebaut und gelevelt sind, was noch fehlt, was sich am meisten lohnt und was dafür
gefarmt werden muss. Ziel: jedes Item mindestens einmal gebaut, nichts doppelt.

## Verbindliches lesen

* `docs/KONTRAKT.md`: die harten Regeln, darunter **kein Deploy ohne Freigabe** des Projektinhabers.
* `docs/UEBERGABE-1.1.0.md`: aktueller Stand, was auf den Pi geht, Offenes. Dazu `docs/CHECKLISTE-1.1.0.md` und `docs/PI.md` (Docker-Betrieb, Regeln, Zurückrollen).
* `docs/ERKENNTNISSE.md`: Erkenntnisse, nur anhängen.

## Starten

```bash
./start.sh          # lokal: startet den Server und öffnet den Browser auf http://127.0.0.1:8765/
python3 server.py --lan   # Familienmodus: im Heimnetz erreichbar, ein Profil je Benutzer
make up              # dasselbe als Docker-Container, nur localhost (siehe docs/PI.md)
```

Nur Python 3 (Standardbibliothek) wird gebraucht. Pillow ist optional (verkleinert Item-Bilder).
Beenden mit Strg+C. Läuft schon eine Instanz, öffnet `start.sh` nur den Browser.

## Ordner

| Pfad | Inhalt |
|------|--------|
| `server.py` | lokaler Server: Oberfläche ausliefern, Fortschritt speichern, Text auswerten, Datenbank bauen, Bilder zwischenspeichern |
| `wf_daten.py` | baut `daten/items.json` aus WFCD warframe-items und dem offiziellen PublicExport |
| `wf_profil.py` | Auswertung von eingefügtem Profil- oder Inventar-Text, Mastery-Rechnung |
| `web/index.html`, `app.js`, `style.css` | Oberfläche (ohne Build-Schritt) |
| `web/rechnen.js` | reine Rechenfunktionen (auch unter Node testbar) |
| `daten/items.json` | Item-Datenbank, mitgeliefert, offline nutzbar |
| `daten/zustand.json` | dein Fortschritt (entsteht beim ersten Speichern) |
| `daten/sicherungen/` | automatische Sicherungen des Fortschritts (alle 15 Minuten bei Änderung, 40 Stück) |
| `daten/profil_roh.json` | zuletzt eingefügtes Profil-JSON, nur falls der Benutzer eines einfügt |
| `daten/bilder/` | Zwischenspeicher der Item-Bilder |
| `daten/profile/` | Familienmodus: ein Fortschritt je Profil (`<name>.json`), Vorversionen in `daten/sicherungen/<name>/` |
| `Dockerfile`, `compose.yaml`, `.env.example`, `Makefile` | Container nach den Pi-Regeln, Deploy nur mit zwei Rückfragen (`docs/PI.md`) |
| `pi/` | Skripte, die auf dem Pi laufen: `pi-start.sh` (Start), `sichern.sh` (Sicherung mit geprüfter Kopie) |
| `VERSION` | die Versionsnummer als Datei, muss mit `server.py` übereinstimmen |
| `tests/` | `alle.sh` startet alle Tests (kein Netz nötig, außer beim ersten Bau der Datenbank), `rauchtest.py` prüft einen laufenden Server |
| `docs/ERKENNTNISSE.md` | Erkenntnisse und Regeln, die daraus folgen. Nur anhängen. |
| `docs/INHALTSVERZEICHNIS.md` | erzeugt, nicht von Hand pflegen: `python3 docs/inhaltsverzeichnis.py` |

## Datenfluss

1. `wf_daten.py` lädt Itemlisten, Drops und Relikte (WFCD) sowie Rezepte inklusive Unter-Rezepte
   (PublicExport) und schreibt `daten/items.json`. Aufruf von Hand oder per Knopf "Datenbank aktualisieren".
2. Die Oberfläche lädt `/api/daten` (Items) und `/api/zustand` (Fortschritt) und rechnet alles im Browser.
3. Jede Änderung wird nach 350 ms an `/api/zustand` geschickt (immer nur eine Anfrage zugleich) und atomar gespeichert. Zusätzlich
   liegt eine Kopie im `localStorage` des Browsers. Der Stand trägt eine Revision (`rev`): hat inzwischen ein anderes Gerät oder Fenster
   gespeichert, antwortet der Server mit 409, die Oberfläche lädt den neuen Stand und überschreibt nichts.
   Im Familienmodus gehört der Stand zu einem Profil (`?profil=<name>`), die Profilwahl merkt sich der Browser.
4. Optionaler Text-Import (Reiter Daten, eingeklappt): Profil- oder Inventar-JSON geht an `/api/profil/einlesen`,
   der Server ordnet XPInfo den Items zu, der Browser übernimmt das (nur hochstufen, nie herabstufen).
   Der Normalfall ist das Abhaken von Hand in der Schmiede.

## Farm-Liste und Aufwand

`web/rechnen.js` rechnet den Farm-Plan (`farm`, `aufwand`, `orteGruppieren`):

* Je fehlendem Teil (Zustand `0`) wird die beste Quelle gewählt, das ist die mit den wenigsten erwarteten Versuchen
  (`100 / Chance`, bei Relikten plus 3, Tresor-Relikte zählen nicht, Conclave-Orte zählen dreifach, fehlende Chance wird mit 5 % geschätzt).
* Teile am selben Ort werden zusammengefasst: erwartete Versuche, bis alle gefallen sind (Maximum geometrischer Verteilungen
  per Einschluss und Ausschluss, `erwartetMax`).
* Teile ohne bekannte Quelle zählen 25 Versuche, ein unbekannter Haupt-Blueprint 20.
* Aufwandspunkte = Versuche / 6 + Credits / 50.000. Stufen: unter 3 leicht, unter 8 mittel, sonst aufwendig. Nur im Tresor: `tresor`.
* Die Reihenfolge ist `Mastery / (1 + Aufwandspunkte)`. Vorhandene Teile senken den Aufwand, deshalb steigen angefangene Items auf.
* Items ohne Rezept (Syndikat, Baro, Lich, Quest, Inkubator) stehen getrennt unter "Sonderbezug".

## Status je Item

`0` offen, `1` im Bau, `2` gebaut, `3` Rang 30. Dazu: `w` Wunschliste, `x` zurückgestellt,
`r` Rang (0 bis 30), `n` Notiz, `t` Teile-Zustand (`0` fehlt, `1` Bauplan da, `2` fertig, Schlüssel `bp` für den Haupt-Blueprint).

## Regeln für dieses Projekt

* Alle harten Regeln stehen in `docs/KONTRAKT.md`. Kurz: Oberfläche und Texte auf Deutsch, Anrede "du", immer generisches Maskulinum, kein Gendern.
* Niemals Gedankenstriche (lang oder halblang) verwenden, auch nicht in Code-Kommentaren.
  `tests/test_alles.py` prüft das über alle Dateien.
* Item-Namen bleiben englisch, das Spiel läuft auf Englisch.
* Das Programm greift nie auf das Warframe-Konto zu: keine Profil-, Inventar- oder Konto-Abrufe, kein Auslesen des Spielprozesses,
  keine Zugangsdaten. `tests/test_alles.py` (Klasse `KeinKontozugriff`) prüft das. Ins Internet geht es nur für die
  Item-Datenbank (GitHub, PublicExport) und die Item-Bilder.
* Nach jeder Änderung `tests/alle.sh` laufen lassen und den ganzen Bereich prüfen, nicht nur die geänderte Zeile.
* Neue Erkenntnisse gehören ans Ende von `docs/ERKENNTNISSE.md`.

## Bekannte Grenzen

* Es gibt keine öffentliche Inventar-Schnittstelle, deshalb wird alles von Hand abgehakt (mit Sammelaktionen).
  Nur wer selbst ein Profil- oder Inventar-JSON hat, kann es einfügen.
* Modulare Items (Zaw, Kitgun, K-Drive, Moa, Hound) werden aus eingefügtem Text nicht erkannt.
* Die Aufwand-Einschätzung ist eine Faustregel (Credits, Drops, Relikte), keine Farm-Zeit.
* Die Zuordnung `XPInfo` zu Rang 30 geht davon aus, dass `XP` die rohe Affinität ist
  (Waffe 450.000, Warframe 900.000 bei Rang 30). Das ist nur mit nachgebauten Daten getestet.
