/*
 * Raktár – közös üzleti logika.
 * Ugyanez a fájl fut a böngészőben (web/js/logic.js) és a Google Apps Scriptben (apps-script/Logic.gs).
 * Ha módosítod, mindkét helyen frissítsd (a két fájl tartalma azonos).
 */
var RaktarLogic = (function () {
  'use strict';

  var ROLES = { olvaso: 1, szerelo: 2, raktaros: 3, admin: 4 };
  var ROLE_LABELS = { admin: 'Admin', raktaros: 'Raktáros', szerelo: 'Szerelő', olvaso: 'Olvasó' };
  var MOVE_TYPES = { LELTAR: 'Leltár', BEERKEZES: 'Beérkezés', KIVET: 'Kivét', KORREKCIO: 'Korrekció' };
  var EDITABLE = { Tetelek: 1, Beszallitok: 1, Forrasok: 1, Felhasznalok: 1, Listak: 1 };
  var DELETABLE = { Forrasok: 1, Listak: 1 };
  var LIST_TYPES = { kategoria: 'Kategóriák', mertekegyseg: 'Mértékegységek', raktar: 'Raktárak' };
  var LIST_FIELD = { kategoria: 'kategoria', mertekegyseg: 'mertekegyseg', raktar: 'raktar' };

  // Az oszlopok sorrendje a Sheetben is ez (a Keszlet lap képletei erre épülnek).
  var SCHEMA = {
    Tetelek: { key: 'tetel_id', cols: [
      ['tetel_id', 'str'], ['megnevezes', 'str'], ['kategoria', 'str'], ['mertekegyseg', 'str'],
      ['polc', 'str'], ['min_keszlet', 'num'], ['cel_keszlet', 'num'], ['leltar_ciklus_nap', 'num'],
      ['aktiv', 'bool'], ['megjegyzes', 'str'], ['modositva', 'date'], ['raktar', 'str']] },
    // rendeles_mod: 'webshop' | 'email'; kereso_url: webshop keresés, a {cikkszam} helyére kerül a cikkszám
    Beszallitok: { key: 'beszallito_id', cols: [
      ['beszallito_id', 'str'], ['nev', 'str'], ['kapcsolattarto', 'str'], ['email', 'str'],
      ['telefon', 'str'], ['weboldal', 'str'], ['aktiv', 'bool'], ['megjegyzes', 'str'], ['modositva', 'date'],
      ['rendeles_mod', 'str'], ['kereso_url', 'str']] },
    Forrasok: { key: 'forras_id', cols: [
      ['forras_id', 'str'], ['tetel_id', 'str'], ['beszallito_id', 'str'], ['cikkszam', 'str'],
      ['kiszereles', 'num'], ['egysegar', 'num'], ['link', 'str'], ['elsodleges', 'bool'],
      ['megjegyzes', 'str'], ['modositva', 'date']] },
    Mozgasok: { key: 'mozgas_id', cols: [
      ['mozgas_id', 'str'], ['datum', 'date'], ['tipus', 'str'], ['tetel_id', 'str'], ['mennyiseg', 'num'],
      ['bizonylat', 'str'], ['rendeles_sor_id', 'str'], ['felhasznalo', 'str'], ['rogzitve', 'date'],
      ['megjegyzes', 'str']] },
    Rendelesek: { key: 'rendeles_id', cols: [
      ['rendeles_id', 'str'], ['datum', 'date'], ['beszallito_id', 'str'], ['lezarva', 'bool'],
      ['letrehozta', 'str'], ['megjegyzes', 'str'], ['modositva', 'date']] },
    Rendeles_tetelek: { key: 'sor_id', cols: [
      ['sor_id', 'str'], ['rendeles_id', 'str'], ['tetel_id', 'str'], ['forras_id', 'str'],
      ['cikkszam', 'str'], ['mennyiseg', 'num'], ['egysegar', 'num'], ['beerkezett', 'num'],
      ['lezarva', 'bool'], ['megjegyzes', 'str']] },
    // Választólisták a tétel űrlapokhoz: tipus = kategoria | mertekegyseg | raktar
    Listak: { key: 'lista_id', cols: [
      ['lista_id', 'str'], ['tipus', 'str'], ['ertek', 'str'], ['sorrend', 'num'], ['modositva', 'date']] },
    // Leltár sablon: tetelek = vesszővel elválasztott tétel azonosítók
    Leltar_sablonok: { key: 'sablon_id', cols: [
      ['sablon_id', 'str'], ['nev', 'str'], ['tetelek', 'str'], ['letrehozta', 'str'], ['modositva', 'date']] },
    Felhasznalok: { key: 'email', cols: [
      ['email', 'str'], ['nev', 'str'], ['szerepkor', 'str'], ['aktiv', 'bool'], ['megjegyzes', 'str']] }
  };
  var TABLES = Object.keys(SCHEMA);

  /* ---------- Típuskonverzió ---------- */
  function toBool(v) {
    if (v === true || v === false) return v;
    if (typeof v === 'number') return v !== 0;
    var s = String(v == null ? '' : v).trim().toLowerCase();
    return s === 'true' || s === 'igen' || s === 'i' || s === '1' || s === 'x' || s === 'yes' || s === 'igaz';
  }
  function toNum(v) {
    if (v === '' || v == null) return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
    return isFinite(n) ? n : 0;
  }
  function toDate(v) {
    if (v === '' || v == null) return '';
    if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? '' : v.toISOString();
    var d = new Date(v);
    return isNaN(d.getTime()) ? '' : d.toISOString();
  }
  function round3(n) { return Math.round(n * 1000) / 1000; }

  function normalize(table, row) {
    var out = {};
    row = row || {};
    SCHEMA[table].cols.forEach(function (c) {
      var name = c[0], v = row[name];
      if (c[1] === 'num') out[name] = toNum(v);
      else if (c[1] === 'bool') out[name] = (name === 'aktiv' && (v === '' || v == null)) ? true : toBool(v);
      else if (c[1] === 'date') out[name] = toDate(v);
      else out[name] = v == null ? '' : String(v).trim().slice(0, 2000); // hosszkorlát (cella-visszaélés ellen)
    });
    if (table === 'Felhasznalok') out.email = out.email.toLowerCase();
    // Linkmezők: csak http(s) cím fogadható el (pl. „javascript:” nem)
    ['link', 'weboldal', 'kereso_url'].forEach(function (f) {
      if (out[f] && !/^https?:\/\//i.test(out[f])) out[f] = '';
    });
    return out;
  }

  /* ---------- Azonosítók ---------- */
  var ALPHA = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  function newId(prefix, len, rnd) {
    var s = '';
    len = len || 10;
    for (var i = 0; i < len; i++) s += ALPHA.charAt(Math.floor((rnd ? rnd() : Math.random()) * ALPHA.length));
    return (prefix ? prefix + '-' : '') + s;
  }

  /* ---------- Memóriabeli adatbázis segédek ---------- */
  function index(db, table) {
    db._idx = db._idx || {};
    if (!db._idx[table]) {
      var m = {}, k = SCHEMA[table].key;
      (db[table] || []).forEach(function (r) { m[r[k]] = r; });
      db._idx[table] = m;
    }
    return db._idx[table];
  }
  function get(db, table, id) { return index(db, table)[id]; }
  function put(db, table, row, changes) {
    var k = SCHEMA[table].key, idx = index(db, table), ex = idx[row[k]];
    if (ex) {
      for (var p in row) if (p !== '_row') ex[p] = row[p];
      changes.push({ table: table, row: ex });
      return ex;
    }
    db[table] = db[table] || [];
    db[table].push(row);
    idx[row[k]] = row;
    changes.push({ table: table, row: row });
    return row;
  }
  function remove(db, table, id, changes) {
    var idx = index(db, table), ex = idx[id];
    if (!ex) return;
    db[table] = db[table].filter(function (r) { return r !== ex; });
    delete idx[id];
    changes.push({ table: table, row: ex, deleted: true });
  }
  /** Tiszta másolat (belső mezők nélkül), opcionálisan csak a megadott táblákkal. */
  function exportDb(db, tables) {
    var out = {};
    (tables || TABLES).forEach(function (t) {
      out[t] = (db[t] || []).map(function (r) {
        var o = {};
        for (var p in r) if (p !== '_row') o[p] = r[p];
        return o;
      });
    });
    return out;
  }
  function cloneDb(db) { return JSON.parse(JSON.stringify(exportDb(db))); }

  /* ---------- Jogosultság ---------- */
  function fail(msg) { var e = new Error(msg); e.validation = true; throw e; }
  function hasRole(user, role) { return !!user && !!ROLES[user.szerepkor] && ROLES[user.szerepkor] >= ROLES[role]; }

  /**
   * Láthatósági jogok szerepkörönként – EZ AZ EGYETLEN HELY, ahol állítani kell.
   * A szerver ez alapján szűri az adatot, mielőtt elküldi (amihez nincs jog, az el sem jut a készülékre).
   */
  var PERMS = {
    arak: ['admin', 'raktaros', 'olvaso'],      // beszerzési árak, készletérték
    rendeles: ['admin', 'raktaros', 'olvaso'],  // rendelések, beszállítók, beszerzési források
    kimutatas: ['admin', 'raktaros', 'olvaso'], // kimutatások oldal
  };
  /** Szerepkör (pl. 'raktaros') vagy jog (pl. 'arak') ellenőrzése. */
  function can(user, what) {
    if (ROLES[what]) return hasRole(user, what);
    return !!user && !!PERMS[what] && PERMS[what].indexOf(user.szerepkor) >= 0;
  }

  /** A felhasználónak elküldhető adat: a jogosultság szerint szűrve (szerveren és a demo backendben is). */
  function filterSnapshot(db, user) {
    var out = exportDb(db);
    if (!can(user, 'rendeles')) {
      out.Beszallitok = [];
      out.Forrasok = [];
      out.Rendelesek = [];
      // Csak az „úton” mennyiséghez szükséges minimum marad: nyitott sorok, ár / beszállító / cikkszám nélkül
      out.Rendeles_tetelek = out.Rendeles_tetelek.filter(function (l) { return !l.lezarva; }).map(function (l) {
        return { sor_id: l.sor_id, rendeles_id: '', tetel_id: l.tetel_id, forras_id: '', cikkszam: '',
          mennyiseg: l.mennyiseg, egysegar: 0, beerkezett: l.beerkezett, lezarva: false, megjegyzes: '' };
      });
    }
    if (!can(user, 'arak')) {
      out.Forrasok.forEach(function (f) { f.egysegar = 0; });
      out.Rendeles_tetelek.forEach(function (l) { l.egysegar = 0; });
    }
    out.Felhasznalok = out.Felhasznalok.map(function (u) {
      return hasRole(user, 'admin') ? u : { email: u.email, nev: u.nev };
    });
    return out;
  }
  function need(user, role) { if (!hasRole(user, role)) fail('Nincs jogosultságod ehhez a művelethez.'); }

  /* ---------- Műveletek ---------- */
  /**
   * Egy művelet alkalmazása. Előbb mindent ellenőriz, csak utána módosít.
   * Idempotens: egy már feldolgozott művelet újraküldése nem okoz duplikációt.
   * Visszatér a módosított rekordok listájával ({table, row, deleted?}).
   */
  function applyOp(db, op, user, nowIso) {
    var changes = [];
    nowIso = nowIso || new Date().toISOString();
    switch (op && op.type) {
      case 'mozgasok': opMozgasok(db, op, user, nowIso, changes); break;
      case 'rendeles': opRendeles(db, op, user, nowIso, changes); break;
      case 'rendeles_lezaras': opLezaras(db, op, user, nowIso, changes); break;
      case 'mentes': opMentes(db, op, user, nowIso, changes); break;
      case 'torles': opTorles(db, op, user, changes); break;
      case 'uj_tetel': opUjTetel(db, op, user, nowIso, changes); break;
      case 'forras_ar': opForrasAr(db, op, user, nowIso, changes); break;
      case 'sablon_mentes': opSablon(db, op, user, nowIso, changes); break;
      case 'sablon_torles':
        need(user, 'raktaros');
        remove(db, 'Leltar_sablonok', op.sablon_id, changes);
        break;
      default: fail('Ismeretlen művelet: ' + (op && op.type));
    }
    return changes;
  }

  function opMozgasok(db, op, user, now, changes) {
    var rows = op.rows || [];
    if (!rows.length) fail('Nincs rögzítendő tétel.');
    var fresh = [], seen = {};
    rows.forEach(function (r0) {
      var r = normalize('Mozgasok', r0);
      if (!r.mozgas_id) fail('Hiányzó mozgás-azonosító.');
      if (get(db, 'Mozgasok', r.mozgas_id) || seen[r.mozgas_id]) return; // már feldolgozva
      seen[r.mozgas_id] = 1;
      if (!MOVE_TYPES[r.tipus]) fail('Ismeretlen mozgástípus: ' + r.tipus);
      need(user, r.tipus === 'KIVET' ? 'szerelo' : 'raktaros');
      var t = get(db, 'Tetelek', r.tetel_id);
      if (!t) fail('Ismeretlen tétel: ' + r.tetel_id);
      if (r.tipus === 'KORREKCIO') {
        if (!r.mennyiseg) fail('A korrekció mennyisége nem lehet 0 (' + t.megnevezes + ').');
        if (!r.megjegyzes) fail('A korrekcióhoz indoklás szükséges (' + t.megnevezes + ').');
      } else if (r.mennyiseg < 0) {
        fail('Negatív mennyiség nem rögzíthető (' + t.megnevezes + ').');
      } else if (r.tipus !== 'LELTAR' && r.mennyiseg === 0) {
        fail('A mennyiség nem lehet 0 (' + t.megnevezes + ').');
      }
      if (r.rendeles_sor_id) {
        var s = get(db, 'Rendeles_tetelek', r.rendeles_sor_id);
        if (!s) fail('Ismeretlen rendelési sor: ' + r.rendeles_sor_id);
        if (s.tetel_id !== r.tetel_id) fail('A rendelési sor más tételre vonatkozik.');
        if (r.tipus !== 'BEERKEZES') fail('Rendelési sorhoz csak beérkezés köthető.');
      }
      if (!r.datum) r.datum = now;
      r.felhasznalo = user.email;
      r.rogzitve = now;
      fresh.push(r);
    });
    var lines = {};
    fresh.forEach(function (r) {
      put(db, 'Mozgasok', r, changes);
      if (r.rendeles_sor_id) lines[r.rendeles_sor_id] = 1;
    });
    Object.keys(lines).forEach(function (sid) { recalcLine(db, sid, changes); });
  }

  function recalcLine(db, sorId, changes) {
    var line = get(db, 'Rendeles_tetelek', sorId);
    if (!line) return;
    var sum = 0;
    (db.Mozgasok || []).forEach(function (m) {
      if (m.rendeles_sor_id === sorId && m.tipus === 'BEERKEZES') sum += toNum(m.mennyiseg);
    });
    var upd = { sor_id: sorId, beerkezett: round3(sum) };
    if (sum >= line.mennyiseg) upd.lezarva = true;
    put(db, 'Rendeles_tetelek', upd, changes);
  }

  function opRendeles(db, op, user, now, changes) {
    need(user, 'raktaros');
    var o = normalize('Rendelesek', op.rendeles);
    if (!o.rendeles_id) fail('Hiányzó rendelés-azonosító.');
    if (get(db, 'Rendelesek', o.rendeles_id)) return; // már létezik
    var sorok = (op.sorok || []).map(function (s) { return normalize('Rendeles_tetelek', s); });
    if (!sorok.length) fail('A rendelés nem tartalmaz tételt.');
    if (o.beszallito_id && !get(db, 'Beszallitok', o.beszallito_id)) fail('Ismeretlen beszállító.');
    sorok.forEach(function (s) {
      if (!s.sor_id) fail('Hiányzó rendelési sor azonosító.');
      var t = get(db, 'Tetelek', s.tetel_id);
      if (!t) fail('Ismeretlen tétel: ' + s.tetel_id);
      if (s.mennyiseg <= 0) fail('A rendelt mennyiségnek pozitívnak kell lennie (' + t.megnevezes + ').');
    });
    o.datum = o.datum || now;
    o.lezarva = false;
    o.letrehozta = user.email;
    o.modositva = now;
    put(db, 'Rendelesek', o, changes);
    sorok.forEach(function (s) {
      s.rendeles_id = o.rendeles_id;
      s.beerkezett = 0;
      s.lezarva = false;
      put(db, 'Rendeles_tetelek', s, changes);
    });
  }

  function opLezaras(db, op, user, now, changes) {
    need(user, 'raktaros');
    var o = get(db, 'Rendelesek', op.rendeles_id);
    if (!o) fail('Ismeretlen rendelés.');
    if (op.sor_id) {
      var s = get(db, 'Rendeles_tetelek', op.sor_id);
      if (!s || s.rendeles_id !== o.rendeles_id) fail('Ismeretlen rendelési sor.');
      put(db, 'Rendeles_tetelek', { sor_id: s.sor_id, lezarva: true }, changes);
      return;
    }
    put(db, 'Rendelesek', { rendeles_id: o.rendeles_id, lezarva: true, modositva: now }, changes);
    (db.Rendeles_tetelek || []).forEach(function (s) {
      if (s.rendeles_id === o.rendeles_id && !s.lezarva) put(db, 'Rendeles_tetelek', { sor_id: s.sor_id, lezarva: true }, changes);
    });
  }

  function opMentes(db, op, user, now, changes) {
    need(user, 'admin');
    var table = op.table;
    if (!EDITABLE[table]) fail('Ez a tábla nem szerkeszthető.');
    var r = normalize(table, op.row);
    var k = SCHEMA[table].key;
    if (!r[k]) fail('Hiányzó azonosító.');
    if (table === 'Tetelek') {
      if (!r.megnevezes) fail('A megnevezés kötelező.');
      if (r.min_keszlet < 0 || r.cel_keszlet < 0) fail('A készletszint nem lehet negatív.');
      if (r.cel_keszlet && r.cel_keszlet < r.min_keszlet) fail('A célkészlet nem lehet kisebb a minimumnál.');
    } else if (table === 'Beszallitok') {
      if (!r.nev) fail('A beszállító neve kötelező.');
      if (r.rendeles_mod && r.rendeles_mod !== 'webshop' && r.rendeles_mod !== 'email') fail('Érvénytelen rendelési mód.');
    } else if (table === 'Forrasok') {
      if (!get(db, 'Tetelek', r.tetel_id)) fail('Ismeretlen tétel.');
      if (!get(db, 'Beszallitok', r.beszallito_id)) fail('Válassz beszállítót.');
      if (r.kiszereles <= 0) r.kiszereles = 1;
    } else if (table === 'Listak') {
      if (!LIST_TYPES[r.tipus]) fail('Ismeretlen lista típus.');
      if (!r.ertek) fail('Az érték nem lehet üres.');
      var dupL = (db.Listak || []).some(function (x) {
        return x.tipus === r.tipus && x.lista_id !== r.lista_id && String(x.ertek).toLowerCase() === r.ertek.toLowerCase();
      });
      if (dupL) fail('Ez az érték már szerepel a listában: ' + r.ertek);
    } else if (table === 'Felhasznalok') {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) fail('Érvénytelen e-mail-cím.');
      if (!ROLES[r.szerepkor]) fail('Érvénytelen szerepkör.');
      if (r.email === String(user.email).toLowerCase() && (r.szerepkor !== 'admin' || !r.aktiv)) {
        fail('A saját admin jogosultságodat nem veheted el.');
      }
    }
    if ('modositva' in r) r.modositva = now;
    put(db, table, r, changes);
    if (table === 'Forrasok' && r.elsodleges) {
      (db.Forrasok || []).forEach(function (f) {
        if (f.tetel_id === r.tetel_id && f.forras_id !== r.forras_id && f.elsodleges) {
          put(db, 'Forrasok', { forras_id: f.forras_id, elsodleges: false, modositva: now }, changes);
        }
      });
    }
  }

  /** Gyors tételfelvétel munka közben (raktáros is): új tétel + opcionálisan egy beszerzési forrás. */
  function opUjTetel(db, op, user, now, changes) {
    need(user, 'raktaros');
    var t = normalize('Tetelek', op.tetel);
    if (!t.tetel_id) fail('Hiányzó tétel azonosító.');
    if (get(db, 'Tetelek', t.tetel_id)) return; // már létrejött
    if (!t.megnevezes) fail('A megnevezés kötelező.');
    var nev = t.megnevezes.toLowerCase();
    if ((db.Tetelek || []).some(function (x) { return String(x.megnevezes).toLowerCase() === nev; })) {
      fail('Már létezik ilyen nevű tétel: ' + t.megnevezes);
    }
    if (t.min_keszlet < 0 || t.cel_keszlet < 0) fail('A készletszint nem lehet negatív.');
    if (t.cel_keszlet && t.cel_keszlet < t.min_keszlet) fail('A célkészlet nem lehet kisebb a minimumnál.');
    var f = null;
    if (op.forras && op.forras.beszallito_id) {
      f = normalize('Forrasok', op.forras);
      if (!f.forras_id) fail('Hiányzó forrás azonosító.');
      if (!get(db, 'Beszallitok', f.beszallito_id)) fail('Ismeretlen beszállító.');
      f.tetel_id = t.tetel_id;
      f.elsodleges = true;
      if (f.kiszereles <= 0) f.kiszereles = 1;
      f.modositva = now;
    }
    t.aktiv = true;
    t.modositva = now;
    put(db, 'Tetelek', t, changes);
    if (f) put(db, 'Forrasok', f, changes);
  }

  /** Beszerzési ár frissítése rendeléskor (raktáros is). */
  function opForrasAr(db, op, user, now, changes) {
    need(user, 'raktaros');
    var f = get(db, 'Forrasok', op.forras_id);
    if (!f) fail('Ismeretlen beszerzési forrás.');
    var ar = toNum(op.egysegar);
    if (ar < 0) fail('Az ár nem lehet negatív.');
    put(db, 'Forrasok', { forras_id: f.forras_id, egysegar: ar, modositva: now }, changes);
  }

  function opSablon(db, op, user, now, changes) {
    need(user, 'raktaros');
    var s = normalize('Leltar_sablonok', op.sablon);
    if (!s.sablon_id) fail('Hiányzó sablon azonosító.');
    if (!s.nev) fail('A sablon neve kötelező.');
    var ids = s.tetelek.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    if (!ids.length) fail('A sablon nem tartalmaz tételt.');
    s.tetelek = ids.join(',');
    var ex = get(db, 'Leltar_sablonok', s.sablon_id);
    s.letrehozta = ex ? ex.letrehozta : user.email;
    s.modositva = now;
    put(db, 'Leltar_sablonok', s, changes);
  }

  function opTorles(db, op, user, changes) {
    need(user, 'admin');
    if (!DELETABLE[op.table]) fail('Ebből a táblából nem lehet törölni (használd az „aktív” jelölőt).');
    remove(db, op.table, op.id, changes);
  }

  /* ---------- Számítások ---------- */
  function sourcesFor(db, tetelId) {
    return (db.Forrasok || []).filter(function (f) { return f.tetel_id === tetelId; })
      .sort(function (a, b) { return (b.elsodleges ? 1 : 0) - (a.elsodleges ? 1 : 0); });
  }
  function roundPack(q, pack) {
    pack = toNum(pack) > 0 ? toNum(pack) : 1;
    if (q <= 0) return 0;
    return round3(Math.ceil(round3(q / pack)) * pack);
  }

  /**
   * Aktuális készlet tételenként: utolsó leltár + azóta beérkezett − kivét ± korrekció.
   * Továbbá: úton lévő mennyiség, esedékes leltár, rendelési javaslat.
   */
  function computeStock(db, nowMs) {
    nowMs = nowMs || Date.now();
    var res = {};
    (db.Tetelek || []).forEach(function (t) {
      res[t.tetel_id] = { tetel_id: t.tetel_id, keszlet: 0, leltarDatum: '', leltarErtek: null, elteres: null,
        uton: 0, mozgasDb: 0, utolsoMozgas: '' };
    });
    var moves = (db.Mozgasok || []).slice().sort(function (a, b) {
      if (a.datum !== b.datum) return a.datum < b.datum ? -1 : 1;
      return a.rogzitve < b.rogzitve ? -1 : a.rogzitve > b.rogzitve ? 1 : 0;
    });
    moves.forEach(function (m) {
      var s = res[m.tetel_id];
      if (!s) return;
      var q = toNum(m.mennyiseg);
      if (m.tipus === 'LELTAR') {
        s.elteres = s.mozgasDb ? round3(q - s.keszlet) : null;
        s.keszlet = q; s.leltarDatum = m.datum; s.leltarErtek = q;
      } else if (m.tipus === 'BEERKEZES') s.keszlet += q;
      else if (m.tipus === 'KIVET') s.keszlet -= q;
      else if (m.tipus === 'KORREKCIO') s.keszlet += q;
      s.keszlet = round3(s.keszlet);
      s.mozgasDb++;
      s.utolsoMozgas = m.datum;
    });
    (db.Rendeles_tetelek || []).forEach(function (l) {
      if (l.lezarva || !res[l.tetel_id]) return;
      res[l.tetel_id].uton = round3(res[l.tetel_id].uton + Math.max(0, toNum(l.mennyiseg) - toNum(l.beerkezett)));
    });
    var DAY = 86400000;
    (db.Tetelek || []).forEach(function (t) {
      var s = res[t.tetel_id];
      var min = toNum(t.min_keszlet), cel = toNum(t.cel_keszlet), ciklus = toNum(t.leltar_ciklus_nap);
      s.napjaLeltar = s.leltarDatum ? Math.floor((nowMs - Date.parse(s.leltarDatum)) / DAY) : null;
      s.esedekes = !!t.aktiv && ciklus > 0 && (s.napjaLeltar === null || s.napjaLeltar >= ciklus);
      if (min > 0 && s.keszlet <= min) s.statusz = 'hiany';
      else if (min > 0 && s.keszlet <= min + Math.max(1, (cel - min) * 0.25)) s.statusz = 'figyelem';
      else s.statusz = 'ok';
      var src = sourcesFor(db, t.tetel_id);
      s.forras = src[0] || null;
      s.forrasDb = src.length;
      // Készletérték: aktuális készlet × elsődleges forrás egységára (ha van)
      s.egysegar = s.forras ? toNum(s.forras.egysegar) : 0;
      s.ertek = s.keszlet > 0 ? Math.round(s.keszlet * s.egysegar) : 0;
      s.javaslat = (t.aktiv && cel > 0 && s.keszlet + s.uton <= min) ? round3(cel - s.keszlet - s.uton) : 0;
      s.javaslatKerekitve = roundPack(s.javaslat, s.forras ? s.forras.kiszereles : 1);
    });
    return res;
  }

  /**
   * Felhasználás becslése a leltárakból (a kivét nincs mindig rögzítve, így a leltárkori hiány = fogyás).
   * Tételenként: fogyas (az időszakban), tobblet (leltárkor több volt, mint a nyilvántartott),
   * napi átlag (a leltárak közötti időszakra vetítve).
   */
  function usageStats(db, fromIso) {
    var DAY = 86400000, res = {}, run = {}, lastInv = {};
    var moves = (db.Mozgasok || []).slice().sort(function (a, b) {
      if (a.datum !== b.datum) return a.datum < b.datum ? -1 : 1;
      return a.rogzitve < b.rogzitve ? -1 : a.rogzitve > b.rogzitve ? 1 : 0;
    });
    moves.forEach(function (m) {
      var id = m.tetel_id, q = toNum(m.mennyiseg), cur = run[id] || 0;
      var r = res[id] = res[id] || { fogyas: 0, tobblet: 0, kivet: 0, leltarDb: 0, spanStart: null, spanEnd: null };
      var inWin = m.datum >= fromIso;
      if (m.tipus === 'LELTAR') {
        if (inWin && lastInv[id]) {
          var diff = q - cur;
          if (diff < 0) r.fogyas += -diff; else r.tobblet += diff;
          r.leltarDb++;
          if (!r.spanStart) r.spanStart = lastInv[id];
          r.spanEnd = m.datum;
        }
        lastInv[id] = m.datum;
        run[id] = q;
      } else if (m.tipus === 'BEERKEZES') run[id] = cur + q;
      else if (m.tipus === 'KORREKCIO') run[id] = cur + q;
      else if (m.tipus === 'KIVET') {
        run[id] = cur - q;
        if (inWin) { r.kivet += q; r.fogyas += q; if (!r.spanStart) r.spanStart = m.datum; r.spanEnd = m.datum; }
      }
    });
    Object.keys(res).forEach(function (id) {
      var r = res[id];
      r.fogyas = round3(r.fogyas); r.tobblet = round3(r.tobblet);
      var days = r.spanStart && r.spanEnd ? (Date.parse(r.spanEnd) - Date.parse(r.spanStart)) / DAY : 0;
      r.napiAtlag = days >= 1 ? r.fogyas / days : 0;
    });
    return res;
  }

  /**
   * Választható értékek egy listához: a Listak tábla elemei (sorrend, majd ábécé szerint),
   * kiegészítve a tételeknél már használt, de a listában nem szereplő értékekkel.
   */
  function listValues(db, tipus) {
    var own = (db.Listak || []).filter(function (l) { return l.tipus === tipus && l.ertek; })
      .sort(function (a, b) { return (toNum(a.sorrend) - toNum(b.sorrend)) || String(a.ertek).localeCompare(String(b.ertek), 'hu'); })
      .map(function (l) { return l.ertek; });
    // Mértékegységnél alapkészlet, amíg a lista üres
    if (!own.length && tipus === 'mertekegyseg') own = ['db', 'm', 'tekercs', 'doboz', 'csomag', 'kg', 'l', 'pár'];
    var seen = {};
    own.forEach(function (v) { seen[v.toLowerCase()] = 1; });
    var used = [];
    (db.Tetelek || []).forEach(function (t) {
      var v = t[LIST_FIELD[tipus]];
      if (v && !seen[String(v).toLowerCase()]) { seen[String(v).toLowerCase()] = 1; used.push(v); }
    });
    used.sort(function (a, b) { return String(a).localeCompare(String(b), 'hu'); });
    return own.concat(used);
  }

  /** Rendelési mód: ha nincs megadva, weboldallal webshop, anélkül e-mail. */
  function orderMode(sup) {
    if (!sup) return 'email';
    return sup.rendeles_mod || (sup.weboldal || sup.kereso_url ? 'webshop' : 'email');
  }
  /** Termék link: a forrás saját linkje, vagy a beszállító kereső URL-je a cikkszámmal, vagy a weboldal. */
  function productUrl(sup, forras) {
    if (forras && forras.link) return forras.link;
    if (sup && sup.kereso_url && forras && forras.cikkszam) {
      return sup.kereso_url.replace('{cikkszam}', encodeURIComponent(forras.cikkszam));
    }
    return sup && sup.weboldal ? sup.weboldal : '';
  }

  /** Rendelés állapota a sorai alapján. */
  function orderInfo(db, rendeles) {
    var sorok = (db.Rendeles_tetelek || []).filter(function (s) { return s.rendeles_id === rendeles.rendeles_id; });
    var ertek = 0, nyitott = 0, beerk = 0, teljes = true;
    sorok.forEach(function (s) {
      ertek += toNum(s.mennyiseg) * toNum(s.egysegar);
      if (toNum(s.beerkezett) > 0) beerk++;
      if (toNum(s.beerkezett) < toNum(s.mennyiseg)) teljes = false;
      if (!s.lezarva) nyitott++;
    });
    var statusz;
    if (nyitott === 0) statusz = teljes ? 'teljesitve' : 'lezarva';
    else if (rendeles.lezarva) statusz = 'lezarva';
    else statusz = beerk > 0 ? 'reszben' : 'nyitott';
    return { sorok: sorok, ertek: round3(ertek), nyitottSorok: nyitott, statusz: statusz };
  }

  /* ---------- Demo adatok ---------- */
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /**
   * Véletlenszerű, de valószerű próbaadatok (kb. 13 hónap előzménnyel).
   * Fogyás nincs rögzítve (mint a valóságban), a leltárak mutatják ki.
   */
  function generateDemoData(nowMs, seed) {
    nowMs = nowMs || Date.now();
    var R = rng(seed || 20261106);
    function rand(a, b) { return a + R() * (b - a); }
    function irand(a, b) { return Math.floor(rand(a, b + 1)); }
    function pick(arr) { return arr[Math.floor(R() * arr.length)]; }
    var DAY = 86400000;

    var besz = [
      ['B01', 'Kötőelem Centrum Kft.', 'Tóth Bence', 'rendeles@kotoelem-centrum.example', '+36 1 555 0101', 'https://kotoelem-centrum.example', 'KC'],
      ['B02', 'Profi-Szer Kereskedés Kft.', 'Varga Zsófia', 'info@profi-szer.example', '+36 1 555 0102', 'https://profi-szer.example', 'PS'],
      ['B03', 'VillTech Nagyker Zrt.', 'Molnár Ádám', 'webshop@villtech.example', '+36 1 555 0103', 'https://villtech.example', 'VT'],
      ['B04', 'Redőnyalkatrész Depó Kft.', 'Kiss Réka', 'rendeles@redonydepo.example', '+36 1 555 0104', 'https://redonydepo.example', 'RD'],
      ['B05', 'Tömítés-Ragasztás Bt.', 'Fekete László', 'iroda@tomites.example', '+36 1 555 0105', 'https://tomites.example', 'TR'],
      ['B06', 'Szerszámház Online', 'Horváth Dóra', 'b2b@szerszamhaz.example', '+36 1 555 0106', 'https://szerszamhaz.example', 'SZ']
    ];
    // [kategória, megnevezés, me., min, cél, leltár ciklus (nap), polc, [[beszállító index, kiszerelés, egységár], ...]]
    var cat = [
      ['Csavarok', 'Faforgácslap csavar 4×30 TX20', 'db', 300, 1500, 90, 'A1', [[0, 500, 6], [1, 200, 7]]],
      ['Csavarok', 'Faforgácslap csavar 4×40 TX20', 'db', 300, 1500, 90, 'A1', [[0, 500, 7], [1, 200, 8]]],
      ['Csavarok', 'Faforgácslap csavar 4×50 TX20', 'db', 200, 1000, 90, 'A1', [[0, 500, 8]]],
      ['Csavarok', 'Faforgácslap csavar 5×60 TX25', 'db', 200, 800, 90, 'A1', [[0, 200, 12], [1, 100, 14]]],
      ['Csavarok', 'Faforgácslap csavar 5×80 TX25', 'db', 100, 500, 90, 'A2', [[0, 200, 16]]],
      ['Csavarok', 'Lemezcsavar 3,9×13 (önmetsző)', 'db', 300, 1500, 90, 'A2', [[0, 1000, 3]]],
      ['Csavarok', 'Önfúró csavar 4,2×16', 'db', 300, 1500, 90, 'A2', [[0, 500, 5], [1, 250, 6]]],
      ['Csavarok', 'Ablakkeret csavar 7,5×92', 'db', 100, 400, 90, 'A2', [[0, 100, 45]]],
      ['Csavarok', 'Ablakkeret csavar 7,5×112', 'db', 100, 400, 90, 'A3', [[0, 100, 52]]],
      ['Csavarok', 'Betoncsavar 7,5×72', 'db', 100, 400, 90, 'A3', [[0, 100, 48], [1, 100, 55]]],
      ['Csavarok', 'Imbuszcsavar M6×16', 'db', 100, 400, 180, 'A3', [[0, 200, 9]]],
      ['Csavarok', 'Alátét M6', 'db', 200, 800, 180, 'A3', [[0, 500, 2]]],
      ['Dübelek', 'Nylon dübel 6×30', 'db', 300, 1500, 90, 'A4', [[0, 500, 4], [1, 100, 6]]],
      ['Dübelek', 'Nylon dübel 8×40', 'db', 300, 1200, 90, 'A4', [[0, 500, 6], [1, 100, 8]]],
      ['Dübelek', 'Nylon dübel 10×50', 'db', 100, 500, 90, 'A4', [[0, 250, 11]]],
      ['Dübelek', 'Gipszkarton dübel csavarral', 'db', 50, 200, 180, 'A4', [[1, 50, 38]]],
      ['Dübelek', 'Vegyi dübel ragasztó 300 ml', 'db', 4, 12, 180, 'A4', [[1, 1, 5900], [4, 12, 5400]]],
      ['Rögzítők', 'Napellenző fali konzol', 'db', 10, 30, 90, 'B1', [[3, 2, 4800]]],
      ['Rögzítők', 'Redőny tengelytartó 60', 'db', 20, 80, 90, 'B1', [[3, 10, 650]]],
      ['Rögzítők', 'Reluxa tartó konzol', 'db', 30, 120, 90, 'B1', [[3, 20, 180]]],
      ['Rögzítők', 'Szúnyogháló rögzítő Z-profil', 'db', 40, 160, 90, 'B2', [[3, 50, 95]]],
      ['Rögzítők', 'Popszegecs 4×10 alu', 'db', 300, 1000, 90, 'B2', [[0, 500, 4], [1, 1000, 3]]],
      ['Rögzítők', 'Popszegecs 4,8×12 alu', 'db', 200, 800, 90, 'B2', [[0, 500, 5]]],
      ['Rögzítők', 'Kábelkötegelő 200 mm', 'db', 200, 1000, 180, 'B2', [[2, 100, 9], [1, 100, 11]]],
      ['Elektromos', 'Wago 221-413 sorkapocs', 'db', 50, 200, 90, 'C1', [[2, 50, 120]]],
      ['Elektromos', 'Wago 221-415 sorkapocs', 'db', 50, 200, 90, 'C1', [[2, 25, 160]]],
      ['Elektromos', 'Motorkábel 4×0,75', 'm', 50, 200, 90, 'C1', [[2, 100, 290], [3, 50, 340]]],
      ['Elektromos', 'Kötődoboz IP65', 'db', 10, 40, 90, 'C2', [[2, 10, 690]]],
      ['Elektromos', 'Védőcső 16 mm', 'm', 30, 100, 180, 'C2', [[2, 50, 120]]],
      ['Elektromos', 'Szigetelőszalag fekete', 'tekercs', 10, 40, 180, 'C2', [[2, 10, 290], [1, 10, 320]]],
      ['Ragasztók, tömítők', 'Szilikon színtelen 310 ml', 'db', 12, 48, 30, 'C3', [[4, 12, 1450], [1, 1, 1790]]],
      ['Ragasztók, tömítők', 'Szilikon fehér 310 ml', 'db', 12, 48, 30, 'C3', [[4, 12, 1450]]],
      ['Ragasztók, tömítők', 'Akril tömítő fehér 310 ml', 'db', 6, 24, 30, 'C3', [[4, 12, 990]]],
      ['Ragasztók, tömítők', 'Purhab 750 ml', 'db', 6, 24, 30, 'C3', [[4, 12, 2690], [1, 1, 2990]]],
      ['Ragasztók, tömítők', 'Montázsragasztó 290 ml', 'db', 6, 24, 30, 'C3', [[4, 12, 1890]]],
      ['Ragasztók, tömítők', 'Kétoldalú ragasztószalag 19 mm', 'tekercs', 5, 20, 90, 'C3', [[4, 5, 1290]]],
      ['Redőny alkatrész', 'Gurtni 14 mm szürke', 'm', 50, 200, 90, 'D1', [[3, 50, 85]]],
      ['Redőny alkatrész', 'Gurtni 23 mm szürke', 'm', 50, 200, 90, 'D1', [[3, 50, 120]]],
      ['Redőny alkatrész', 'Gurtnibevezető kefés', 'db', 20, 80, 90, 'D1', [[3, 10, 390]]],
      ['Redőny alkatrész', 'Lamella ütköző (stopper)', 'db', 50, 200, 90, 'D2', [[3, 100, 45]]],
      ['Redőny alkatrész', 'Akasztórugó 60-as tengelyhez', 'db', 50, 200, 90, 'D2', [[3, 50, 70]]],
      ['Redőny alkatrész', 'Végzáró sapka szürke', 'db', 30, 120, 180, 'D2', [[3, 20, 60]]],
      ['Szerszámok (fogyó)', 'Imbuszkulcs 2,5 mm', 'db', 10, 40, 30, 'E1', [[5, 10, 290], [1, 1, 390]]],
      ['Szerszámok (fogyó)', 'Imbuszkulcs 4 mm', 'db', 5, 20, 90, 'E1', [[5, 10, 340]]],
      ['Szerszámok (fogyó)', 'Bit TX20 25 mm', 'db', 20, 60, 30, 'E1', [[5, 10, 190], [1, 10, 240]]],
      ['Szerszámok (fogyó)', 'Bit TX25 25 mm', 'db', 10, 40, 30, 'E1', [[5, 10, 190]]],
      ['Szerszámok (fogyó)', 'Bit PH2 25 mm', 'db', 10, 40, 90, 'E1', [[5, 10, 170]]],
      ['Szerszámok (fogyó)', 'Fúrószár beton SDS 6×110', 'db', 10, 30, 30, 'E2', [[5, 5, 690], [1, 1, 890]]],
      ['Szerszámok (fogyó)', 'Fúrószár beton SDS 8×160', 'db', 10, 30, 30, 'E2', [[5, 5, 790]]],
      ['Szerszámok (fogyó)', 'Fúrószár beton SDS 10×400', 'db', 3, 10, 90, 'E2', [[5, 1, 2490]]],
      ['Szerszámok (fogyó)', 'Fúrószár fém HSS 3,5 mm', 'db', 10, 30, 90, 'E2', [[5, 10, 260]]],
      ['Szerszámok (fogyó)', 'Tapétavágó penge 18 mm', 'db', 20, 100, 365, 'E2', [[5, 10, 90], [1, 10, 120]]],
      ['Szerszámok (fogyó)', 'Ácsceruza', 'db', 10, 40, 365, 'E2', [[5, 12, 150]]]
    ];

    var users = [
      { email: 'admin@pelda.hu', nev: 'Demo Admin', szerepkor: 'admin', aktiv: true, megjegyzes: 'Demo felhasználó' },
      { email: 'raktar@pelda.hu', nev: 'Demo Raktáros', szerepkor: 'raktaros', aktiv: true, megjegyzes: 'Demo felhasználó' },
      { email: 'szerelo@pelda.hu', nev: 'Demo Szerelő', szerepkor: 'szerelo', aktiv: true, megjegyzes: 'Demo felhasználó' },
      { email: 'iroda@pelda.hu', nev: 'Demo Olvasó', szerepkor: 'olvaso', aktiv: true, megjegyzes: 'Demo felhasználó' }
    ];
    var counters = ['admin@pelda.hu', 'raktar@pelda.hu'];
    var startMs = nowMs - 400 * DAY;
    var nowIso = new Date(nowMs).toISOString();

    var db = { Tetelek: [], Beszallitok: [], Forrasok: [], Mozgasok: [], Rendelesek: [], Rendeles_tetelek: [], Leltar_sablonok: [], Felhasznalok: users };
    besz.forEach(function (b) {
      var email = b[0] === 'B05'; // egy beszállítónak e-mailben rendelünk, a többinek webshopban
      db.Beszallitok.push({ beszallito_id: b[0], nev: b[1], kapcsolattarto: b[2], email: b[3], telefon: b[4], weboldal: b[5],
        aktiv: true, megjegyzes: '', modositva: nowIso, rendeles_mod: email ? 'email' : 'webshop',
        kereso_url: email ? '' : b[5] + '/kereses?q={cikkszam}' });
    });

    var sim = [];
    cat.forEach(function (c, i) {
      var id = 'T' + ('00' + (i + 1)).slice(-3);
      db.Tetelek.push({ tetel_id: id, megnevezes: c[1], kategoria: c[0], mertekegyseg: c[2], polc: c[6],
        min_keszlet: c[3], cel_keszlet: c[4], leltar_ciklus_nap: c[5], aktiv: true, megjegyzes: '', modositva: nowIso,
        raktar: 'Központi raktár' });
      c[7].forEach(function (s, j) {
        var b = besz[s[0]];
        db.Forrasok.push({ forras_id: 'F' + ('00' + (i + 1)).slice(-3) + '-' + (j + 1), tetel_id: id, beszallito_id: b[0],
          cikkszam: b[6] + '-' + irand(10000, 99999), kiszereles: s[1], egysegar: s[2],
          link: '', elsodleges: j === 0, megjegyzes: '', modositva: nowIso });
      });
      // fogyás/nap: a min→cél sávot nagyjából a leltári ciklus 1–2,5-szerese alatt fogyasztja el
      sim.push({ id: id, min: c[3], cel: c[4], ciklus: c[5], src: c[7][0], s: c[4] * rand(0.6, 1),
        rate: (c[4] - c[3]) / (c[5] * rand(1, 2.5)), lastCount: -1, pending: false });
    });

    // Leltárnapok: kb. havonta (hétköznap), az esedékes tételekkel
    var days = [];
    // Az utolsó leltár 2–7 hete volt → a havi ciklusú tételek egy része esedékes
    for (var d = 5; d < 385; d += irand(26, 35)) days.push(d);
    var lastDay = days[days.length - 1];
    var arrivals = []; // {day, lines:[{sor, simItem, qty}]}
    var ordSeq = 0;

    function iso(dayIdx, hour, min) {
      var t = new Date(startMs + dayIdx * DAY);
      t.setHours(hour, min || 0, irand(0, 59), 0);
      return t.toISOString();
    }

    for (var day = 0; day < 400; day++) {
      if (startMs + day * DAY > nowMs) break;
      // fogyás
      sim.forEach(function (it) { it.s = Math.max(0, it.s - it.rate * rand(0, 2)); });
      // beérkezések
      arrivals.filter(function (a) { return a.day === day; }).forEach(function (a) {
        a.lines.forEach(function (l) {
          var q = l.qty;
          if (R() < 0.12) q = Math.max(1, Math.round(l.qty * rand(0.4, 0.8))); // hiányos szállítás
          l.it.s += q;
          l.it.pending = q < l.qty && R() < 0.5; // fele marad nyitva
          db.Mozgasok.push({ mozgas_id: newId('M', 12, R), datum: iso(day, 13, irand(0, 59)), tipus: 'BEERKEZES',
            tetel_id: l.it.id, mennyiseg: q, bizonylat: 'SZL-' + irand(100000, 999999), rendeles_sor_id: l.sor.sor_id,
            felhasznalo: pick(counters), rogzitve: iso(day, 13, 59), megjegyzes: '' });
          l.sor.beerkezett = q;
          l.sor.lezarva = q >= l.sor.mennyiseg || !l.it.pending;
        });
      });
      // leltárnap
      if (days.indexOf(day) >= 0) {
        var biz = 'LT-' + iso(day, 8).slice(0, 10).replace(/-/g, '');
        var who = pick(counters);
        var toOrder = {};
        sim.forEach(function (it, i) {
          var due = it.lastCount < 0 || (day - it.lastCount) >= it.ciklus - 5;
          if (!due) return;
          var counted = Math.round(it.s);
          it.s = counted;
          it.lastCount = day;
          db.Mozgasok.push({ mozgas_id: newId('M', 12, R), datum: iso(day, 8, irand(0, 59)), tipus: 'LELTAR',
            tetel_id: it.id, mennyiseg: counted, bizonylat: biz, rendeles_sor_id: '', felhasznalo: who,
            rogzitve: iso(day, 10), megjegyzes: '' });
          // rendelés (az utolsó leltár után még nem rendeltünk → a javaslatban jelenik meg)
          if ((day !== lastDay || R() < 0.5) && !it.pending && counted <= it.min) {
            var b = besz[it.src[0]][0];
            (toOrder[b] = toOrder[b] || []).push(it);
          }
        });
        Object.keys(toOrder).forEach(function (b) {
          ordSeq++;
          var rid = 'R-' + iso(day, 9).slice(0, 10).replace(/-/g, '') + '-' + ordSeq;
          db.Rendelesek.push({ rendeles_id: rid, datum: iso(day, 11), beszallito_id: b, lezarva: false,
            letrehozta: 'admin@pelda.hu', megjegyzes: '', modositva: iso(day, 11) });
          var lines = [];
          toOrder[b].forEach(function (it, k) {
            var f = db.Forrasok.filter(function (x) { return x.tetel_id === it.id && x.elsodleges; })[0];
            var qty = roundPack(it.cel - it.s, f.kiszereles);
            var sor = { sor_id: rid + '-' + (k + 1), rendeles_id: rid, tetel_id: it.id, forras_id: f.forras_id,
              cikkszam: f.cikkszam, mennyiseg: qty, egysegar: f.egysegar, beerkezett: 0, lezarva: false, megjegyzes: '' };
            db.Rendeles_tetelek.push(sor);
            it.pending = true;
            lines.push({ sor: sor, it: it, qty: qty });
          });
          arrivals.push({ day: day + irand(3, 12), lines: lines });
        });
      }
    }
    // Választólisták
    db.Listak = [];
    var addList = function (tipus, vals) {
      vals.forEach(function (v, i) {
        db.Listak.push({ lista_id: 'L-' + tipus.slice(0, 3).toUpperCase() + '-' + (i + 1), tipus: tipus, ertek: v, sorrend: i + 1, modositva: nowIso });
      });
    };
    addList('kategoria', cat.map(function (c) { return c[0]; }).filter(function (v, i, a) { return a.indexOf(v) === i; }));
    addList('mertekegyseg', ['db', 'm', 'tekercs', 'doboz', 'csomag', 'kg', 'l', 'pár']);
    addList('raktar', ['Központi raktár']);
    // Minta leltár sablon: a gyorsan fogyó tömítők és bitek
    db.Leltar_sablonok.push({ sablon_id: 'S001', nev: 'Havi gyorsan fogyók',
      tetelek: db.Tetelek.filter(function (t) { return Number(t.leltar_ciklus_nap) === 30; }).map(function (t) { return t.tetel_id; }).join(','),
      letrehozta: 'admin@pelda.hu', modositva: nowIso });
    return db;
  }

  return {
    ROLES: ROLES, ROLE_LABELS: ROLE_LABELS, MOVE_TYPES: MOVE_TYPES, SCHEMA: SCHEMA, TABLES: TABLES,
    EDITABLE: EDITABLE, normalize: normalize, toNum: toNum, toBool: toBool, toDate: toDate, round3: round3,
    newId: newId, index: index, get: get, exportDb: exportDb, cloneDb: cloneDb,
    hasRole: hasRole, can: can, PERMS: PERMS, filterSnapshot: filterSnapshot, applyOp: applyOp, computeStock: computeStock, orderInfo: orderInfo,
    sourcesFor: sourcesFor, roundPack: roundPack, generateDemoData: generateDemoData,
    orderMode: orderMode, productUrl: productUrl, usageStats: usageStats,
    LIST_TYPES: LIST_TYPES, LIST_FIELD: LIST_FIELD, listValues: listValues
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RaktarLogic;
if (typeof window !== 'undefined') window.RaktarLogic = RaktarLogic;
