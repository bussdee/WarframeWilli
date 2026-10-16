#!/usr/bin/env bash
# Führt alle Tests aus. Kein Netzwerk nötig.
cd "$(dirname "$(readlink -f "$0")")/.." || exit 1
set -e
[ -f daten/items.json ] || python3 wf_daten.py
node --check web/app.js
node --check web/rechnen.js
python3 -m py_compile server.py wf_daten.py wf_profil.py
node tests/test_rechnen.js
python3 -I tests/test_alles.py 2>&1 | tail -25
python3 docs/inhaltsverzeichnis.py --pruefen
