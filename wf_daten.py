#!/usr/bin/env python3
"""WarframeWilli: baut die Item-Datenbank (daten/items.json).

Quellen:
  1. WFCD warframe-items (GitHub, JSON): Itemliste, Mastery-Rang, Prime/Vaulted,
     Drop-Orte der Bauteile, Relikte.
  2. Offizieller PublicExport von Digital Extremes (content.warframe.com):
     vollstaendige Rezepte inklusive der Unter-Rezepte der Bauteile.

Faellt eine Quelle aus, wird mit der anderen weitergearbeitet. Die Datei
daten/items.json bleibt als Stand erhalten und das Programm laeuft damit weiter.

Aufruf von Hand:  python3 wf_daten.py
"""
import json
import lzma
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASIS = Path(__file__).resolve().parent
DATEN = Path(__import__("os").environ.get("WFW_DATEN") or (BASIS / "daten"))
ITEMS_DATEI = DATEN / "items.json"

UA = "WarframeWilli/1.0 (privates Hilfswerkzeug)"
WFCD_URL = "https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json/{}.json"
PE_INDEX = "https://content.warframe.com/PublicExport/index_en.txt.lzma"
PE_MANIFEST = "https://content.warframe.com/PublicExport/Manifest/{}"

# Anzeigename, Mastery-Punkte pro Item (Rang 30), Reihenfolge in der Oberflaeche
KATEGORIEN = {
    "warframe": ("Warframes", 6000, 1),
    "primary": ("Primärwaffen", 3000, 2),
    "secondary": ("Sekundärwaffen", 3000, 3),
    "melee": ("Nahkampfwaffen", 3000, 4),
    "pet": ("Begleiter", 6000, 5),
    "sentinel": ("Sentinels", 6000, 6),
    "sentinelwaffe": ("Sentinel-Waffen", 3000, 7),
    "archwing": ("Archwings", 6000, 8),
    "archgun": ("Arch-Guns", 3000, 9),
    "archmelee": ("Arch-Nahkampf", 3000, 10),
    "necramech": ("Necramechs", 6000, 11),
    "kdrive": ("K-Drives", 6000, 12),
    "zaw": ("Zaw-Klingen", 3000, 13),
    "kitgun": ("Kitgun-Kammern", 3000, 14),
}

# (Datei, Kategorie-Ermittlung)
QUELL_DATEIEN = [
    "Warframes", "Primary", "Secondary", "Melee", "Pets", "Sentinels",
    "SentinelWeapons", "Archwing", "Arch-Gun", "Arch-Melee", "Misc",
]
HILFS_DATEIEN = ["Components", "Resources", "Gear", "Relics"]

RELIKT = re.compile(r"^(Lith|Meso|Neo|Axi|Requiem) (\S+) Relic(?: \((\w+)\))?$")
SPEZIAL_TAGS = {
    "Baro": "Baro Ki'Teer (Void-Händler)",
    "Syndicate": "Syndikat-Belohnung",
    "Kuva Lich": "Kuva-Lich-Waffe",
    "Technocyte Coda": "Sister-Waffe (Coda)",
    "Tenet": "Sister-Waffe (Tenet)",
    "Founder": "Founder-Item (nicht mehr erhältlich)",
    "Invasion Reward": "Invasions-Belohnung",
    "Stalker": "Stalker-Waffe",
    "Red Veil": "Syndikat-Belohnung",
    "New Loka": "Syndikat-Belohnung",
    "Steel Meridian": "Syndikat-Belohnung",
    "Arbiters of Hexis": "Syndikat-Belohnung",
    "Cephalon Suda": "Syndikat-Belohnung",
    "Perrin Sequence": "Syndikat-Belohnung",
}


def jetzt():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def http_get(url, timeout=120, versuche=3):
    letzter = None
    for i in range(versuche):
        try:
            anfrage = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(anfrage, timeout=timeout) as antwort:
                return antwort.read()
        except (urllib.error.URLError, TimeoutError, OSError) as fehler:
            letzter = fehler
            time.sleep(1.5 * (i + 1))
    raise RuntimeError("Abruf fehlgeschlagen: {} ({})".format(url, letzter))


def json_robust(roh):
    """Der PublicExport enthaelt manchmal Steuerzeichen in Texten."""
    text = roh.decode("utf-8", "replace")
    try:
        return json.loads(text, strict=False)
    except ValueError:
        return json.loads(re.sub(r"[\x00-\x1f]", " ", text))


def lade_wfcd(name, log):
    log("WFCD: " + name)
    return json.loads(http_get(WFCD_URL.format(name)).decode("utf-8"))


