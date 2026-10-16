# Erkenntnisse WarframeWilli

Nur anhängen, nie löschen. Jede Erkenntnis nennt die Regel, die daraus folgt.

## 16.10.2026: Es gibt keine öffentliche Inventar-Schnittstelle

Die Warframe-Schnittstelle `inventory.php` braucht `accountId` und `nonce`. Die Nonce steht nur im
Arbeitsspeicher des laufenden Spiels, in keiner Logdatei. Werkzeuge anderer Entwickler lesen sie aus dem Prozess.

**Regel:** WarframeWilli liest den Spielprozess nie aus und fragt keine Zugangsdaten ab. Account-Risiko und
Fragilität sind es nicht wert. Das Inventar-JSON darf nur von Hand eingefügt werden.

## 16.10.2026: Das öffentliche Profil ist der Weg

* URL: `https://api.warframe.com/cdn/getProfileViewingData.php?playerId=<24 Zeichen, 0-9 a-f>`
* Antwort: `{"Results":[{"AccountId":{"$oid":...},"DisplayName":...,"PlayerLevel":...,"XPInfo":[{"ItemType":"/Lotus/...","XP":n}], ...}]}`.
  `XPInfo` listet jedes Item, das je Erfahrung bekommen hat, auch verkaufte. Der Parser von WFCD
  (`WFCD/profile-parser`, `src/XpInfo.ts`) bestätigt das Feldformat.
* `content.warframe.com/dynamic/getProfileViewingData.php` liefert 404.
* Suche nach Name (`n=`, `name=`) liefert leere 200-Antworten, geht also nicht mehr.
* Unbekannte ID liefert 409 mit "Could not find requested account".
* Items, die gebaut, aber nie gelevelt wurden, stehen nicht in `XPInfo`.

**Regel:** Profil nur per ID abrufen, ID kommt von `www.warframe.com/api/user-data` (Feld `user_id`).

## 16.10.2026: Sperrgefahr beim Abruf

Digital Extremes begrenzt diese Schnittstelle streng. Viele oder ungültige Anfragen können die IP zeitweise
sperren, dann klappt auch das Einloggen ins Spiel nicht. (Quelle: FrameHub-Anleitung von DaPigGuy und ein Forenbeitrag zu
403-Fehlern.)

**Regel:** `wf_profil.abrufen` bleibt streng: nur gültige 24-stellige ID, nur auf Klick, mindestens 10 Minuten
Abstand, höchstens 5 Abrufe pro Tag, nach jedem Fehler 1 Stunde Pause. Nie automatisch wiederholen,
nie "mal eben" mit anderen IDs probieren. Auswertungen laufen auf `daten/profil_roh.json`.
Beim Entwickeln wurden am 16.10.2026 wenige Testabrufe gemacht (ein paar mit ungültiger ID oder unbekanntem Parameter),
eine Sperre wurde nicht bemerkt.

## 16.10.2026: Die Konto-ID steht nicht in der EE.log

Auf dem Entwicklungsrechner steht in `EE.log` nur `Logged in <Spielername>` ohne ID. Die Zeilen mit `memberAccountId`
gehören zu anderen Spielern in der Gruppe, `mm=` ist eine Matchmaking-Kennung und keine Konto-ID.
Pfad der Log unter Linux mit Steam und Proton: `<Steam-Bibliothek>/steamapps/compatdata/230410/pfx/drive_c/users/steamuser/AppData/Local/Warframe/EE.log`,
Spielsprache dort Englisch.

**Regel:** Nie fremde IDs aus der Log verwenden, das wären Profile anderer Spieler.

## 16.10.2026: Datenquellen und ihre Eigenheiten

* WFCD `warframe-items` (`raw.githubusercontent.com/WFCD/warframe-items/master/data/json/<Datei>.json`):
  `components` enthält nur `uniqueName` und `itemCount`, Namen und Drops stehen in `Components.json`,
  Rohstoffe in `Resources.json`/`Misc.json`, Relikte (mit `vaulted`) in `Relics.json`.
* Masterable-Items nach Filtern: 809. PvP-Varianten (`PvPVariant` im Pfad) zählen nicht extra.
* PublicExport: `https://content.warframe.com/PublicExport/index_en.txt.lzma` hat ein beschädigtes Ende.
  Mit `lzma.LZMADecompressor(FORMAT_ALONE)` in kleinen Stücken lesen und den Fehler am Ende ignorieren.
  Die Zeilen sind `Export..._en.json!00_<Hash>`, Abruf unter `/PublicExport/Manifest/<Zeile>`. Die JSON-Dateien
  enthalten Steuerzeichen und müssen tolerant gelesen werden.
* Rezepte stehen in `ExportRecipes`, geordnet nach `resultType` (Item oder Bauteil), mit `ingredients`.
  Rohstoffe aus `/Lotus/Types/Items/MiscItems/` sind Blätter, auch wenn es dafür ein Rezept gibt
  (sonst explodiert der Bedarf: Orokin Cell hätte ein Rezept über 50.000 Platten).
* Bilder: Das Wiki liefert 1 MB große Originale. `raw.githubusercontent.com/wfcd/warframe-items/master/data/img/<imageName>`
  liefert 512 px Bilder mit etwa 80 KB, der Server verkleinert zusätzlich auf 128 px, wenn Pillow da ist.

**Regel:** Datenbank immer über `wf_daten.py` bauen. Fällt der PublicExport aus, läuft der Bau mit den
WFCD-Zutaten ohne Unter-Rezepte weiter (`meta.rezepteVollstaendig` wird dann `false`).

## 16.10.2026: Mastery-Regeln (Quelle: Warframe Wiki, Seite Mastery Rank)

