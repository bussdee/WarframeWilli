/* WarframeWilli: reine Rechenfunktionen ohne Oberflaeche (auch unter Node testbar). */
(function (wurzel) {
  'use strict';

  var PRO_RANG = { 3000: 100, 6000: 200 };

  /** Gesamte Mastery-Punkte, die fuer einen Mastery Rank noetig sind. */
  function mrXp(rang) {
    if (rang <= 0) return 0;
    if (rang <= 30) return 2500 * rang * rang;
    return 2250000 + 147500 * (rang - 30);
  }

  function mrFuerXp(xp) {
    var r = 0;
    while (mrXp(r + 1) <= xp) r++;
    return r;
  }

  function statusVon(e) { return e ? (e.s | 0) : 0; }

  /** Mastery-Punkte, die ein Item noch bringt (0 bei Rang 30). */
  function rest(item, e) {
    var s = statusVon(e);
    if (s >= 3) return 0;
    if (s === 0) return item.xp;
    var ppr = PRO_RANG[item.xp] || 100;
    var r = Math.min(30, (e && e.r) | 0);
    return Math.max(0, item.xp - r * ppr);
  }

  /** Teile-Zustand: 0 fehlt, 1 Bauplan vorhanden, 2 fertig vorhanden. */
  function teilStufe(e, id) { return e && e.t ? (e.t[id] | 0) : 0; }

  function zeitKette(rezept, e) {
    if (!rezept) return 0;
    var laengster = 0;
    (rezept.zutaten || []).forEach(function (z) {
      if (z.art !== 'teil' || teilStufe(e, z.id) === 2 || !z.rezept) return;
      laengster = Math.max(laengster, zeitKette(z.rezept, e));
    });
    return (rezept.zeit || 0) + laengster;
  }

  /**
   * Was fehlt noch, um das Item zu bauen?
   * Rueckgabe: credits, zeitSumme, zeitKette (paralleles Bauen), res {id: n},
   * plaene [{id, name, n, q, art}] = Bauplaene und Teile, die noch beschafft werden muessen.
   */
  function bedarf(item, e) {
    var out = { credits: 0, zeitSumme: 0, zeitKette: 0, res: {}, plaene: [], bpMarkt: 0 };
    if (!item.rezept) return out;
    if (teilStufe(e, 'bp') < 2) {
      if (item.bpCredits) {
        // Blueprint ist im Markt kaeuflich, das ist der einfachste Weg
        out.bpMarkt = item.bpCredits;
        out.credits += item.bpCredits;
      } else if (item.bpQuellen && item.bpQuellen.length) {
        out.plaene.push({ id: 'bp', name: item.name + ' Blueprint', n: 1, q: item.bpQuellen, art: 'haupt', markt: 0 });
      }
    }
    out.credits += item.rezept.kosten || 0;
    out.zeitSumme += item.rezept.zeit || 0;
    out.zeitKette = zeitKette(item.rezept, e);

    function lauf(zutaten, mal) {
      (zutaten || []).forEach(function (z) {
        var n = (z.n || 1) * mal;
        if (z.art === 'res') {
          out.res[z.id] = (out.res[z.id] || 0) + n;
          return;
        }
        var stufe = teilStufe(e, z.id);
        if (stufe === 2) return;
        if (stufe === 0) out.plaene.push({ id: z.id, name: z.name, n: n, q: z.q || [], art: 'teil' });
        if (z.rezept) {
          out.credits += (z.rezept.kosten || 0) * n;
          out.zeitSumme += (z.rezept.zeit || 0) * n;
          lauf(z.rezept.zutaten, n);
        }
      });
    }
    lauf(item.rezept.zutaten, 1);
    return out;
  }

  /** Erwartete Versuche, bis ALLE Teile gefallen sind (unabhaengige Chancen je Versuch, Werte 0 bis 1). */
  function erwartetMax(ps) {
    var n = ps.length;
    if (!n) return 0;
    if (n === 1) return 1 / ps[0];
    if (n > 10) return ps.reduce(function (a, p) { return a + 1 / p; }, 0);
    var summe = 0;
    for (var maske = 1; maske < (1 << n); maske++) {
      var fehl = 1;
      var bits = 0;
      for (var i = 0; i < n; i++) {
        if (maske & (1 << i)) { fehl *= (1 - ps[i]); bits++; }
      }
      summe += (bits % 2 ? 1 : -1) / (1 - fehl);
    }
    return summe;
  }

  var RELIKT_AUFSCHLAG = 3;   // Versuche, um das passende Relikt ueberhaupt zu bekommen
  var UNBEKANNT_VERSUCHE = 25; // Annahme, wenn die Daten keine Quelle kennen
  var BP_UNBEKANNT_VERSUCHE = 20;

  /** Beste Quelle fuer ein Teil: wenigste erwartete Versuche, Tresor-Relikte zaehlen nicht. */
  function besteQuelle(q) {
    var best = null;
    (q || []).forEach(function (x) {
      if (x.art === 'Relikt' && x.tresor) return;
      var pvp = /Conclave/i.test(x.ort);
      var p = x.chance ? Math.min(1, x.chance / 100) : 0.05;
      p = Math.max(p / (pvp ? 3 : 1), 0.005);   // PvP-Orte zaehlen dreifach, kaum jemand will dort farmen
      var versuche = 1 / p + (x.art === 'Relikt' ? RELIKT_AUFSCHLAG : 0);
      if (!best || versuche < best.versuche) {
        best = { ort: x.ort, art: x.art, chance: x.chance || null, selten: x.selten, p: p, versuche: versuche, geschaetzt: !x.chance, pvp: pvp };
      }
    });
    return best;
  }

  /**
   * Farm-Plan fuer ein Item: welche Teile fehlen noch, wo faellt das Beste, wie viele Versuche sind es.
   * Rueckgabe: teile (fehlende Teile mit Quelle), gruppen (je Farm-Ort, dort wird gemeinsam gefarmt),
   * versuche (Summe), tresor (ein Teil gibt es nur im Tresor), unbekannt (Teile ohne Quelle),
   * bpUnbekannt, credits, bpMarkt, da/gesamt (Teile-Fortschritt), alleDa (nichts mehr zu farmen).
   */
  function farm(item, e) {
    var out = { teile: [], gruppen: [], versuche: 0, tresor: false, unbekannt: 0, bpUnbekannt: false,
      credits: 0, bpMarkt: 0, da: 0, gesamt: 0, alleDa: false, hatRezept: !!item.rezept };
    if (!item.rezept) return out;
    var b = bedarf(item, e);
    out.credits = b.credits;
    out.bpMarkt = b.bpMarkt;

    item.rezept.zutaten.forEach(function (z) {
      if (z.art !== 'teil') return;
      out.gesamt++;
      if (teilStufe(e, z.id) >= 1) out.da++;
    });
    var bpFarmbar = !item.bpCredits && !!(item.bpQuellen && item.bpQuellen.length);
    if (bpFarmbar) {
      out.gesamt++;
      if (teilStufe(e, 'bp') === 2) out.da++;
    }
    out.bpUnbekannt = !item.bpCredits && !(item.bpQuellen && item.bpQuellen.length) && teilStufe(e, 'bp') < 2;

    b.plaene.forEach(function (pl) {
      var wahl = besteQuelle(pl.q);
      var t = { id: pl.id, name: pl.name, n: pl.n, q: pl.q || [], quelle: wahl, art: pl.art, unbekannt: false, tresor: false };
      if (!(pl.q && pl.q.length)) { t.unbekannt = true; out.unbekannt++; }
      else if (!wahl) { t.tresor = true; out.tresor = true; }
      out.teile.push(t);
    });

    var gr = {};
    out.teile.forEach(function (t) {
      if (!t.quelle) return;
      var g = gr[t.quelle.ort] || (gr[t.quelle.ort] = { ort: t.quelle.ort, art: t.quelle.art, teile: [], ps: [] });
      g.teile.push(t);
      for (var i = 0; i < Math.max(1, t.n); i++) g.ps.push(t.quelle.p);
    });
    Object.keys(gr).forEach(function (k) {
      var g = gr[k];
      g.versuche = erwartetMax(g.ps) + (g.art === 'Relikt' ? RELIKT_AUFSCHLAG : 0);
      out.versuche += g.versuche;
      out.gruppen.push(g);
    });
    out.gruppen.sort(function (x, y) { return y.teile.length - x.teile.length || x.versuche - y.versuche; });
    out.versuche += out.unbekannt * UNBEKANNT_VERSUCHE + (out.bpUnbekannt ? BP_UNBEKANNT_VERSUCHE : 0);
    out.alleDa = out.teile.length === 0 && !out.bpUnbekannt;
    return out;
  }

  function stufeVon(p) { return p < 3 ? 'leicht' : (p < 8 ? 'mittel' : 'aufwendig'); }

  /** Aufwand-Einschaetzung, Stufe: leicht, mittel, aufwendig, tresor (nur ueber Varzia, Handel oder Events). */
  function aufwand(item, e) {
    var gruende = [];
    if (item.manuell) { gruende.push('Modular: selbst zusammenbauen'); }
    if (!item.rezept) {
      if ((item.spezial || []).length) gruende.push(item.spezial[0]);
      else gruende.push('Kein Schmiede-Rezept');
      if (item.spezial && item.spezial.some(function (s) { return /Founder/.test(s); })) {
        return { punkte: 99, stufe: 'tresor', gruende: gruende, farm: farm(item, e) };
      }
      return { punkte: 6, stufe: stufeVon(6), gruende: gruende, farm: farm(item, e) };
    }
    var f = farm(item, e);
    var p = f.versuche / 6 + f.credits / 50000;
    if (f.bpUnbekannt) gruende.push('Blueprint-Quelle nicht in den Daten, siehe Wiki');
    if ((item.spezial || []).length && !item.bpCredits && teilStufe(e, 'bp') < 2) {
      p += 4;
      gruende.push(item.spezial[0]);
    }
    if (f.teile.length) {
      gruende.push(f.teile.length + (f.teile.length === 1 ? ' Teil fehlt' : ' Teile fehlen') + ', etwa ' + Math.round(f.versuche) + ' Versuche');
    }
    if (f.unbekannt) gruende.push(f.unbekannt + (f.unbekannt === 1 ? ' Teil ohne bekannte Quelle' : ' Teile ohne bekannte Quelle'));
    if (f.bpMarkt) gruende.push('Blueprint im Markt: ' + f.bpMarkt.toLocaleString('de-DE') + ' Credits');
    if (f.credits >= 150000) gruende.push((Math.round(f.credits / 1000)).toLocaleString('de-DE') + 'k Credits');
    if (f.tresor) {
      gruende.unshift('Im Void-Tresor: nur über Varzia, Handel oder Events');
      return { punkte: 90 + p, stufe: 'tresor', gruende: gruende, farm: f };
    }
    return { punkte: p, stufe: stufeVon(p), gruende: gruende, farm: f };
  }

  /** Fasst fehlende Teile mehrerer Items nach Farm-Ort zusammen. eintraege: [{item, farm}]. */
  function orteGruppieren(eintraege) {
    var orte = {};
    eintraege.forEach(function (ei) {
      ei.farm.teile.forEach(function (t) {
        if (!t.quelle) return;
        var o = orte[t.quelle.ort] || (orte[t.quelle.ort] = { ort: t.quelle.ort, art: t.quelle.art, teile: [], items: {}, ps: [] });
        o.teile.push({ item: ei.item, teil: t });
        o.items[ei.item.id] = ei.item;
        for (var i = 0; i < Math.max(1, t.n); i++) o.ps.push(t.quelle.p);
      });
    });
    return Object.keys(orte).map(function (k) {
      var o = orte[k];
      o.anzahlItems = Object.keys(o.items).length;
      o.versuche = erwartetMax(o.ps) + (o.art === 'Relikt' ? RELIKT_AUFSCHLAG : 0);
      return o;
    }).sort(function (x, y) {
      var px = /Conclave/i.test(x.ort) ? 1 : 0;
      var py = /Conclave/i.test(y.ort) ? 1 : 0;
      return px - py || y.anzahlItems - x.anzahlItems || x.versuche - y.versuche;   // PvP-Orte ans Ende
    });
  }

  /** Zaehlt Status und Mastery je Kategorie. z = Zustand, items = db.items. */
  function statistik(items, z) {
    var gesamt = { n: 0, s: [0, 0, 0, 0], xp: 0, xpErhalten: 0, xpOffen: 0, xpPotenzial: 0, zurueck: 0 };
    var kat = {};
    items.forEach(function (it) {
      var e = z.items[it.id];
      var s = statusVon(e);
      var k = kat[it.kat] || (kat[it.kat] = { n: 0, s: [0, 0, 0, 0], xp: 0, xpOffen: 0, zurueck: 0 });
      var ziele = [gesamt, k];
      ziele.forEach(function (t) {
        t.n++;
        t.s[s]++;
        t.xp += it.xp;
        var r = rest(it, e);
        if (e && e.x && s < 2) { t.zurueck++; } else { t.xpOffen += r; }
      });
      gesamt.xpErhalten += it.xp - rest(it, e);
      if (s === 1 || s === 2) gesamt.xpPotenzial += rest(it, e);
    });
    return { gesamt: gesamt, kat: kat };
  }

  /** Plan fuer den naechsten Mastery Rank. */
  function mrPlan(spieler, offeneXp) {
    var mr = spieler.mr | 0;
    var ziel = (spieler.zielMr | 0) > mr ? (spieler.zielMr | 0) : mr + 1;
    var aktuell = typeof spieler.mrXp === 'number' && spieler.mrXp >= mrXp(mr) ? spieler.mrXp : mrXp(mr);
    var genau = typeof spieler.mrXp === 'number' && spieler.mrXp >= mrXp(mr);
    var fehlt = Math.max(0, mrXp(ziel) - aktuell);
    return {
      mr: mr, ziel: ziel, aktuell: aktuell, genau: genau, fehlt: fehlt,
      frames: Math.ceil(fehlt / 6000), waffen: Math.ceil(fehlt / 3000),
      reichtDerRest: offeneXp >= fehlt
    };
  }

  var api = {
    PRO_RANG: PRO_RANG, mrXp: mrXp, mrFuerXp: mrFuerXp, rest: rest, statusVon: statusVon,
    teilStufe: teilStufe, zeitKette: zeitKette, bedarf: bedarf, aufwand: aufwand,
    erwartetMax: erwartetMax, besteQuelle: besteQuelle, farm: farm, orteGruppieren: orteGruppieren,
    statistik: statistik, mrPlan: mrPlan
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else wurzel.Rechnen = api;
})(typeof window !== 'undefined' ? window : this);
