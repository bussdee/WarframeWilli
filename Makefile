# WarframeWilli: lokal bauen und testen, auf den Pi nur mit zwei Bestaetigungen.
#
# Regeln fuer den Pi stehen in der Datei PI-PROJEKTE-INSTALLIEREN.md des Projektinhabers (ausserhalb dieses Repositorys).
# Kurz: Docker Compose im eigenen Ordner, Ports 8100 bis 8199, nur LAN-Adresse, nichts Fremdes anfassen, die zwei Rueckfragen
# beantwortet der Projektinhaber selbst. Ein Assistent ruft "make deploy" nie auf und beantwortet nie eine Rueckfrage.

PI_PATH ?= ~/warframewilli
APP_PORT ?= 8100
PI_IP = $(shell echo "$(PI_HOST)" | sed 's/.*@//')

# Was NICHT auf den Pi geht. Fuehrender Schraegstrich = nur an der Wurzel. /data und /backup entstehen auf dem Pi und bleiben dort
# (ohne diese Ausschluesse wuerde --delete sie loeschen). .env entsteht auf dem Pi.
RSYNC_AUS = --exclude '.git' --exclude '.claude' --exclude '/.local' --exclude '.env' --exclude '.env.*' \
	--exclude '/data' --exclude '/backup' --exclude '/daten' --exclude '/tests' --exclude '/paket' \
	--exclude '__pycache__' --exclude '*.pyc' --exclude '*.log' --exclude 'WarframeWilli.desktop*' \
	--exclude '/start.sh' --exclude '/web/icons/erzeugen.py'

.PHONY: help test up down logs ps verify deploy-trocken deploy pi-status pi-logs pi-verify pi-sichern _braucht_pi _rsync

help:
	@echo "Lokal:   make test | up | verify | logs | ps | down"
	@echo "Pi:      make deploy-trocken PI_HOST=...   (liest nur, zeigt den Uebertragungsplan)"
	@echo "         make deploy PI_HOST=...           (zwei Rueckfragen, nur der Projektinhaber)"
	@echo "         make pi-status | pi-logs | pi-verify | pi-sichern  (alle mit PI_HOST=...)"

test:
	@./tests/alle.sh

# ---- lokal (nur localhost) --------------------------------------------------------------------------------------------
up:
	@mkdir -p data/profile data/sicherungen data/bilder data/geloeschte_profile
	@BIND_ADDR=127.0.0.1 APP_PORT=$(APP_PORT) docker compose up -d --build
	@echo "Lokal erreichbar unter http://127.0.0.1:$(APP_PORT)/"

down:
	@BIND_ADDR=127.0.0.1 docker compose down

ps:
	@BIND_ADDR=127.0.0.1 docker compose ps

logs:
	@BIND_ADDR=127.0.0.1 docker compose logs --tail=100

verify:
	@python3 tests/rauchtest.py http://127.0.0.1:$(APP_PORT)/ --schreibend --admin-aus

# ---- Pi ---------------------------------------------------------------------------------------------------------------
_braucht_pi:
	@test -n "$(PI_HOST)" || (echo "PI_HOST fehlt. Beispiel: make deploy PI_HOST=benutzer@adresse (nie geraten, immer angegeben)"; exit 1)
	@echo "$(PI_IP)" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}$$' || (echo "Die Adresse hinter dem @ muss die LAN-IP sein: '$(PI_IP)'"; exit 1)

_rsync:
	@rsync -az --delete $(RSYNC_AUS) ./ $(PI_HOST):$(PI_PATH)/

# Trockenlauf: veraendert nichts. GANZ lesen: was wird geloescht, und was kommt neu dazu, ergibt jede Datei dort Sinn?
deploy-trocken: _braucht_pi
	@rsync -az --delete --dry-run --itemize-changes $(RSYNC_AUS) ./ $(PI_HOST):$(PI_PATH)/

deploy: _braucht_pi
	@echo ""
	@echo "=========================================================================="
	@echo "  DEPLOY AUF $(PI_HOST):$(PI_PATH)  (Port $(APP_PORT), Adresse $(PI_IP))"
	@echo "  Nur dieses Projekt. Fremde Container, ~/docker und andere Ports bleiben unberuehrt."
	@echo "  VORAUSSETZUNG: lokal getestet (make test, make up, make verify) und"
	@echo "  'make deploy-trocken' ganz gelesen."
	@echo "=========================================================================="
	@echo ""
	@read -p "BESTAETIGUNG 1/2: Lokale Version getestet und Plan gelesen? [ja/NEIN] " c1; \
	  if [ "$$c1" != "ja" ]; then echo "Abgebrochen."; exit 1; fi
	@read -p "BESTAETIGUNG 2/2: Deploy auf den Pi JETZT durchfuehren? [ja/NEIN] " c2; \
	  if [ "$$c2" != "ja" ]; then echo "Abgebrochen."; exit 1; fi
	@echo "Uebertrage Code nach $(PI_HOST):$(PI_PATH) ..."
	@$(MAKE) --no-print-directory _rsync PI_HOST=$(PI_HOST)
	@echo "Starte auf dem Pi ..."
	@ssh $(PI_HOST) "cd $(PI_PATH) && bash pi/pi-start.sh $(PI_IP) $(APP_PORT)"
	@echo "Deploy fertig. Jetzt nachpruefen (pi-pruefen.py nach, HTTP) und make pi-verify."

pi-status: _braucht_pi
	@ssh $(PI_HOST) "cd $(PI_PATH) && docker compose ps && cat VERSION"

pi-logs: _braucht_pi
	@ssh $(PI_HOST) "cd $(PI_PATH) && docker compose logs --tail=100"

pi-verify: _braucht_pi
	@python3 tests/rauchtest.py http://$(PI_IP):$(APP_PORT)/ --admin-aus

pi-sichern: _braucht_pi
	@ssh $(PI_HOST) "cd $(PI_PATH) && bash pi/sichern.sh"
