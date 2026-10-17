# WarframeWilli im Heimnetz (Familienmodus, Docker)

Ein einziger Container läuft im Heimnetz, die ganze Familie benutzt ihn im Handy-Browser. Jeder hat ein eigenes Profil mit eigenem
Fortschritt, die Profile liegen auf dem Server (`data/profile/`), nicht auf den Handys.

Das Projekt ist für einen Raspberry Pi gebaut, auf dem schon andere Dienste laufen. Deshalb gelten strenge Regeln, die im Projekt
nachgebaut und von Tests festgehalten sind:

* Docker Compose im eigenen Ordner (`~/warframewilli`), eigener Namensraum: Container `warframewilli-app`, Netz `warframewilli-net`.
* Port aus 8100 bis 8199, **nur an die LAN-Adresse gebunden**, nie `0.0.0.0`, nie ein Port unter 1024.
* Kein Host-Netz, kein Docker-Socket, kein `privileged`, keine zusätzlichen Rechte, `no-new-privileges`, Dateisystem nur lesbar, alle Fähigkeiten abgegeben.
* Grenzen: 512 MB Speicher, 1 CPU, 100 Prozesse. Läuft als normaler Benutzer (`PUID`/`PGID`). Zeitzone `Europe/Berlin`.
* Nur ein Bind-Mount: `./data`. Die Datenordner werden angelegt, bevor Docker etwas einhängt (sonst legt Docker sie als root an).
* Geheimnisse gibt es nicht. Die `.env` enthält nur Adresse, Port und Benutzer-Nummern und entsteht auf dem Zielgerät.

## Dateien

| Datei | Zweck |
| --- | --- |
| `Dockerfile` | Image auf Basis `python:3.12-slim` (gibt es für amd64 und arm64) |
| `compose.yaml` | der Dienst nach den Regeln oben |
| `.env.example` | Vorlage, die echte `.env` entsteht auf dem Gerät |
| `Makefile` | `make test`, `make up`, `make verify`, `make deploy-trocken`, `make deploy` |
| `pi/pi-start.sh` | läuft auf dem Pi: Ordner anlegen, `.env` anlegen, nur dieses Projekt starten, Gesundheit abwarten |
| `pi/sichern.sh` | läuft auf dem Pi: Sicherung der Profile mit geprüfter Kopie |
| `tests/rauchtest.py` | Rauchtest gegen einen laufenden Server, lesend oder schreibend |

## Lokal ausprobieren (nur localhost)

```bash
make test        # alle Tests
make up          # baut und startet den Container auf http://127.0.0.1:8100/
make verify      # Rauchtest, legt ein Probe-Profil an und löscht es wieder
make down        # stoppt nur dieses Projekt, keine Volumes werden gelöscht
```

## Auf den Pi bringen

**Das macht nur der Projektinhaber.** `make deploy` stellt zwei Rückfragen, die er selbst mit `ja` beantwortet. Ein Assistent ruft es nicht
auf, beantwortet keine Rückfrage und leitet keine Antworten ein. Ablauf: lokal testen, Vorprüfung des Pi (nur lesend), Trockenlauf ganz lesen,
Sicherung, Plan, Deploy, Nachprüfung, Protokoll. Die Regeln dazu stehen in der Pi-Anleitung des Projektinhabers, die außerhalb des Repositorys liegt.

```bash
cd <Projektordner> && make deploy-trocken PI_HOST=benutzer@LAN-IP     # verändert nichts, zeigt den Übertragungsplan
cd <Projektordner> && make deploy PI_HOST=benutzer@LAN-IP             # zwei Rückfragen, dann Übertragung und Start
```

`PI_HOST` wird nie geraten, die Adresse hinter dem `@` muss die LAN-IP sein (sie wird auch als `BIND_ADDR` benutzt).

Übertragen wird per `rsync` mit `--delete`. **Nicht** übertragen werden `.env`, `/data`, `/backup`, `/daten`, `/tests`, `.git`, `.local`. `/data` und `/backup`
entstehen auf dem Pi und müssen ausgeschlossen bleiben, sonst würde `--delete` sie löschen.

## Handys einrichten

