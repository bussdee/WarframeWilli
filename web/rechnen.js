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

  /** Aufwand-Einschaetzung, Stufe: leicht, mittel, aufwendig, tresor (nur ueber Handel). */
  function aufwand(item, e) {
    var gruende = [];
    var p = 0;
    var stufe;
    if (item.manuell) { gruende.push('Modular: selbst zusammenbauen'); }
    if (!item.rezept) {
      p += 6;
      if ((item.spezial || []).length) gruende.push(item.spezial[0]);
      else gruende.push('Kein Schmiede-Rezept');
      if (item.spezial && item.spezial.some(function (s) { return /Founder/.test(s); })) {
        return { punkte: 99, stufe: 'tresor', gruende: gruende };
      }
      stufe = p < 3 ? 'leicht' : (p < 8 ? 'mittel' : 'aufwendig');
      return { punkte: p, stufe: stufe, gruende: gruende };
    }
    var b = bedarf(item, e);
    p += b.credits / 50000;
    var bpBekannt = !!item.bpCredits || !!(item.bpQuellen && item.bpQuellen.length) || teilStufe(e, 'bp') === 2;
    if (!bpBekannt) {
      p += 3;
      gruende.push('Blueprint-Quelle nicht in den Daten, siehe Wiki');
    }
    if ((item.spezial || []).length && !item.bpCredits && teilStufe(e, 'bp') < 2) {
      p += 4;
      gruende.push(item.spezial[0]);
    }
    var farm = 0;
    var relikt = 0;
    var tresorNur = 0;
    b.plaene.forEach(function (pl) {
      var rel = (pl.q || []).filter(function (x) { return x.art === 'Relikt'; });
      var drops = (pl.q || []).filter(function (x) { return x.art !== 'Relikt'; });
      if (rel.length && !drops.length) {
        relikt++;
        if (rel.every(function (x) { return x.tresor; })) tresorNur++;
      } else {
        farm++;
      }
    });
    p += farm * 2 + relikt * 3;
    if (farm) gruende.push(farm + (farm === 1 ? ' Teil muss gedroppt werden' : ' Teile müssen gedroppt werden'));
    if (relikt) gruende.push(relikt + (relikt === 1 ? ' Teil aus Relikten' : ' Teile aus Relikten'));
    if (b.bpMarkt) gruende.push('Blueprint im Markt: ' + b.bpMarkt.toLocaleString('de-DE') + ' Credits');
    if (b.credits >= 150000) gruende.push((Math.round(b.credits / 1000)).toLocaleString('de-DE') + 'k Credits');
    if (tresorNur) {
      gruende.unshift('Im Void-Tresor: nur über Varzia, Handel oder Events');
      return { punkte: 90 + p, stufe: 'tresor', gruende: gruende };
    }
    stufe = p < 3 ? 'leicht' : (p < 8 ? 'mittel' : 'aufwendig');
    return { punkte: p, stufe: stufe, gruende: gruende };
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
    statistik: statistik, mrPlan: mrPlan
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else wurzel.Rechnen = api;
})(typeof window !== 'undefined' ? window : this);
