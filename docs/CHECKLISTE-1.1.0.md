# Testliste Version 1.1.0 (Pi, Docker)

Abgehakt ist, was am 17.10.2026 nachgewiesen wurde (Protokoll im privaten `.local/`). Offen bleiben die Handy-Punkte und alles, was nur der Projektinhaber tun kann.
Ablauf nach den Pi-Regeln. Ein roter Punkt ist ein Stoppsignal: nicht herumprobieren, zurückrollen (`PI.md`, Abschnitt Zurückrollen) und berichten.

## Vor dem Deploy (lokal, localhost)

- [x] `make test` läuft ohne Fehler durch.
- [x] `make up` baut und startet den Container, `docker compose ps` zeigt `healthy`.
- [x] `make verify` ist grün (Rauchtest schreibend, Probe-Profil wird angelegt und gelöscht).
- [x] Speicher unter der 512-MB-Grenze auch beim Datenbankbau: gemessene Spitze 70 MiB (cgroup, 5-ms-Takt).
- [x] Logs ohne `error`, `panic`, `fatal`.
- [x] `docker manifest inspect python:3.12-slim` nennt `arm64`.
- [x] Neustart-Probe: `docker compose restart`, Profile sind danach unverändert.
- [x] `make down` anschließend (ohne `-v`).

## Vorprüfung auf dem Pi (nur lesend)

- [x] `python3 pi-pruefen.py vor --name warframewilli --ports 8100` ist grün. Das Ergebnis wird vollständig berichtet, Hinweise einzeln erklärt.

## Übertragungsplan

- [x] `make deploy-trocken PI_HOST=...` ganz gelesen: keine Löschungen, keine Datei, die auf dem Pi nichts zu suchen hat (kein `.env`, kein `data`, keine Schlüssel).
- [ ] Bei einem Update: `make pi-sichern PI_HOST=...` meldet eine geprüfte Sicherung.

## Bestätigungen (der Projektinhaber, nicht der Assistent)

- [x] 1. Bestätigung auf den vorgelegten Plan.
- [x] 2. Bestätigung unmittelbar vor `make deploy` (zwei Rückfragen, `ja`, `ja`).

## Nach dem Deploy (beide Türen)

- [x] `python3 pi-pruefen.py nach --name warframewilli --ports 8100 --url http://<LAN-IP>:8100/` ist grün (kein fremder Container verändert, Plex, Kavita, FileBrowser antworten).
- [x] `cat ~/warframewilli/VERSION` zeigt `1.1.0`, `/api/info` meldet `"version": "1.1.0"` und `"modus": "familie"`.
- [x] `make pi-verify PI_HOST=...` (lesender Rauchtest) ist grün.
- [x] `docker compose logs --since 10m | grep -iE 'error|panic|fatal'` ist leer.
- [x] Der Container ist `healthy` und startet nicht in einer Schleife (`RestartCount` bleibt 0).
- [x] Port lauscht nur an der LAN-Adresse (nicht `0.0.0.0`).
- [ ] Hinweis aus der Nachprüfung: Die Speichergrenze des Containers wird auf diesem Pi nicht durchgesetzt (siehe `UEBERGABE-1.1.0.md`).

## Handy

- [ ] Adresse öffnet im WLAN, "Wer bist du?" erscheint, Profil anlegen, Übersicht erscheint.
- [ ] Items abhaken, neu laden: Fortschritt und gewähltes Profil sind noch da.
- [ ] Zweites Handy, anderes Profil: getrennt. Gleiches Profil auf zwei Geräten: Meldung bei Änderung, neuer Stand wird geladen.
- [ ] "Zum Startbildschirm hinzufügen" zeigt das Symbol (Sechseck mit W). Tippflächen lassen sich ohne Fehltreffer bedienen.
- [ ] PC-Stand per Datei laden: Zahlen stimmen mit dem PC überein.

## Protokoll

- [x] `.local/DEPLOY-warframewilli-1.1.0.md` ist geschrieben (Datum, Version, Sicherung, Plan, Ergebnis von `nach`, Auffälligkeiten).
- [x] Port-Tabelle der Pi-Anleitung ist ergänzt (nach Ok des Projektinhabers).
- [x] Push auf GitHub am 17.10.2026 auf ausdrückliche Ansage, nachdem die Version nachweislich auf dem Pi lief.
- [x] Tag `v1.1.0` und GitHub-Release am 17.10.2026 auf ausdrückliche Ansage, nachdem die Version nachweislich auf dem Pi lief.
