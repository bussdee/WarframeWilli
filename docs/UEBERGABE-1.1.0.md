# Übergabe Version 1.1.0 (Familienmodus, Docker für den Raspberry Pi)

**Freigabestatus: freigegeben und auf dem Pi deployt (17.10.2026).** Der Projektinhaber hat den Plan bestätigt und `make deploy` mit den zwei Rückfragen selbst ausgeführt, die Nachprüfung am Pi ist grün
(Abschnitt unten). Auf GitHub ist 1.1.0 veröffentlicht (Push auf `main` am 17.10.2026, auf ausdrückliche Ansage des Projektinhabers, **ohne Tag und ohne Release**). Ein Tag oder Release kommt nur auf eine neue Ansage.

## Stand

* Version `1.1.0`, steht in `server.py` (`VERSION`, wird von `/api/info` gemeldet) und in der Datei `VERSION` (der Pi-Ordner enthält sie, `cat ~/warframewilli/VERSION`).
  Ein Test hält beide Stellen und die Doku zusammen.
* Auf GitHub gepusht (ein gebündelter Commit, ohne Tag und Release). Auf dem Pi läuft Version 1.1.0 als Container `warframewilli-app` in `~/warframewilli` auf Port 8100, nur an die LAN-Adresse gebunden.
* Eine frühere Fassung dieses Standes baute einen systemd-Installer mit `sudo`, Port 8765 und Binden auf alle Adressen. Das verstößt gegen die Pi-Regeln
  und wurde **vollständig entfernt**, bevor irgendetwas auf den Pi ging. Der Pi bekommt nur den Docker-Weg.

## Was neu ist

| Bereich | Änderung | Datei |
| --- | --- | --- |
| Betrieb | Container nach den Pi-Regeln (Namensraum, LAN-Bindung, Grenzen, Zeitzone, Healthcheck, nur lesbares Dateisystem) | `Dockerfile`, `compose.yaml`, `.env.example` |
| Betrieb | Pi-Skripte: Start mit Ordnern und `.env`, Sicherung mit Prüfung der Kopie | `pi/pi-start.sh`, `pi/sichern.sh` |
| Betrieb | Deploy nur mit zwei Rückfragen, Trockenlauf, feste Ausschlüsse | `Makefile` |
| Server | Familienmodus per `--lan`/`WFW_LAN=1`, Profile, Revisions-Schutz, Host-Prüfung, Datenbank-Bau nur lokal, optionales Auto-Update (Standard aus) | `server.py` |
| Server | Relikt-Datei beim Datenbankbau zuerst verdichten (weniger Arbeitsspeicher) | `wf_daten.py` |
| Oberfläche | Profilwahl, größere Tippflächen, Manifest und App-Symbol für den Startbildschirm | `web/` |
| Tests | Pi-Regeln als Test mit Gegenproben, Skripte gegen Attrappen, Make-Deploy ohne Antwort, Rauchtest gegen gesunden und kaputten Server | `tests/` |

## Was auf den Pi geht, und was nicht

* Übertragen wird der Projektordner per `rsync --delete` nach `~/warframewilli/` (Ausschlüsse im `Makefile`, Trockenlauf mit `make deploy-trocken`).
* **Nie übertragen:** `.env`, `/data`, `/backup`, `/daten` (lokale Daten), `/tests`, `.git`, `.local`, Zugangsdaten.
* Auf dem Pi entstehen: `~/warframewilli/.env`, `~/warframewilli/data/` (Profile, Sicherungen, Datenbank, Bilder), `~/warframewilli/backup/`, das Image `warframewilli-app`,
  der Container `warframewilli-app`, das Netz `warframewilli-net`.
* Port `8100`, gebunden an die LAN-Adresse des Pi. Es werden keine fremden Container, `~/docker`, `~/docker-data` oder andere Ports angefasst.

## Migration und Daten

* Erstinstallation, startet leer. Keine Daten wandern vom PC zum Pi. Den PC-Stand lädt jeder selbst im Browser über "Fortschritt laden".
* Das Stand-Format ist rückwärtskompatibel (neues Feld `rev`, fehlt es, gilt 0), nichts wird umgeschrieben. Eine Aufstiegsprobe entfällt bei der Erstinstallation,
  bei späteren Updates gilt sie (alte Profile mit neuem Code starten, zweimal neu starten).

## Geprüft

