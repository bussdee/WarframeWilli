#!/usr/bin/env bash
# Sicherung der Familien-Profile. Laeuft AUF DEM PI im Projektordner (~/warframewilli), liest nur und schreibt eine Sicherungsdatei
# in ./backup. Danach wird die Kopie GEPRUEFT (Archiv lesbar, jedes Profil ist gueltiges JSON), nicht nur ihre Existenz.
#
#   cd ~/warframewilli && bash pi/sichern.sh
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."

if [ ! -d data/profile ] || [ -z "$(find data/profile -name '*.json' -print -quit 2>/dev/null)" ]; then
  echo "Nichts zu sichern (noch keine Profile). Das ist bei einer Erstinstallation normal."
  exit 0
fi

mkdir -p backup
ZIEL="backup/profile-$(date +%Y%m%d-%H%M%S).tgz"
tar czf "$ZIEL" data/profile data/sicherungen data/geloeschte_profile 2>/dev/null || tar czf "$ZIEL" data/profile
tar tzf "$ZIEL" > /dev/null

if command -v python3 >/dev/null 2>&1; then
  n="$(tar xzOf "$ZIEL" --wildcards 'data/profile/*.json' | python3 -c "
import sys, json
text = sys.stdin.read()
dec = json.JSONDecoder()
i = n = 0
while i < len(text):
    while i < len(text) and text[i].isspace():
        i += 1
    if i >= len(text):
        break
    obj, i = dec.raw_decode(text, i)
    assert isinstance(obj, dict) and 'items' in obj
    n += 1
print(n)
")"
  echo "Sicherung geprueft: $ZIEL ($n Profile gueltig)"
else
  echo "Sicherung angelegt, Archiv lesbar: $ZIEL (python3 fehlt, JSON nicht geprueft)"
fi
