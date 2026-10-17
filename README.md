# WarframeWilli

Ein kleines Hilfswerkzeug für Warframe, das dir den Überblick über deine Schmiede gibt:
Welche Warframes, Waffen, Begleiter, Archwings, K-Drives und Necramechs hast du schon gebaut und gelevelt,
was fehlt dir noch für den nächsten Mastery Rank, und was lohnt sich am meisten?

Läuft komplett lokal auf deinem Rechner, braucht nur Python 3 und greift **nie auf dein Warframe-Konto** zu.
Es ist ein inoffizielles Fan-Werkzeug und steht in keiner Verbindung zu Digital Extremes.

## Was es kann

* **809 Items** in 14 Kategorien (Warframes, Primär-, Sekundär- und Nahkampfwaffen, Begleiter, Sentinels, Archwing, K-Drives, Zaws, Kitguns ...),
  jedes mit Status: Offen, Im Bau, Gebaut, Rang 30.
* **Mastery-Plan:** trage deinen Mastery Rank ein und sieh, wie viele Mastery-Punkte bis zum nächsten (oder einem Wunsch-) Rang fehlen
  und wie viele Warframes oder Waffen das sind.
* **Sofort-Gewinne:** Items, die schon gebaut, aber noch nicht auf Rang 30 sind. Das ist der schnellste Weg zu Mastery.
* **Farm-Liste:** zeigt, welche Items du als Nächstes farmen solltest. Der Aufwand kommt aus den Drop-Chancen der **fehlenden** Teile
  (erwartete Versuche, Relikte, Tresor-Status), vorhandene Teile zählen nicht mehr. Teile hakst du direkt in der Karte ab.
  Zweite Ansicht nach Farm-Ort: Wo bekommst du Teile für mehrere Items zugleich?
* **Sofort baubar:** Items, bei denen kein Teil mehr fehlt, nur Rohstoffe und Credits.
* **Nichts doppelt bauen:** Gebautes erscheint nicht mehr in Empfehlung und Einkaufsliste.
* **Bauplan mit Unter-Rezepten:** Teile, Rohstoffe, Credits, Bauzeit, Drop-Orte und Relikte (mit Tresor-Anzeige), pro Teil abhakbar
  ("fehlt", "Bauplan da", "fertig").
* **Einkaufsliste** für deine Wunschliste: Rohstoffe summiert, Farm-Orte zusammengefasst, als Text kopierbar.
* Sammelaktionen ("alle sichtbaren auf Gebaut"), Suche, Filter, Notizen, helles und dunkles Design, Handy-tauglich.
* Automatische Sicherungen deines Fortschritts.

## Starten

Voraussetzung: Python 3.10 oder neuer (getestet mit 3.10). Pillow ist optional (verkleinert die Item-Bilder).

```bash
git clone <dieses Repository>
cd WarframeWilli
./start.sh
```

Der Browser öffnet sich auf `http://127.0.0.1:8765/`. Beim ersten Start baut das Programm die Item-Datenbank
(etwa 10 Sekunden, Internet nötig). Beenden mit Strg+C.

Optional als Starter im Anwendungsmenü (Linux):

```bash
sed "s|@PFAD@|$PWD|g" WarframeWilli.desktop.vorlage > ~/.local/share/applications/WarframeWilli.desktop
```

## Für die ganze Familie auf einem Raspberry Pi

Mit `python3 server.py --lan` (oder als Docker-Container auf einem Raspberry Pi, siehe [`docs/PI.md`](docs/PI.md)) läuft der Server im Heimnetz.
Jeder in der Familie öffnet ihn im Handy-Browser, wählt oder legt sein **Profil** an und hat seinen eigenen Fortschritt, der auf dem Server liegt.
Ein Symbol für den Startbildschirm ist dabei. Es gibt keine Anmeldung, der Familienmodus ist nur für ein vertrauenswürdiges Heimnetz gedacht
und der Port darf nie ins Internet freigegeben werden.

## Bedienung in drei Schritten

1. Trage auf der Übersicht deinen Mastery Rank ein.
2. Setze in der Schmiede bei jedem Item, das du schon hast, den Status. Mit "Alle sichtbaren ändern" geht das für ganze Gruppen.
3. Lass dir Empfehlungen zeigen, setze Sterne und hole dir die Einkaufsliste.

Dein Fortschritt liegt in `daten/zustand.json`, Sicherungen in `daten/sicherungen/`. Beides bleibt auf deinem Rechner.

## Datenschutz und Sicherheit

* Der Server hört nur auf `127.0.0.1`, ist also im Netzwerk nicht erreichbar.
* Es gibt **keinen** Abruf von Profil-, Inventar- oder Konto-Schnittstellen von Warframe und kein Auslesen des Spiels.
  Ein Test (`KeinKontozugriff`) hält das fest.
* Ins Internet geht das Programm nur für die Item-Datenbank (GitHub und der offizielle PublicExport) und das einmalige Laden der Item-Bilder.
* Optional kannst du ein Profil- oder Inventar-JSON, das du aus anderer Quelle hast, als Text einfügen. Das wird nur lokal ausgewertet.

## Tests

```bash
./tests/alle.sh      # Syntax, Rechen-Tests (Node), Python-Tests, Inhaltsverzeichnis
```

Benötigt Node.js für die Rechen-Tests. Fehlt `daten/items.json`, baut das Skript sie zuerst.

## Aufbau

Einstieg für Entwickler ist [`docs/START-HIER.md`](docs/START-HIER.md), Erkenntnisse und Entscheidungen stehen in
[`docs/ERKENNTNISSE.md`](docs/ERKENNTNISSE.md), eine erzeugte Übersicht im [`docs/INHALTSVERZEICHNIS.md`](docs/INHALTSVERZEICHNIS.md).

## Änderungsverlauf

Siehe [`CHANGELOG.md`](CHANGELOG.md). Fassungen stehen als Release auf GitHub.

## Lizenz

MIT, siehe [`LICENSE`](LICENSE). Das gilt für den Code, nicht für Warframe-Spieldaten.

## Datenquellen und Dank

* Itemlisten, Drops und Relikte: [WFCD warframe-items](https://github.com/WFCD/warframe-items) (MIT-Lizenz).
* Rezepte: offizieller PublicExport von Digital Extremes.
* Mastery-Regeln: [Warframe Wiki](https://wiki.warframe.com/w/Mastery_Rank).

Warframe und alle zugehörigen Marken, Namen und Spieldaten gehören Digital Extremes Ltd.
Die Datenbank (`daten/items.json`) wird beim Start lokal erzeugt und ist nicht Teil dieses Repositorys.