def lade_pe(log):
    """Liefert (rezepte, ressourcen) aus dem offiziellen PublicExport oder (None, None)."""
    try:
        log("PublicExport: Verzeichnis")
        roh = http_get(PE_INDEX)
        zerleger = lzma.LZMADecompressor(format=lzma.FORMAT_ALONE)
        teile = []
        try:
            for i in range(0, len(roh), 32):
                teile.append(zerleger.decompress(roh[i:i + 32]))
        except lzma.LZMAError:
            pass  # die Datei von DE hat ein beschaedigtes Ende, der Anfang reicht
        text = b"".join(teile).decode("utf-8", "replace")
        dateien = {}
        for zeile in text.splitlines():
            zeile = zeile.strip()
            if "!" in zeile:
                dateien[zeile.split("!")[0]] = zeile
        ergebnis = []
        for schluessel, feld in (("ExportRecipes_en.json", "ExportRecipes"),
                                 ("ExportResources_en.json", "ExportResources")):
            if schluessel not in dateien:
                raise RuntimeError(schluessel + " fehlt im Verzeichnis")
            log("PublicExport: " + schluessel)
            daten = json_robust(http_get(PE_MANIFEST.format(dateien[schluessel])))
            ergebnis.append(daten.get(feld, []))
        return ergebnis[0], ergebnis[1]
    except Exception as fehler:  # noqa: BLE001 Ausfall ist erlaubt, es geht ohne weiter
        log("PublicExport nicht verfuegbar: {}".format(fehler))
        return None, None


def huebsch(pfad):
    teil = pfad.rstrip("/").split("/")[-1]
    teil = re.sub(r"(Component|Blueprint|Item)$", "", teil)
    return re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", teil).strip() or pfad


def relikt_karte(relikte):
    karte = {}
    for r in relikte:
        m = re.match(r"^(Lith|Meso|Neo|Axi|Requiem) (\S+)", r.get("name", ""))
        if not m:
            continue
        basis = "{} {}".format(m.group(1), m.group(2))
        v = r.get("vaulted")
        if v is None:
            continue
        # gilt als verfuegbar, sobald irgendeine Variante nicht im Tresor liegt
        karte[basis] = bool(v) and karte.get(basis, True)
    return karte


def quellen_aus_drops(drops, relikte):
    """Verdichtet die Drop-Liste: Relikte einmal je Relikt, Rest nach Chance."""
    rel = {}
    sonst = {}
    for d in drops or []:
        ort = d.get("location") or ""
        m = RELIKT.match(ort)
        if m:
            basis = "{} {}".format(m.group(1), m.group(2))
            if basis not in rel or m.group(3) is None:
                rel[basis] = {
                    "ort": basis, "art": "Relikt",
                    "selten": d.get("rarity"), "chance": d.get("chance"),
                    "tresor": relikte.get(basis),
                }
        else:
            alt = sonst.get(ort)
            if alt is None or (d.get("chance") or 0) > (alt.get("chance") or 0):
                sonst[ort] = {"ort": ort, "art": "Drop", "selten": d.get("rarity"), "chance": d.get("chance")}
    rel_liste = sorted(rel.values(), key=lambda x: (bool(x["tresor"]), -(x["chance"] or 0)))
    sonst_liste = sorted(sonst.values(), key=lambda x: -(x["chance"] or 0))
    return rel_liste[:14] + sonst_liste[:8]


