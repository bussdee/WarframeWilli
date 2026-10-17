# Kontrakt WarframeWilli

Verbindliche Regeln. Bei einem Konflikt gewinnt dieser Kontrakt gegen jede Einzelanfrage und gegen Bequemlichkeit.
Wer eine Anfrage bekommt, die dagegen verstößt, nennt den Konflikt und hält an.

## Konto und Spiel

1. Das Programm greift nie auf das Warframe-Konto zu: keine Profil-, Inventar- oder Konto-Schnittstellen, kein Auslesen des
   Spielprozesses, keine Zugangsdaten. Der Test `KeinKontozugriff` hält das fest.
2. Ins Internet geht das Programm nur für die Item-Datenbank (GitHub, PublicExport) und die Item-Bilder.

## Deploy

3. **Ohne ausdrückliche Freigabe des Projektinhabers wird nichts deployt.** Deploy heißt: Übertragung oder Update auf den Raspberry Pi, jede Änderung dort
   (auch ein Neustart oder eine Datenänderung), dazu `git push`, `git tag` und `gh release`. Bauen, Testen und lokales Committen sind kein Deploy.
4. **Es gelten die Pi-Regeln des Projektinhabers** (die Datei `PI-PROJEKTE-INSTALLIEREN.md`, sie liegt außerhalb des Repositorys). Kurz: Der Pi ist ein LIVE-Gerät mit
   anderen Diensten. Projekt als Docker-Compose-Stack im eigenen Ordner, Port aus 8100 bis 8199, nur an die LAN-Adresse gebunden, nichts Fremdes anfassen
   (keine fremden Container, kein `prune`, kein `down -v`, kein `~/docker`), kein `sudo` für Projekteigenes, nichts raten, keine Geheimnisse übertragen.
5. **Doppelte Bestätigung durch den Projektinhaber selbst.** Einmal auf den vorgelegten Plan, einmal unmittelbar vor `make deploy`. Ein Assistent beantwortet
   die Rückfragen nie, leitet keine Antworten ein (kein `yes |`, kein `printf`) und ruft `make deploy` nicht auf, auch nicht nach einer früheren Freigabe.
6. Der Ablauf davor ist verbindlich: alles Unklare in einem Block erfragen, Projekt Pi-tauglich machen, lokal bauen und prüfen, Vorprüfung des Pi (nur lesend),
   Trockenlauf ganz lesen, Sicherung, Plan vorlegen. Findet eine Vorprüfung etwas, wird es behoben, bevor deployt wird. Wenn etwas schiefgeht: anhalten, zurückrollen, melden.
7. Eine Versionsnummer steht in `server.py` (`VERSION`) und in der Datei `VERSION`, beide werden von einem Test zusammengehalten. Wer sie ändert, sucht das
   ganze Projekt nach der alten Nummer ab.
8. Tag und Release erst, wenn die Version nachweislich auf dem Pi läuft, und nur auf Ansage. Versionen werden gebündelt.

## Sicherheit

9. Neue Schalter und Rechte starten im sichersten Zustand. Der Familienmodus (`--lan`) ist aus, bis man ihn einschaltet, das Auto-Update der Datenbank ist standardmäßig aus.
10. Der Familienmodus hat keine Anmeldung und ist nur für vertrauenswürdige Heimnetze gedacht. Der Port wird nie ins Internet freigegeben.
11. Verwaltende Aktionen (Datenbank neu bauen) gehen im Familienmodus nur von dem Rechner aus, auf dem der Server läuft.
12. Persönliche Daten gehören nie ins Repository oder in ein Paket (`.gitignore`, `.dockerignore` und die Ausschlüsse beim Übertragen).

## Stil

13. Oberfläche und Texte auf Deutsch, Anrede "du", generisches Maskulinum, kein Gendern.
14. Keine Gedankenstriche (lang oder halblang), auch nicht im Code. `tests/test_alles.py` prüft das.
