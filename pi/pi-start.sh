#!/usr/bin/env bash
# Laeuft AUF DEM PI im Projektordner (~/warframewilli), aufgerufen vom Deploy nach der Uebertragung.
#
#   bash pi/pi-start.sh <LAN-Adresse> <Port>
#
# Legt die Datenordner an (BEVOR Docker etwas einhaengt, sonst legt Docker sie als root an), erzeugt beim ersten Mal die .env
# und startet NUR dieses Projekt. Fasst keinen fremden Container an, nutzt kein sudo, raeumt nichts systemweit auf.
set -euo pipefail

ADRESSE="${1:-}"
PORT="${2:-}"
[[ "$ADRESSE" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || { echo "FEHLER: Als Adresse wird die LAN-IP erwartet (Zahlen mit Punkten), nicht '$ADRESSE'."; exit 1; }
[ "$ADRESSE" != "0.0.0.0" ] || { echo "FEHLER: Nie auf 0.0.0.0 binden."; exit 1; }
[[ "$PORT" =~ ^81[0-9]{2}$ ]] || { echo "FEHLER: Der Port muss aus 8100 bis 8199 sein, nicht '$PORT'."; exit 1; }

cd "$(dirname "$(readlink -f "$0")")/.."
[ -f compose.yaml ] || { echo "FEHLER: compose.yaml fehlt in $(pwd)."; exit 1; }

# Alle Bind-Mount-Pfade vor dem Start anlegen, als der Benutzer, dem das Projekt gehoert
mkdir -p data/profile data/sicherungen data/bilder data/geloeschte_profile

if [ -f .env ]; then
  # eine vorhandene .env bleibt, aber sie muss zu den Angaben passen
  if ! { grep -qx "BIND_ADDR=$ADRESSE" .env && grep -qx "APP_PORT=$PORT" .env; }; then
    echo "FEHLER: Die vorhandene .env passt nicht zu $ADRESSE:$PORT. Nichts wurde geaendert, bitte pruefen."
    exit 1
  fi
else
  umask 077
  {
    echo "BIND_ADDR=$ADRESSE"
    echo "APP_PORT=$PORT"
    echo "PUID=$(id -u)"
    echo "PGID=$(id -g)"
    echo "WFW_AUTO_UPDATE_TAGE=0"
  } > .env
  echo ".env angelegt (keine Geheimnisse darin)."
fi

docker compose up -d --build

echo "Warte auf den Gesundheitstest ..."
for _ in $(seq 1 40); do
  zustand="$(docker inspect --format '{{.State.Health.Status}}' warframewilli-app 2>/dev/null || echo fehlt)"
  [ "$zustand" = "healthy" ] && break
  sleep 3
done
docker compose ps
echo "Version: $(cat VERSION)"
[ "$zustand" = "healthy" ] || { echo "FEHLER: Der Container ist nicht healthy (Zustand: $zustand). Logs: docker compose logs --tail=100"; exit 1; }
echo "Fertig: http://$ADRESSE:$PORT/"
