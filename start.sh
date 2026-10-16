#!/usr/bin/env bash
# Startet WarframeWilli und öffnet den Browser. Beenden mit Strg+C.
cd "$(dirname "$(readlink -f "$0")")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 fehlt. Bitte installieren (Ubuntu: sudo apt install python3)."
  exit 1
fi
exec python3 server.py --oeffnen "$@"
