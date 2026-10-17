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

## 17.10.2026: Profile auf dem Server statt Speichern im Handy

Wunsch: Familienmitglieder benutzen das Werkzeug auf dem Pi im Heimnetz, nur mit Handys. Der erste Gedanke war, dass jeder seine
Einstellungen im Gerät speichert und lädt. Entschieden wurde anders, mit Begründung:

* Der Browser-Speicher (`localStorage`) gehört zu genau einer Adresse. Wechselt die Adresse (IP statt Name, neue IP nach einem Router-Neustart),
  sieht der Benutzer seinen Fortschritt nicht mehr.
* Safari auf dem iPhone löscht Webseiten-Speicher, wenn die Seite eine Woche nicht benutzt wurde (außer als Startbildschirm-App).
* Beides wirkt für Benutzer wie Datenverlust. Dasselbe passierte schon einmal lokal, als ein Filter den Fortschritt ausblendete.

Deshalb liegt der Fortschritt in Profilen auf dem Pi (`daten/profile/`), der Browser merkt sich nur, welches Profil gewählt ist. Die Datei zum Speichern und Laden bleibt als
Mitnahme-Weg erhalten (zum Beispiel PC nach Pi).

**Regel:** Fortschritt der Benutzer liegt nie nur im Browser. Der Browser-Speicher ist höchstens eine Zweitkopie.

## 17.10.2026: Gleichzeitige Änderungen und veraltete Anzeigen

* Zwei Geräte im selben Profil, oder zwei Fenster im lokalen Modus, würden sich sonst gegenseitig überschreiben. Der Stand trägt eine Revision (`rev`),
  der Server lehnt veraltete Stände mit 409 ab, die Oberfläche lädt dann den neuen Stand. Speichern läuft in der Oberfläche immer nur eine Anfrage zugleich,
  sonst lehnt der Server die eigene zweite Anfrage ab.
* Im Browser-Test fiel auf: Eine spät eintreffende Antwort der Profilwahl überschrieb die schon geladene Übersicht. Asynchrone Zeichenläufe müssen prüfen, ob sie noch gebraucht werden
  (`if (S.nutzer) return;` in `renderProfilWahl`).

**Regel:** Jeder asynchrone Aufruf, der die Seite zeichnet, prüft vor dem Zeichnen, ob sein Ergebnis noch gilt.

## 17.10.2026: Zugriffsregeln im Heimnetz

* Der Host-Kopf wird geprüft, auch im Heimnetz: erlaubt sind private IP-Adressen und lokale Namen (`.local`, `.lan`, `.fritz.box`, ohne Punkt), sonst 403.
  Das schützt vor DNS-Rebinding (eine fremde Webseite lässt ihren Namen auf die Pi-Adresse zeigen). Weitere Namen: `WFW_HOSTS`.
* Die Datenbank bauen darf im Familienmodus nur der Server-Rechner selbst. Bilder werden nur geladen, wenn sie in der Datenbank vorkommen.
* Es gibt keine Anmeldung. Das ist eine bewusste Grenze, siehe `KONTRAKT.md`. Ein gemeinsamer Familien-Code wäre eine mögliche Erweiterung.

## 17.10.2026: Deploy nur mit Freigabe, Werkzeuge im Test

Der Projektinhaber hat klargestellt: Für das Deploy gibt es Regeln, vorher gibt es keine Freigabe. Auf dem Pi wurde deshalb nichts installiert, nichts per `scp` verschickt
und nichts auf GitHub veröffentlicht. Ablauf und Paket stehen in `UEBERGABE-1.1.0.md`, die Prüfliste in `CHECKLISTE-1.1.0.md`.
Den Aufruf der Heimnetz-Adresse im Browser-Werkzeug hat der Projektinhaber abgelehnt, getestet wurde auf `127.0.0.1` (der Host-Test der Regeln läuft mit Anfragen per `curl`).

**Regel:** Deploy (Installation auf dem Pi, Upload, Veröffentlichung) nur nach ausdrücklicher Freigabe. Vorher: Kontrakt und Stand lesen, Plan, Bauen, echte Prüfung,
Paket, Übergabe, Testliste. Heimnetz-Adressen nicht ohne Erlaubnis im Browser aufrufen.

## 17.10.2026: Die Pi-Regeln zuerst lesen, dann bauen (Korrektur zum systemd-Weg)

Für die Installation auf dem Pi wurde zuerst ein systemd-Installer mit `sudo`, eigenem Benutzer, `/opt`, Port 8765 und Binden auf alle Adressen gebaut, ohne vorher
die Regeln des Projektinhabers für den Pi zu suchen. Dazu wurde, auf den Hinweis "Für den Deploy haben wir Regeln", zuerst im falschen Projekt nach Regeln gesucht (Klassenkiste, die es
auf dem Pi nicht gibt). Die richtige Datei liegt bei den Pi-Projekten des Projektinhabers (`PI-PROJEKTE-INSTALLIEREN.md`). Sie verbietet den ganzen Weg:
Der Pi ist ein LIVE-Gerät, Projekte sind Docker-Compose-Stacks im eigenen Ordner, Ports aus 8100 bis 8199, nur an die LAN-Adresse gebunden, kein `sudo`, nichts raten.
Nichts davon war auf dem Pi angekommen. Der systemd-Weg wurde komplett entfernt und durch Docker ersetzt.

