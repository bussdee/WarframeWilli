# Änderungsverlauf

## 1.1.0 (17.10.2026)

**Familienmodus für das ganze Haus.** WarframeWilli läuft jetzt auch als Server im Heimnetz, den alle im Handy-Browser benutzen.

* Jeder legt ein **eigenes Profil** an. Der Fortschritt liegt auf dem Server, nicht auf dem Handy. Er geht nicht verloren, wenn man das Handy wechselt oder den Browser leert.
* **Schutz vor gleichzeitigen Änderungen:** Wird dasselbe Profil auf zwei Geräten oder in zwei Fenstern benutzt, lädt das zweite Gerät den neuen Stand, statt ihn zu überschreiben.
* **Handy:** größere Tippflächen, App-Symbol und Manifest für "Zum Startbildschirm hinzufügen".
* **Docker-Betrieb**, geeignet für einen Raspberry Pi: `Dockerfile`, `compose.yaml`, `.env.example`, `Makefile` mit Trockenlauf und zwei Rückfragen für das Deployen, Start- und Sicherungsskript für das Zielgerät, Rauchtest gegen einen laufenden Server.
  Der Container läuft als normaler Benutzer mit nur lesbarem Dateisystem, ohne zusätzliche Rechte, mit Port nur an der gewählten LAN-Adresse. Die Anleitung steht in `docs/PI.md`.
* **Zugriffsschutz im Heimnetz:** Anfragen mit fremdem Host-Namen werden abgewiesen, die Item-Datenbank lässt sich von außen nicht neu bauen, der Webordner liefert nur Web-Dateien, Bilder werden nur geladen, wenn sie zur Datenbank gehören.
* Optional: die Item-Datenbank kann sich alle N Tage selbst erneuern (`WFW_AUTO_UPDATE_TAGE`, Standard aus).
* Der Datenbankbau braucht weniger Arbeitsspeicher (Spitze rund 70 MiB).
* Tests: Regeln für den Container mit Gegenproben, Skripte gegen Attrappen, Rauchtest gegen gesunden und kaputten Server (45 Python-Tests, 13 Rechen-Tests).

Hinweise: Der Familienmodus hat keine Anmeldung und ist nur für ein vertrauenswürdiges Heimnetz gedacht, der Port wird nie ins Internet freigegeben. Auf einem Raspberry Pi mit der Standard-Kernelzeile
setzt Docker die Speichergrenze nicht durch (`docs/PI.md`). Es gibt weiterhin keinen Zugriff auf das Warframe-Konto.

## 1.0.0 (16.10.2026)

Erste Fassung: Schmiede-Überblick für den Mastery Rank.

* 809 Items in 14 Kategorien mit Status (Offen, Im Bau, Gebaut, Rang 30), Suche, Filter, Sammelaktionen, Notizen, helles und dunkles Design.
* Mastery-Plan bis zum nächsten oder einem Wunsch-Rang, Sofort-Gewinne (gebaut, aber noch nicht auf Rang 30), Empfehlung nach Mastery pro Aufwand.
* Farm-Liste mit Drop-Chancen, Relikten und Tresor-Status, dazu eine Ansicht nach Farm-Ort und der Bereich "Sofort baubar".
* Bauplan mit Unter-Rezepten, Teile abhakbar, Einkaufsliste mit summierten Rohstoffen und Farm-Orten.
* Automatische Sicherungen des Fortschritts, Text-Import für Profil- oder Inventar-JSON.
