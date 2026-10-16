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

console.log('Alle ' + n + ' Rechen-Tests bestanden.');