* 45 Python-Tests und 13 Rechen-Tests, dazu Syntax von Python, Node und den Skripten (`shellcheck` ohne Befund).
* Die Pi-Regeln sind ein Test gegen `docker compose config` (19 Gegenproben: jeder Verstoß wird gefunden).
* `pi-start.sh`, `sichern.sh`, `make deploy` laufen gegen Attrappen von `docker`, `rsync`, `ssh`. Ohne Antwort auf die Rückfragen passiert nichts.
* Der Rauchtest ist gegen einen gesunden Server grün und gegen drei absichtlich kaputte rot (fehlende Host-Prüfung, falsche Version, fehlender Schreibschutz).
* **Lokaler Container-Lauf (17.10.2026, nur localhost, Port 8100, Image `python:3.12-slim`, Digest `sha256:a6e34c59...`):** Bau fehlerfrei, Container `healthy`,
  Rauchtest schreibend 21 von 21 Punkten grün (inklusive "Datenbank bauen ist gesperrt"), läuft als Benutzer 1000, Dateisystem nur lesbar (Schreibversuch in `/app` scheitert),
  `no-new-privileges`, alle Fähigkeiten abgegeben, kein privileged, Zeitzone Berlin, Port nur an `127.0.0.1`, Speicher im Leerlauf 23 MiB von 512 MiB, keine Fehler in den Logs.
  Neustart-Probe: Profil mit Stand ist nach `docker compose restart` unverändert, Neustartzähler 0. Browser in Handy-Breite gegen den Container: Profilwahl, Anmeldung, Übersicht.
* **Erster Start ohne Datenbank (mit Freigabe, nur lokal):** Der Container baut die Datenbank beim Start selbst (809 Items, 241 Ressourcen, rund 10 Sekunden, `healthy` nach 8 Sekunden). Feinmessung im 5-ms-Takt
  an der cgroup: Spitze **70 MiB** (davon 67 MiB Programm) bei 512 MiB Grenze, kein OOM-Kill, 0 Neustarts. Die Datenbank ist inhaltlich identisch zur bisherigen (gleiche Item-IDs und Reihenfolge, Rezepte und Quellen gleich),
  der Umbau der Ladereihenfolge hat also nichts verändert.
* `docker manifest inspect python:3.12-slim` nennt `linux/arm64/v8`, die Basis gibt es also für den Pi 5.
* Der Test-Container und sein Netz sind wieder entfernt (`make down`, ohne `-v`). Fremde lokale Container liefen unverändert weiter.

## Nachprüfung auf dem Pi (17.10.2026, nur lesend)

* `pi-pruefen.py nach`: Rückgabewert 0. Kein fremder Container hat sich verändert (Startzeiten und Neustartzähler gleich), Port 8100 lauscht, keine unangemeldeten Portänderungen,
  Plex, Kavita und FileBrowser antworten, `warframewilli-app` ist healthy mit 0 Neustarts, die Adresse antwortet mit 200 (nur HTTP, das Projekt bietet kein HTTPS).
* Von Hand: `VERSION` ist 1.1.0 und `/api/info` meldet es, der Socket lauscht nur an der LAN-Adresse, Benutzer 1000, Dateisystem nur lesbar, nicht privileged, TZ Berlin,
  `data/` gehört dem Benutzer (nicht root), keine Fehlerzeilen im Log, die Datenbank hat der erste Start selbst gebaut (809 Items), Rauchtest lesend 16 von 16.
* Prozessgröße des Servers rund 72 MB, passend zur lokalen Messung.

## Auffälligkeit: die Speichergrenze wirkt auf diesem Pi nicht

`mem_limit` wird vom Kernel des Pi nicht durchgesetzt (`cgroup_disable=memory`, `docker info` warnt "No memory limit support", `docker inspect` zeigt `Memory=0`, bei fremden Containern ebenso).
CPU- und Prozessgrenze wirken. Für dieses Projekt ist das Risiko klein (Spitze 70 MiB), grundsätzlich gilt die Regel "ein hängender Prozess darf anderen den Speicher nicht nehmen" auf diesem Pi aber nicht durch Docker.
Abhilfe wäre ein Kernel-Parameter und ein Neustart des Pi, das ist eine Entscheidung des Projektinhabers. Siehe auch `ERKENNTNISSE.md`.

## Noch offen

* Zugriff von echten Handys über WLAN, "Zum Startbildschirm hinzufügen" auf iPhone und Android (macht der Projektinhaber).
* Neustart-Probe des Containers auf dem Pi (ein Eingriff, nur auf Ansage).
* Tag und Release für 1.1.0: nur auf Ansage des Projektinhabers (der Push ist erfolgt).
* Optional, nächste Fassung: `pi/pi-start.sh` könnte eine Warnung ausgeben, wenn `docker info` "No memory limit support" meldet.
