# WarframeWilli: Einstieg

Stand: 16.10.2026, Version 1.0.0 (inoffizielles Fan-Werkzeug, nicht mit Digital Extremes verbunden)

## Zweck

Hilfswerkzeug, um den Mastery Rank (MR) in Warframe schneller zu steigern.
Es zeigt, welche Items (Warframes, Waffen, Begleiter, Archwings, K-Drives, Necramechs ...)
schon gebaut und gelevelt sind, was noch fehlt, was sich am meisten lohnt und was dafür
gefarmt werden muss. Ziel: jedes Item mindestens einmal gebaut, nichts doppelt.

## Starten

```bash
./start.sh          # startet den Server und öffnet den Browser auf http://127.0.0.1:8765/
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
| `tests/` | `alle.sh` startet alle Tests (kein Netz nötig) |
| `docs/ERKENNTNISSE.md` | Erkenntnisse und Regeln, die daraus folgen. Nur anhängen. |
| `docs/INHALTSVERZEICHNIS.md` | erzeugt, nicht von Hand pflegen: `python3 docs/inhaltsverzeichnis.py` |

## Datenfluss

1. `wf_daten.py` lädt Itemlisten, Drops und Relikte (WFCD) sowie Rezepte inklusive Unter-Rezepte
   (PublicExport) und schreibt `daten/items.json`. Aufruf von Hand oder per Knopf "Datenbank aktualisieren".
2. Die Oberfläche lädt `/api/daten` (Items) und `/api/zustand` (Fortschritt) und rechnet alles im Browser.
3. Jede Änderung wird nach 350 ms an `/api/zustand` geschickt und atomar gespeichert. Zusätzlich
   liegt eine Kopie im `localStorage` des Browsers.
4. Optionaler Text-Import (Reiter Daten, eingeklappt): Profil- oder Inventar-JSON geht an `/api/profil/einlesen`,
   der Server ordnet XPInfo den Items zu, der Browser übernimmt das (nur hochstufen, nie herabstufen).
   Der Normalfall ist das Abhaken von Hand in der Schmiede.

## Status je Item

`0` offen, `1` im Bau, `2` gebaut, `3` Rang 30. Dazu: `w` Wunschliste, `x` zurückgestellt,
`r` Rang (0 bis 30), `n` Notiz, `t` Teile-Zustand (`0` fehlt, `1` Bauplan da, `2` fertig, Schlüssel `bp` für den Haupt-Blueprint).

## Regeln für dieses Projekt

* Oberfläche und Texte auf Deutsch, Anrede "du", immer generisches Maskulinum, kein Gendern.
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