1. Die Adresse (`http://<LAN-IP>:<Port>/`) im Browser öffnen, ein Profil mit dem eigenen Namen anlegen.
2. Im Browser-Menü "Zum Startbildschirm hinzufügen" wählen. Dann gibt es ein App-Symbol.
3. Fortschritt vom PC übernehmen: am PC unter "Daten und Import" auf "Fortschritt als Datei speichern", die Datei aufs Handy bringen,
   im Profil auf "Fortschritt laden".

Es gibt keine Passwörter. Jeder wählt nur das eigene Profil.

## Betrieb

| Aufgabe | Befehl (alles nur für dieses Projekt) |
| --- | --- |
| Status und Version | `make pi-status PI_HOST=...` |
| Logs | `make pi-logs PI_HOST=...` |
| Rauchtest (lesend) | `make pi-verify PI_HOST=...` |
| Sicherung der Profile | `make pi-sichern PI_HOST=...` (legt `backup/profile-<Zeit>.tgz` an und prüft die Kopie) |
| Anhalten, Daten bleiben | `ssh <PI_HOST> 'cd ~/warframewilli && docker compose down'` (nie mit `-v`) |

Die Item-Datenbank wird beim ersten Start einmalig geladen (Internet nötig, etwa 10 Sekunden). Aktualisieren: neu starten ist nicht nötig, entweder
`WFW_AUTO_UPDATE_TAGE` in der `.env` setzen (zum Beispiel `7`, Standard `0` = aus) oder von Hand im Container
`docker compose exec app python3 wf_daten.py`. Die Oberfläche kann die Datenbank im Container nicht erneuern (keine Verwaltungsrechte von außen).

## Bekannte Grenze: Speichergrenze auf dem Raspberry Pi

Auf einem Raspberry Pi mit der Standard-Kernelzeile (`cgroup_disable=memory`) setzt Docker `mem_limit` nicht durch. `docker info` warnt dann "No memory limit support", `docker inspect` zeigt `Memory=0`.
CPU- und Prozessgrenze wirken. WarframeWilli braucht rund 70 MiB, das Risiko ist klein. Wer die Grenze braucht, muss `cgroup_enable=memory cgroup_memory=1` in die Kernelzeile eintragen und den Pi neu starten,
das ist ein Eingriff in das Gerät und gehört dem Besitzer.

## Sicherheit

* Keine Anmeldung, nur für das Heimnetz. Der Port wird nie im Router ins Internet freigegeben. Für Gäste das getrennte Gastnetz benutzen.
* Der Server nimmt nur Anfragen an, deren Host-Name eine private Adresse oder ein lokaler Name ist (Schutz gegen DNS-Rebinding).
  Zusätzliche Namen erlaubt `WFW_HOSTS`.
* Der Pi speichert nur Spielfortschritt (welche Items gebaut sind). Zum Warframe-Konto gibt es keinen Zugriff.
* Ins Internet geht der Container nur für die Item-Datenbank (GitHub, PublicExport) und die Item-Bilder.

## Zurückrollen

* Code: den vorigen Stand ausliefern (`git checkout <Tag der Vorversion>`, dann derselbe Deploy mit den zwei Rückfragen).
* Daten: nur bei beschädigten Daten, nicht bei einem Fehler im Code. Dienst anhalten, den jetzigen Zustand von `data/` sichern (auch ein kaputter
  Stand ist Beweismaterial), Profile aus der geprüften Sicherung zurückkopieren, Dienst starten.
* Gelöschte Profile liegen unter `data/geloeschte_profile/`, Zurückholen: Datei nach `data/profile/` kopieren und den Zeitstempel aus dem Namen entfernen.

## Fehlersuche

| Beobachtung | Ursache und Abhilfe |
| --- | --- |
| Handy zeigt nichts | gleiches WLAN? Adresse mit `http://`, nicht `https://`. `make pi-status` zeigt, ob der Container `healthy` ist. |
| "Ungültiger Host" | Adresse ist weder IP noch lokaler Name. Namen in `WFW_HOSTS` eintragen. |
| "Keine Datenbank" | der Start konnte die Datenbank nicht laden (Internet). Logs ansehen, Container neu starten. |
| "Dieser Stand wurde auf einem anderen Gerät geändert" | gewollt: das Profil wird auf zwei Geräten benutzt, der neue Stand wird geladen. |
| Container startet in Schleife | `make pi-logs`. Fehlt `data/` oder gehört es root? Dann nicht herumprobieren: anhalten und melden. |
