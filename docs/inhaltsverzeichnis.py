#!/usr/bin/env python3
"""Erzeugt docs/INHALTSVERZEICHNIS.md aus dem Code (nicht von Hand pflegen).

Aufruf:  python3 docs/inhaltsverzeichnis.py          schreibt die Datei
         python3 docs/inhaltsverzeichnis.py --pruefen  meldet, ob sie veraltet ist
"""
import ast
import re
import sys
from pathlib import Path

BASIS = Path(__file__).resolve().parent.parent
ZIEL = BASIS / "docs" / "INHALTSVERZEICHNIS.md"


def python_teil(pfad):
    baum = ast.parse(pfad.read_text(encoding="utf-8"))
    zeilen = []
    kopf = (ast.get_docstring(baum) or "").splitlines()
    if kopf:
        zeilen.append("_{}_".format(kopf[0]))
    for knoten in baum.body:
        if isinstance(knoten, ast.FunctionDef) and not knoten.name.startswith("_"):
            doku = (ast.get_docstring(knoten) or "").splitlines()
            zeilen.append("* `{}()`{}".format(knoten.name, ": " + doku[0] if doku else ""))
        elif isinstance(knoten, ast.ClassDef):
            zeilen.append("* Klasse `{}`".format(knoten.name))
            for sub in knoten.body:
                if isinstance(sub, ast.FunctionDef) and sub.name.startswith("do_"):
                    zeilen.append("  * `{}`".format(sub.name))
    return zeilen


def js_teil(pfad):
    text = pfad.read_text(encoding="utf-8")
    zeilen = []
    kopf = re.match(r"\s*/\*\s*(.+?)\s*\*/", text, re.S)
    if kopf:
        zeilen.append("_{}_".format(" ".join(kopf.group(1).split())))
    for m in re.finditer(r"(?:/\*\*?\s*(.+?)\s*\*/\s*)?\n\s*function (\w+)\(", text, re.S):
        doku = " ".join((m.group(1) or "").split())
        if len(doku) > 140 or doku.startswith("WarframeWilli"):
            doku = ""
        zeilen.append("* `{}()`{}".format(m.group(2), ": " + doku if doku else ""))
    return zeilen


def erzeugen():
    ausgabe = ["# Inhaltsverzeichnis (erzeugt, nicht von Hand ändern)", "",
               "Neu erzeugen mit `python3 docs/inhaltsverzeichnis.py`.", ""]
    for pfad in sorted(BASIS.glob("*.py")):
        ausgabe += ["## `{}`".format(pfad.name), ""] + python_teil(pfad) + [""]
    for pfad in sorted((BASIS / "web").glob("*.js")):
        ausgabe += ["## `web/{}`".format(pfad.name), ""] + js_teil(pfad) + [""]
    for pfad in sorted((BASIS / "tests").glob("*")):
        if pfad.is_file():
            ausgabe.append("* `tests/{}`".format(pfad.name))
    return "\n".join(ausgabe).rstrip() + "\n"


if __name__ == "__main__":
    neu = erzeugen()
    if "--pruefen" in sys.argv:
        alt = ZIEL.read_text(encoding="utf-8") if ZIEL.exists() else ""
        if alt != neu:
            print("INHALTSVERZEICHNIS.md ist veraltet. Bitte python3 docs/inhaltsverzeichnis.py ausführen.")
            sys.exit(1)
        print("INHALTSVERZEICHNIS.md ist aktuell.")
    else:
        ZIEL.write_text(neu, encoding="utf-8")
        print("Geschrieben: " + str(ZIEL))
