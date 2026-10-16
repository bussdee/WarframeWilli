/* WarframeWilli: Oberflaeche. Zustand liegt auf dem lokalen Server (daten/zustand.json). */
(function () {
  'use strict';
  var R = window.Rechnen;

  var STATUS_NAMEN = ['Offen', 'Im Bau', 'Gebaut', 'Rang 30'];
  var STATUS_LANG = ['Noch nicht gebaut', 'Liegt in der Schmiede', 'Gebaut, noch nicht auf Rang 30', 'Auf Rang 30, Mastery erhalten'];
  var SELTEN = { Common: 'Häufig', Uncommon: 'Ungewöhnlich', Rare: 'Selten', Legendary: 'Legendär' };
  var TABS = [
    ['uebersicht', 'Übersicht'], ['schmiede', 'Schmiede'], ['farm', 'Farm-Liste'], ['einkauf', 'Einkaufsliste'],
    ['daten', 'Daten und Import'], ['hilfe', 'Hilfe']
  ];

  var S = {
    db: null, nach: {}, katReihe: [], z: null, info: null, profil: null,
    ui: { tab: 'uebersicht', kat: 'alle', status: 'alle', suche: '', sort: 'name', nurBaubar: false, ohneTresor: false, nurRezept: false, empfKat: 'alle', detail: null,
      farm: { kat: 'alle', sort: 'empfehlung', nurBaubar: true, ohneTresor: true, ansicht: 'items', max: 25, maxSofort: 10 } },
    speicherStand: null, speicherFehler: false, geladen: false, lastImport: null, aktualisiert: null
  };

  /* ---------------------------------------------------------------- Hilfen */
  function $(sel, el) { return (el || document).querySelector(sel); }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var zahlFmt = new Intl.NumberFormat('de-DE');
  function fmt(n) { return zahlFmt.format(Math.round(n || 0)); }
  function prozent(a, b) { return b ? Math.round((a / b) * 100) : 0; }
  function dauer(sek) {
    sek = Math.round(sek || 0);
    if (sek <= 0) return '0';
    var t = Math.floor(sek / 86400), h = Math.floor((sek % 86400) / 3600), m = Math.floor((sek % 3600) / 60);
    var teile = [];
    if (t) teile.push(t + ' T');
    if (h) teile.push(h + ' Std');
    if (m && !t) teile.push(m + ' Min');
    return teile.join(' ') || '< 1 Min';
  }
  function toast(text, fehler) {
    var box = $('#toast');
    var d = document.createElement('div');
    if (fehler) d.className = 'fehler';
    d.textContent = text;
    box.appendChild(d);
    setTimeout(function () { d.remove(); }, fehler ? 7000 : 3500);
  }
  function wikiUrl(it) { return it.wiki || ('https://wiki.warframe.com/w/' + encodeURIComponent(it.name.replace(/ /g, '_'))); }
  function resName(id) { var r = S.db.res[id]; return r ? r.name : id.split('/').pop(); }
  function seltenheit(s) { return SELTEN[s] || s || ''; }

  var API = {
    get: function (pfad) {
      return fetch(pfad, { cache: 'no-store' }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.fehler || ('Fehler ' + r.status)); return j; }); });
    },
    post: function (pfad, body) {
      return fetch(pfad, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-WFW': '1' }, body: JSON.stringify(body || {})
      }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.fehler || ('Fehler ' + r.status)); return j; }); });
    }
  };

  /* ---------------------------------------------------------------- Zustand */
  function leererZustand() { return { version: 1, spieler: { name: '', mr: 0, mrXp: null }, items: {}, einst: {} }; }
  function ez(id) { return S.z.items[id] || (S.z.items[id] = { s: 0 }); }
  function sauber() {
    var kopie = JSON.parse(JSON.stringify(S.z));
    Object.keys(kopie.items).forEach(function (id) {
      var e = kopie.items[id];
      if (e.t) { Object.keys(e.t).forEach(function (k) { if (!e.t[k]) delete e.t[k]; }); if (!Object.keys(e.t).length) delete e.t; }
      if (!e.s) delete e.s;
      if (!e.w) delete e.w;
      if (!e.x) delete e.x;
      if (!e.n) delete e.n;
      if (!e.r) delete e.r;
      if (!Object.keys(e).length) delete kopie.items[id];
    });
    return kopie;
  }
  var speicherTimer = null;
  function speichern() {
    if (!S.geladen) return;
    clearTimeout(speicherTimer);
    zeigeSpeicher('Speichert ...');
    speicherTimer = setTimeout(function () {
      var daten = sauber();
      try { localStorage.setItem('wfw_zustand', JSON.stringify(daten)); } catch (e) { /* ohne Zwischenspeicher weiter */ }
      API.post('/api/zustand', daten).then(function () {
        S.speicherStand = new Date(); S.speicherFehler = false; zeigeSpeicher();
      }).catch(function (f) {
        S.speicherFehler = true; zeigeSpeicher(); toast('Speichern fehlgeschlagen: ' + f.message, true);
      });
    }, 350);
  }
  function zeigeSpeicher(text) {
    var el = $('#speicher');
    if (!el) return;
    el.classList.toggle('fehler', S.speicherFehler);
    if (text) { el.textContent = text; return; }
    if (S.speicherFehler) el.textContent = 'Nicht gespeichert!';
    else if (S.speicherStand) el.textContent = 'Gespeichert ' + S.speicherStand.toLocaleTimeString('de-DE');
    else el.textContent = '';
  }

  /* ---------------------------------------------------------------- Status setzen */
  function setStatus(id, s) {
    var e = ez(id);
    if (e.s === s && s > 0) s = 0;
    e.s = s;
    if (s === 3) e.r = 30;
    if (s === 0) { delete e.r; }
    if (s === 1 && e.r === 30) delete e.r;
    speichern();
  }
  function toggle(id, feld) { var e = ez(id); e[feld] = !e[feld]; speichern(); }
  function mrBekannt() { return (S.z.spieler.mr | 0) > 0; }

  /* ---------------------------------------------------------------- Filter und Sortierung */
  function anzeigeItems() {
    var u = S.ui;
    var q = u.suche.trim().toLowerCase();
    var mr = S.z.spieler.mr | 0;
    var liste = S.db.items.filter(function (it) {
      if (u.kat !== 'alle' && it.kat !== u.kat) return false;
      var e = S.z.items[it.id];
      var s = R.statusVon(e);
      var x = e && e.x;
      switch (u.status) {
        case 'offen': if (s !== 0 || x) return false; break;
        case 'bau': if (s !== 1) return false; break;
        case 'gebaut': if (s !== 2) return false; break;
        case 'rang30': if (s !== 3) return false; break;
        case 'nichtfertig': if (s >= 3 || x) return false; break;
        case 'wunsch': if (!(e && e.w)) return false; break;
        case 'zurueck': if (!x) return false; break;
        default: break;
      }
      if (u.nurBaubar && mr > 0 && it.mr > mr) return false;
      if (u.ohneTresor && it.tresor) return false;
      if (u.nurRezept && !it.rezept) return false;
      if (q) {
        var heu = (it.name + ' ' + it.art + ' ' + (it.tags || []).join(' ') + ' ' + (it.spezial || []).join(' ')).toLowerCase();
        if (heu.indexOf(q) < 0) return false;
      }
      return true;
    });
    var sort = u.sort;
    var ap = {};
    if (sort === 'empfehlung' || sort === 'aufwand') {
      liste.forEach(function (it) { ap[it.id] = R.aufwand(it, S.z.items[it.id]); });
    }
    liste = liste.slice();
    liste.sort(function (a, b) {
      switch (sort) {
        case 'empfehlung': return (b.xp / (1 + ap[b.id].punkte)) - (a.xp / (1 + ap[a.id].punkte)) || a.name.localeCompare(b.name);
        case 'aufwand': return ap[a.id].punkte - ap[b.id].punkte || a.name.localeCompare(b.name);
        case 'xp': return b.xp - a.xp || a.name.localeCompare(b.name);
        case 'mr': return a.mr - b.mr || a.name.localeCompare(b.name);
        case 'neu': return (b.datum || '').localeCompare(a.datum || '') || a.name.localeCompare(b.name);
        default: return S.db.meta.kategorien[a.kat].pos - S.db.meta.kategorien[b.kat].pos || a.name.localeCompare(b.name);
      }
    });
    return liste;
  }

  /* ---------------------------------------------------------------- Bausteine */
  function bildHtml(it, klasse) {
    var anfang = esc(it.name.charAt(0));
    if (!it.bild) return '<div class="' + klasse + '">' + anfang + '</div>';
    return '<div class="' + klasse + '" style="position:relative"><span>' + anfang + '</span><img loading="lazy" alt="" src="/bild/' + encodeURIComponent(it.bild) +
      '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain" onload="this.previousElementSibling.style.display=\'none\'" onerror="this.remove()"></div>';
  }
  function statusWahl(id, s, kurz) {
    var h = '<div class="seg" role="group" aria-label="Status">';
    for (var i = 0; i < 4; i++) {
      h += '<button type="button" data-a="status" data-id="' + esc(id) + '" data-s="' + i + '" aria-pressed="' + (s === i) + '" title="' + esc(STATUS_LANG[i]) + '">' + STATUS_NAMEN[i] + '</button>';
    }
    return h + '</div>';
  }
  function quellenHtml(q, max) {
    max = max || 8;
    if (!q || !q.length) return '<span class="chip">Quelle unbekannt, siehe Wiki</span>';
    var h = q.slice(0, max).map(function (x) {
      var tip = seltenheit(x.selten) + (x.chance ? ', ' + String(x.chance).replace('.', ',') + ' %' : '');
      if (x.art === 'Relikt') {
        return '<span class="chip ' + (x.tresor ? 'tresor' : 'gruen') + '" title="' + esc((x.tresor ? 'Relikt liegt im Void-Tresor. ' : 'Relikt ist aktuell farmbar. ') + tip) + '">' + esc(x.ort) + '</span>';
      }
      return '<span class="chip" title="' + esc(tip) + '">' + esc(x.ort) + (x.chance ? ' ' + String(x.chance).replace('.', ',') + ' %' : '') + '</span>';
    }).join('');
    if (q.length > max) h += '<span class="chip">+' + (q.length - max) + ' weitere</span>';
    return h;
  }
  function balkenHtml(t, klein) {
    var n = t.n || 1;
    return '<div class="balken' + (klein ? '' : ' dick') + '" title="' + t.s[3] + ' auf Rang 30, ' + t.s[2] + ' gebaut, ' + t.s[1] + ' im Bau, ' + t.s[0] + ' offen">' +
      '<i class="b3" style="width:' + (t.s[3] / n * 100) + '%"></i><i class="b2" style="width:' + (t.s[2] / n * 100) + '%"></i><i class="b1" style="width:' + (t.s[1] / n * 100) + '%"></i></div>';
  }
  function legendeHtml() {
    return '<div class="legende"><span><i style="background:var(--gruen)"></i>Rang 30</span><span><i style="background:var(--gelb)"></i>Gebaut</span><span><i style="background:var(--blau)"></i>Im Bau</span><span><i style="background:var(--panel2);border:1px solid var(--rand)"></i>Offen</span></div>';
  }
  function aufwandHtml(a) {
    var namen = { leicht: 'leicht', mittel: 'mittel', aufwendig: 'aufwendig', tresor: 'Tresor' };
    return '<span class="aufwand ' + a.stufe + '" title="' + esc(a.gruende.join('. ') || 'Keine besonderen Hürden') + '">' + namen[a.stufe] + '</span>';
  }

  function artChip(it) {
    var kn = S.db.meta.kategorien[it.kat].name.toLowerCase();
    if (!it.art || kn.indexOf(it.art.toLowerCase()) === 0) return '';
    return '<span class="chip">' + esc(it.art) + '</span>';
  }

  function zeileHtml(it) {
    var e = S.z.items[it.id];
    var s = R.statusVon(e);
    var zur = e && e.x;
    var mr = S.z.spieler.mr | 0;
    var gesperrt = mr > 0 && it.mr > mr;
    var chips = artChip(it);
    if (it.mr > 0) chips += '<span class="chip ' + (gesperrt ? 'rot' : '') + '" title="' + (gesperrt ? 'Dein Mastery Rank reicht noch nicht' : 'Benötigter Mastery Rank') + '">MR ' + it.mr + '</span>';
    if (it.prime) chips += '<span class="chip gold">Prime</span>';
    var aw = (s === 0 && !zur) ? R.aufwand(it, e) : null;
    if (it.tresor && !(aw && aw.stufe === 'tresor')) chips += '<span class="chip rot" title="Im Void-Tresor: aktuell nur über Varzia (Prime Resurgence), Handel oder Events">Tresor</span>';
    if (it.manuell) chips += '<span class="chip blau" title="Modulare Items bitte von Hand abhaken">Modular</span>';
    (it.spezial || []).slice(0, 1).forEach(function (t) { chips += '<span class="chip">' + esc(t) + '</span>'; });
    if (e && e.w) chips += '<span class="chip gold">Auf der Wunschliste</span>';
    if (zur) chips += '<span class="chip">Zurückgestellt</span>';
    if (aw) chips += aufwandHtml(aw);
    var rang = '';
    if ((s === 1 || s === 2) && e.r) {
      rang = '<div class="rangbalken" title="Rang ' + e.r + ' von 30"><i style="width:' + (Math.min(30, e.r) / 30 * 100) + '%"></i></div>';
      chips += '<span class="chip">Rang ' + e.r + '/30</span>';
    }
    var teile = teileFortschritt(it, e);
    if (teile && s === 0) chips += '<span class="chip">' + teile + '</span>';
    return '<div class="zeile st' + s + (zur ? ' zurueck' : '') + '" data-id="' + esc(it.id) + '">' +
      bildHtml(it, 'bild') +
      '<div><div class="name" data-a="detail" data-id="' + esc(it.id) + '" tabindex="0" role="button">' + esc(it.name) + '</div><div class="meta">' + chips + '</div>' + rang + '</div>' +
      '<div class="aktionen"><span class="xp" title="Mastery-Punkte bei Rang 30">' + fmt(it.xp) + ' XP</span>' + statusWahl(it.id, s) +
      '<button type="button" class="stern" data-a="stern" data-id="' + esc(it.id) + '" aria-pressed="' + !!(e && e.w) + '" title="Auf die Wunschliste setzen">' + (e && e.w ? '★' : '☆') + '</button></div></div>';
  }
  function teileFortschritt(it, e) {
    if (!it.rezept) return '';
    var gesamt = 0, da = 0;
    it.rezept.zutaten.forEach(function (z) {
      if (z.art !== 'teil') return;
      gesamt++;
      if (R.teilStufe(e, z.id) === 2) da++;
    });
    return gesamt ? ('Teile ' + da + '/' + gesamt) : '';
  }

  /* ---------------------------------------------------------------- Kopf */
  function renderKopf() {
    var h = '';
    TABS.forEach(function (t) {
      h += '<button class="tab" role="tab" data-a="tab" data-tab="' + t[0] + '" aria-selected="' + (S.ui.tab === t[0]) + '">' + t[1] + '</button>';
    });
    $('#tabs').innerHTML = h;
  }

  /* ---------------------------------------------------------------- Uebersicht */
  function renderUebersicht() {
    var st = R.statistik(S.db.items, S.z);
    var g = st.gesamt;
    var sp = S.z.spieler;
    var plan = R.mrPlan(sp, g.xpOffen);
    var h = '<div class="kopfzeile"><h1>Dein Weg zum nächsten Mastery Rank</h1></div>';

    if (!mrBekannt() && g.s[1] + g.s[2] + g.s[3] === 0) {
      h += '<div class="hinweis" style="margin-bottom:16px"><p><b>So fängst du an:</b> Trage unten deinen Mastery Rank ein. ' +
        'Dann öffnest du die <a href="#" data-a="filter" data-status="offen" data-sort="empfehlung">Schmiede</a> und setzt bei jedem Item, das du schon gebaut hast, den Status auf "Gebaut" oder "Rang 30". ' +
        'Mit "Alle sichtbaren ändern" geht das für ganze Gruppen auf einmal.</p></div>';
    }

    /* MR-Plan */
    h += '<div class="raster zwei">';
    h += '<div class="karte"><h2>Mastery-Plan</h2>';
    h += '<div class="formzeile">' +
      '<label class="feld">Name<input type="text" data-feld="name" value="' + esc(sp.name || '') + '" placeholder="Spielername"></label>' +
      '<label class="feld">Mastery Rank (MR)<input type="number" min="0" max="60" data-feld="mr" value="' + (sp.mr || '') + '" placeholder="z. B. 29"></label>' +
      '<label class="feld">Mastery-XP laut Spiel (optional)<input type="number" min="0" data-feld="mrXp" value="' + (typeof sp.mrXp === 'number' ? sp.mrXp : '') + '" placeholder="z. B. 2150000"></label>' +
      '<label class="feld">Ziel-MR (optional)<input type="number" min="1" max="60" data-feld="zielMr" value="' + (sp.zielMr || '') + '" placeholder="Standard: nächster Rang"></label></div>';
    if (mrBekannt()) {
      h += '<div class="raster drei" style="margin-top:16px">' +
        '<div class="kennzahl gold"><b>' + fmt(plan.fehlt) + '</b><span>Mastery-XP bis MR ' + plan.ziel + (plan.genau ? '' : ' (höchstens)') + '</span></div>' +
        '<div class="kennzahl"><b>' + plan.frames + '</b><span>Warframes oder Begleiter (je 6.000)</span></div>' +
        '<div class="kennzahl"><b>' + plan.waffen + '</b><span>Waffen (je 3.000)</span></div></div>';
      h += '<p class="muted klein" style="margin:12px 0 0">Alle noch offenen Items zusammen bringen <b>' + fmt(g.xpOffen) + '</b> Mastery-XP, ' +
        (plan.reichtDerRest ? 'das reicht für MR ' + plan.ziel + '.' : 'das reicht <b>nicht</b> für MR ' + plan.ziel + ', der Rest kommt aus Sternenkarte und Intrinsics.') + '</p>';
      if (!plan.genau) {
        h += '<p class="muted klein" style="margin:6px 0 0">Ohne deine genaue Mastery-XP rechne ich ab dem Beginn von MR ' + plan.mr + ', daher ist der Wert ein Höchstwert. Die genaue Zahl steht im Spiel in deinem Profil.</p>';
      }
      h += '<p class="muted klein" style="margin:6px 0 0">Wenn die Punkte reichen, musst du im Spiel noch den Mastery-Test bestehen (23 Stunden Pause nach jedem Test).</p>';
    } else {
      h += '<p class="muted" style="margin-top:14px">Trage deinen Mastery Rank ein, dann rechne ich dir aus, was bis zum nächsten Rang fehlt.</p>';
    }
    h += '</div>';

    /* Gesamtfortschritt */
    var gebaut = g.s[2] + g.s[3];
    h += '<div class="karte"><h2>Gesamtfortschritt</h2>' +
      '<div class="raster drei">' +
      '<div class="kennzahl gold"><b>' + gebaut + ' / ' + g.n + '</b><span>mindestens einmal gebaut (' + prozent(gebaut, g.n) + ' %)</span></div>' +
      '<div class="kennzahl gruen"><b>' + g.s[3] + '</b><span>auf Rang 30, Mastery erhalten</span></div>' +
      '<div class="kennzahl blau"><b>' + g.s[0] + '</b><span>noch gar nicht gebaut</span></div></div>' +
      '<div style="margin-top:14px">' + balkenHtml(g) + legendeHtml() + '</div>' +
      '<p class="muted klein" style="margin:10px 0 0">Item-Mastery bisher: <b>' + fmt(g.xpErhalten) + '</b> von <b>' + fmt(g.xp) + '</b> XP. ' +
      (g.xpPotenzial ? 'Allein durch Leveln schon gebauter Items warten noch <b>' + fmt(g.xpPotenzial) + '</b> XP.' : '') + '</p></div>';
    h += '</div>';

    /* Kategorien */
    h += '<div class="karte" style="margin-top:16px"><h2>Fortschritt je Kategorie</h2><table><thead><tr><th>Kategorie</th><th style="width:34%">Stand</th>' +
      '<th class="num">Gebaut</th><th class="num">Offen</th><th class="num">Offene Mastery-XP</th></tr></thead><tbody>';
    S.katReihe.forEach(function (k) {
      var t = st.kat[k.key];
      if (!t) return;
      h += '<tr><td><a href="#" data-a="gotokat" data-kat="' + k.key + '">' + esc(k.name) + '</a></td><td>' + balkenHtml(t, true) + '</td>' +
        '<td class="num">' + (t.s[2] + t.s[3]) + ' / ' + t.n + '</td><td class="num">' + t.s[0] + '</td><td class="num">' + fmt(t.xpOffen) + '</td></tr>';
    });
    h += '</tbody></table>' + legendeHtml() + '</div>';

    /* Sofort-Gewinne und Empfehlungen */
    h += '<div class="raster zwei" style="margin-top:16px">';
    h += sofortGewinneHtml();
    h += empfehlungenHtml();
    h += '</div>';
    $('#ansicht').innerHTML = h;
  }

  function vorschlagZeile(it, rechts, unter) {
    return '<div class="vorschlag">' + bildHtml(it, 'bild') + '<div><b data-a="detail" data-id="' + esc(it.id) + '">' + esc(it.name) + '</b>' +
      '<div class="klein muted">' + unter + '</div></div><div style="text-align:right">' + rechts + '</div></div>';
  }
  function sofortGewinneHtml() {
    var liste = [];
    S.db.items.forEach(function (it) {
      var e = S.z.items[it.id];
      var s = R.statusVon(e);
      if (s === 1 || s === 2) liste.push({ it: it, e: e, rest: R.rest(it, e), s: s });
    });
    liste.sort(function (a, b) { return b.rest - a.rest; });
    var summe = liste.reduce(function (a, x) { return a + x.rest; }, 0);
    var h = '<div class="karte"><h2>Sofort-Gewinne: schon gebaut, noch nicht auf Rang 30</h2>';
    if (!liste.length) {
      h += '<p class="muted">Hier erscheint alles, was du gebaut hast, aber noch nicht voll gelevelt ist. Das ist der schnellste Weg zu Mastery, weil nichts mehr gebaut werden muss.</p></div>';
      return h;
    }
    h += '<p class="muted klein" style="margin-top:0">Zusammen noch <b>' + fmt(summe) + '</b> Mastery-XP ohne einen einzigen Bauauftrag.</p>';
    liste.slice(0, 10).forEach(function (x) {
      h += vorschlagZeile(x.it, '<span class="xp">+' + fmt(x.rest) + '</span>', x.s === 1 ? 'Liegt in der Schmiede' : (x.e.r ? 'Rang ' + x.e.r + ' von 30' : 'Rang unbekannt, bitte leveln'));
    });
    if (liste.length > 10) h += '<p class="muted klein">und ' + (liste.length - 10) + ' weitere. <a href="#" data-a="filter" data-status="nichtfertig">Alle ansehen</a></p>';
    return h + '</div>';
  }
  function empfehlungenHtml() {
    var mr = S.z.spieler.mr | 0;
    var kat = S.ui.empfKat;
    var liste = [];
    S.db.items.forEach(function (it) {
      var e = S.z.items[it.id];
      if (R.statusVon(e) !== 0 || (e && e.x)) return;
      if (kat === 'waffen' && ['primary', 'secondary', 'melee', 'archgun', 'archmelee', 'sentinelwaffe'].indexOf(it.kat) < 0) return;
      if (kat === 'frames' && ['warframe', 'pet', 'sentinel', 'archwing', 'necramech', 'kdrive'].indexOf(it.kat) < 0) return;
      if (mr > 0 && it.mr > mr) return;
      var a = R.aufwand(it, e);
      if (a.stufe === 'tresor') return;
      liste.push({ it: it, a: a, score: it.xp / (1 + a.punkte) });
    });
    liste.sort(function (x, y) { return y.score - x.score || x.it.name.localeCompare(y.it.name); });
    var h = '<div class="karte"><div class="kopfzeile" style="margin-bottom:6px"><h2>Als Nächstes bauen</h2>' +
      '<select data-feld="empfKat" class="rechts" style="width:auto" aria-label="Auswahl einschränken">' +
      '<option value="alle"' + (kat === 'alle' ? ' selected' : '') + '>Alles</option><option value="frames"' + (kat === 'frames' ? ' selected' : '') + '>Warframes und Begleiter (6.000 XP)</option>' +
      '<option value="waffen"' + (kat === 'waffen' ? ' selected' : '') + '>Waffen (3.000 XP)</option></select></div>' +
      '<p class="muted klein" style="margin-top:0">Sortiert nach Mastery pro Aufwand. Aufwand heißt: Credits, zu droppende Teile, Relikte. Items im Void-Tresor und mit zu hohem MR sind ausgeblendet.</p>';
    if (!liste.length) return h + '<p class="muted">Nichts Passendes mehr offen.</p></div>';
    liste.slice(0, 10).forEach(function (x) {
      h += vorschlagZeile(x.it, '<span class="xp">' + fmt(x.it.xp) + '</span> ' + aufwandHtml(x.a), esc(x.it.art) + (x.a.gruende.length ? ' · ' + esc(x.a.gruende[0]) : ''));
    });
    h += '<p class="muted klein">Insgesamt ' + liste.length + ' passende Items. <a href="#" data-a="tab" data-tab="farm">Zur Farm-Liste mit Teilen und Drop-Chancen</a></p>';
    return h + '</div>';
  }

  /* ---------------------------------------------------------------- Schmiede */
  function renderSchmiede() {
    var st = R.statistik(S.db.items, S.z);
    var u = S.ui;
    var h = '<div class="kopfzeile"><h1>Schmiede</h1><span class="muted" id="zaehler"></span></div>';
    h += '<div class="katleiste" id="katleiste">' + katLeisteHtml(st) + '</div>';
    h += '<div class="werkzeug">' +
      '<input class="suche" type="search" id="suche" placeholder="Suchen: Name, Typ, Herkunft ...  (Taste /)" value="' + esc(u.suche) + '" aria-label="Suche">' +
      '<select data-feld="status" aria-label="Status filtern">' + [
        ['alle', 'Alle anzeigen'], ['offen', 'Noch nicht gebaut'], ['nichtfertig', 'Nicht auf Rang 30'], ['bau', 'Im Bau'], ['gebaut', 'Gebaut, noch nicht Rang 30'],
        ['rang30', 'Auf Rang 30'], ['wunsch', 'Wunschliste'], ['zurueck', 'Zurückgestellt']
      ].map(function (o) { return '<option value="' + o[0] + '"' + (u.status === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<select data-feld="sort" aria-label="Sortierung">' + [
        ['name', 'Sortierung: Kategorie, Name'], ['empfehlung', 'Sortierung: Empfehlung'], ['aufwand', 'Sortierung: Aufwand'], ['xp', 'Sortierung: Mastery'],
        ['mr', 'Sortierung: MR-Anforderung'], ['neu', 'Sortierung: Neueste zuerst']
      ].map(function (o) { return '<option value="' + o[0] + '"' + (u.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<label class="haken"><input type="checkbox" data-feld="nurBaubar"' + (u.nurBaubar ? ' checked' : '') + '>Nur baubar mit meinem MR</label>' +
      '<label class="haken"><input type="checkbox" data-feld="ohneTresor"' + (u.ohneTresor ? ' checked' : '') + '>Tresor ausblenden</label>' +
      '<label class="haken"><input type="checkbox" data-feld="nurRezept"' + (u.nurRezept ? ' checked' : '') + '>Nur mit Schmiede-Rezept</label>' +
      '<select data-feld="massen" class="rechts" aria-label="Alle sichtbaren ändern"><option value="">Alle sichtbaren ändern ...</option>' +
      '<option value="0">Alle auf Offen</option><option value="2">Alle auf Gebaut</option><option value="3">Alle auf Rang 30</option><option value="w">Alle auf die Wunschliste</option><option value="x">Alle zurückstellen</option></select>' +
      '<button class="knopf klein" data-a="listekopieren" title="Namen der sichtbaren Items in die Zwischenablage">Liste kopieren</button></div>';
    h += '<div id="filterhinweis"></div><div class="liste" id="liste"></div>';
    $('#ansicht').innerHTML = h;
    renderListe();
  }
  function katLeisteHtml(st) {
    var u = S.ui;
    var g = st.gesamt;
    var h = '<button class="kat" data-a="kat" data-kat="alle" aria-pressed="' + (u.kat === 'alle') + '"><b>Alle</b><span>' + (g.s[2] + g.s[3]) + ' / ' + g.n + '</span>' + balkenHtml(g, true) + '</button>';
    S.katReihe.forEach(function (k) {
      var t = st.kat[k.key];
      if (!t) return;
      h += '<button class="kat" data-a="kat" data-kat="' + k.key + '" aria-pressed="' + (u.kat === k.key) + '"><b>' + esc(k.name) + '</b><span>' + (t.s[2] + t.s[3]) + ' / ' + t.n + '</span>' + balkenHtml(t, true) + '</button>';
    });
    return h;
  }
  var MAX_ZEILEN = 400;
  function renderListe() {
    var el = $('#liste');
    if (!el) return;
    var liste = anzeigeItems();
    S.sichtbar = liste;
    var h = '';
    liste.slice(0, MAX_ZEILEN).forEach(function (it) { h += zeileHtml(it); });
    if (!liste.length) h = '<div class="leer">Nichts gefunden. Passe Filter oder Suche an.</div>';
    if (liste.length > MAX_ZEILEN) h += '<div class="leer">Es werden die ersten ' + MAX_ZEILEN + ' von ' + liste.length + ' Treffern gezeigt. Bitte Filter eingrenzen.</div>';
    el.innerHTML = h;
    var z = $('#zaehler');
    if (z) z.textContent = liste.length + ' Items';
    filterHinweis(liste.length);
  }
  var STATUS_FILTER = { offen: 'Noch nicht gebaut', nichtfertig: 'Nicht auf Rang 30', bau: 'Im Bau', gebaut: 'Gebaut, noch nicht Rang 30', rang30: 'Auf Rang 30', wunsch: 'Wunschliste', zurueck: 'Zurückgestellt' };
  function filterHinweis(angezeigt) {
    var box = $('#filterhinweis');
    if (!box) return;
    var u = S.ui;
    var basis = S.db.items.filter(function (it) { return u.kat === 'alle' || it.kat === u.kat; }).length;
    var aktiv = [];
    if (u.status !== 'alle' && STATUS_FILTER[u.status]) aktiv.push('Status: ' + STATUS_FILTER[u.status]);
    if (u.nurBaubar && mrBekannt()) aktiv.push('nur baubar mit meinem MR');
    if (u.ohneTresor) aktiv.push('Tresor ausgeblendet');
    if (u.nurRezept) aktiv.push('nur mit Schmiede-Rezept');
    if (u.suche.trim()) aktiv.push('Suche "' + u.suche.trim() + '"');
    if (!aktiv.length || angezeigt >= basis) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="hinweis warn" style="margin-bottom:10px"><p><b>Filter aktiv:</b> ' + angezeigt + ' von ' + basis + ' Items werden gezeigt, ' + (basis - angezeigt) +
      ' sind ausgeblendet (' + esc(aktiv.join(', ')) + '). Dein Fortschritt ist unverändert. ' +
      '<button type="button" class="knopf klein" data-a="filterweg">Alle anzeigen</button></p></div>';
  }
  function aktualisiereKatLeiste() {
    var el = $('#katleiste');
    if (el) el.innerHTML = katLeisteHtml(R.statistik(S.db.items, S.z));
  }
  function zeileErneuern(id) {
    var alt = document.querySelector('.zeile[data-id="' + CSS.escape(id) + '"]');
    var it = S.nach[id];
    if (alt && it) { var t = document.createElement('div'); t.innerHTML = zeileHtml(it); alt.replaceWith(t.firstChild); }
    aktualisiereKatLeiste();
  }

  /* ---------------------------------------------------------------- Schublade */
  function oeffneDetail(id) {
    S.ui.detail = id;
    renderSchublade();
    $('#schublade').hidden = false;
    $('#abdunkeln').hidden = false;
    $('#schublade').scrollTop = 0;
  }
  function schliesseDetail() {
    S.ui.detail = null;
    $('#schublade').hidden = true;
    $('#abdunkeln').hidden = true;
    if (S.ui.tab === 'uebersicht' || S.ui.tab === 'einkauf') render();
  }
  function teilStufeWahl(id, stufe, mitBauplan) {
    var namen = mitBauplan ? ['Fehlt', 'Bauplan da', 'Fertig'] : ['Fehlt', '', 'Da'];
    var h = '<div class="seg" role="group" aria-label="Teil-Status">';
    for (var i = 0; i < 3; i++) {
      if (!namen[i]) continue;
      h += '<button type="button" data-a="teil" data-teil="' + esc(id) + '" data-stufe="' + i + '" aria-pressed="' + (stufe === i) + '" data-s="' + (i === 0 ? 0 : (i === 1 ? 2 : 3)) + '">' + namen[i] + '</button>';
    }
    return h + '</div>';
  }
  function baumHtml(zutaten, e, mal) {
    var h = '<ul class="baum">';
    zutaten.forEach(function (z) {
      var n = (z.n || 1) * mal;
      if (z.art === 'res') {
        h += '<li class="teil"><div class="kopfz"><b>' + fmt(n) + ' x ' + esc(z.name) + '</b><span class="muted klein">Rohstoff</span></div></li>';
        return;
      }
      var stufe = R.teilStufe(e, z.id);
      h += '<li class="teil"><div class="kopfz"><b>' + (n > 1 ? fmt(n) + ' x ' : '') + esc(z.name) + '</b>' + teilStufeWahl(z.id, stufe, !!z.rezept) + '</div>';
      if (stufe < 2) {
        h += '<div class="quellen">' + quellenHtml(z.q, 8) + '</div>';
        if (z.rezept) {
          h += '<div class="muted klein" style="margin-top:5px">Bauen: ' + fmt(z.rezept.kosten) + ' Credits, ' + dauer(z.rezept.zeit) + '</div>';
          if (stufe < 2) h += baumHtml(z.rezept.zutaten, e, n);
        }
      }
      h += '</li>';
    });
    return h + '</ul>';
  }
  function renderSchublade() {
    var id = S.ui.detail;
    var it = S.nach[id];
    if (!it) return;
    var e = S.z.items[id];
    var s = R.statusVon(e);
    var mr = S.z.spieler.mr | 0;
    var gesperrt = mr > 0 && it.mr > mr;
    var h = '<button class="knopf klein zu" data-a="zu">Schließen (Esc)</button>';
    h += '<div class="kopf-s">' + bildHtml(it, 'grossbild') + '<div><h2>' + esc(it.name) + '</h2><div class="meta" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">' +
      '<span class="chip">' + esc(S.db.meta.kategorien[it.kat].name) + '</span>' + artChip(it) +
      (it.prime ? '<span class="chip gold">Prime</span>' : '') + (it.tresor ? '<span class="chip rot">Im Tresor</span>' : '') +
      (it.mr ? '<span class="chip ' + (gesperrt ? 'rot' : '') + '">MR ' + it.mr + '</span>' : '') + '</div></div></div>';
    h += '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">' + statusWahl(id, s) +
      '<button type="button" class="stern" data-a="stern" data-id="' + esc(id) + '" aria-pressed="' + !!(e && e.w) + '">' + (e && e.w ? '★ Auf der Wunschliste' : '☆ Wunschliste') + '</button>' +
      '<label class="haken"><input type="checkbox" data-a="zurueck" data-id="' + esc(id) + '"' + (e && e.x ? ' checked' : '') + '>Zurückstellen (nicht erreichbar oder unwichtig)</label></div>';

    h += '<section><h3>Fakten</h3><table><tbody>' +
      '<tr><td>Mastery bei Rang 30</td><td class="num"><b>' + fmt(it.xp) + ' XP</b></td></tr>' +
      '<tr><td>Benötigter MR</td><td class="num">' + it.mr + (gesperrt ? ' <span class="gesperrt">(dein MR reicht noch nicht)</span>' : '') + '</td></tr>' +
      (it.datum ? '<tr><td>Erschienen</td><td class="num">' + esc(it.datum) + '</td></tr>' : '') +
      (e && e.r && s < 3 && s > 0 ? '<tr><td>Dein Rang</td><td class="num">' + e.r + ' von 30, noch ' + fmt(R.rest(it, e)) + ' XP</td></tr>' : '') +
      '<tr><td>Wiki</td><td class="num"><a href="' + esc(wikiUrl(it)) + '" target="_blank" rel="noopener noreferrer">Seite öffnen</a></td></tr></tbody></table></section>';

    if (it.hinweis) h += '<section>' + it.hinweis.map(function (t) { return '<div class="hinweis warn" style="margin-bottom:8px"><p>' + esc(t) + '</p></div>'; }).join('') + '</section>';

    /* Beschaffung */
    h += '<section><h3>Beschaffung</h3>';
    var info = [];
    if (it.bpCredits) info.push('Blueprint im Markt: <b>' + fmt(it.bpCredits) + ' Credits</b>');
    if (it.platin) info.push('Fertig kaufbar im Markt: <b>' + fmt(it.platin) + ' Platinum</b>');
    (it.spezial || []).forEach(function (t) { info.push(esc(t)); });
    if (it.tresor) info.push('Im Void-Tresor: nur über Varzia (Prime Resurgence), Handel mit anderen Spielern oder Events');
    if (!it.rezept) info.push('Kein Schmiede-Rezept in den Daten. Bezug im Spiel über Markt, Syndikat, Händler, Inkubator oder Quest, Details im Wiki.');
    else if (!it.bpCredits && !(it.bpQuellen && it.bpQuellen.length)) info.push('Woher der Haupt-Blueprint kommt, steht nicht in den Daten (oft Quest, Boss, Syndikat oder Händler). Bitte im Wiki nachsehen.');
    h += info.length ? '<p>' + info.join('<br>') + '</p>' : '<p class="muted">Keine Besonderheiten.</p>';
    h += '</section>';

    if (it.rezept) {
      h += '<section><h3>Bauplan</h3>';
      var bpStufe = R.teilStufe(e, 'bp');
      h += '<div class="teil"><div class="kopfz"><b>' + esc(it.name) + ' Blueprint</b>' + teilStufeWahl('bp', bpStufe, false) + '</div>';
      if (bpStufe < 2) h += '<div class="quellen">' + (it.bpCredits ? '<span class="chip gold">Markt ' + fmt(it.bpCredits) + ' Credits</span>' : '') + (it.bpQuellen && it.bpQuellen.length ? quellenHtml(it.bpQuellen, 8) : (it.bpCredits ? '' : '<span class="chip">Quelle unbekannt, siehe Wiki</span>')) + '</div>';
      h += '</div>';
      h += baumHtml(it.rezept.zutaten, e, 1);
      h += '<p class="muted klein">Hauptbau: ' + fmt(it.rezept.kosten) + ' Credits, ' + dauer(it.rezept.zeit) + '. Setze bei Teilen "Bauplan da" oder "Fertig", dann rechne ich sie aus dem Bedarf heraus.</p></section>';

      var b = R.bedarf(it, e);
      var ids = Object.keys(b.res).sort(function (x, y) { return b.res[y] - b.res[x]; });
      h += '<section><h3>Noch benötigt (alles zusammen)</h3><div class="res"><span>Credits</span><b>' + fmt(b.credits) + '</b></div>' +
        '<div class="res"><span>Bauzeit mit paralleler Schmiede</span><b>' + dauer(b.zeitKette) + '</b></div>' +
        '<div class="res"><span>Bauzeit, wenn alles nacheinander läuft</span><b>' + dauer(b.zeitSumme) + '</b></div><hr style="border:0;border-top:1px solid var(--rand)">';
      ids.forEach(function (rid) {
        var q = S.db.res[rid] && S.db.res[rid].q && S.db.res[rid].q[0];
        h += '<div class="res"><span>' + esc(resName(rid)) + (q ? ' <span class="muted klein">(z. B. ' + esc(q.ort) + ')</span>' : '') + '</span><b>' + fmt(b.res[rid]) + '</b></div>';
      });
      h += '</section>';
    }
    h += '<section><h3>Notiz</h3><textarea data-feld="notiz" data-id="' + esc(id) + '" placeholder="z. B. Kurs, Gruppe, wo ich das Teil bekommen habe">' + esc(e && e.n ? e.n : '') + '</textarea></section>';
    $('#schublade').innerHTML = h;
  }

  /* ---------------------------------------------------------------- Farm-Liste */
  var FARM_SORT = [
    ['empfehlung', 'Empfehlung (Mastery pro Aufwand)'], ['leicht', 'Wenigster Aufwand zuerst'],
    ['fertig', 'Fast fertig (meiste Teile vorhanden)'], ['xp', 'Meiste Mastery zuerst']
  ];
  function prozText(c) { return String(c).replace('.', ',') + ' %'; }
  function versucheText(v) { return v < 1.5 ? '1 Versuch' : ('ca. ' + fmt(Math.ceil(v)) + ' Versuche'); }

  function farmKandidaten() {
    var f = S.ui.farm;
    var mr = S.z.spieler.mr | 0;
    var res = { farmen: [], sofort: [], sonder: [], tresor: 0, gesperrt: 0 };
    S.db.items.forEach(function (it) {
      var e = S.z.items[it.id];
      if (R.statusVon(e) !== 0 || (e && e.x)) return;
      if (f.kat !== 'alle' && it.kat !== f.kat) return;
      if (mr > 0 && it.mr > mr) { res.gesperrt++; if (f.nurBaubar) return; }
      var a = R.aufwand(it, e);
      if (a.stufe === 'tresor') { res.tresor++; if (f.ohneTresor) return; }
      var x = { it: it, a: a, f: a.farm, score: it.xp / (1 + a.punkte) };
      if (!it.rezept) res.sonder.push(x);
      else if (x.f.alleDa) res.sofort.push(x);
      else res.farmen.push(x);
    });
    var sort = f.sort;
    function vergleich(p, q) {
      if (sort === 'leicht') return p.a.punkte - q.a.punkte || q.it.xp - p.it.xp;
      if (sort === 'fertig') {
        var fp = p.f.gesamt ? p.f.da / p.f.gesamt : 0;
        var fq = q.f.gesamt ? q.f.da / q.f.gesamt : 0;
        return fq - fp || p.a.punkte - q.a.punkte;
      }
      if (sort === 'xp') return q.it.xp - p.it.xp || p.a.punkte - q.a.punkte;
      return q.score - p.score;
    }
    [res.farmen, res.sofort].forEach(function (l) { l.sort(function (p, q) { return vergleich(p, q) || p.it.name.localeCompare(q.it.name); }); });
    res.sonder.sort(function (p, q) { return p.it.name.localeCompare(q.it.name); });
    return res;
  }

  function quelleText(qu) {
    var t = qu.ort;
    if (qu.art === 'Relikt') t = 'Relikt ' + qu.ort;
    t += qu.chance ? ' (' + prozText(qu.chance) + ')' : ' (Chance unbekannt)';
    return t + ', ' + versucheText(qu.versuche);
  }

  function farmTeilWahl(itemId, partId, stufe, mitBauplan) {
    var namen = mitBauplan ? ['Fehlt', 'Bauplan da', 'Fertig'] : ['Fehlt', '', 'Da'];
    var h = '<div class="seg" role="group" aria-label="Teil-Status">';
    for (var i = 0; i < 3; i++) {
      if (!namen[i]) continue;
      h += '<button type="button" data-a="farmteil" data-id="' + esc(itemId) + '" data-teil="' + esc(partId) + '" data-stufe="' + i + '" aria-pressed="' + (stufe === i) + '" data-s="' + (i === 0 ? 0 : (i === 1 ? 2 : 3)) + '">' + namen[i] + '</button>';
    }
    return h + '</div>';
  }

  function farmKarteHtml(x) {
    var it = x.it, a = x.a, f = x.f;
    var e = S.z.items[it.id];
    var s = R.statusVon(e);
    var mr = S.z.spieler.mr | 0;
    var chips = artChip(it);
    if (it.mr > 0) chips += '<span class="chip ' + (mr > 0 && it.mr > mr ? 'rot' : '') + '">MR ' + it.mr + '</span>';
    if (it.prime) chips += '<span class="chip gold">Prime</span>';
    if (it.tresor) chips += '<span class="chip rot">Tresor</span>';
    (it.spezial || []).slice(0, 1).forEach(function (t) { chips += '<span class="chip">' + esc(t) + '</span>'; });
    if (f.gesamt) chips += '<span class="chip ' + (f.da === f.gesamt ? 'gruen' : '') + '">Teile ' + f.da + '/' + f.gesamt + '</span>';
    var kopf = '<div class="farmkopf">' + bildHtml(it, 'bild') +
      '<div class="farminfo"><b class="farmname" data-a="detail" data-id="' + esc(it.id) + '" tabindex="0" role="button">' + esc(it.name) + '</b><div class="meta">' + chips + '</div></div>' +
      '<div class="farmwert"><span class="xp">' + fmt(it.xp) + ' XP</span> ' + aufwandHtml(a) +
      '<div class="klein muted">' + (f.alleDa && it.rezept ? 'nichts mehr zu farmen' : (a.stufe === 'tresor' ? 'nur über Varzia oder Handel' : versucheText(f.versuche))) + '</div></div></div>';

    var teile = '';
    if (s === 0 && it.rezept) {
      /* Haupt-Blueprint */
      var bpStufe = R.teilStufe(e, 'bp');
      if (it.bpCredits || (it.bpQuellen && it.bpQuellen.length)) {
        var bpT = f.teile.filter(function (t) { return t.id === 'bp'; })[0];
        var bpInfo;
        if (bpStufe === 2) bpInfo = '<span class="muted klein">vorhanden</span>';
        else if (it.bpCredits) bpInfo = '<span class="klein">Im Markt kaufen für <b>' + fmt(it.bpCredits) + ' Credits</b></span>';
        else if (bpT && bpT.quelle) bpInfo = '<span class="klein">' + esc(quelleText(bpT.quelle)) + '</span>';
        else bpInfo = '<span class="chip tresor">nur im Tresor</span>';
        teile += '<div class="farmteil' + (bpStufe === 2 ? ' fertig' : '') + '"><div><b>Blueprint</b> ' + bpInfo + '</div>' + farmTeilWahl(it.id, 'bp', bpStufe, false) + '</div>';
      } else if (f.bpUnbekannt) {
        teile += '<div class="farmteil"><div><b>Blueprint</b> <span class="chip">Quelle steht nicht in den Daten, siehe Wiki</span></div>' + farmTeilWahl(it.id, 'bp', bpStufe, false) + '</div>';
      }
      /* Teile */
      it.rezept.zutaten.forEach(function (z) {
        if (z.art !== 'teil') return;
        var stufe = R.teilStufe(e, z.id);
        var t = f.teile.filter(function (u) { return u.id === z.id; })[0];
        var info = '';
        if (stufe === 2) info = '<span class="muted klein">fertig</span>';
        else if (stufe === 1) info = '<span class="klein">Bauplan da' + (z.rezept ? ', bauen: ' + fmt(z.rezept.kosten) + ' Credits, ' + dauer(z.rezept.zeit) : '') + '</span>';
        else if (t && t.quelle) {
          info = '<div class="klein">' + esc(quelleText(t.quelle)) + '</div>';
          var andere = t.q.filter(function (qq) { return qq.ort !== t.quelle.ort; });
          if (andere.length) info += '<div class="quellen">' + quellenHtml(andere, 4) + '</div>';
        } else if (t && t.tresor) info = '<span class="chip tresor">nur im Tresor</span> <span class="klein muted">alle Relikte liegen im Void-Tresor</span>';
        else info = '<span class="chip">Quelle steht nicht in den Daten, siehe Wiki</span>';
        teile += '<div class="farmteil' + (stufe === 2 ? ' fertig' : '') + '"><div><b>' + (z.n > 1 ? z.n + ' x ' : '') + esc(z.name) + '</b> ' + info + '</div>' + farmTeilWahl(it.id, z.id, stufe, !!z.rezept) + '</div>';
      });
    }
    var fuss = '<div class="farmfuss">' + statusWahl(it.id, s) +
      '<button type="button" class="stern" data-a="stern" data-id="' + esc(it.id) + '" aria-pressed="' + !!(e && e.w) + '" title="Auf die Wunschliste">' + (e && e.w ? '★' : '☆') + '</button>' +
      '<span class="muted klein rechts">' + (f.credits ? 'Bau: ' + fmt(f.credits) + ' Credits' : '') + '</span></div>';
    return '<article class="farmkarte' + (s > 0 ? ' erledigt' : '') + '" data-id="' + esc(it.id) + '">' + kopf + (teile ? '<div class="farmteile">' + teile + '</div>' : '') + fuss + '</article>';
  }

  function farmOrteHtml(k) {
    var orte = R.orteGruppieren(k.farmen.map(function (x) { return { item: x.it, farm: x.f }; }));
    var h = '<p class="muted klein">Hier steht, an welchen Orten du Teile für <b>mehrere</b> Items gleichzeitig bekommst. Sortiert nach Anzahl der Items, dann nach Aufwand. ' +
      'Die Versuche gelten für alle Teile an dem Ort zusammen.</p><div class="raster zwei">';
    orte.slice(0, 30).forEach(function (o) {
      var art = o.art === 'Relikt' ? 'Relikt (Void-Fissur)' : (/Assassination/.test(o.ort) ? 'Boss' : 'Drop');
      h += '<div class="karte"><h3>' + esc(o.ort) + '</h3><div class="meta" style="display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 8px">' +
        '<span class="chip">' + art + '</span><span class="chip gold">' + o.anzahlItems + (o.anzahlItems === 1 ? ' Item' : ' Items') + '</span>' +
        '<span class="chip">' + versucheText(o.versuche) + '</span>' + (/Conclave/i.test(o.ort) ? '<span class="chip rot">PvP</span>' : '') + '</div>';
      o.teile.slice(0, 10).forEach(function (x) {
        h += '<div class="res"><span><b data-a="detail" data-id="' + esc(x.item.id) + '" style="cursor:pointer">' + esc(x.item.name) + '</b> <span class="muted klein">' + esc(x.teil.name.replace(x.item.name, '').trim() || x.teil.name) + '</span></span>' +
          '<span class="muted klein">' + (x.teil.quelle.chance ? prozText(x.teil.quelle.chance) : '?') + '</span></div>';
      });
      if (o.teile.length > 10) h += '<p class="muted klein">und ' + (o.teile.length - 10) + ' weitere Teile</p>';
      h += '</div>';
    });
    if (!orte.length) h += '<div class="leer">Keine Farm-Orte gefunden.</div>';
    return h + '</div>';
  }

  function renderFarm() {
    var f = S.ui.farm;
    var mr = S.z.spieler.mr | 0;
    var k = farmKandidaten();
    var h = '<div class="kopfzeile"><h1>Farm-Liste</h1><span class="muted">Was du als Nächstes farmen solltest</span></div>';
    h += '<p class="muted klein" style="margin-top:-6px">Der Aufwand ergibt sich aus den Drop-Chancen der <b>fehlenden</b> Teile (erwartete Versuche, bei Relikten plus ein Aufschlag fürs Besorgen des Relikts). ' +
      'Teile, die du schon hast, zählen nicht mehr. Hake sie direkt in den Karten ab, sobald du sie hast, dann rutscht das Item in der Liste nach oben.</p>';

    h += '<div class="werkzeug">' +
      '<select data-ffeld="kat" aria-label="Kategorie"><option value="alle">Alle Kategorien</option>' + S.katReihe.map(function (c) {
        return '<option value="' + c.key + '"' + (f.kat === c.key ? ' selected' : '') + '>' + esc(c.name) + '</option>';
      }).join('') + '</select>' +
      '<select data-ffeld="sort" aria-label="Sortierung">' + FARM_SORT.map(function (o) {
        return '<option value="' + o[0] + '"' + (f.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select>' +
      '<label class="haken"><input type="checkbox" data-ffeld="nurBaubar"' + (f.nurBaubar ? ' checked' : '') + '>Nur baubar mit meinem MR' + (mr ? ' (' + mr + ')' : '') + '</label>' +
      '<label class="haken"><input type="checkbox" data-ffeld="ohneTresor"' + (f.ohneTresor ? ' checked' : '') + '>Tresor ausblenden</label>' +
      '<div class="seg rechts" role="group" aria-label="Ansicht"><button type="button" data-a="farmansicht" data-v="items" aria-pressed="' + (f.ansicht === 'items') + '" data-s="2">Nach Item</button>' +
      '<button type="button" data-a="farmansicht" data-v="orte" aria-pressed="' + (f.ansicht === 'orte') + '" data-s="2">Nach Farm-Ort</button></div></div>';

    var teile = [];
    teile.push('<b>' + k.farmen.length + '</b> zu farmen');
    teile.push('<b>' + k.sofort.length + '</b> sofort baubar');
    if (k.sonder.length) teile.push('<b>' + k.sonder.length + '</b> Sonderbezug');
    if (k.tresor && f.ohneTresor) teile.push(k.tresor + ' im Tresor ausgeblendet');
    if (k.gesperrt && f.nurBaubar) teile.push(k.gesperrt + ' wegen zu hohem MR ausgeblendet');
    h += '<p class="muted klein">' + teile.join(' · ') + '</p>';

    if (f.ansicht === 'orte') {
      h += farmOrteHtml(k);
      $('#ansicht').innerHTML = h;
      return;
    }

    /* Sofort baubar */
    if (k.sofort.length) {
      h += '<div class="karte" style="margin-bottom:16px"><details id="farmsofort"' + (f.sofortOffen ? ' open' : '') + '><summary><b>Sofort baubar (' + k.sofort.length + ')</b>: kein Teil fehlt, es sind nur Rohstoffe und Credits nötig</summary>';
      k.sofort.slice(0, f.maxSofort).forEach(function (x) {
        var e = S.z.items[x.it.id];
        h += '<div class="vorschlag">' + bildHtml(x.it, 'bild') + '<div><b data-a="detail" data-id="' + esc(x.it.id) + '">' + esc(x.it.name) + '</b>' +
          '<div class="klein muted">' + esc(x.it.art) + ' · ' + (x.f.bpMarkt ? 'Blueprint im Markt ' + fmt(x.f.bpMarkt) + ' Credits, ' : '') + 'Bau ' + fmt(x.f.credits - (x.f.bpMarkt || 0)) + ' Credits</div></div>' +
          '<div style="text-align:right"><span class="xp">' + fmt(x.it.xp) + '</span> ' + statusWahl(x.it.id, R.statusVon(e)) + '</div></div>';
      });
      if (k.sofort.length > f.maxSofort) h += '<p><button class="knopf klein" data-a="farmmehr" data-was="sofort">Mehr anzeigen (' + (k.sofort.length - f.maxSofort) + ' weitere)</button></p>';
      h += '</details></div>';
    }

    /* Zu farmen */
    h += '<h2 style="margin:6px 0 10px">Zu farmen</h2>';
    if (!k.farmen.length) h += '<div class="leer">Nichts zu farmen mit diesen Filtern.</div>';
    h += '<div class="farmliste">';
    k.farmen.slice(0, f.max).forEach(function (x) { h += farmKarteHtml(x); });
    h += '</div>';
    if (k.farmen.length > f.max) h += '<p style="text-align:center;margin-top:12px"><button class="knopf" data-a="farmmehr" data-was="farmen">Mehr anzeigen (' + (k.farmen.length - f.max) + ' weitere)</button></p>';

    /* Sonderbezug */
    if (k.sonder.length) {
      h += '<div class="karte" style="margin-top:20px"><details><summary><b>Sonderbezug (' + k.sonder.length + ')</b>: kein Schmiede-Rezept, kommt aus Markt, Syndikat, Händler, Inkubator oder Quest</summary><table><tbody>';
      k.sonder.slice(0, 80).forEach(function (x) {
        h += '<tr><td><b data-a="detail" data-id="' + esc(x.it.id) + '" style="cursor:pointer">' + esc(x.it.name) + '</b></td><td class="klein muted">' + esc(x.it.art) + '</td><td class="klein">' + esc((x.it.spezial || [])[0] || 'siehe Wiki') +
          '</td><td class="num">' + fmt(x.it.xp) + ' XP</td></tr>';
      });
      h += '</tbody></table></details></div>';
    }
    $('#ansicht').innerHTML = h;
  }

  function elementErneuern(id) {
    var it = S.nach[id];
    var karte = document.querySelector('.farmkarte[data-id="' + CSS.escape(id) + '"]');
    if (karte && it) {
      var e = S.z.items[id];
      var a = R.aufwand(it, e);
      var t = document.createElement('div');
      t.innerHTML = farmKarteHtml({ it: it, a: a, f: a.farm, score: 0 });
      karte.replaceWith(t.firstChild);
      return;
    }
    if (S.ui.tab === 'farm') {
      var y = window.scrollY;
      renderFarm();
      window.scrollTo(0, y);
      return;
    }
    zeileErneuern(id);
  }

  /* ---------------------------------------------------------------- Einkaufsliste */
  function wunschItems() {
    return S.db.items.filter(function (it) {
      var e = S.z.items[it.id];
      return e && e.w && R.statusVon(e) === 0;
    });
  }
  function renderEinkauf() {
    var items = wunschItems();
    var h = '<div class="kopfzeile"><h1>Einkaufsliste</h1><span class="muted">Alles, was für deine Wunschliste gebraucht wird</span></div>';
    if (!items.length) {
      h += '<div class="karte leer"><p><b>Deine Wunschliste ist leer.</b></p><p>Setze in der Schmiede bei Items den Stern ☆. Hier steht dann, was du dafür farmen und sammeln musst, ohne etwas doppelt zu zählen.</p>' +
        '<p><button class="knopf primaer" data-a="filter" data-status="offen" data-sort="empfehlung">Zur Schmiede, Empfehlung zuerst</button></p></div>';
      $('#ansicht').innerHTML = h;
      return;
    }
    var gesamt = { credits: 0, zeitSumme: 0, laengster: 0, res: {} };
    var orte = {};
    var relikte = [];
    var markt = [];
    items.forEach(function (it) {
      var e = S.z.items[it.id];
      var b = R.bedarf(it, e);
      gesamt.credits += b.credits;
      gesamt.zeitSumme += b.zeitSumme;
      gesamt.laengster = Math.max(gesamt.laengster, b.zeitKette);
      Object.keys(b.res).forEach(function (k) { gesamt.res[k] = (gesamt.res[k] || 0) + b.res[k]; });
      if (b.bpMarkt) markt.push({ it: it, credits: b.bpMarkt });
      b.plaene.forEach(function (pl) {
        var q = pl.q || [];
        var rel = q.filter(function (x) { return x.art === 'Relikt'; });
        var dr = q.filter(function (x) { return x.art !== 'Relikt'; });
        var eintrag = { name: pl.name, n: pl.n, item: it.name, markt: pl.markt };
        if (dr.length) {
          var best = dr[0];
          (orte[best.ort] = orte[best.ort] || []).push(Object.assign({ chance: best.chance }, eintrag));
        } else if (rel.length) {
          relikte.push(Object.assign({ rel: rel }, eintrag));
        } else {
          (orte['Quelle unbekannt, siehe Wiki'] = orte['Quelle unbekannt, siehe Wiki'] || []).push(eintrag);
        }
      });
    });

    h += '<div class="raster drei" style="margin-bottom:16px">' +
      '<div class="karte kennzahl gold"><b>' + items.length + '</b><span>Items auf der Wunschliste</span></div>' +
      '<div class="karte kennzahl"><b>' + fmt(gesamt.credits) + '</b><span>Credits insgesamt</span></div>' +
      '<div class="karte kennzahl"><b>' + dauer(gesamt.laengster) + '</b><span>längster einzelner Bau (parallel), Summe ' + dauer(gesamt.zeitSumme) + '</span></div></div>';

    h += '<div class="raster zwei">';
    h += '<div class="karte"><h2>Wunschliste</h2>';
    items.forEach(function (it) {
      var a = R.aufwand(it, S.z.items[it.id]);
      h += vorschlagZeile(it, '<button class="knopf klein" data-a="stern" data-id="' + esc(it.id) + '" data-neu="1" title="Von der Wunschliste nehmen">Entfernen</button>', esc(it.art) + ' · ' + fmt(it.xp) + ' XP · ' + aufwandHtml(a));
    });
    h += '</div>';

    var ids = Object.keys(gesamt.res).sort(function (x, y) { return gesamt.res[y] - gesamt.res[x]; });
    h += '<div class="karte"><h2>Rohstoffe</h2><table><thead><tr><th>Rohstoff</th><th class="num">Menge</th></tr></thead><tbody>';
    ids.forEach(function (rid) {
      var q = S.db.res[rid] && S.db.res[rid].q && S.db.res[rid].q.slice(0, 2).map(function (x) { return x.ort; }).join(', ');
      h += '<tr><td>' + esc(resName(rid)) + (q ? '<div class="muted klein">z. B. ' + esc(q) + '</div>' : '') + '</td><td class="num"><b>' + fmt(gesamt.res[rid]) + '</b></td></tr>';
    });
    if (!ids.length) h += '<tr><td colspan="2" class="muted">Keine Rohstoffe nötig.</td></tr>';
    h += '</tbody></table></div></div>';

    h += '<div class="raster zwei" style="margin-top:16px">';
    h += '<div class="karte"><h2>Wo du farmen musst</h2><p class="muted klein" style="margin-top:0">Bauplan-Teile, nach bester Droprate zusammengefasst.</p>';
    var ortKeys = Object.keys(orte).sort(function (a, b) { return orte[b].length - orte[a].length; });
    ortKeys.forEach(function (ort) {
      h += '<div class="teil"><b>' + esc(ort) + '</b><div class="klein muted">' + orte[ort].map(function (x) { return esc(x.name) + (x.n > 1 ? ' (' + x.n + 'x)' : ''); }).join(', ') + '</div></div>';
    });
    if (relikte.length) {
      h += '<div class="teil"><b>Relikte (Void-Fissuren)</b>';
      relikte.forEach(function (r) {
        var alleTresor = r.rel.every(function (x) { return x.tresor; });
        h += '<div class="klein" style="margin-top:6px"><span class="muted">' + esc(r.name) + ':</span> ' + (alleTresor ? '<span class="chip rot">alle Relikte im Tresor (Varzia oder Handel)</span>' : '') +
          '<div class="quellen">' + quellenHtml(r.rel, 6) + '</div></div>';
      });
      h += '</div>';
    }
    if (!ortKeys.length && !relikte.length) h += '<p class="muted">Keine Bauplan-Teile nötig.</p>';
    h += '</div>';

    h += '<div class="karte"><h2>Blueprints im Markt</h2>';
    if (markt.length) {
      markt.forEach(function (m) { h += '<div class="res"><span>' + esc(m.it.name) + '</span><b>' + fmt(m.credits) + ' Credits</b></div>'; });
    } else h += '<p class="muted">Keine Markt-Blueprints nötig.</p>';
    h += '<p style="margin-top:14px"><button class="knopf" data-a="kopieren">Liste als Text kopieren</button> <button class="knopf" data-a="drucken">Drucken</button></p></div>';
    h += '</div>';
    $('#ansicht').innerHTML = h;
  }
  function einkaufText() {
    var items = wunschItems();
    var gesamt = { credits: 0, res: {} };
    var zeilen = ['WarframeWilli Einkaufsliste', ''];
    zeilen.push('Items: ' + items.map(function (i) { return i.name; }).join(', '));
    items.forEach(function (it) {
      var b = R.bedarf(it, S.z.items[it.id]);
      gesamt.credits += b.credits;
      Object.keys(b.res).forEach(function (k) { gesamt.res[k] = (gesamt.res[k] || 0) + b.res[k]; });
    });
    zeilen.push('', 'Credits: ' + fmt(gesamt.credits), '', 'Rohstoffe:');
    Object.keys(gesamt.res).sort(function (a, b) { return gesamt.res[b] - gesamt.res[a]; }).forEach(function (k) {
      zeilen.push('  ' + fmt(gesamt.res[k]) + ' x ' + resName(k));
    });
    zeilen.push('', 'Teile und Bauplaene:');
    items.forEach(function (it) {
      R.bedarf(it, S.z.items[it.id]).plaene.forEach(function (p) {
        var q = (p.q || []).slice(0, 3).map(function (x) { return x.ort; }).join(', ');
        zeilen.push('  ' + p.name + (p.n > 1 ? ' (' + p.n + 'x)' : '') + (q ? ': ' + q : ''));
      });
    });
    return zeilen.join('\n');
  }

  /* ---------------------------------------------------------------- Daten und Import */
  function renderDaten() {
    var meta = S.db.meta;
    var h = '<div class="kopfzeile"><h1>Daten und Import</h1></div>';
    h += '<div class="raster zwei">';
    h += '<div class="karte"><h2>Sicherung</h2><p>Dein Fortschritt liegt in <code>daten/zustand.json</code>. Das Programm legt automatisch Sicherungen in <code>daten/sicherungen/</code> an (alle 15 Minuten bei Änderungen, die letzten 40).</p>' +
      '<p><button class="knopf" data-a="export">Fortschritt als Datei speichern</button> ' +
      '<label class="knopf" style="display:inline-block">Fortschritt laden<input type="file" id="importdatei" accept="application/json,.json" hidden></label> ' +
      '<button class="knopf gefahr" data-a="zuruecksetzen">Alles zurücksetzen</button></p></div>';

    h += '<div class="karte"><h2>Item-Datenbank</h2><p>' + meta.anzahl + ' Items, Stand <b>' + esc((meta.erstellt || '').replace('T', ' ').replace('Z', ' UTC')) + '</b>.<br>Quellen: ' + esc((meta.quellen || []).join(', ')) +
      (meta.rezepteVollstaendig ? '' : '<br><span class="gesperrt">Die Unter-Rezepte der Bauteile fehlen (PublicExport war nicht erreichbar).</span>') + '</p>' +
      '<p class="muted klein">Neue Warframes und Waffen erscheinen nach dem Aktualisieren. Dein Fortschritt bleibt erhalten. ' +
      'Ins Internet geht das Programm nur dafür (Itemlisten von GitHub und Rezepte vom offiziellen Warframe-PublicExport) und zum einmaligen Laden der Item-Bilder. Auf dein Warframe-Konto greift es nie zu.</p>' +
      '<p><button class="knopf" data-a="dbupdate" id="dbknopf">Datenbank jetzt aktualisieren</button></p><div id="dbstatus"></div></div>';
    h += '</div>';

    h += '<div class="karte" style="margin-top:16px"><details id="fortgeschritten"><summary><b>Für Fortgeschrittene: Profil oder Inventar als Text einfügen</b></summary>' +
      '<p>Wenn du aus einer anderen Quelle ein Profil-JSON (<code>XPInfo</code>) oder ein Inventar-JSON (<code>inventory.php</code>) hast, kannst du es hier einfügen. ' +
      'Das Programm wertet nur den eingefügten Text aus und verbindet sich dafür nirgendwohin. Bei einem Inventar werden auch Bauaufträge und Teile erkannt.</p>' +
      '<textarea id="einfuegen" placeholder="Hier den kompletten JSON-Text einfügen" spellcheck="false"></textarea>' +
      '<p style="margin:12px 0 0"><button class="knopf" data-a="einlesen">Auswerten</button></p><div id="importergebnis"></div></details></div>';

    if (S.profil && S.profil.vorhanden && S.profil.anzahlNichtZugeordnet) {
      h += '<div class="karte" style="margin-top:16px"><h2>Nicht zugeordnete Profil-Einträge</h2><p class="muted klein">' + S.profil.anzahlNichtZugeordnet +
        ' Einträge mit Erfahrung passen zu keinem Item der Datenbank. Meist sind das zusammengebaute Zaws, Kitguns, Amps, Moas und Hunde. Diese bitte in der Schmiede von Hand abhaken.</p>' +
        '<details><summary>Liste anzeigen</summary><table><tbody>' + S.profil.nichtZugeordnet.slice(0, 80).map(function (x) {
          return '<tr><td class="klein">' + esc(x.typ) + '</td><td class="num">' + fmt(x.xp) + '</td></tr>';
        }).join('') + '</tbody></table></details></div>';
    }
    $('#ansicht').innerHTML = h;
  }

  function importErgebnisHtml(erg, angewendet) {
    var a = angewendet;
    var h = '<div class="hinweis ok" style="margin-top:12px"><p><b>' + (erg.quelle === 'inventar' ? 'Inventar' : 'Profil') + ' gelesen' + (erg.name ? ': ' + esc(erg.name) : '') + (erg.mr ? ', MR ' + erg.mr : '') + '</b></p>' +
      '<p>' + a.neu + ' Items neu als gebaut markiert, ' + a.hoch + ' höher gestuft, davon ' + a.rang30 + ' auf Rang 30. ' +
      (a.unbekannt ? a.unbekannt + ' Einträge ohne passendes Item (Modulares, siehe unten).' : '') + '</p>' +
      '<p><a href="#" data-a="tab" data-tab="schmiede">Zur Schmiede</a> · <a href="#" data-a="tab" data-tab="uebersicht">Zur Übersicht</a></p></div>';
    return h;
  }
  function profilAnwenden(erg) {
    var a = { neu: 0, hoch: 0, rang30: 0, unbekannt: erg.anzahlNichtZugeordnet || 0 };
    erg.items.forEach(function (imp) {
      var it = S.nach[imp.id];
      if (!it) return;
      var e = ez(imp.id);
      if (e.s < imp.s) {
        if (e.s === 0) a.neu++; else a.hoch++;
        e.s = imp.s;
        if (imp.s === 3) a.rang30++;
      }
      if (imp.rang != null && (e.r == null || imp.rang > e.r)) e.r = Math.min(imp.rang, 30);
      if (e.s === 3) e.r = 30;
    });
    var bs = erg.besitz || {};
    if (Object.keys(bs).length) {
      S.db.items.forEach(function (it) {
        if (!it.rezept) return;
        var e = null;
        function zug() { return e || (e = ez(it.id)); }
        if (it.bpId && bs[it.bpId]) { zug().t = zug().t || {}; zug().t.bp = Math.max(zug().t.bp | 0, 2); }
        (function lauf(zutaten) {
          zutaten.forEach(function (z) {
            if (z.art !== 'teil') return;
            if (bs[z.id]) { zug().t = zug().t || {}; zug().t[z.id] = Math.max(zug().t[z.id] | 0, 2); }
            else if (z.bp && bs[z.bp]) { zug().t = zug().t || {}; zug().t[z.id] = Math.max(zug().t[z.id] | 0, 1); }
            if (z.rezept) lauf(z.rezept.zutaten);
          });
        })(it.rezept.zutaten);
      });
    }
    if (erg.mr) S.z.spieler.mr = erg.mr;
    if (erg.name) S.z.spieler.name = erg.name;
    S.profil = erg;
    speichern();
    return a;
  }

  /* ---------------------------------------------------------------- Hilfe */
  function renderHilfe() {
    var h = '<div class="kopfzeile"><h1>Hilfe</h1></div><div class="raster zwei">';
    h += '<div class="karte"><h2>So benutzt du das Programm</h2><ol class="schritte">' +
      '<li><b>Mastery Rank eintragen</b> (Übersicht). Dann rechnet das Programm aus, was bis zum nächsten Rang fehlt.</li>' +
      '<li><b>Abhaken, was du schon hast</b>: In der Schmiede setzt du bei jedem Item den Status. "Alle sichtbaren ändern" erledigt ganze Gruppen auf einmal, zum Beispiel alle Items einer Kategorie, die du schon hast.</li>' +
      '<li><b>Farm-Liste</b>: Sie zeigt, welche Items du als Nächstes farmen solltest, sortiert nach Mastery pro Aufwand. Hake dort die Teile ab, die du schon hast, dann rutschen die Items nach oben.</li>' +
      '<li><b>Plane</b>: Die Übersicht zeigt, wie viele Items bis zum nächsten MR fehlen. Setze Sterne und lass dir die Einkaufsliste ausrechnen.</li>' +
      '<li><b>Nichts doppelt bauen</b>: Gebaute Items sind grün oder gelb markiert und erscheinen nicht mehr in der Empfehlung. In der Einkaufsliste zählt nur, was du wirklich noch brauchst.</li></ol></div>';
    h += '<div class="karte"><h2>Was zählt für den Mastery Rank?</h2><ul>' +
      '<li>Warframes, Begleiter, Archwings, K-Drives, Necramechs: <b>6.000 XP</b> bei Rang 30.</li>' +
      '<li>Alle Waffen, Kitgun-Kammern, Zaw-Klingen, Sentinel- und Archwing-Waffen: <b>3.000 XP</b> bei Rang 30.</li>' +
      '<li>Jede Variante zählt einzeln: Braton, Mk1-Braton, Braton Vandal und Braton Prime sind vier Waffen.</li>' +
      '<li>Kuva-, Tenet- und Coda-Waffen geben mit Rang 40 (5 Forma) 4.000 XP, Necramechs 8.000 XP.</li>' +
      '<li>Kitguns, Zaws, Amps, Moas, Predasites und Vulpaphylas zählen erst, wenn sie auf Rang 30, vergoldet und erneut gelevelt wurden.</li>' +
      '<li>Gebaut allein bringt nichts, erst das Leveln auf Rang 30 gibt die Punkte. Einmal erhaltene Punkte bleiben auch nach dem Verkaufen.</li>' +
      '<li>Rang-Schwelle: bis MR 30 braucht MR n genau 2.500 x n x n Punkte, danach 2.250.000 plus 147.500 je Legendary-Rang. Zusätzlich gibt es Punkte aus Sternenkarte, Junctions und Intrinsics.</li>' +
      '<li>Für jeden Rang musst du im Spiel einen Mastery-Test bestehen.</li></ul></div>';
    h += '<div class="karte"><h2>Status der Items</h2><table><tbody>' +
      '<tr><td><b>Offen</b></td><td>Noch nie gebaut.</td></tr><tr><td><b>Im Bau</b></td><td>Liegt gerade in der Schmiede.</td></tr>' +
      '<tr><td><b>Gebaut</b></td><td>Du hast es mindestens einmal gebaut, aber noch nicht auf Rang 30. Nicht erneut bauen, nur leveln.</td></tr>' +
      '<tr><td><b>Rang 30</b></td><td>Fertig, die Punkte sind erhalten.</td></tr>' +
      '<tr><td><b>Zurückgestellt</b></td><td>Gehört dazu, ist aber nicht erreichbar (z. B. Founder) oder unwichtig. Zählt nicht als offen.</td></tr></tbody></table></div>';
    h += '<div class="karte"><h2>Aufwand-Einschätzung</h2><p>Die Empfehlung rechnet Mastery geteilt durch Aufwand. Aufwand sind die erwarteten Versuche für alle <b>fehlenden</b> Teile (100 geteilt durch die Drop-Chance, für mehrere Teile am selben Ort die erwartete Zeit, bis alle gefallen sind), bei Relikten plus ein Aufschlag fürs Besorgen, dazu Credits. PvP-Orte (Conclave) zählen dreifach. ' +
      'Items, deren Relikte alle im Void-Tresor liegen, stehen als "Tresor" ganz unten, denn sie gibt es nur über Varzia (Prime Resurgence), Handel oder Events. Das ist eine Faustregel, kein Gesetz: Rohstoffe wie Tellurium oder Argon-Kristalle sind unterschiedlich schwer zu bekommen.</p>' +
      '<p class="muted klein">Tastatur: <kbd>/</kbd> springt zur Suche, <kbd>Esc</kbd> schließt die Details.</p></div>';
    h += '<div class="karte"><h2>Datenquellen</h2><p class="klein">Itemliste, Drops und Relikte: <a href="https://github.com/WFCD/warframe-items" target="_blank" rel="noopener noreferrer">WFCD warframe-items</a>. ' +
      'Rezepte: offizieller PublicExport von Digital Extremes. Mastery-Regeln: <a href="https://wiki.warframe.com/w/Mastery_Rank" target="_blank" rel="noopener noreferrer">Warframe Wiki</a>. ' +
      'Item-Namen sind englisch, wie im Spiel.</p></div>';
    h += '</div>';
    $('#ansicht').innerHTML = h;
  }

  /* ---------------------------------------------------------------- Rendern */
  function render() {
    renderKopf();
    var t = S.ui.tab;
    if (t === 'uebersicht') renderUebersicht();
    else if (t === 'schmiede') renderSchmiede();
    else if (t === 'farm') renderFarm();
    else if (t === 'einkauf') renderEinkauf();
    else if (t === 'daten') renderDaten();
    else renderHilfe();
    if (S.ui.detail && !$('#schublade').hidden) renderSchublade();
  }
  function wechsleTab(t) {
    S.ui.tab = t;
    uiMerken();
    render();
    window.scrollTo(0, 0);
  }
  function uiMerken() {
    S.z.einst.ui = { tab: S.ui.tab, kat: S.ui.kat, sort: S.ui.sort, nurBaubar: S.ui.nurBaubar, ohneTresor: S.ui.ohneTresor, nurRezept: S.ui.nurRezept, empfKat: S.ui.empfKat,
      farm: { kat: S.ui.farm.kat, sort: S.ui.farm.sort, nurBaubar: S.ui.farm.nurBaubar, ohneTresor: S.ui.farm.ohneTresor, ansicht: S.ui.farm.ansicht } };
    try { localStorage.setItem('wfw_ui', JSON.stringify(S.z.einst.ui)); } catch (e) { /* egal */ }
  }

  /* ---------------------------------------------------------------- Ereignisse */
  function verarbeiteAktion(el, ev) {
    var a = el.getAttribute('data-a');
    var id = el.getAttribute('data-id');
    switch (a) {
      case 'tab': ev.preventDefault(); wechsleTab(el.getAttribute('data-tab')); break;
      case 'kat': S.ui.kat = el.getAttribute('data-kat'); uiMerken(); aktualisiereKatLeiste(); renderListe(); break;
      case 'gotokat': ev.preventDefault(); S.ui.kat = el.getAttribute('data-kat'); S.ui.status = 'alle'; wechsleTab('schmiede'); break;
      case 'filter':
        ev.preventDefault();
        S.ui.status = el.getAttribute('data-status') || 'offen';
        if (el.getAttribute('data-sort')) S.ui.sort = el.getAttribute('data-sort');
        S.ui.kat = 'alle';
        wechsleTab('schmiede');
        break;
      case 'farmteil': {
        var fe = ez(id);
        fe.t = fe.t || {};
        fe.t[el.getAttribute('data-teil')] = +el.getAttribute('data-stufe');
        speichern();
        elementErneuern(id);
        break;
      }
      case 'farmansicht': S.ui.farm.ansicht = el.getAttribute('data-v'); uiMerken(); renderFarm(); break;
      case 'farmmehr':
        if (el.getAttribute('data-was') === 'sofort') S.ui.farm.maxSofort += 20; else S.ui.farm.max += 25;
        renderFarm();
        break;
      case 'filterweg':
        S.ui.status = 'alle'; S.ui.nurBaubar = false; S.ui.ohneTresor = false; S.ui.nurRezept = false; S.ui.suche = '';
        uiMerken();
        renderSchmiede();
        break;
      case 'detail': oeffneDetail(id); break;
      case 'zu': schliesseDetail(); break;
      case 'status':
        setStatus(id, +el.getAttribute('data-s'));
        elementErneuern(id);
        if (S.ui.detail === id) renderSchublade();
        break;
      case 'stern':
        toggle(id, 'w');
        if (el.getAttribute('data-neu')) render(); else { elementErneuern(id); }
        if (S.ui.detail === id) renderSchublade();
        break;
      case 'teil': {
        var e = ez(S.ui.detail);
        e.t = e.t || {};
        e.t[el.getAttribute('data-teil')] = +el.getAttribute('data-stufe');
        speichern();
        renderSchublade();
        zeileErneuern(S.ui.detail);
        break;
      }
      case 'einlesen': einlesen(); break;
      case 'dbupdate': dbUpdate(); break;
      case 'export': exportieren(); break;
      case 'zuruecksetzen': zuruecksetzen(); break;
      case 'kopieren':
        if (navigator.clipboard) navigator.clipboard.writeText(einkaufText()).then(function () { toast('Liste kopiert.'); }, function () { toast('Kopieren nicht möglich.', true); });
        break;
      case 'drucken': window.print(); break;
      case 'listekopieren':
        if (navigator.clipboard && S.sichtbar) {
          navigator.clipboard.writeText(S.sichtbar.map(function (it) { return it.name + ' (' + it.art + ', ' + fmt(it.xp) + ' XP)'; }).join('\n'))
            .then(function () { toast(S.sichtbar.length + ' Items kopiert.'); }, function () { toast('Kopieren nicht möglich.', true); });
        }
        break;
      default: break;
    }
  }

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-a]');
    if (el && el.tagName !== 'INPUT') verarbeiteAktion(el, ev);
    else if (ev.target.id === 'abdunkeln') schliesseDetail();
    else if (ev.target.id === 'themeknopf') themeWechseln();
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && S.ui.detail) { schliesseDetail(); return; }
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.getAttribute && ev.target.getAttribute('data-a') === 'detail') { ev.preventDefault(); oeffneDetail(ev.target.getAttribute('data-id')); return; }
    if (ev.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      var s = $('#suche');
      if (s) { ev.preventDefault(); s.focus(); }
    }
  });
  document.addEventListener('toggle', function (ev) {
    if (ev.target && ev.target.id === 'farmsofort') S.ui.farm.sofortOffen = ev.target.open;
  }, true);
  var sucheTimer = null;
  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.id === 'suche') {
      clearTimeout(sucheTimer);
      sucheTimer = setTimeout(function () { S.ui.suche = t.value; renderListe(); }, 120);
    } else if (t.getAttribute('data-feld') === 'notiz') {
      ez(t.getAttribute('data-id')).n = t.value; speichern();
    } else if (t.getAttribute('data-feld') === 'name') {
      S.z.spieler.name = t.value; speichern();
    }
  });
  document.addEventListener('change', function (ev) {
    var t = ev.target;
    var feld = t.getAttribute && t.getAttribute('data-feld');
    if (t.getAttribute && t.getAttribute('data-a') === 'zurueck') {
      var id = t.getAttribute('data-id');
      ez(id).x = t.checked; speichern(); zeileErneuern(id); return;
    }
    var ff = t.getAttribute && t.getAttribute('data-ffeld');
    if (ff) {
      if (['nurBaubar', 'ohneTresor'].indexOf(ff) >= 0) S.ui.farm[ff] = t.checked; else S.ui.farm[ff] = t.value;
      S.ui.farm.max = 25; S.ui.farm.maxSofort = 10;
      uiMerken();
      renderFarm();
      return;
    }
    if (t.id === 'importdatei') { dateiLaden(t.files[0]); return; }
    if (!feld) return;
    if (feld === 'mr') { S.z.spieler.mr = Math.max(0, parseInt(t.value, 10) || 0); speichern(); renderUebersicht(); }
    else if (feld === 'zielMr') { S.z.spieler.zielMr = Math.max(0, parseInt(t.value, 10) || 0); speichern(); renderUebersicht(); }
    else if (feld === 'mrXp') { var v = parseInt(t.value, 10); S.z.spieler.mrXp = isNaN(v) ? null : v; speichern(); renderUebersicht(); }
    else if (feld === 'empfKat') { S.ui.empfKat = t.value; uiMerken(); renderUebersicht(); }
    else if (feld === 'massen') { massenAendern(t.value); t.value = ''; }
    else if (['status', 'sort'].indexOf(feld) >= 0) { S.ui[feld] = t.value; uiMerken(); renderListe(); }
    else if (['nurBaubar', 'ohneTresor', 'nurRezept'].indexOf(feld) >= 0) { S.ui[feld] = t.checked; uiMerken(); renderListe(); }
  });

  function massenAendern(wert) {
    if (wert === '' || !S.sichtbar) return;
    var n = S.sichtbar.length;
    if (!n) return;
    var text = { '0': 'auf Offen', '2': 'auf Gebaut', '3': 'auf Rang 30', 'w': 'auf die Wunschliste', 'x': 'als zurückgestellt' }[wert];
    if (!window.confirm(n + ' sichtbare Items ' + text + ' setzen?')) return;
    S.sichtbar.forEach(function (it) {
      var e = ez(it.id);
      if (wert === 'w') e.w = true;
      else if (wert === 'x') e.x = true;
      else {
        e.s = +wert;
        if (e.s === 3) e.r = 30; else if (e.s === 0) delete e.r;
      }
    });
    speichern();
    aktualisiereKatLeiste();
    renderListe();
    toast(n + ' Items geändert.');
  }

  /* ---------------------------------------------------------------- Import-Aktionen */
  function ergebnisBox(html) { var b = $('#importergebnis'); if (b) b.innerHTML = html; }
  function einlesen() {
    var text = $('#einfuegen').value.trim();
    if (!text) { toast('Bitte zuerst Text einfügen.', true); return; }
    API.post('/api/profil/einlesen', { text: text }).then(function (erg) {
      var a = profilAnwenden(erg);
      var box = importErgebnisHtml(erg, a);
      renderDaten();
      $('#fortgeschritten').open = true;
      ergebnisBox(box);
    }).catch(function (f) {
      ergebnisBox('<div class="hinweis fehler" style="margin-top:12px"><p>' + esc(f.message) + '</p></div>');
    });
  }
  function dbUpdate() {
    var knopf = $('#dbknopf');
    knopf.disabled = true;
    $('#dbstatus').innerHTML = '<p class="muted">Aktualisiere, das dauert etwa 10 Sekunden ...</p>';
    API.post('/api/db/aktualisieren').then(function () {
      var wartezeit = 0;
      (function pruefen() {
        API.get('/api/info').then(function (info) {
          if (info.aktualisierung.laeuft && wartezeit < 120) { wartezeit++; setTimeout(pruefen, 1000); return; }
          if (info.aktualisierung.fehler) {
            knopf.disabled = false;
            $('#dbstatus').innerHTML = '<div class="hinweis fehler"><p>' + esc(info.aktualisierung.fehler) + '</p><p>Die bisherige Datenbank bleibt unverändert.</p></div>';
            return;
          }
          datenLaden().then(function () { toast('Datenbank aktualisiert: ' + S.db.meta.anzahl + ' Items.'); render(); });
        });
      })();
    }).catch(function (f) { knopf.disabled = false; $('#dbstatus').innerHTML = '<div class="hinweis fehler"><p>' + esc(f.message) + '</p></div>'; });
  }
  function exportieren() {
    var blob = new Blob([JSON.stringify(sauber(), null, 1)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'warframewilli_fortschritt_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  function dateiLaden(datei) {
    if (!datei) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var z = JSON.parse(rd.result);
        if (!z || typeof z !== 'object' || typeof z.items !== 'object') throw new Error('Das ist keine WarframeWilli-Sicherung.');
        if (!window.confirm('Den aktuellen Fortschritt durch die Datei ersetzen? (Die alte Fassung bleibt in den automatischen Sicherungen.)')) return;
        S.z = Object.assign(leererZustand(), z);
        S.z.einst = S.z.einst || {};
        speichern();
        uiAusZustand();
        render();
        toast('Fortschritt geladen.');
      } catch (f) { toast('Laden fehlgeschlagen: ' + f.message, true); }
    };
    rd.readAsText(datei);
  }
  function zuruecksetzen() {
    if (!window.confirm('Wirklich den gesamten Fortschritt löschen? Eine Sicherung wird automatisch angelegt.')) return;
    var bisher = S.z;
    S.z = leererZustand();
    S.z.einst.ui = bisher.einst.ui;
    speichern();
    render();
    toast('Zurückgesetzt. Die letzte Sicherung liegt in daten/sicherungen.');
  }
  function themeWechseln() {
    var jetzt = document.documentElement.getAttribute('data-theme');
    var hell = jetzt ? jetzt === 'light' : window.matchMedia('(prefers-color-scheme: light)').matches;
    var neu = hell ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', neu);
    try { localStorage.setItem('wfw_theme', neu); } catch (e) { /* egal */ }
  }

  /* ---------------------------------------------------------------- Start */
  function uiAusZustand() {
    var u = S.z.einst && S.z.einst.ui;
    if (u) {
      ['tab', 'kat', 'sort', 'nurBaubar', 'ohneTresor', 'nurRezept', 'empfKat'].forEach(function (k) { if (u[k] !== undefined) S.ui[k] = u[k]; });
    }
    if (u && u.farm) Object.keys(u.farm).forEach(function (k) { S.ui.farm[k] = u.farm[k]; });
    if (S.ui.farm.kat !== 'alle' && !S.katReihe.some(function (k) { return k.key === S.ui.farm.kat; })) S.ui.farm.kat = 'alle';
    if (!S.katReihe.some(function (k) { return k.key === S.ui.kat; })) S.ui.kat = 'alle';
    if (!TABS.some(function (t) { return t[0] === S.ui.tab; })) S.ui.tab = 'uebersicht';
  }
  function datenLaden() {
    return API.get('/api/daten').then(function (db) {
      S.db = db;
      S.nach = {};
      db.items.forEach(function (it) { S.nach[it.id] = it; });
      var kats = db.meta.kategorien;
      S.katReihe = Object.keys(kats).map(function (k) { return { key: k, name: kats[k].name, pos: kats[k].pos }; }).sort(function (a, b) { return a.pos - b.pos; });
    });
  }
  function start() {
    try { var th = localStorage.getItem('wfw_theme'); if (th) document.documentElement.setAttribute('data-theme', th); } catch (e) { /* egal */ }
    Promise.all([datenLaden(), API.get('/api/zustand').catch(function () { return null; })]).then(function (erg) {
      var z = erg[1];
      if (!z) {
        try { z = JSON.parse(localStorage.getItem('wfw_zustand') || 'null'); } catch (e) { z = null; }
        if (z) toast('Server nicht erreichbar, es wird der Zwischenspeicher des Browsers genutzt.', true);
      }
      S.z = Object.assign(leererZustand(), z || {});
      S.z.spieler = Object.assign({ name: '', mr: 0, mrXp: null }, S.z.spieler || {});
      S.z.items = S.z.items || {};
      S.z.einst = S.z.einst || {};
      uiAusZustand();
      S.geladen = true;
      return API.get('/api/profil').then(function (p) { S.profil = p; }).catch(function () { S.profil = null; });
    }).then(function () {
      render();
      zeigeSpeicher();
    }).catch(function (f) {
      $('#ansicht').innerHTML = '<div class="karte hinweis fehler"><h2>Start nicht möglich</h2><p>' + esc(f.message) + '</p>' +
        '<p>Falls noch keine Datenbank vorhanden ist, in einem Terminal <code>python3 wf_daten.py</code> ausführen.</p></div>';
    });
  }
  start();
})();