* Waffen, Kitgun-Kammern, Zaw-Klingen, Amp-Prismen, Sentinel- und Archwing-Waffen: 100 pro Rang, bis Rang 30 = 3.000.
* Warframes, Begleiter, Archwings, K-Drives, Plexus, Necramechs: 200 pro Rang, bis Rang 30 = 6.000.
* Kuva, Tenet, Coda, Paracesis: bis Rang 40 insgesamt 4.000. Necramechs mit 5 Polarisierungen 8.000.
* Kitguns, Zaws, Amps, Moas, Predasites, Vulpaphylas müssen auf Rang 30, vergoldet und erneut gelevelt werden.
* Exalted-Waffen und Waffen von Kubrow, Kavat, Predasite, Vulpaphyla geben nichts.
* Jede Variante zählt einzeln. Verkaufen nimmt keine Punkte weg, erneutes Leveln gibt keine doppelten.
* Rang-Schwelle bis MR 30: 2.500 mal Rang zum Quadrat. Danach 2.250.000 plus 147.500 je Legendary-Rang.
* Weitere Quellen: Sternenkarte, Junctions (je 1.000), Railjack- und Drifter-Intrinsics (je 1.500 pro Rang).
* Für jeden Rang ist ein Mastery-Test nötig, danach 23 Stunden Pause.

**Regel:** Die Konstanten stehen in `wf_daten.KATEGORIEN`, `wf_profil` und `web/rechnen.js`. Änderungen immer an allen drei Stellen
und im Test `test_mastery_schwellen` nachziehen.

## 16.10.2026: Tresor und Aufwand

Void-Tresor-Primes sind nicht unerreichbar: Varzia (Prime Resurgence), Handel und Events bieten sie an.
Deshalb heißt die Stufe in der Oberfläche "Tresor" und nicht "unmöglich". Die Aufwand-Zahl in
`web/rechnen.js` (`aufwand`) ist eine Faustregel: Credits / 50.000, 2 je zu droppendem Teil, 3 je Relikt-Teil,
3 wenn die Blueprint-Quelle fehlt, 4 für Sonderbezug. Stufen: unter 3 leicht, unter 8 mittel, sonst aufwendig.

**Regel:** Wer die Faustregel ändert, passt Hilfe-Text und diesen Eintrag an.

## 16.10.2026: Online-Profilabruf wieder entfernt

Die Konto-ID des Projektinhabers ließ sich nicht beschaffen: `/api/user-data` auf warframe.com liefert auch angemeldet 404, die EE.log
enthält die ID nicht, eine Suche nach dem Namen geht nicht. Der Projektinhaber hat entschieden: kein Zugriff auf öffentliche
Konto-Schnittstellen, das muss weg. Entfernt wurden `wf_profil.abrufen`, die Konto-ID-Suche, der Sperrschutz
(`api_zugriffe.json`), der Endpunkt `/api/profil/abrufen` und die Anleitung in der Oberfläche. Eine Sicherung des
Standes davor liegt nicht im Projekt, die Funktion ist hier oben beschrieben und kann bei Bedarf neu gebaut werden.
Geblieben sind das Abhaken von Hand mit Sammelaktionen und der eingeklappte Text-Import (wertet nur eingefügten Text aus).

**Regel:** Kein Abruf von `api.warframe.com`, Profil-, Inventar- oder Konto-Schnittstellen. Wer das wieder einbauen will,
fragt zuerst den Projektinhaber. Der Test `KeinKontozugriff` hält das fest. Die älteren Abschnitte oben bleiben als Wissen stehen.

## 16.10.2026: Ein Filter darf Fortschritt nie still verstecken

Ein Benutzer hatte 55 Warframes abgehakt, wechselte einmal den Tab, und die Schmiede zeigte sie nicht mehr. Die Daten waren da
(`daten/zustand.json`, Kachel "55 / 120"), aber der Standardfilter "Noch nicht gebaut" blendete genau diese Items aus.
Beim Abhaken blieben die Zeilen absichtlich stehen, beim nächsten Neuaufbau der Liste waren sie weg und der Benutzer hielt es für Datenverlust.

**Regel:** Der Standardfilter der Schmiede ist "Alle anzeigen". Der Statusfilter wird nicht über Neustarts gemerkt.
Sobald ein Filter Items ausblendet, zeigt die Liste oben einen Hinweis mit Zahlen und dem Knopf "Alle anzeigen".
Neue Filter müssen in `filterHinweis` (web/app.js) eingetragen werden.

## 17.10.2026: Farm-Liste aus Teilen und Drop-Chancen

Wunsch: eine Liste, welche Items als Nächstes gefarmt werden sollten, nach vorhandenen Teilen und Drop-Schwierigkeit.
Umgesetzt als Reiter "Farm-Liste" (Modell siehe START-HIER.md, Abschnitt Farm-Liste und Aufwand). Mit dem echten Fortschritt
geprüft: von 499 offenen Items sind 128 leicht, 210 mittel, 52 aufwendig und 109 nur im Tresor, 101 sind sofort baubar.
Die Zaw-Klingen (Balla, Cyath, Dehtat ...) fallen laut Daten nur im Conclave, das PvP-Gebiet wird deshalb abgewertet und in der
Ortsansicht ans Ende sortiert.

**Regel:** Die Aufwand-Zahl bleibt eine Faustregel. Änderungen an den Gewichten (`RELIKT_AUFSCHLAG`, `UNBEKANNT_VERSUCHE`,
`BP_UNBEKANNT_VERSUCHE`, Faktor 6 und 50.000 in `aufwand`) immer zusammen mit dem Test "Aufwand mit echten Daten" prüfen.