**Regel:** Bevor ein Weg auf ein fremdes oder gemeinsames Gerät gebaut wird, nach den Regeln für dieses Gerät fragen oder suchen, notfalls den Projektinhaber nach der Datei fragen.
Regeln eines anderen Projekts gelten nicht automatisch. Die Pi-Regeln sind im Projekt als Test festgehalten (`PiRegeln` in `tests/test_alles.py`, mit Gegenproben).

## 17.10.2026: Werkzeuge gegen die Wirklichkeit testen, auch den grünen Fall

Aus den Pi-Regeln (Abschnitt "Was schon schiefgegangen ist"): Ein Prüfwerkzeug, das nur Rot kann, beweist nichts. Deshalb laufen der Rauchtest gegen einen gesunden und gegen drei absichtlich
kaputte Server, die Pi-Regel-Prüfung mit 19 künstlichen Verstößen, die Skripte gegen Attrappen von `docker`, `rsync` und `ssh`, und `make deploy` wird nur ohne Antwort gestartet
(es bricht ab, ohne dass `rsync` oder `ssh` aufgerufen werden). Nie getestet wird mit eingespeisten Antworten, das wäre ein Umgehen der Rückfragen.
Der erste Entwurf der Versions-Gegenprobe war selbst blind (sie verglich den Server mit sich selbst), erst die Version aus der Datei `VERSION` hat sie scharf gemacht.

**Regel:** Jede Prüfung bekommt eine Gegenprobe am echten Fehler, und die Gegenprobe selbst wird geprüft.

## 17.10.2026: Container und Speicher

* Der Datenbankbau lädt rund 25 MB JSON, im Speicher ein Vielfaches. Die Relikt-Datei (die größte) wird deshalb zuerst gelesen, zu einer kleinen Karte verdichtet und verworfen.
  Gemessen ist der Spitzenbedarf noch nicht, die Grenze im Container steht vorsichtig bei 512 MB (Regeln: ein hängender Prozess darf Plex den Speicher nicht nehmen).
* Im Container kommen Aufrufe nie von `127.0.0.1`, die Verwaltungsrechte (Datenbank bauen per Oberfläche) sind dort immer aus. Das Auto-Update (`WFW_AUTO_UPDATE_TAGE`, Standard 0 = aus)
  ersetzt den Wochen-Timer, ohne Cron und ohne systemd.
* Das Dateisystem ist nur lesbar. Geschrieben wird ausschließlich nach `/data` (Bind-Mount `./data`) und `/tmp` (tmpfs).

## 17.10.2026: Speicherbedarf gemessen (Korrektur der Schätzung)

Die Schätzung "170 bis 250 MB für den Datenbankbau" war falsch. Gemessen im Container (cgroup, 5-ms-Takt, erster Start ohne Datenbank): Spitze 70 MiB, davon 67 MiB Programm.
Die 512-MB-Grenze hat damit reichlich Luft. Den Wert nannte ich vorher nur geschätzt, die Messung war vor dem Deploy nötig und hat die Sorge ausgeräumt.
Der Datenbankbau mit zuerst verdichteter Relikt-Datei liefert dieselbe Datenbank wie vorher (Item-IDs, Rezepte, Quellen identisch).

**Regel:** Grenzen für Container (Speicher, CPU) werden gemessen, nicht geschätzt. Dazu die cgroup lesen (`memory.current` und `memory.stat`, hier gibt es kein `memory.peak`) und in feinem Takt abfragen,
sonst entgehen kurze Spitzen.

## 17.10.2026: Deploy auf den Pi, Nachprüfung und ein Befund, den nur das Gerät zeigte

Der Projektinhaber hat den Plan bestätigt und `make deploy` mit den zwei Rückfragen selbst ausgeführt. Die Nachprüfung (`pi-pruefen.py nach`, Handprüfungen, lesender Rauchtest) war grün:
Version 1.1.0, Container healthy mit 0 Neustarts, Port nur an der LAN-Adresse, Daten gehören dem Benutzer, keine Fehler im Log, kein fremder Container verändert.

Ein Befund fiel erst am Gerät auf: Die Speichergrenze (`mem_limit: 512m`) wirkt dort nicht. Der Kernel des Pi startet mit `cgroup_disable=memory`, `docker inspect` zeigt `Memory=0`, `docker stats` `0B / 0B`,
`docker info` warnt "No memory limit support". Das trifft alle Container auf dem Pi, auch Plex. Weder der lokale Test (dort wirkt die Grenze) noch die Vorprüfung konnten das zeigen.

**Regel:** Eine Grenze in der Compose-Datei beweist nichts. Nach dem Deploy nachsehen, ob sie am Gerät wirkt (`docker inspect` auf `Memory` und `NanoCpus`, `docker info` auf Warnungen).
Ergebnisse, die nur das Zielgerät zeigt, gehören in die Übergabe, und eine Regel, die dort nicht greift, wird dem Projektinhaber gemeldet, nicht still hingenommen.
Der systemweite Eingriff (Kernelzeile, Neustart) bleibt eine Entscheidung des Projektinhabers.

Die Nachprüfung deckte sich mit der lokalen Messung: Prozessgröße rund 72 MB im Pi gegen 70 MiB Spitze lokal.
