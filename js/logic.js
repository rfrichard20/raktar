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
  var EDITABLE = { Tetelek: 1, Beszallitok: 1, Forrasok: 1, Felhasznalok: 1, Listak: 1, Email_sablonok: 1 };
  var DELETABLE = { Forrasok: 1, Listak: 1, Email_sablonok: 1 };
  var LIST_TYPES = { kategoria: 'Kategóriák', mertekegyseg: 'Mértékegységek', raktar: 'Raktárak' };
  var LIST_FIELD = { kategoria: 'kategoria', mertekegyseg: 'mertekegyseg', raktar: 'raktar' };

  // Új lapnál ez az oszlopsorrend; a szerver a fejlécnevek alapján olvas és ír, így az oszlopok átrendezhetők.
  var SCHEMA = {
    Tetelek: { key: 'tetel_id', cols: [
      ['tetel_id', 'str'], ['megnevezes', 'str'], ['kategoria', 'str'], ['mertekegyseg', 'str'],
      ['polc', 'str'], ['min_keszlet', 'num'], ['cel_keszlet', 'num'], ['leltar_ciklus_nap', 'num'],
      ['aktiv', 'bool'], ['megjegyzes', 'str'], ['modositva', 'date'], ['raktar', 'str'],
      // Készletezés módja: '' / 'anyag' = mennyiségi (fogyóanyag); 'eszkoz' = eszköztípus, egyedi darabokkal (Eszkozok.tetel_id)
      ['keszletezes', 'str']] },
    // rendeles_mod: 'webshop' | 'email'; kereso_url: webshop keresés, a {cikkszam} helyére kerül a cikkszám
    Beszallitok: { key: 'beszallito_id', cols: [
      ['beszallito_id', 'str'], ['nev', 'str'], ['kapcsolattarto', 'str'], ['email', 'str'],
      ['telefon', 'str'], ['weboldal', 'str'], ['aktiv', 'bool'], ['megjegyzes', 'str'], ['modositva', 'date'],
      ['rendeles_mod', 'str'], ['kereso_url', 'str'], ['email_sablon', 'str']] },
    Forrasok: { key: 'forras_id', cols: [
      ['forras_id', 'str'], ['tetel_id', 'str'], ['beszallito_id', 'str'], ['cikkszam', 'str'],
      ['kiszereles', 'num'], ['egysegar', 'num'], ['link', 'str'], ['elsodleges', 'bool'],
      ['megjegyzes', 'str'], ['modositva', 'date']] },
    Mozgasok: { key: 'mozgas_id', cols: [
      ['mozgas_id', 'str'], ['datum', 'date'], ['tipus', 'str'], ['tetel_id', 'str'], ['mennyiseg', 'num'],
      ['bizonylat', 'str'], ['rendeles_sor_id', 'str'], ['felhasznalo', 'str'], ['rogzitve', 'date'],
      ['megjegyzes', 'str'],
      // Kivétnél / kiadásnál: ki vitte el (felhasználó e-mail-címe vagy szabad szöveg) és melyik munkára (pl. MiniCRM
      // azonosító); eszközmozgásnál: kinek adták ki / kitől jött vissza / melyik szerviz
      ['atvevo', 'str'], ['munka', 'str'],
      // A közös mozgásnapló eszközsorai (tipus = TOOL_EVENTS kulcsa): melyik eszköz, és az új állapota (ha változott).
      // Anyagsornál üres. Egy bizonylaton lehet anyag és eszköz is (pl. egy kiadás).
      ['eszkoz_id', 'str'], ['allapot', 'str']] },
    Rendelesek: { key: 'rendeles_id', cols: [
      ['rendeles_id', 'str'], ['datum', 'date'], ['beszallito_id', 'str'], ['lezarva', 'bool'],
      ['letrehozta', 'str'], ['megjegyzes', 'str'], ['modositva', 'date'],
      ['belso_azon', 'str']] }, // belső azonosító, pl. MiniCRM
    Rendeles_tetelek: { key: 'sor_id', cols: [
      ['sor_id', 'str'], ['rendeles_id', 'str'], ['tetel_id', 'str'], ['forras_id', 'str'],
      ['cikkszam', 'str'], ['mennyiseg', 'num'], ['egysegar', 'num'], ['beerkezett', 'num'],
      ['lezarva', 'bool'], ['megjegyzes', 'str']] },
    // Választólisták a tétel űrlapokhoz: tipus = kategoria | mertekegyseg | raktar
    Listak: { key: 'lista_id', cols: [
      ['lista_id', 'str'], ['tipus', 'str'], ['ertek', 'str'], ['sorrend', 'num'], ['modositva', 'date']] },
    // E-mail sablonok: tipus = rendeles | ajanlat; a szövegben {mezo} helyőrzők (lásd EMAIL_FIELDS)
    Email_sablonok: { key: 'sablon_id', cols: [
      ['sablon_id', 'str'], ['nev', 'str'], ['tipus', 'str'], ['targy', 'str'], ['szoveg', 'str'], ['modositva', 'date']] },
    // Leltár sablon: tetelek = vesszővel elválasztott tétel azonosítók
    Leltar_sablonok: { key: 'sablon_id', cols: [
      ['sablon_id', 'str'], ['nev', 'str'], ['tetelek', 'str'], ['letrehozta', 'str'], ['modositva', 'date']] },
    Felhasznalok: { key: 'email', cols: [
      ['email', 'str'], ['nev', 'str'], ['szerepkor', 'str'], ['aktiv', 'bool'], ['megjegyzes', 'str']] },
    // Beszerzési igények (szerszám, anyag, bármi): statusz = IGENY_STATUS kulcsa; tetel_id: a kapcsolt tétel;
    // rendeles_sor_id: a rendelési sor, amelyben megrendelték (a rendelés / beérkezés frissíti az állapotot)
    Igenyek: { key: 'igeny_id', cols: [
      ['igeny_id', 'str'], ['datum', 'date'], ['igenylo', 'str'], ['megnevezes', 'str'], ['leiras', 'str'],
      ['mennyiseg', 'num'], ['mertekegyseg', 'str'], ['link', 'str'], ['surgos', 'bool'], ['hatarido', 'date'],
      ['statusz', 'str'], ['tetel_id', 'str'], ['rendeles_sor_id', 'str'], ['valasz', 'str'], ['kezelte', 'str'],
      ['modositva', 'date']] },
    // Szerszámok, eszközök: egyedi darabok. azonosito: címkére nyomtatott kód (pl. SZ-0001), egyedi;
    // allapot: TOOL_STATE kulcsa; felulvizsgalat_nap: időszakos felülvizsgálat ciklusa (0 = nincs)
    Eszkozok: { key: 'eszkoz_id', cols: [
      ['eszkoz_id', 'str'], ['azonosito', 'str'], ['megnevezes', 'str'], ['kategoria', 'str'], ['gyarto', 'str'],
      ['tipus', 'str'], ['gyari_szam', 'str'], ['beszerzes_datum', 'date'], ['felulvizsgalat_nap', 'num'],
      ['allapot', 'str'], ['tetel_id', 'str'], ['megjegyzes', 'str'], ['modositva', 'date'],
      // Tárolási hely (ahová visszakerül, ha bent van) – ugyanazok a raktárak / polcok, mint a tételeknél
      ['raktar', 'str'], ['polc', 'str']] },
    // Átadás-átvételi aláírások (SVG vonalrajz). Nem része a letöltött adatnak (méret): kérésre jön le (alairas művelet).
    Alairasok: { key: 'alairas_id', cols: [
      ['alairas_id', 'str'], ['bizonylat', 'str'], ['nev', 'str'], ['rajz', 'long'], ['felhasznalo', 'str'], ['rogzitve', 'date'],
      // szerep: 'szemely' (aki átveszi / visszaadja) | 'raktar' (a rögzítő raktáros – a neve a bejelentkezésből)
      // pecset: a szerver lenyomata (HMAC) az aláírásról és az átadás adatairól – ebből látszik, ha utólag módosították
      ['szerep', 'str'], ['pecset', 'str']] }
  };
  // Külön kezelt lapok: nem töltődnek le a teljes adattal (lásd Alairasok)
  var SIDE_TABLES = ['Alairasok'];
  /** Eszköztípus-e a tétel (egyedi darabokkal követve); különben anyag (mennyiségben). */
  function isToolItem(t) { return !!t && t.keszletezes === 'eszkoz'; }
  var TOOL_STATE = { rendben: 'Rendben', javitando: 'Javítandó', szervizben: 'Szervizben', selejtezve: 'Selejtezve', elveszett: 'Elveszett' };
  var TOOL_EVENTS = { KIADAS: 'Kiadás', VISSZAVETEL: 'Visszavétel', SZERVIZ: 'Szervizbe adás', SZERVIZBOL: 'Szervizből vissza',
    ALLAPOT: 'Állapotváltozás', FELULVIZSGALAT: 'Felülvizsgálat', SELEJTEZES: 'Selejtezés' };
  /** Mozgástípus felirata – anyag (MOVE_TYPES) és eszköz (TOOL_EVENTS) egyaránt. */
  function moveLabel(t) { return own(MOVE_TYPES, t) ? MOVE_TYPES[t] : own(TOOL_EVENTS, t) ? TOOL_EVENTS[t] : t; }
  var IGENY_STATUS = { uj: 'Új', folyamatban: 'Folyamatban', rendelve: 'Rendelve', teljesitve: 'Teljesítve', elutasitva: 'Elutasítva' };
  var TABLES = Object.keys(SCHEMA).filter(function (t) { return SIDE_TABLES.indexOf(t) < 0; });

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
      else if (c[1] === 'long') out[name] = v == null ? '' : String(v).trim().slice(0, 40000); // pl. aláírás rajza (cella max. 50 000)
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
    mozgasok: ['admin', 'raktaros', 'olvaso'],  // Mozgások oldal (összes tétel mozgása) – csak a menüpontot rejti,
                                                // a mozgások adata mindenkinek kell a készletszámításhoz
    igenyek: ['admin', 'raktaros', 'olvaso'],   // minden igény látható (a többiek csak a sajátjukat kapják meg)
    alairasok: ['admin', 'raktaros', 'olvaso'], // minden átadás aláírása (a többiek csak a nekik szóló átadásokét)
  };

  /**
   * Az aláírás lenyomatának alapja: az aláírás és a hozzá tartozó átadás minden lényeges adata egy szövegben.
   * Ha ezek közül bármi megváltozik (a Sheetben átírják), a szerver által számolt lenyomat már nem egyezik.
   * (Az időpont percre kerekítve, mert a Sheet a dátumot a saját formátumában tárolja.)
   * Változatok (a pecset elején: 'v2.'): v1 – csak az eszközsorok (a korábbi, külön eszköznaplós aláírások);
   * v2 – a bizonylat minden sora, az anyag is (közös kiadás). A régi pecsétek így is ellenőrizhetők maradnak.
   */
  function sealPayload(sig, moves, ver) {
    var mine = (moves || []).filter(function (m) { return m.bizonylat === sig.bizonylat && (ver === 'v2' || m.eszkoz_id); });
    var rows = mine.map(function (m) {
      return (ver === 'v2' ? [m.mozgas_id, m.eszkoz_id, m.tetel_id, m.tipus, toNum(m.mennyiseg), m.atvevo, m.allapot]
        : [m.mozgas_id, m.eszkoz_id, m.tipus, m.atvevo, m.allapot]).join('|');
    }).sort();
    return [ver === 'v2' ? 'v2' : 'v1', sig.alairas_id, sig.bizonylat, sig.nev, sig.szerep || 'szemely', sig.felhasznalo,
      String(sig.rogzitve || '').slice(0, 16), sig.rajz].concat(rows).join('\n');
  }
  /** A tárolt pecset változata ('v2.…' → v2, egyébként a régi v1). */
  function sealVersion(pecset) { return /^v2\./.test(String(pecset || '')) ? 'v2' : 'v1'; }

  /** Egy átadás aláírásai, ha a felhasználó láthatja (jog, vagy neki / tőle történt az átadás). */
  function signaturesFor(db, sigs, user, bizonylat) {
    bizonylat = String(bizonylat || '');
    var me = user ? String(user.email).toLowerCase() : '';
    var allowed = can(user, 'alairasok') || (db.Mozgasok || []).some(function (m) {
      return m.bizonylat === bizonylat && String(m.atvevo).toLowerCase() === me;
    });
    if (!bizonylat || !allowed) return [];
    return (sigs || []).filter(function (s) { return s.bizonylat === bizonylat; })
      .map(function (s) { return { alairas_id: s.alairas_id, bizonylat: s.bizonylat, nev: s.nev, szerep: s.szerep || 'szemely', rajz: s.rajz, felhasznalo: s.felhasznalo, rogzitve: s.rogzitve,
        hiteles: s.hiteles, kod: s.pecset ? String(s.pecset).replace(/^v2\./, '').slice(0, 10) : '' }; });
  }
  /** Szerepkör (pl. 'raktaros') vagy jog (pl. 'arak') ellenőrzése. */
  function can(user, what) {
    if (ROLES[what]) return hasRole(user, what);
    return !!user && !!PERMS[what] && PERMS[what].indexOf(user.szerepkor) >= 0;
  }

  /** A felhasználónak elküldhető adat: a jogosultság szerint szűrve (szerveren és a demo backendben is). */
  function filterSnapshot(db, user) {
    var out = exportDb(db);
    if (!can(user, 'rendeles')) {
      out.Email_sablonok = [];
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
    if (!can(user, 'igenyek')) {
      var me = user ? String(user.email).toLowerCase() : '';
      out.Igenyek = out.Igenyek.filter(function (i) { return String(i.igenylo).toLowerCase() === me; });
    }
    out.Felhasznalok = out.Felhasznalok.map(function (u) {
      return hasRole(user, 'admin') ? u : { email: u.email, nev: u.nev };
    });
    return out;
  }
  function need(user, role) { if (!hasRole(user, role)) fail('Nincs jogosultságod ehhez a művelethez.'); }

  /* ---------- Bemenet-korlátok (a szerver ezekkel védi az adatot a hibás vagy rosszindulatú kérésektől) ---------- */
  var MAX_ROWS = 5000;          // egy műveletben legfeljebb ennyi sor (teljes leltár is belefér)
  var MAX_QTY = 10000000;       // egy mozgás / rendelési sor mennyiségének felső határa
  var BACKDATE_DAYS = 31;       // Szerelő ennyi napnál régebbi kivétet nem rögzíthet (raktárostól felfelé szabad)
  /** Saját kulcs-e (a beépített nevek – pl. constructor, __proto__ – nem számítanak érvényes értéknek). */
  function own(obj, key) { return typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key); }
  /** Új rekord azonosítója: csak betű, szám, pont, kötőjel, aláhúzás (képlet, HTML, szóköz nem lehet benne). */
  function checkId(id) { if (!/^[\w.\-]{1,60}$/.test(String(id))) fail('Érvénytelen azonosító.'); }
  /** A művelet sorai: tömb, objektumokkal, a megengedett darabszámon belül. */
  function rowsOf(list, emptyMsg) {
    if (!Array.isArray(list) || !list.length) fail(emptyMsg);
    if (list.length > MAX_ROWS) fail('Túl sok sor egy műveletben (legfeljebb ' + MAX_ROWS + ').');
    list.forEach(function (r) { if (!r || typeof r !== 'object') fail('Hibás sor a műveletben.'); });
    return list;
  }

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
      case 'rendeles_torles': opRendelesTorles(db, op, user, changes, nowIso); break;
      case 'rendeles_adat':
        // Belső azonosító és megjegyzés utólagos módosítása
        need(user, 'raktaros');
        if (!get(db, 'Rendelesek', op.rendeles_id)) fail('Ismeretlen rendelés.');
        put(db, 'Rendelesek', { rendeles_id: op.rendeles_id, belso_azon: String(op.belso_azon || '').trim().slice(0, 200),
          megjegyzes: String(op.megjegyzes || '').trim().slice(0, 2000), modositva: nowIso }, changes);
        break;
      case 'mentes': opMentes(db, op, user, nowIso, changes); break;
      case 'torles': opTorles(db, op, user, changes); break;
      case 'uj_tetel': opUjTetel(db, op, user, nowIso, changes); break;
      case 'forras_ar': opForrasAr(db, op, user, nowIso, changes); break;
      case 'sablon_mentes': opSablon(db, op, user, nowIso, changes); break;
      case 'sablon_torles':
        need(user, 'raktaros');
        remove(db, 'Leltar_sablonok', op.sablon_id, changes);
        break;
      case 'igeny': opIgeny(db, op, user, nowIso, changes); break;
      case 'igeny_kezeles': opIgenyKezeles(db, op, user, nowIso, changes); break;
      case 'igeny_torles': opIgenyTorles(db, op, user, changes); break;
      case 'eszkoz_mentes': opEszkozMentes(db, op, user, nowIso, changes); break;
      case 'eszkoz_esemeny': opEszkozEsemenyCompat(db, op, user, nowIso, changes); break; // régi kimenő sor
      default: fail('Ismeretlen művelet.');
    }
    return changes;
  }

  /**
   * Mozgások egy műveletben – a közös mozgásnapló (Mozgasok) minden sora:
   *  - anyag: LELTAR, BEERKEZES, KIVET, KORREKCIO (mennyiséggel);
   *  - eszköz: KIADAS, VISSZAVETEL, SZERVIZ, SZERVIZBOL, ALLAPOT, FELULVIZSGALAT, SELEJTEZES (eszkoz_id-vel; atvevo: kinek / kitől / szerviz).
   * Egy bizonylaton vegyesen is (pl. egy kiadás anyaggal és eszközzel), opcionális aláírásokkal (op.alairasok).
   * Előbb minden sort ellenőriz, csak utána ír. Idempotens: a már feldolgozott sorokat kihagyja.
   */
  function opMozgasok(db, op, user, now, changes) {
    var rows = rowsOf(op.rows, 'Nincs rögzítendő tétel.');
    var fresh = [], seen = {}, toolSeen = {}, st = null;
    rows.forEach(function (r0) {
      var r = normalize('Mozgasok', r0);
      if (!r.mozgas_id) fail('Hiányzó mozgás-azonosító.');
      if (get(db, 'Mozgasok', r.mozgas_id) || seen[r.mozgas_id]) return; // már feldolgozva
      checkId(r.mozgas_id);
      seen[r.mozgas_id] = 1;
      if (!r.datum) r.datum = now;
      // Jövőbeli dátum torzítaná a készletet (a felület sem engedi); 1 nap tűrés az eltérő órák / időzónák miatt
      if (Date.parse(r.datum) > Date.parse(now) + DAY_MS) fail('A mozgás dátuma nem lehet a jövőben.');
      if (own(TOOL_EVENTS, r.tipus)) {
        st = st || toolStates(db, Date.parse(now));
        checkToolMove(db, r, user, st, toolSeen);
      } else checkMaterialMove(db, r, user, now);
      r.felhasznalo = user.email;
      r.rogzitve = now;
      fresh.push(r);
    });
    if (!fresh.length) return; // az egész művelet már feldolgozva (az aláírás is)
    var biz = String(op.bizonylat || fresh[0].bizonylat || '').trim();
    var sigs = signaturesOf(op, biz, user, now);
    var lines = {};
    fresh.forEach(function (r) {
      put(db, 'Mozgasok', r, changes);
      if (r.rendeles_sor_id) lines[r.rendeles_sor_id] = 1;
      // Eszköz: az esemény állapotváltozása az eszköz rekordjára is (pl. szervizben, selejtezve, javítandó)
      var e = r.eszkoz_id ? get(db, 'Eszkozok', r.eszkoz_id) : null;
      if (e && r.allapot && r.allapot !== e.allapot) put(db, 'Eszkozok', { eszkoz_id: e.eszkoz_id, allapot: r.allapot, modositva: now }, changes);
    });
    Object.keys(lines).forEach(function (sid) { recalcLine(db, sid, changes); syncIgenyek(db, sid, now, changes); });
    sigs.forEach(function (sig) { put(db, 'Alairasok', sig, changes); });
  }

  /** Anyagmozgás ellenőrzése (tétel, mennyiség, jog, rendelési sor, visszadátumozás). */
  function checkMaterialMove(db, r, user, now) {
    if (!own(MOVE_TYPES, r.tipus)) fail('Ismeretlen mozgástípus.');
    need(user, r.tipus === 'KIVET' ? 'szerelo' : 'raktaros');
    var t = get(db, 'Tetelek', r.tetel_id);
    if (!t) fail('Ismeretlen tétel: ' + r.tetel_id);
    // Eszköztípusnál csak beérkezés lehet (a rendelés teljesítéséhez); a darabok saját eszközmozgásokkal mennek
    if (isToolItem(t) && r.tipus !== 'BEERKEZES') fail('Eszköztípusnál (' + t.megnevezes + ') nincs kivét, leltár, korrekció – az eszközt kiadással / visszavétellel kezeld.');
    r.eszkoz_id = ''; r.allapot = '';
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
    if (Math.abs(r.mennyiseg) > MAX_QTY) fail('Túl nagy mennyiség (' + t.megnevezes + ').');
    // Visszadátumozás: a Szerelő csak a közelmúltra rögzíthet (régi dátummal ne lehessen „elrejteni” egy kivétet)
    if (!hasRole(user, 'raktaros') && Date.parse(r.datum) < Date.parse(now) - BACKDATE_DAYS * DAY_MS) {
      fail('Ennél régebbi dátumra (' + BACKDATE_DAYS + ' nap) csak raktáros rögzíthet (' + t.megnevezes + ').');
    }
  }

  /** Eszközmozgás ellenőrzése: az eszköz most hol van (st: toolStates), és ez az esemény megengedett-e. */
  function checkToolMove(db, r, user, st, toolSeen) {
    need(user, 'raktaros');
    var e = get(db, 'Eszkozok', r.eszkoz_id);
    if (!e) fail('Ismeretlen eszköz.');
    if (toolSeen[e.eszkoz_id]) fail('Egy eszköz egy műveletben csak egyszer szerepelhet.');
    toolSeen[e.eszkoz_id] = 1;
    if (r.allapot && !own(TOOL_STATE, r.allapot)) fail('Ismeretlen állapot.');
    var s = st[e.eszkoz_id], nev = e.azonosito + ' ' + e.megnevezes;
    if (e.allapot === 'selejtezve') fail('Selejtezett eszköz: ' + nev);
    r.tetel_id = e.tetel_id || ''; r.mennyiseg = 0; r.rendeles_sor_id = '';
    if (r.tipus === 'KIADAS') {
      if (s.hely !== 'raktar') fail((s.hely === 'kiadva' ? 'Már ki van adva' : 'Szervizben van') + ': ' + nev);
      if (e.allapot === 'elveszett') fail('Elveszettként jelölt eszköz: ' + nev);
      if (!r.atvevo) fail('Add meg, kinek adod ki.');
      r.allapot = '';
    } else if (r.tipus === 'VISSZAVETEL') {
      if (s.hely !== 'kiadva') fail('Nincs kiadva: ' + nev);
      r.atvevo = s.kinel; // kitől jött vissza
    } else if (r.tipus === 'SZERVIZ') {
      if (s.hely !== 'raktar') fail((s.hely === 'kiadva' ? 'Előbb vedd vissza' : 'Már szervizben van') + ': ' + nev);
      r.allapot = 'szervizben';
    } else if (r.tipus === 'SZERVIZBOL') {
      if (s.hely !== 'szerviz') fail('Nincs szervizben: ' + nev);
      r.atvevo = s.kinel;
      r.allapot = r.allapot || 'rendben';
      if (r.allapot === 'szervizben' || r.allapot === 'selejtezve') fail('Érvénytelen állapot.');
    } else if (r.tipus === 'ALLAPOT') {
      if (!r.allapot) fail('Add meg az új állapotot.');
      if (r.allapot === 'szervizben' || r.allapot === 'selejtezve') fail('Ehhez a szervizbe adás, ill. a selejtezés művelet való.');
    } else if (r.tipus === 'SELEJTEZES') {
      if (s.hely !== 'raktar') fail('Csak raktárban lévő eszköz selejtezhető: ' + nev);
      if (!r.megjegyzes) fail('A selejtezéshez indoklás szükséges.');
      r.allapot = 'selejtezve';
    } else if (r.tipus === 'FELULVIZSGALAT') {
      if (r.allapot === 'szervizben' || r.allapot === 'selejtezve') fail('Érvénytelen állapot.');
    }
  }

  /** Aláírások egy bizonylathoz: az átvevő / visszaadó személyé és opcionálisan a rögzítő raktárosé (szerepenként egy). */
  function signaturesOf(op, biz, user, now) {
    var raw = op.alairasok != null ? op.alairasok : op.alairas ? [op.alairas] : [];
    if (!Array.isArray(raw) || raw.length > 2) fail('Érvénytelen aláírás.');
    if (raw.length) { if (!biz) fail('Az aláíráshoz bizonylat szükséges.'); checkId(biz); }
    var sigs = [], roles = {};
    raw.forEach(function (a) {
      if (!a || typeof a !== 'object') fail('Érvénytelen aláírás.');
      var sig = normalize('Alairasok', a);
      if (!sig.alairas_id) fail('Hiányzó aláírás-azonosító.');
      checkId(sig.alairas_id);
      sig.szerep = sig.szerep || 'szemely';
      if (sig.szerep !== 'szemely' && sig.szerep !== 'raktar') fail('Érvénytelen aláírás.');
      if (roles[sig.szerep]) fail('Szerepenként egy aláírás lehet.');
      roles[sig.szerep] = 1;
      // A raktáros neve a bejelentkezésből jön (nem írható át); a személyé kötelező
      if (sig.szerep === 'raktar') sig.nev = user.nev || user.email;
      if (!sig.nev) fail('Az aláíró neve kötelező.');
      // Csak vonalrajz (M/L parancsok és számok) – semmi, ami megjelenítéskor kódként futhatna
      if (!sig.rajz || String(a.rajz).length > 40000 || !/^[ML0-9 .\-]+$/.test(sig.rajz)) fail('Érvénytelen aláírás.');
      sig.bizonylat = biz;
      sig.felhasznalo = user.email;
      sig.rogzitve = now;
      sig.pecset = ''; // csak a szerver adhatja (Code.gs → sealSignatures)
      sigs.push(sig);
    });
    return sigs;
  }

  /** Régi (külön eszköznaplós) művelet a kimenő sorból: átalakítva a közös mozgásnaplóba. */
  function opEszkozEsemenyCompat(db, op, user, now, changes) {
    var rows = rowsOf(op.rows, 'Nincs kijelölt eszköz.').map(function (r) {
      return { mozgas_id: r.esemeny_id, eszkoz_id: r.eszkoz_id, tipus: r.tipus, datum: r.datum, atvevo: r.kinel,
        allapot: r.allapot, megjegyzes: r.megjegyzes, bizonylat: op.bizonylat };
    });
    opMozgasok(db, { rows: rows, bizonylat: op.bizonylat, alairasok: op.alairasok, alairas: op.alairas }, user, now, changes);
  }

  /* ---------- Igények ---------- */
  var IGENY_FIELDS = ['megnevezes', 'leiras', 'mennyiseg', 'mertekegyseg', 'link', 'surgos', 'hatarido'];
  function isMine(rec, user) { return !!user && String(rec.igenylo).toLowerCase() === String(user.email).toLowerCase(); }

  /** Új igény rögzítése, vagy módosítása (az igénylő csak amíg „Új”, a raktáros bármikor, ha még nincs lezárva). */
  function opIgeny(db, op, user, now, changes) {
    need(user, 'szerelo');
    var r = normalize('Igenyek', op.igeny);
    if (!r.igeny_id) fail('Hiányzó igény-azonosító.');
    if (!r.megnevezes) fail('A megnevezés kötelező.');
    if (r.mennyiseg < 0 || r.mennyiseg > MAX_QTY) fail('Érvénytelen mennyiség.');
    var ex = get(db, 'Igenyek', r.igeny_id);
    var row = { igeny_id: r.igeny_id, modositva: now };
    IGENY_FIELDS.forEach(function (f) { row[f] = r[f]; });
    if (ex) {
      if (!(hasRole(user, 'raktaros') || (isMine(ex, user) && ex.statusz === 'uj'))) fail('Ezt az igényt már nem módosíthatod.');
      if (ex.statusz === 'teljesitve' || ex.statusz === 'elutasitva') fail('Lezárt igény nem módosítható.');
    } else {
      checkId(r.igeny_id);
      row.datum = now;
      row.igenylo = user.email;
      row.statusz = 'uj';
      row.tetel_id = ''; row.rendeles_sor_id = ''; row.valasz = ''; row.kezelte = '';
    }
    put(db, 'Igenyek', row, changes);
  }

  /** Raktáros: állapot (a „Rendelve” csak rendeléssel), válasz / indoklás, kapcsolt tétel. */
  function opIgenyKezeles(db, op, user, now, changes) {
    need(user, 'raktaros');
    var ig = get(db, 'Igenyek', op.igeny_id);
    if (!ig) fail('Ismeretlen igény.');
    var row = { igeny_id: ig.igeny_id, kezelte: user.email, modositva: now };
    if (op.statusz != null && op.statusz !== ig.statusz) {
      if (!own(IGENY_STATUS, op.statusz) || op.statusz === 'rendelve') fail('Érvénytelen állapot.');
      if (ig.statusz === 'rendelve' && op.statusz !== 'teljesitve') fail('A megrendelt igény állapotát a rendelés kezeli (törléssel vagy lezárással).');
      row.statusz = op.statusz;
    }
    if (op.valasz != null) row.valasz = String(op.valasz).trim().slice(0, 2000);
    if (op.tetel_id != null) {
      var tid = String(op.tetel_id);
      if (tid && !get(db, 'Tetelek', tid)) fail('Ismeretlen tétel.');
      if (ig.statusz === 'rendelve') fail('A megrendelt igény tétele nem módosítható.');
      row.tetel_id = tid;
    }
    if ((row.statusz || ig.statusz) === 'elutasitva' && !(row.valasz != null ? row.valasz : ig.valasz)) fail('Az elutasításhoz indoklás szükséges.');
    put(db, 'Igenyek', row, changes);
  }

  /** Igény törlése (visszavonás): az igénylő, amíg „Új”; a raktáros, amíg nincs megrendelve. */
  function opIgenyTorles(db, op, user, changes) {
    need(user, 'szerelo');
    var ig = get(db, 'Igenyek', op.igeny_id);
    if (!ig) return; // már törölve
    if (!(hasRole(user, 'raktaros') || (isMine(ig, user) && ig.statusz === 'uj'))) fail('Ezt az igényt már nem vonhatod vissza.');
    if (ig.statusz === 'rendelve') fail('Megrendelt igény nem törölhető.');
    remove(db, 'Igenyek', ig.igeny_id, changes);
  }

  /* ---------- Szerszámok, eszközök ---------- */
  var DAY_MS = 86400000;
  /** Következő szabad sorszámos azonosító (SZ-0001, SZ-0002 …). */
  function nextToolCode(db) {
    var max = 0;
    (db.Eszkozok || []).forEach(function (e) { var m = /^SZ-(\d+)$/i.exec(e.azonosito); if (m) max = Math.max(max, Number(m[1])); });
    return 'SZ-' + ('000' + (max + 1)).slice(-4);
  }
  function codeTaken(db, code, id) {
    code = String(code).toLowerCase();
    return (db.Eszkozok || []).some(function (e) { return e.eszkoz_id !== id && String(e.azonosito).toLowerCase() === code; });
  }

  /**
   * Eszközönként a napló visszajátszásából: hely ('raktar' | 'kiadva' | 'szerviz'), kinel (kinél / melyik szerviz),
   * mióta (a kiadás / szervizbe adás dátuma), bizonylat, az utolsó felülvizsgálat, és annak esedékessége
   * (felulvizsgalat: '' | 'ok' | 'kozel' (30 napon belül) | 'lejart'; kovetkezo: a következő dátuma).
   */
  function toolStates(db, nowMs) {
    var out = {};
    nowMs = nowMs || Date.now();
    (db.Eszkozok || []).forEach(function (e) {
      out[e.eszkoz_id] = { eszkoz_id: e.eszkoz_id, hely: 'raktar', kinel: '', miota: '', bizonylat: '', felulvizsgalva: '', kovetkezo: '', felulvizsgalat: '' };
    });
    // A közös mozgásnapló eszközsorai, időrendben
    sortedMoves(db).forEach(function (ev) {
      var s = ev.eszkoz_id ? out[ev.eszkoz_id] : null;
      if (!s) return;
      if (ev.tipus === 'KIADAS' || ev.tipus === 'SZERVIZ') {
        s.hely = ev.tipus === 'KIADAS' ? 'kiadva' : 'szerviz'; s.kinel = ev.atvevo; s.miota = ev.datum; s.bizonylat = ev.bizonylat;
      } else if (ev.tipus === 'VISSZAVETEL' || ev.tipus === 'SZERVIZBOL') {
        s.hely = 'raktar'; s.kinel = ''; s.miota = ''; s.bizonylat = '';
      } else if (ev.tipus === 'FELULVIZSGALAT') s.felulvizsgalva = ev.datum;
    });
    (db.Eszkozok || []).forEach(function (e) {
      var s = out[e.eszkoz_id], n = toNum(e.felulvizsgalat_nap);
      if (!(n > 0) || e.allapot === 'selejtezve') return;
      var base = s.felulvizsgalva || e.beszerzes_datum;
      if (!base) { s.felulvizsgalat = 'lejart'; return; } // még soha nem volt felülvizsgálva
      var next = Date.parse(base) + n * DAY_MS;
      s.kovetkezo = new Date(next).toISOString();
      s.felulvizsgalat = next < nowMs ? 'lejart' : next < nowMs + 30 * DAY_MS ? 'kozel' : 'ok';
    });
    return out;
  }

  /** Eszköz felvétele / módosítása (raktáros). Az állapot csak eseménnyel változik. */
  function opEszkozMentes(db, op, user, now, changes) {
    need(user, 'raktaros');
    var r = normalize('Eszkozok', op.eszkoz);
    if (!r.eszkoz_id) fail('Hiányzó eszköz-azonosító.');
    if (!r.megnevezes) fail('A megnevezés kötelező.');
    if (r.felulvizsgalat_nap < 0 || r.felulvizsgalat_nap > 3650) fail('Érvénytelen felülvizsgálati ciklus.');
    if (r.tetel_id && !isToolItem(get(db, 'Tetelek', r.tetel_id))) fail('Az eszköz típusa csak eszköztípusú tétel lehet.');
    var ex = get(db, 'Eszkozok', r.eszkoz_id);
    if (!ex) checkId(r.eszkoz_id);
    r.azonosito = r.azonosito.toUpperCase();
    // Üres, vagy (offline felvételnél) közben máshol kiosztott automatikus azonosító: a következő szabad sorszám
    if (!r.azonosito) r.azonosito = ex ? ex.azonosito : nextToolCode(db);
    else if (!ex && op.autoKod && codeTaken(db, r.azonosito, r.eszkoz_id)) r.azonosito = nextToolCode(db);
    if (!/^[A-Z0-9][A-Z0-9._\-]{0,29}$/.test(r.azonosito)) fail('Az azonosító csak betű, szám és kötőjel lehet (legfeljebb 30 karakter).');
    if (codeTaken(db, r.azonosito, r.eszkoz_id)) fail('Ez az azonosító már foglalt: ' + r.azonosito);
    r.allapot = ex ? ex.allapot : 'rendben';
    r.modositva = now;
    put(db, 'Eszkozok', r, changes);
  }


  /** Rendeléshez kötött igények: a rendelési sor sorsa szerint (beérkezett / lezárva / törölve) frissül az állapot. */
  function syncIgenyek(db, sorId, now, changes) {
    var line = get(db, 'Rendeles_tetelek', sorId);
    (db.Igenyek || []).forEach(function (ig) {
      if (ig.rendeles_sor_id !== sorId || ig.statusz !== 'rendelve') return;
      if (line && !line.lezarva) return;
      var done = line && line.beerkezett > 0;
      put(db, 'Igenyek', { igeny_id: ig.igeny_id, statusz: done ? 'teljesitve' : 'folyamatban',
        rendeles_sor_id: done ? sorId : '', modositva: now }, changes);
    });
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
    checkId(o.rendeles_id);
    var raw = rowsOf(op.sorok, 'A rendelés nem tartalmaz tételt.');
    var sorok = raw.map(function (s) { return normalize('Rendeles_tetelek', s); });
    // A sorhoz kötött igények (a rendelési listára igényből került tétel): ellenőrzés még módosítás előtt
    var links = [];
    raw.forEach(function (s, i) {
      if (s.igenyek == null) return;
      if (!Array.isArray(s.igenyek) || s.igenyek.length > 100) fail('Hibás igény-hivatkozás.');
      s.igenyek.forEach(function (id) {
        var ig = get(db, 'Igenyek', String(id));
        if (!ig) fail('Ismeretlen igény.');
        if (ig.statusz === 'teljesitve' || ig.statusz === 'elutasitva') fail('Lezárt igény nem rendelhető meg: ' + ig.megnevezes);
        if (ig.statusz === 'rendelve') fail('Ez az igény már meg van rendelve: ' + ig.megnevezes);
        links.push({ ig: ig, sor: sorok[i] });
      });
    });
    if (o.beszallito_id && !get(db, 'Beszallitok', o.beszallito_id)) fail('Ismeretlen beszállító.');
    var sorIds = {};
    sorok.forEach(function (s) {
      if (!s.sor_id) fail('Hiányzó rendelési sor azonosító.');
      checkId(s.sor_id);
      if (s.mennyiseg > MAX_QTY) fail('Túl nagy mennyiség.');
      // Ütköző azonosító ne írhasson felül egy másik rendeléshez tartozó sort
      if (get(db, 'Rendeles_tetelek', s.sor_id) || sorIds[s.sor_id]) fail('Ismétlődő rendelési sor azonosító.');
      sorIds[s.sor_id] = 1;
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
    links.forEach(function (l) {
      put(db, 'Igenyek', { igeny_id: l.ig.igeny_id, statusz: 'rendelve', rendeles_sor_id: l.sor.sor_id, tetel_id: l.sor.tetel_id,
        kezelte: user.email, modositva: now }, changes);
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
      syncIgenyek(db, s.sor_id, now, changes);
      return;
    }
    put(db, 'Rendelesek', { rendeles_id: o.rendeles_id, lezarva: true, modositva: now }, changes);
    (db.Rendeles_tetelek || []).forEach(function (s) {
      if (s.rendeles_id !== o.rendeles_id) return;
      if (!s.lezarva) put(db, 'Rendeles_tetelek', { sor_id: s.sor_id, lezarva: true }, changes);
      syncIgenyek(db, s.sor_id, now, changes);
    });
  }

  /** Téves / feleslegessé vált rendelés törlése – csak ha még semmi nem érkezett belőle. */
  function opRendelesTorles(db, op, user, changes, now) {
    need(user, 'raktaros');
    var o = get(db, 'Rendelesek', op.rendeles_id);
    if (!o) return; // már törölve
    var lines = (db.Rendeles_tetelek || []).filter(function (s) { return s.rendeles_id === o.rendeles_id; });
    var ids = {};
    lines.forEach(function (s) { ids[s.sor_id] = 1; });
    var received = (db.Mozgasok || []).some(function (m) { return m.rendeles_sor_id && ids[m.rendeles_sor_id]; });
    if (received) fail('Ebből a rendelésből már érkezett áru, ezért nem törölhető – csak lezárható.');
    lines.forEach(function (s) { remove(db, 'Rendeles_tetelek', s.sor_id, changes); syncIgenyek(db, s.sor_id, now, changes); });
    remove(db, 'Rendelesek', o.rendeles_id, changes);
  }

  function opMentes(db, op, user, now, changes) {
    need(user, 'admin');
    var table = op.table;
    if (!own(EDITABLE, table)) fail('Ez a tábla nem szerkeszthető.');
    var r = normalize(table, op.row);
    var k = SCHEMA[table].key;
    if (!r[k]) fail('Hiányzó azonosító.');
    if (table !== 'Felhasznalok' && !get(db, table, r[k])) checkId(r[k]); // új rekord (a felhasználó kulcsa az e-mail-cím)
    if (table === 'Tetelek') {
      if (!r.megnevezes) fail('A megnevezés kötelező.');
      if (r.keszletezes !== '' && r.keszletezes !== 'anyag' && r.keszletezes !== 'eszkoz') fail('Érvénytelen készletezési mód.');
      if (!isToolItem(r) && (db.Eszkozok || []).some(function (e) { return e.tetel_id === r.tetel_id; })) {
        fail('Ehhez a tételhez eszközök tartoznak, ezért eszköztípus marad.');
      }
      if (r.min_keszlet < 0 || r.cel_keszlet < 0) fail('A készletszint nem lehet negatív.');
      if (r.cel_keszlet && r.cel_keszlet < r.min_keszlet) fail('A célkészlet nem lehet kisebb a minimumnál.');
    } else if (table === 'Beszallitok') {
      if (!r.nev) fail('A beszállító neve kötelező.');
      if (r.rendeles_mod && r.rendeles_mod !== 'webshop' && r.rendeles_mod !== 'email') fail('Érvénytelen rendelési mód.');
    } else if (table === 'Forrasok') {
      if (!get(db, 'Tetelek', r.tetel_id)) fail('Ismeretlen tétel.');
      if (!get(db, 'Beszallitok', r.beszallito_id)) fail('Válassz beszállítót.');
      if (r.kiszereles <= 0) r.kiszereles = 1;
    } else if (table === 'Email_sablonok') {
      if (!r.nev) fail('A sablon neve kötelező.');
      if (r.tipus !== 'rendeles' && r.tipus !== 'ajanlat') fail('Érvénytelen sablontípus.');
      if (!r.szoveg) fail('A sablon szövege nem lehet üres.');
    } else if (table === 'Listak') {
      if (!own(LIST_TYPES, r.tipus)) fail('Ismeretlen lista típus.');
      if (!r.ertek) fail('Az érték nem lehet üres.');
      var dupL = (db.Listak || []).some(function (x) {
        return x.tipus === r.tipus && x.lista_id !== r.lista_id && String(x.ertek).toLowerCase() === r.ertek.toLowerCase();
      });
      if (dupL) fail('Ez az érték már szerepel a listában: ' + r.ertek);
    } else if (table === 'Felhasznalok') {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) fail('Érvénytelen e-mail-cím.');
      if (!own(ROLES, r.szerepkor)) fail('Érvénytelen szerepkör.');
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
    checkId(t.tetel_id);
    if (!t.megnevezes) fail('A megnevezés kötelező.');
    if (t.keszletezes !== '' && t.keszletezes !== 'anyag' && t.keszletezes !== 'eszkoz') fail('Érvénytelen készletezési mód.');
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
      checkId(f.forras_id);
      if (get(db, 'Forrasok', f.forras_id)) fail('Ismétlődő forrás azonosító.'); // más tétel forrását ne írja felül
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
    if (!ex) checkId(s.sablon_id);
    s.letrehozta = ex ? ex.letrehozta : user.email;
    s.modositva = now;
    put(db, 'Leltar_sablonok', s, changes);
  }

  function opTorles(db, op, user, changes) {
    need(user, 'admin');
    if (!own(DELETABLE, op.table)) fail('Ebből a táblából nem lehet törölni (használd az „aktív” jelölőt).');
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
    sortedMoves(db).forEach(function (m) {
      var s = res[m.tetel_id];
      if (!s || m.eszkoz_id) return; // eszközsor: nem mennyiségi mozgás
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
    // Eszköztípus: a készlet a hozzá tartozó (nem selejtezett, nem elveszett) egyedi darabok száma – a mozgások nem számítanak
    var units = {};
    (db.Eszkozok || []).forEach(function (e) {
      if (!e.tetel_id || e.allapot === 'selejtezve' || e.allapot === 'elveszett') return;
      units[e.tetel_id] = (units[e.tetel_id] || 0) + 1;
    });
    (db.Tetelek || []).forEach(function (t) {
      if (!isToolItem(t)) return;
      var s = res[t.tetel_id];
      s.eszkoz = true; s.keszlet = units[t.tetel_id] || 0; s.leltarDatum = ''; s.leltarErtek = null; s.elteres = null;
    });
    (db.Rendeles_tetelek || []).forEach(function (l) {
      if (l.lezarva || !res[l.tetel_id]) return;
      res[l.tetel_id].uton = round3(res[l.tetel_id].uton + Math.max(0, toNum(l.mennyiseg) - toNum(l.beerkezett)));
    });
    var DAY = 86400000;
    // Források tételenként egy menetben (tételenkénti szűrés helyett – sok tételnél ez a lassú rész)
    var srcBy = {};
    (db.Forrasok || []).forEach(function (f) { (srcBy[f.tetel_id] = srcBy[f.tetel_id] || []).push(f); });
    (db.Tetelek || []).forEach(function (t) {
      var s = res[t.tetel_id];
      var min = toNum(t.min_keszlet), cel = toNum(t.cel_keszlet), ciklus = toNum(t.leltar_ciklus_nap);
      s.napjaLeltar = s.leltarDatum ? Math.floor((nowMs - Date.parse(s.leltarDatum)) / DAY) : null;
      s.esedekes = !!t.aktiv && !s.eszkoz && ciklus > 0 && (s.napjaLeltar === null || s.napjaLeltar >= ciklus);
      if (min > 0 && s.keszlet <= min) s.statusz = 'hiany';
      else if (min > 0 && s.keszlet <= min + Math.max(1, (cel - min) * 0.25)) s.statusz = 'figyelem';
      else s.statusz = 'ok';
      var src = (srcBy[t.tetel_id] || []).slice().sort(function (a, b) { return (b.elsodleges ? 1 : 0) - (a.elsodleges ? 1 : 0); });
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
   * Felhasználás: a rögzített kivétek + a leltárkori hiány (a nem rögzített kivét a leltárnál derül ki).
   * Tételenként: fogyas (az időszakban), tobblet (leltárkor több volt, mint a nyilvántartott),
   * napi átlag (az első és utolsó mérés közötti időszakra vetítve).
   */
  function usageStats(db, fromIso) {
    var DAY = 86400000, res = {}, run = {}, lastInv = {};
    sortedMoves(db).forEach(function (m) {
      if (m.eszkoz_id) return; // eszközsor: nem fogyás
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

  /**
   * Leltárak (bizonylatonként) és egy leltár részletei.
   * A „nyilvántartott” érték a mozgásnapló visszajátszásából jön: mennyi volt a gép szerint a leltár pillanatában.
   */
  function sortedMoves(db) {
    return (db.Mozgasok || []).slice().sort(function (a, b) {
      if (a.datum !== b.datum) return a.datum < b.datum ? -1 : 1;
      return a.rogzitve < b.rogzitve ? -1 : a.rogzitve > b.rogzitve ? 1 : 0;
    });
  }
  // Leltármozgás megjegyzése: utólagos leltárnál az elején a jelölés, utána (' – ' után) a tételhez írt megjegyzés
  var UTOLAG = 'Utólag rögzített leltár';
  function inventoryNote(utolag, note) { return [utolag ? UTOLAG : '', String(note || '').trim()].filter(Boolean).join(' – '); }
  function parseInventoryNote(s) {
    s = String(s || '');
    var u = s.indexOf(UTOLAG) === 0;
    return { utolag: u, note: u ? s.slice(UTOLAG.length).replace(/^\s*–\s*/, '') : s };
  }
  function inventorySessions(db) {
    var map = {}, cur = {}, seen = {};
    // Egy végigjátszás: leltáronként a tételszám és az eltérő tételek száma
    sortedMoves(db).forEach(function (m) {
      var id = m.tetel_id, q = toNum(m.mennyiseg), c = cur[id] || 0;
      if (m.tipus === 'LELTAR') {
        var k = m.bizonylat || '(bizonylat nélkül)';
        var s = map[k] = map[k] || { bizonylat: k, n: 0, elteres: 0, tol: m.datum, ig: m.datum, rogzitve: m.rogzitve, kik: {}, utolag: false };
        s.n++;
        if (seen[id] && round3(q - c) !== 0) s.elteres++;
        if (m.datum < s.tol) s.tol = m.datum;
        if (m.datum > s.ig) s.ig = m.datum;
        if (m.rogzitve > s.rogzitve) s.rogzitve = m.rogzitve;
        if (parseInventoryNote(m.megjegyzes).utolag) s.utolag = true;
        s.kik[m.felhasznalo] = 1;
        cur[id] = q;
      } else if (m.tipus === 'BEERKEZES' || m.tipus === 'KORREKCIO') cur[id] = c + q;
      else if (m.tipus === 'KIVET') cur[id] = c - q;
      seen[id] = 1;
    });
    return Object.keys(map).map(function (k) { var s = map[k]; s.kik = Object.keys(s.kik); return s; })
      .sort(function (a, b) { return a.ig < b.ig ? 1 : -1; });
  }
  function inventoryDetails(db, bizonylat) {
    var cur = {}, seen = {}, rows = [];
    sortedMoves(db).forEach(function (m) {
      var id = m.tetel_id, q = toNum(m.mennyiseg), c = cur[id] || 0;
      if (m.tipus === 'LELTAR') {
        if ((m.bizonylat || '(bizonylat nélkül)') === bizonylat) {
          var n = parseInventoryNote(m.megjegyzes);
          rows.push({ tetel_id: id, datum: m.datum, felhasznalo: m.felhasznalo, rogzitve: m.rogzitve, utolag: n.utolag, megjegyzes: n.note,
            mennyiseg: q, elotte: seen[id] ? round3(c) : null, elteres: seen[id] ? round3(q - c) : null });
        }
        cur[id] = q;
      } else if (m.tipus === 'BEERKEZES' || m.tipus === 'KORREKCIO') cur[id] = c + q;
      else if (m.tipus === 'KIVET') cur[id] = c - q;
      seen[id] = 1;
    });
    return rows;
  }

  /**
   * Kiadások bizonylatonként (egy kiadás = egy alkalommal elvitt anyag és / vagy eszköz), a legújabb elöl.
   * { bizonylat, datum, atvevo, munka, megjegyzes, felhasznalo, rogzitve, sorok: [mozgás, …] } – anyag: KIVET, eszköz: KIADAS
   */
  function withdrawals(db) {
    var map = {};
    (db.Mozgasok || []).forEach(function (m) {
      if (m.tipus !== 'KIVET' && m.tipus !== 'KIADAS') return;
      var k = m.bizonylat || m.mozgas_id;
      var w = map[k] = map[k] || { bizonylat: k, datum: m.datum, atvevo: m.atvevo, munka: m.munka, megjegyzes: m.megjegyzes,
        felhasznalo: m.felhasznalo, rogzitve: m.rogzitve, sorok: [] };
      w.sorok.push(m);
      if (m.datum > w.datum) w.datum = m.datum;
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return a.datum < b.datum ? 1 : -1; });
  }

  /* ---------- E-mail sablonok ---------- */
  var EMAIL_TYPES = { rendeles: 'Megrendelés', ajanlat: 'Ajánlatkérés' };
  var EMAIL_FIELDS = {
    beszallito: 'a beszállító neve', kapcsolattarto: 'a kapcsolattartó teljes neve (ha nincs: „Partnerünk”)',
    keresztnev: 'a kapcsolattartó keresztneve (tegezéshez)', tetelek: 'a tétellista, soronként egy tétel',
    rendelesszam: 'a rendelés azonosítója', belso_azon: 'a rendelés belső azonosítója (pl. MiniCRM)', datum: 'a mai dátum', felado: 'a bejelentkezett felhasználó neve',
    felado_email: 'a bejelentkezett felhasználó e-mail-címe'
  };
  /** Beépített alapsablonok – akkor is használhatók, ha még nincs saját sablon a táblában. */
  var DEFAULT_EMAIL_TEMPLATES = [
    { sablon_id: 'E-HIVATALOS', nev: 'Megrendelés – hivatalos', tipus: 'rendeles', targy: 'Megrendelés – {rendelesszam}',
      szoveg: 'Tisztelt {kapcsolattarto}!\n\nAz alábbi tételeket szeretnénk megrendelni:\n\n{tetelek}\n\nRendelésszámunk: {rendelesszam}\n' +
        'Kérjük, visszaigazolásukban jelezzék a várható szállítási időt.\n\nKöszönjük!\n\nÜdvözlettel:\n{felado}' },
    { sablon_id: 'E-TEGEZO', nev: 'Megrendelés – tegező', tipus: 'rendeles', targy: 'Rendelés – {rendelesszam}',
      szoveg: 'Szia {keresztnev}!\n\nKérlek, küldjétek az alábbiakat:\n\n{tetelek}\n\nRendelésszám: {rendelesszam}\n\nKöszi!\n{felado}' },
    { sablon_id: 'E-AJANLAT', nev: 'Ajánlatkérés', tipus: 'ajanlat', targy: 'Ajánlatkérés – {datum}',
      szoveg: 'Tisztelt {kapcsolattarto}!\n\nAz alábbi tételekre szeretnénk árajánlatot kérni:\n\n{tetelek}\n\n' +
        'Kérjük, ajánlatukban tüntessék fel az egységárakat és a szállítási határidőt.\n\nKöszönjük!\n\nÜdvözlettel:\n{felado}' }
  ];
  /** A használható sablonok: a táblában lévők, vagy ha ott nincs egy sem, a beépítettek. */
  function emailTemplates(db) {
    var own = (db.Email_sablonok || []).filter(function (s) { return s.nev && s.szoveg; });
    return own.length ? own : DEFAULT_EMAIL_TEMPLATES;
  }
  /** Tétellista e-mailhez: soronként egy tétel – bármilyen betűtípussal olvasható marad. */
  function emailItemList(lines) {
    return lines.map(function (l, i) {
      return (i + 1) + '. ' + l.megnevezes + ' — ' + l.qText + (l.cikkszam ? ' (cikkszám: ' + l.cikkszam + ')' : '');
    }).join('\n');
  }
  /** Sablon kitöltése: {mezo} → érték. Az ismeretlen mezők változatlanok maradnak. */
  function fillTemplate(text, vals) {
    return String(text || '').replace(/\{([a-z_]+)\}/g, function (m, k) { return vals[k] != null ? vals[k] : m; });
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
    // E-mail sablonok (a beépítettek másolata); az e-mailes beszállítóval tegeződünk
    db.Email_sablonok = DEFAULT_EMAIL_TEMPLATES.map(function (s) {
      return { sablon_id: s.sablon_id, nev: s.nev, tipus: s.tipus, targy: s.targy, szoveg: s.szoveg, modositva: nowIso };
    });
    db.Beszallitok.forEach(function (b) { b.email_sablon = b.beszallito_id === 'B05' ? 'E-TEGEZO' : 'E-HIVATALOS'; });
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
    // Minta igények (szerszám, anyag) különböző állapotban
    var ago = function (d) { return new Date(nowMs - d * DAY).toISOString(); };
    var igeny = function (id, d, who, nev, leiras, q, me, extra) {
      var r = { igeny_id: id, datum: ago(d), igenylo: who, megnevezes: nev, leiras: leiras, mennyiseg: q, mertekegyseg: me,
        link: '', surgos: false, hatarido: '', statusz: 'uj', tetel_id: '', rendeles_sor_id: '', valasz: '', kezelte: '', modositva: ago(d) };
      for (var k in extra) r[k] = extra[k];
      db.Igenyek.push(r);
    };
    db.Igenyek = [];
    igeny('I-DEMO01', 1, 'szerelo@pelda.hu', 'Akkus ütvecsavarozó 18 V', 'A régi tokmánya kotyog, csere kellene.', 1, 'db',
      { surgos: true, hatarido: ago(-7) });
    igeny('I-DEMO02', 3, 'szerelo@pelda.hu', 'SDS-plus fúrószár 8×160', 'Betonba, tartaléknak.', 5, 'db', {});
    igeny('I-DEMO03', 6, 'raktar@pelda.hu', 'Lézeres szintező', 'Nagyobb homlokzatokhoz, keresztvonalas.', 1, 'db',
      { statusz: 'folyamatban', kezelte: 'admin@pelda.hu', valasz: 'Ajánlatot kértem két helyről.' });
    igeny('I-DEMO04', 12, 'szerelo@pelda.hu', 'Létra 3×9 fokos', 'A meglévő sérült.', 1, 'db',
      { statusz: 'elutasitva', kezelte: 'admin@pelda.hu', valasz: 'A raktárban van egy tartalék, azt vidd el.' });
    // Minta eszközök: kiadva, szervizben, lejárt felülvizsgálattal
    db.Eszkozok = []; db.Alairasok = [];
    [['SZ-0001', 'Akkus fúró-csavarozó 18 V', 'Elektromos kéziszerszám', 'Makita', 'DDF484', 365, 300],
      ['SZ-0002', 'Ütvefúró SDS-plus', 'Elektromos kéziszerszám', 'Bosch', 'GBH 2-26', 365, 280],
      ['SZ-0003', 'Lézeres szintező', 'Mérőeszköz', 'Bosch', 'GLL 3-80', 0, 260],
      ['SZ-0004', 'Alumínium létra 3×9 fokos', 'Létra, állvány', 'Krause', '', 365, 240],
      ['SZ-0005', 'Sarokcsiszoló 125 mm', 'Elektromos kéziszerszám', 'Makita', 'GA5030', 365, 200],
      ['SZ-0006', 'Akkus ütvecsavarozó 18 V', 'Elektromos kéziszerszám', 'Makita', 'DTD153', 365, 400]
    ].forEach(function (t, i) {
      // Eszköztípus a cikktörzsben (Tetelek, keszletezes = eszkoz); az akkus fúróból legalább 2 kell (rendelési javaslat)
      var tid = 'T-ESZ' + (i + 1);
      db.Tetelek.push({ tetel_id: tid, megnevezes: t[1], kategoria: t[2], mertekegyseg: 'db', polc: i < 3 ? 'SZ1' : 'SZ2',
        min_keszlet: i === 0 ? 2 : 0, cel_keszlet: i === 0 ? 3 : 0, leltar_ciklus_nap: 0, aktiv: true, megjegyzes: '', modositva: nowIso,
        raktar: 'Központi raktár', keszletezes: 'eszkoz' });
      if (i === 0) db.Forrasok.push({ forras_id: 'F-ESZ1', tetel_id: tid, beszallito_id: 'B06', cikkszam: 'SZ-DDF484Z', kiszereles: 1,
        egysegar: 42990, link: '', elsodleges: true, megjegyzes: '', modositva: nowIso });
      db.Eszkozok.push({ eszkoz_id: 'E-DEMO0' + (i + 1), azonosito: t[0], megnevezes: t[1], kategoria: t[2], gyarto: t[3], tipus: t[4],
        gyari_szam: 'SN' + irand(100000, 999999), beszerzes_datum: ago(t[6]), felulvizsgalat_nap: t[5], allapot: 'rendben',
        tetel_id: tid, megjegyzes: '', modositva: nowIso, raktar: 'Központi raktár', polc: i < 3 ? 'SZ1' : 'SZ2' });
    });
    // Eszközmozgások a közös mozgásnaplóban (atvevo: kinek / melyik szerviz)
    var tev = function (id, eszk, d, tipus, kinel, extra) {
      var e = db.Eszkozok.filter(function (x) { return x.eszkoz_id === eszk; })[0];
      var r = { mozgas_id: id, datum: ago(d), tipus: tipus, tetel_id: e ? e.tetel_id : '', mennyiseg: 0, bizonylat: '', rendeles_sor_id: '',
        felhasznalo: 'raktar@pelda.hu', rogzitve: ago(d), megjegyzes: '', atvevo: kinel, munka: '', eszkoz_id: eszk, allapot: '' };
      for (var k in extra) r[k] = extra[k];
      db.Mozgasok.push(r);
    };
    tev('EV-DEMO1', 'E-DEMO01', 40, 'FELULVIZSGALAT', '', { megjegyzes: 'Érintésvédelmi felülvizsgálat: megfelelt.' });
    tev('EV-DEMO2', 'E-DEMO01', 20, 'KIADAS', 'szerelo@pelda.hu', { bizonylat: 'AT-DEMO-1' });
    tev('EV-DEMO3', 'E-DEMO02', 20, 'KIADAS', 'szerelo@pelda.hu', { bizonylat: 'AT-DEMO-1' });
    tev('EV-DEMO4', 'E-DEMO04', 10, 'KIADAS', 'Kovács Péter (alvállalkozó)', { bizonylat: 'AT-DEMO-2' });
    tev('EV-DEMO5', 'E-DEMO05', 5, 'SZERVIZ', 'Makita szerviz', { allapot: 'szervizben', megjegyzes: 'Szénkefe csere' });
    db.Eszkozok[4].allapot = 'szervizben';
    return db;
  }

  return {
    ROLES: ROLES, ROLE_LABELS: ROLE_LABELS, MOVE_TYPES: MOVE_TYPES, IGENY_STATUS: IGENY_STATUS,
    TOOL_STATE: TOOL_STATE, TOOL_EVENTS: TOOL_EVENTS, SIDE_TABLES: SIDE_TABLES, toolStates: toolStates, nextToolCode: nextToolCode, isToolItem: isToolItem, signaturesFor: signaturesFor, sealPayload: sealPayload, sealVersion: sealVersion, moveLabel: moveLabel, SCHEMA: SCHEMA, TABLES: TABLES, BACKDATE_DAYS: BACKDATE_DAYS,
    normalize: normalize, round3: round3,
    newId: newId, get: get, exportDb: exportDb, cloneDb: cloneDb,
    can: can, PERMS: PERMS, filterSnapshot: filterSnapshot, applyOp: applyOp, computeStock: computeStock, orderInfo: orderInfo,
    sourcesFor: sourcesFor, roundPack: roundPack, generateDemoData: generateDemoData,
    orderMode: orderMode, productUrl: productUrl, usageStats: usageStats,
    LIST_TYPES: LIST_TYPES, LIST_FIELD: LIST_FIELD, listValues: listValues,
    inventorySessions: inventorySessions, inventoryDetails: inventoryDetails, inventoryNote: inventoryNote, withdrawals: withdrawals,
    EMAIL_TYPES: EMAIL_TYPES, EMAIL_FIELDS: EMAIL_FIELDS, DEFAULT_EMAIL_TEMPLATES: DEFAULT_EMAIL_TEMPLATES,
    emailTemplates: emailTemplates, emailItemList: emailItemList, fillTemplate: fillTemplate
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RaktarLogic;
if (typeof window !== 'undefined') window.RaktarLogic = RaktarLogic;
