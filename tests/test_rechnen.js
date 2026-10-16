/* Tests fuer web/rechnen.js. Aufruf: node tests/test_rechnen.js */
'use strict';
const assert = require('assert');
const R = require('../web/rechnen.js');
const db = require('../daten/items.json');

let n = 0;
function test(name, f) { f(); n++; }

test('MR-Schwellen', () => {
  assert.strictEqual(R.mrXp(0), 0);
  assert.strictEqual(R.mrXp(1), 2500);
  assert.strictEqual(R.mrXp(30), 2250000);
  assert.strictEqual(R.mrXp(31), 2397500);
  assert.strictEqual(R.mrFuerXp(2250000), 30);
  assert.strictEqual(R.mrFuerXp(2249999), 29);
});

test('Rest-Mastery', () => {
  const w = { xp: 3000 }, f = { xp: 6000 };
  assert.strictEqual(R.rest(w, undefined), 3000);
  assert.strictEqual(R.rest(w, { s: 1 }), 3000);
  assert.strictEqual(R.rest(w, { s: 2, r: 10 }), 2000);
  assert.strictEqual(R.rest(f, { s: 2, r: 10 }), 4000);
  assert.strictEqual(R.rest(f, { s: 3 }), 0);
});

test('Bedarf: Teile herausrechnen', () => {
  const rhino = db.items.find(i => i.name === 'Rhino');
  const alles = R.bedarf(rhino, undefined);
  assert.ok(alles.credits > 25000 + 35000);
  assert.strictEqual(alles.bpMarkt, 35000);
  assert.strictEqual(alles.plaene.length, 3);
  const e = { t: { bp: 2 } };
  rhino.rezept.zutaten.filter(z => z.art === 'teil').forEach(z => { e.t[z.id] = 2; });
  const rest = R.bedarf(rhino, e);
  assert.strictEqual(rest.plaene.length, 0);
  assert.strictEqual(rest.credits, 25000);
  assert.strictEqual(rest.zeitKette, rhino.rezept.zeit);
  // ein Teil nur als Bauplan: Ressourcen zaehlen, Quelle nicht
  const t = rhino.rezept.zutaten.find(z => z.art === 'teil');
  const e2 = { t: { bp: 2 } };
  e2.t[t.id] = 1;
  const b2 = R.bedarf(rhino, e2);
  assert.ok(b2.credits > 25000);
  assert.ok(!b2.plaene.some(p => p.id === t.id));
});

test('Bedarf: Rohstoffe summieren', () => {
  const item = { name: 'X', xp: 3000, rezept: { kosten: 100, zeit: 60, zutaten: [
    { id: 'a', name: 'A', n: 2, art: 'res' },
    { id: 't', name: 'T', n: 2, art: 'teil', rezept: { kosten: 10, zeit: 30, zutaten: [{ id: 'a', name: 'A', n: 3, art: 'res' }] } }
  ] } };
  const b = R.bedarf(item, undefined);
  assert.strictEqual(b.res.a, 2 + 3 * 2);
  assert.strictEqual(b.credits, 100 + 10 * 2);
  assert.strictEqual(b.zeitKette, 60 + 30);
  assert.strictEqual(b.zeitSumme, 60 + 60);
});

test('Aufwand-Stufen', () => {
  const braton = db.items.find(i => i.name === 'Braton');
  assert.ok(['leicht', 'mittel'].includes(R.aufwand(braton, undefined).stufe));
  const nurTresor = db.items.filter(i => R.aufwand(i, undefined).stufe === 'tresor');
  assert.ok(nurTresor.length > 20, 'Tresor-Items muessen erkannt werden');
  const founder = db.items.find(i => i.name === 'Lato Prime');
  assert.strictEqual(R.aufwand(founder, undefined).stufe, 'tresor');
  // alle Items rechnen ohne Fehler
  db.items.forEach(i => { const a = R.aufwand(i, undefined); assert.ok(isFinite(a.punkte)); });
});

test('Statistik', () => {
  const z = { items: {} };
  const items = db.items.slice(0, 10);
  z.items[items[0].id] = { s: 3 };
  z.items[items[1].id] = { s: 2, r: 10 };
  z.items[items[2].id] = { s: 0, x: true };
  const st = R.statistik(items, z);
  assert.strictEqual(st.gesamt.n, 10);
  assert.strictEqual(st.gesamt.s[3], 1);
  assert.strictEqual(st.gesamt.s[2], 1);
  assert.strictEqual(st.gesamt.zurueck, 1);
  assert.strictEqual(st.gesamt.xpOffen, st.gesamt.xp - items[0].xp - items[2].xp - R.PRO_RANG[items[1].xp] * 10);
});

test('MR-Plan', () => {
  const p = R.mrPlan({ mr: 29, mrXp: null }, 100000);
  assert.strictEqual(p.fehlt, R.mrXp(30) - R.mrXp(29));
  assert.strictEqual(p.genau, false);
  const q = R.mrPlan({ mr: 29, mrXp: 2200000 }, 100000);
  assert.strictEqual(q.fehlt, 50000);
  assert.strictEqual(q.genau, true);
  assert.strictEqual(q.reichtDerRest, true);
  const z = R.mrPlan({ mr: 29, mrXp: null, zielMr: 31 }, 0);
  assert.strictEqual(z.ziel, 31);
  assert.strictEqual(z.fehlt, R.mrXp(31) - R.mrXp(29));
  assert.strictEqual(R.mrPlan({ mr: 29, zielMr: 20 }, 0).ziel, 30);
});

