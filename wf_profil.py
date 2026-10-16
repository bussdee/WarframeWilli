#!/usr/bin/env python3
"""WarframeWilli: Auswertung von Profil- und Inventar-Text und Mastery-Rechnung.

Das Programm ruft keine Konto- oder Profil-Schnittstellen von Warframe ab. Hier wird nur Text
ausgewertet, den der Benutzer selbst einfuegt (Profil-JSON oder inventory.php-JSON).
"""
import json
import math

# Mastery-Punkte pro Rang und Affinitaets-Faktor (Rang n braucht faktor * n^2 Affinitaet)
PRO_RANG = {3000: 100, 6000: 200}
FAKTOR = {3000: 500, 6000: 1000}

INVENTAR_LISTEN = [
    "Suits", "LongGuns", "Pistols", "Melee", "SpaceSuits", "SpaceGuns", "SpaceMelee",
    "Sentinels", "SentinelWeapons", "KubrowPets", "MoaPets", "Hoverboards", "MechSuits",
]


class ImportFehler(Exception):
    """Fehler mit Klartext fuer die Oberflaeche."""


def mastery_xp_fuer_rang(rang):
    if rang <= 0:
        return 0
    if rang <= 30:
        return 2500 * rang * rang
    return 2250000 + 147500 * (rang - 30)


def rang_fuer_mastery_xp(xp):
    rang = 0
    while mastery_xp_fuer_rang(rang + 1) <= xp:
        rang += 1
    return rang


def item_rang(affinitaet, item_xp):
    """Rang eines Items aus der Affinitaet (0 bis 40)."""
    faktor = FAKTOR.get(item_xp, 500)
    return max(0, min(40, int(math.sqrt(max(affinitaet, 0) / faktor) + 1e-9)))


def _status_aus_rang(rang):
    return 3 if rang >= 30 else 2


def _profil_ergebnis(daten):
    if isinstance(daten, dict) and isinstance(daten.get("Results"), list) and daten["Results"]:
        return daten["Results"][0]
    return daten if isinstance(daten, dict) else None


def auswerten(daten, index, bp_index=None, teile_index=None):
    """Wertet Profil- oder Inventardaten aus.

    index:  {item-id: item} aus items.json
    Rueckgabe: dict mit quelle, name, mr, items [{id, s, rang}], pending [item-id],
               besitz {id: anzahl}, nichtZugeordnet [{typ, xp}]
    """
    bp_index = bp_index or {}
    r = _profil_ergebnis(daten)
    if r is None:
        raise ImportFehler("Die Daten sind weder ein Profil noch ein Inventar (kein JSON-Objekt).")
    ist_inventar = any(k in r for k in INVENTAR_LISTEN) or "PendingRecipes" in r
    ist_profil = "XPInfo" in r or "PlayerLevel" in r
    if not (ist_inventar or ist_profil):
        raise ImportFehler("Keine Profil- oder Inventardaten erkannt. Erwartet wird ein Profil-JSON "
                          "(mit XPInfo) oder ein Inventar-JSON.")

    items = {}
    nicht = []

    def setzen(item, rang, mindest_status):
        alt = items.get(item["id"])
        s = max(mindest_status, _status_aus_rang(rang) if rang is not None else mindest_status)
        if alt is None:
            items[item["id"]] = {"id": item["id"], "s": s, "rang": rang}
        else:
            alt["s"] = max(alt["s"], s)
            if rang is not None and (alt["rang"] is None or rang > alt["rang"]):
                alt["rang"] = rang

    for eintrag in r.get("XPInfo") or []:
        typ = eintrag.get("ItemType")
        xp = eintrag.get("XP") or 0
        item = index.get(typ)
        if item is None:
            if typ and xp > 0:
                nicht.append({"typ": typ, "xp": xp})
            continue
        if xp <= 0:
            continue
        rang = item_rang(xp, item["xp"])
        setzen(item, rang, 2)

    for liste in INVENTAR_LISTEN:
        for eintrag in r.get(liste) or []:
            item = index.get(eintrag.get("ItemType"))
            if item is None:
                continue
            xp = eintrag.get("XP")
            rang = item_rang(xp, item["xp"]) if isinstance(xp, (int, float)) else None
            setzen(item, rang, 2)

    pending = []
    for eintrag in r.get("PendingRecipes") or []:
        item_id = bp_index.get(eintrag.get("ItemType"))
        if item_id:
            pending.append(item_id)
            if item_id not in items:
                items[item_id] = {"id": item_id, "s": 1, "rang": None}

    besitz = {}
    for liste in ("Recipes", "MiscItems"):
        for eintrag in r.get(liste) or []:
            typ = eintrag.get("ItemType")
            if typ and typ in (teile_index or ()):
                besitz[typ] = besitz.get(typ, 0) + int(eintrag.get("ItemCount") or 1)

    name = r.get("DisplayName")
    mr = r.get("PlayerLevel")
    nicht.sort(key=lambda x: -x["xp"])
    return {
        "quelle": "inventar" if ist_inventar else "profil",
        "name": name if isinstance(name, str) else None,
        "mr": mr if isinstance(mr, int) else None,
        "items": list(items.values()),
        "pending": pending,
        "besitz": besitz,
        "nichtZugeordnet": nicht[:200],
        "anzahlNichtZugeordnet": len(nicht),
    }