def baue(log=print):
    DATEN.mkdir(exist_ok=True)
    wfcd = {}
    for name in QUELL_DATEIEN + HILFS_DATEIEN:
        wfcd[name] = lade_wfcd(name, log)
    pe_rezepte, pe_ressourcen = lade_pe(log)

    log("Verknuepfe Daten ...")
    relikte = relikt_karte(wfcd["Relics"])
    comps = {c["uniqueName"]: c for c in wfcd["Components"]}

    namen = {}
    for datei in ("Resources", "Misc", "Gear"):
        for e in wfcd[datei]:
            namen[e["uniqueName"]] = e.get("name")
    for e in pe_ressourcen or []:
        namen.setdefault(e["uniqueName"], e.get("name"))
    res_drops = {e["uniqueName"]: e.get("drops") for e in wfcd["Resources"] if e.get("drops")}

    rezept_von = {}
    for r in pe_rezepte or []:
        rezept_von.setdefault(r.get("resultType"), r)

    ressourcen_ausgabe = {}

    def ressource_notieren(rid, name):
        if rid in ressourcen_ausgabe:
            return
        q = []
        for d in sorted(res_drops.get(rid, []), key=lambda x: -(x.get("chance") or 0)):
            ort = d.get("location")
            if ort and all(ort != e["ort"] for e in q):
                q.append({"ort": ort, "chance": d.get("chance"), "selten": d.get("rarity")})
            if len(q) >= 4:
                break
        ressourcen_ausgabe[rid] = {"name": name, "q": q}

    def teil_name(rid, besitzer):
        if rid in namen and namen[rid]:
            return namen[rid]
        c = comps.get(rid)
        if c and c.get("name"):
            nm = c["name"]
            if nm in ("Blueprint", "Chassis", "Neuroptics", "Systems", "Barrel", "Receiver",
                      "Stock", "Blade", "Handle", "Link", "Grip", "String", "Upper Limb",
                      "Lower Limb", "Gauntlet", "Guard", "Pouch", "Boot", "Hilt", "Head",
                      "Ornament", "Chain", "Disc", "Band", "Buckle", "Strike", "Core",
                      "Carapace", "Cerebrum", "Wings", "Harness"):
                return "{} {}".format(besitzer, nm).strip()
            return nm
        return huebsch(rid)

    def zutat(rid, anzahl, besitzer, tiefe, besucht):
        rez = rezept_von.get(rid)
        # Rohstoffe aus MiscItems sind Blaetter, auch wenn es ein Rezept dafuer gibt
        ist_teil = rid.startswith("/Lotus/Types/Recipes/")
        name = teil_name(rid, besitzer)
        eintrag = {"id": rid, "name": name, "n": anzahl, "art": "teil" if ist_teil else "res"}
        if ist_teil:
            c = comps.get(rid)
            if c:
                q = quellen_aus_drops(c.get("drops"), relikte)
                if q:
                    eintrag["q"] = q
            if rez is not None and tiefe < 3 and rid not in besucht:
                eintrag["bp"] = rez.get("uniqueName")
                eintrag["rezept"] = rezept_baum(rez, besitzer, tiefe + 1, besucht | {rid})
        else:
            ressource_notieren(rid, name)
        return eintrag

    def rezept_baum(rez, besitzer, tiefe, besucht):
        zutaten = []
        for z in rez.get("ingredients", []):
            zutaten.append(zutat(z["ItemType"], z.get("ItemCount", 1), besitzer, tiefe, besucht))
        return {
            "kosten": rez.get("buildPrice", 0), "zeit": rez.get("buildTime", 0),
            "menge": rez.get("num", 1), "zutaten": zutaten,
        }

    items = []
    gesehen = set()
    for datei in QUELL_DATEIEN:
        for roh in wfcd[datei]:
            if not roh.get("masterable"):
                continue
            uid = roh["uniqueName"]
            if uid in gesehen or "PvPVariant" in uid:
                continue
            kat = kategorie_von(datei, roh)
            if kat is None:
                continue
            gesehen.add(uid)
            items.append(baue_item(roh, kat, comps, relikte, rezept_von, zutat, rezept_baum))

    items.sort(key=lambda i: (KATEGORIEN[i["kat"]][2], i["name"].lower()))
    meta = {
        "erstellt": jetzt(),
        "anzahl": len(items),
        "quellen": ["WFCD warframe-items"] + (["Warframe PublicExport"] if pe_rezepte else []),
        "rezepteVollstaendig": bool(pe_rezepte),
        "kategorien": {k: {"name": v[0], "xp": v[1], "pos": v[2]} for k, v in KATEGORIEN.items()},
    }
    ergebnis = {"meta": meta, "items": items, "res": ressourcen_ausgabe}
    tmp = ITEMS_DATEI.with_suffix(".tmp")
    tmp.write_text(json.dumps(ergebnis, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(ITEMS_DATEI)
    log("Fertig: {} Items, {} Ressourcen".format(len(items), len(ressourcen_ausgabe)))
    return meta


def kategorie_von(datei, roh):
    typ = roh.get("type")
    if datei == "Warframes":
        return "necramech" if typ == "Necramech" else "warframe"
    if datei == "Primary":
        return "primary"
    if datei == "Secondary":
        return "secondary"
    if datei == "Melee":
        return "zaw" if typ == "Zaw Component" else "melee"
    if datei == "Pets":
        return "pet"
    if datei == "Sentinels":
        return "sentinel"
    if datei == "SentinelWeapons":
        return "sentinelwaffe"
    if datei == "Archwing":
        return "archwing"
    if datei == "Arch-Gun":
        return "archgun"
    if datei == "Arch-Melee":
        return "archmelee"
    if datei == "Misc":
        if typ == "Kitgun Component":
            return "kitgun"
        if typ == "K-Drive Component":
            return "kdrive"
    return None


def unterart(kat, roh):
    uid = roh["uniqueName"]
    if kat == "pet":
        for muster, name in (("KubrowPet", "Kubrow"), ("CatbrowPet", "Kavat"), ("MoaPets", "Moa"),
                             ("ZanukaPets", "Hound"), ("CreaturePets", None)):
            if muster in uid:
                if name:
                    return name
                n = roh.get("name", "")
                return "Predasite" if "Predasite" in n else "Vulpaphyla"
        return "Begleiter"
    return roh.get("type") or ""


def baue_item(roh, kat, comps, relikte, rezept_von, zutat, rezept_baum):
    uid = roh["uniqueName"]
    name = roh["name"]
    tags = roh.get("tags") or []
    art = unterart(kat, roh)
    xp = KATEGORIEN[kat][1]
    hinweise = []
    manuell = kat in ("zaw", "kitgun", "kdrive") or art in ("Moa", "Hound")

    if kat == "necramech":
        hinweise.append("8.000 Mastery bei Rang 40 (5 Polarisierungen), sonst 6.000.")
    if re.match(r"^(Kuva|Tenet|Coda) ", name) or name == "Paracesis":
        hinweise.append("Bis Rang 40 mit 5 Forma: insgesamt 4.000 Mastery statt 3.000.")
    if kat in ("zaw", "kitgun"):
        hinweise.append("Muss auf Rang 30, im Spiel vergoldet und danach erneut gelevelt werden, "
                        "sonst zählt es nicht für den Mastery Rang.")
    if art in ("Moa", "Predasite", "Vulpaphyla"):
        hinweise.append("Muss auf Rang 30, vergoldet und danach erneut gelevelt werden, "
                        "sonst zählt es nicht für den Mastery Rang.")
    if kat == "kdrive":
        hinweise.append("K-Drive-Teile werden an der Werkbank in Fortuna zusammengesetzt, kein Vergolden nötig.")
    if manuell:
        hinweise.append("Modulares Item, bitte von Hand abhaken.")

    spezial = []
    for t in tags:
        if t in SPEZIAL_TAGS and SPEZIAL_TAGS[t] not in spezial:
            spezial.append(SPEZIAL_TAGS[t])

    rez = rezept_von.get(uid)
    haupt_bp = None
    rezept = None
    bp_quellen = []
    if rez is not None:
        rezept = rezept_baum(rez, name, 0, {uid})
        haupt_bp = rez.get("uniqueName")
    elif roh.get("components"):
        # Rueckfall auf die WFCD-Zutaten (ohne Unter-Rezepte)
        zut = []
        for c in roh["components"]:
            if c["uniqueName"].endswith("Blueprint") and c["uniqueName"].startswith("/Lotus/Types/Recipes/"):
                haupt_bp = c["uniqueName"]
                continue
            zut.append(zutat(c["uniqueName"], c.get("itemCount", 1), name, 3, set()))
        rezept = {
            "kosten": roh.get("buildPrice") or 0, "zeit": roh.get("buildTime") or 0,
            "menge": roh.get("buildQuantity") or 1, "zutaten": zut,
        }
    if haupt_bp and haupt_bp in comps:
        bp_quellen = quellen_aus_drops(comps[haupt_bp].get("drops"), relikte)

    item = {
        "id": uid,
        "name": name,
        "kat": kat,
        "art": art,
        "xp": xp,
        "mr": roh.get("masteryReq") or 0,
        "prime": bool(roh.get("isPrime")),
        "tresor": bool(roh.get("vaulted")),
        "handel": bool(roh.get("tradable")),
        "manuell": manuell,
        "tags": tags,
        "spezial": spezial,
        "bild": roh.get("imageName"),
        "wiki": roh.get("wikiaUrl"),
        "datum": roh.get("releaseDate"),
    }
    if haupt_bp:
        item["bpId"] = haupt_bp
    if roh.get("bpCost"):
        item["bpCredits"] = roh["bpCost"]
    if roh.get("marketCost"):
        item["platin"] = roh["marketCost"]
    if hinweise:
        item["hinweis"] = hinweise
    if rezept:
        item["rezept"] = rezept
    if bp_quellen:
        item["bpQuellen"] = bp_quellen
    if rezept is None and not roh.get("components"):
        item["ohneRezept"] = True
    return item


if __name__ == "__main__":
    try:
        baue(lambda s: print(s, flush=True))
    except Exception as fehler:  # noqa: BLE001
        print("FEHLER: {}".format(fehler), file=sys.stderr)
        sys.exit(1)
