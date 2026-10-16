# Inhaltsverzeichnis (erzeugt, nicht von Hand ändern)

Neu erzeugen mit `python3 docs/inhaltsverzeichnis.py`.

## `server.py`

_WarframeWilli: lokaler Server (nur Python-Standardbibliothek)._
* `lese_json()`
* `schreibe_json_atomar()`
* `teile_sammeln()`
* `datenbank_laden()`
* `zustand_sichern()`: Legt vor dem Ueberschreiben eine Sicherung an (hoechstens alle 15 Minuten, 40 Stueck).
* `zustand_pruefen()`
* `aktualisierung_starten()`
* `verkleinern()`: Haelt den Zwischenspeicher klein, falls Pillow vorhanden ist. Ohne Pillow bleibt das Original.
* `bild_holen()`: Liefert (bytes, mime) aus dem Zwischenspeicher oder vom Wiki. None, wenn nicht verfuegbar.
* Klasse `Handler`
  * `do_HEAD`
  * `do_GET`
  * `do_PUT`
  * `do_POST`
* `port_frei()`
* `laeuft_schon()`
* `main()`

## `wf_daten.py`

_WarframeWilli: baut die Item-Datenbank (daten/items.json)._
* `jetzt()`
* `http_get()`
* `json_robust()`: Der PublicExport enthaelt manchmal Steuerzeichen in Texten.
* `lade_wfcd()`
* `lade_pe()`: Liefert (rezepte, ressourcen) aus dem offiziellen PublicExport oder (None, None).
* `huebsch()`
* `relikt_karte()`
* `quellen_aus_drops()`: Verdichtet die Drop-Liste: Relikte einmal je Relikt, Rest nach Chance.
* `baue()`
* `kategorie_von()`
* `unterart()`
* `baue_item()`

## `wf_profil.py`

_WarframeWilli: Auswertung von Profil- und Inventar-Text und Mastery-Rechnung._
* Klasse `ImportFehler`
* `mastery_xp_fuer_rang()`
* `rang_fuer_mastery_xp()`
* `item_rang()`: Rang eines Items aus der Affinitaet (0 bis 40).
* `auswerten()`: Wertet Profil- oder Inventardaten aus.

## `web/app.js`

_WarframeWilli: Oberflaeche. Zustand liegt auf dem lokalen Server (daten/zustand.json)._
* `leererZustand()`
* `ez()`
* `sauber()`
* `speichern()`
* `setStatus()`
* `toggle()`
* `mrBekannt()`
* `anzeigeItems()`: ---------------------------------------------------------------- Filter und Sortierung
* `bildHtml()`: ---------------------------------------------------------------- Bausteine
* `statusWahl()`
* `quellenHtml()`
* `balkenHtml()`
* `legendeHtml()`
* `aufwandHtml()`
* `artChip()`
* `zeileHtml()`
* `teileFortschritt()`
* `renderKopf()`: ---------------------------------------------------------------- Kopf
* `renderUebersicht()`: ---------------------------------------------------------------- Uebersicht
* `renderSchmiede()`
* `katLeisteHtml()`
* `renderListe()`
* `filterHinweis()`
* `aktualisiereKatLeiste()`
* `zeileErneuern()`
* `oeffneDetail()`: ---------------------------------------------------------------- Schublade
* `schliesseDetail()`
* `teilStufeWahl()`
* `baumHtml()`
* `renderSchublade()`
* `wunschItems()`
* `renderEinkauf()`
* `einkaufText()`
* `renderDaten()`: ---------------------------------------------------------------- Daten und Import
* `importErgebnisHtml()`
* `profilAnwenden()`
* `zug()`
* `renderHilfe()`: ---------------------------------------------------------------- Hilfe
* `render()`: ---------------------------------------------------------------- Rendern
* `wechsleTab()`
* `uiMerken()`
* `verarbeiteAktion()`: egal */ } } /* ---------------------------------------------------------------- Ereignisse
* `massenAendern()`
* `ergebnisBox()`: ---------------------------------------------------------------- Import-Aktionen
* `einlesen()`
* `dbUpdate()`
* `exportieren()`
* `dateiLaden()`
* `zuruecksetzen()`
* `themeWechseln()`
* `uiAusZustand()`: egal */ } } /* ---------------------------------------------------------------- Start
* `datenLaden()`
* `start()`

## `web/rechnen.js`

_WarframeWilli: reine Rechenfunktionen ohne Oberflaeche (auch unter Node testbar)._
* `mrXp()`
* `mrFuerXp()`
* `statusVon()`
* `rest()`: Mastery-Punkte, die ein Item noch bringt (0 bei Rang 30).
* `teilStufe()`: Teile-Zustand: 0 fehlt, 1 Bauplan vorhanden, 2 fertig vorhanden.
* `zeitKette()`
* `bedarf()`
* `lauf()`
* `aufwand()`: Aufwand-Einschaetzung, Stufe: leicht, mittel, aufwendig, tresor (nur ueber Handel).
* `statistik()`: Zaehlt Status und Mastery je Kategorie. z = Zustand, items = db.items.
* `mrPlan()`: Plan fuer den naechsten Mastery Rank.

* `tests/alle.sh`
* `tests/test_alles.py`
* `tests/test_rechnen.js`
