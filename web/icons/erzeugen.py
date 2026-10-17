#!/usr/bin/env python3
"""Erzeugt die App-Symbole (PNG) fuer den Startbildschirm. Benoetigt Pillow. Aufruf: python3 web/icons/erzeugen.py"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

ORDNER = Path(__file__).resolve().parent
HINTERGRUND = (22, 29, 40)
GOLD = (227, 179, 76)
TUERKIS = (79, 195, 181)


def zeichne(groesse, maskable=False):
    f = 4                       # vierfach zeichnen und verkleinern glaettet die Kanten
    g = groesse * f
    bild = Image.new("RGBA", (g, g), (0, 0, 0, 0))
    d = ImageDraw.Draw(bild)
    if maskable:
        d.rectangle([0, 0, g, g], fill=HINTERGRUND)
        anteil = 0.29           # maskierbare Symbole brauchen Rand, die Mitte 80 Prozent bleibt sicher sichtbar
    else:
        d.rounded_rectangle([0, 0, g - 1, g - 1], radius=int(g * 0.22), fill=HINTERGRUND)
        anteil = 0.38
    mx = my = g / 2
    r = g * anteil
    sechseck = [(mx + r * math.cos(math.radians(60 * i - 90)), my + r * math.sin(math.radians(60 * i - 90))) for i in range(6)]
    d.line(sechseck + [sechseck[0], sechseck[1]], fill=GOLD, width=int(g * 0.045), joint="curve")
    b = r * 0.62
    w = [(mx - b, my - b * 0.55), (mx - b * 0.5, my + b * 0.55), (mx, my - b * 0.25), (mx + b * 0.5, my + b * 0.55), (mx + b, my - b * 0.55)]
    d.line(w, fill=TUERKIS, width=int(g * 0.05), joint="curve")
    for x, y in w:
        d.ellipse([x - g * 0.025, y - g * 0.025, x + g * 0.025, y + g * 0.025], fill=TUERKIS)
    return bild.resize((groesse, groesse), Image.LANCZOS)


if __name__ == "__main__":
    for name, groesse, maskable in (("icon-180.png", 180, False), ("icon-192.png", 192, False),
                                    ("icon-512.png", 512, False), ("icon-maskable-512.png", 512, True)):
        zeichne(groesse, maskable).save(ORDNER / name, optimize=True)
        print("geschrieben:", name)