test('Erwartete Versuche', () => {
  const nah = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' ist nicht ' + b);
  nah(R.erwartetMax([]), 0);
  nah(R.erwartetMax([0.5]), 2);
  nah(R.erwartetMax([1]), 1);
  nah(R.erwartetMax([0.5, 0.5]), 8 / 3);          // Maximum zweier geometrischer Verteilungen
  assert.ok(Math.abs(R.erwartetMax([0.25, 0.25, 0.25]) - 6.872586872586873) < 1e-6);   // Handrechnung per Einschluss-Ausschluss
  assert.ok(R.erwartetMax([0.3, 0.3]) > R.erwartetMax([0.3]));
  assert.ok(R.erwartetMax([0.3, 0.3]) < 2 / 0.3);
});

test('Beste Quelle', () => {
  const q = [
    { ort: 'Lith A1', art: 'Relikt', chance: 25, tresor: true },
    { ort: 'Meso B2', art: 'Relikt', chance: 11 },
    { ort: 'Venus/Fossa', art: 'Drop', chance: 38 },
    { ort: 'Saturn/Variant (Conclave)', art: 'Drop', chance: 90 }
  ];
  const b = R.besteQuelle(q);
  assert.strictEqual(b.ort, 'Venus/Fossa');
  assert.strictEqual(R.besteQuelle([q[0]]), null, 'Tresor-Relikte zaehlen nicht');
  const pvp = R.besteQuelle([q[3]]);
  assert.strictEqual(pvp.pvp, true);
  assert.ok(pvp.versuche > 1 / 0.9 * 2.5);
  assert.strictEqual(R.besteQuelle([{ ort: 'X', art: 'Drop' }]).geschaetzt, true);
});

test('Farm-Plan: Teile verkuerzen die Liste', () => {
  const rhino = db.items.find(i => i.name === 'Rhino');
  const leer = R.farm(rhino, undefined);
  assert.strictEqual(leer.teile.length, 3);
  assert.strictEqual(leer.gruppen.length, 1, 'alle drei Teile fallen am selben Ort');
  assert.ok(leer.versuche > 2 && leer.versuche < 30);
  assert.strictEqual(leer.da, 0);
  assert.strictEqual(leer.alleDa, false);
  const e = { t: {} };
  rhino.rezept.zutaten.filter(z => z.art === 'teil').forEach((z, i) => { e.t[z.id] = i === 0 ? 2 : 1; });
  const mit = R.farm(rhino, e);
  assert.strictEqual(mit.teile.length, 0);
  assert.strictEqual(mit.da, 3);
  assert.strictEqual(mit.versuche, 0);
  assert.strictEqual(mit.alleDa, true);
  const halb = { t: {} };
  halb.t[rhino.rezept.zutaten.find(z => z.art === 'teil').id] = 2;
  const h = R.farm(rhino, halb);
  assert.strictEqual(h.teile.length, 2);
  assert.ok(h.versuche < leer.versuche);
});

test('Farm-Plan: Tresor und unbekannte Quellen', () => {
  const nurTresor = { name: 'T', xp: 3000, kat: 'primary', rezept: { kosten: 1000, zeit: 10, zutaten: [
    { id: 'p1', name: 'P1', n: 1, art: 'teil', q: [{ ort: 'Lith A1', art: 'Relikt', chance: 25, tresor: true }] }] } };
  const f = R.farm(nurTresor, undefined);
  assert.strictEqual(f.tresor, true);
  assert.strictEqual(R.aufwand(nurTresor, undefined).stufe, 'tresor');
  const unbekannt = { name: 'U', xp: 3000, kat: 'primary', bpCredits: 1000, rezept: { kosten: 1000, zeit: 10, zutaten: [
    { id: 'p1', name: 'P1', n: 1, art: 'teil', q: [] }] } };
  const u = R.farm(unbekannt, undefined);
  assert.strictEqual(u.unbekannt, 1);
  assert.ok(u.versuche >= 25);
  assert.strictEqual(u.alleDa, false);
});

test('Orte gruppieren', () => {
  const mk = (name, ort, chance) => ({ name, xp: 3000, id: name, rezept: { kosten: 0, zeit: 0, zutaten: [
    { id: name + 'teil', name: name + ' Teil', n: 1, art: 'teil', q: [{ ort, art: 'Drop', chance }] }] } });
  const a = mk('A', 'Ort1', 50), b = mk('B', 'Ort1', 25), c = mk('C', 'Ort2', 50);
  const orte = R.orteGruppieren([a, b, c].map(it => ({ item: it, farm: R.farm(it, undefined) })));
  assert.strictEqual(orte[0].ort, 'Ort1');
  assert.strictEqual(orte[0].anzahlItems, 2);
  assert.ok(orte[0].versuche > 4, 'mindestens so viele Versuche wie das seltenste Teil');
  assert.strictEqual(orte[1].anzahlItems, 1);
  const pv = mk('P', 'Mode (Conclave)', 90), pw = mk('Q', 'Mode (Conclave)', 90), r = mk('R', 'Ort3', 10);
  const o2 = R.orteGruppieren([pv, pw, r].map(it => ({ item: it, farm: R.farm(it, undefined) })));
  assert.strictEqual(o2[o2.length - 1].ort, 'Mode (Conclave)', 'PvP-Orte stehen am Ende');
});

test('Aufwand mit echten Daten: alle Items rechnen, Verteilung plausibel', () => {
  const stufen = {};
  db.items.forEach(i => {
    const a = R.aufwand(i, undefined);
    assert.ok(isFinite(a.punkte), i.name);
    stufen[a.stufe] = (stufen[a.stufe] || 0) + 1;
  });
  assert.ok(stufen.leicht > 50 && stufen.mittel > 50 && stufen.aufwendig > 10 && stufen.tresor > 20, JSON.stringify(stufen));
});

console.log('Alle ' + n + ' Rechen-Tests bestanden.');
