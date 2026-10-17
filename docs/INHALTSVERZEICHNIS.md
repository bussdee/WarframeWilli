# Inhaltsverzeichnis (erzeugt, nicht von Hand ändern)

Neu erzeugen mit `python3 docs/inhaltsverzeichnis.py`.

## `server.py`

_WarframeWilli: Server (nur Python-Standardbibliothek)._
* Klasse `Konflikt`
* `lese_json()`
* `schreibe_json_atomar()`
* `teile_sammeln()`
* `datenbank_laden()`
* `datenbank_pruefen()`: Laedt die Datenbank neu, wenn sie von aussen (z. B. per Wochen-Timer) ersetzt wurde.
* `host_erlaubt()`: Prueft den Host-Kopf (Schutz gegen DNS-Rebinding). Im LAN-Modus sind private Adressen und lokale Namen erlaubt.
* `profil_name_pruefen()`
* `profil_slug()`
* `zustand_pfad()`
* `sicherungs_ordner()`
* `zustand_sichern()`: Legt vor dem Ueberschreiben eine Sicherung an (hoechstens alle 15 Minuten, 40 Stueck).
* `zustand_pruefen()`
* `zustand_speichern()`: Speichert atomar. Wirft Konflikt, wenn ein anderes Geraet inzwischen gespeichert hat. Gibt die neue Revision zurueck.
* `profile_liste()`
* `profil_anlegen()`
* `profil_loeschen()`
* `aktualisierung_starten()`
* `auto_aktualisierung_starten()`: Optional: prueft regelmaessig, ob die Datenbank aelter als `tage` Tage ist, und baut sie dann im Hintergrund neu.
* `verkleinern()`: Haelt den Zwischenspeicher klein, falls Pillow vorhanden ist. Ohne Pillow bleibt das Original.
* `bild_holen()`: Liefert (bytes, mime) aus dem Zwischenspeicher oder aus dem Netz. None, wenn nicht verfuegbar.
* Klasse `Handler`
  * `do_HEAD`
  * `do_GET`
  * `do_PUT`
  * `do_POST`
* `port_frei()`
* `laeuft_schon()`
* `eigene_adressen()`: Adressen, unter denen andere Geraete im Heimnetz den Server erreichen (Hinweis fuer die Anzeige).
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
* `profilQuery()`
* `speicherSchluessel()`
* `speichern()`
* `sendeZustand()`
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
* `renderProfilWahl()`: ---------------------------------------------------------------- Profilwahl (Familienmodus)
* `profilNeu()`
* `profilWechseln()`
* `renderHilfe()`
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
* `zustandSetzen()`
* `profilLaden()`
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
* `erwartetMax()`: Erwartete Versuche, bis ALLE Teile gefallen sind (unabhaengige Chancen je Versuch, Werte 0 bis 1).
* `besteQuelle()`: Beste Quelle fuer ein Teil: wenigste erwartete Versuche, Tresor-Relikte zaehlen nicht.
* `farm()`
* `stufeVon()`
* `aufwand()`: Aufwand-Einschaetzung, Stufe: leicht, mittel, aufwendig, tresor (nur ueber Varzia, Handel oder Events).
* `orteGruppieren()`: Fasst fehlende Teile mehrerer Items nach Farm-Ort zusammen. eintraege: [{item, farm}].
* `statistik()`: Zaehlt Status und Mastery je Kategorie. z = Zustand, items = db.items.
* `mrPlan()`: Plan fuer den naechsten Mastery Rank.

* `tests/alle.sh`
* `tests/rauchtest.py`
* `tests/test_alles.py`
* `tests/test_rechnen.js`
