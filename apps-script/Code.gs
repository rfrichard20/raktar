/**
 * Raktár – Google Apps Script backend.
 * A Google Sheethez kötött scriptként fut (Bővítmények → Apps Script).
 * A Logic.gs fájl a web/js/logic.js pontos másolata.
 *
 * Telepítés: lásd README.md.
 */

// A Google Cloud Console-ban létrehozott OAuth kliens azonosító (Web application típus).
// Nem titkos adat; a webes app config.js-ében is ugyanez szerepel.
var GOOGLE_CLIENT_ID = '';

var SESSION_DAYS = 30;
var MAX_OPS_PER_REQUEST = 200;       // egy szinkronban legfeljebb ennyi művelet
var MAX_REQUEST_BYTES = 2 * 1024 * 1024;

/* ===================== Menü a Sheetben ===================== */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Raktár')
    .addItem('Táblák létrehozása / ellenőrzése', 'setup')
    .addItem('Készlet lap frissítése', 'buildKeszletSheet')
    .addItem('Tömeges import előkészítése', 'importPrepareConfirm')
    .addSeparator()
    .addItem('Mindenki kijelentkeztetése', 'logoutEveryoneConfirm')
    .addSeparator()
    .addItem('Demo adatok betöltése (TÖRLI az adatokat!)', 'seedDemoDataConfirm')
    .addToUi();
}

/**
 * Minden kiadott munkamenet érvénytelenítése (a titkos kulcs cseréjével).
 * Pl. elveszett telefon esetén. Mindenkinek újra be kell jelentkeznie; a fel nem töltött adatok megmaradnak.
 */
function logoutEveryoneConfirm() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.alert('Mindenki kijelentkeztetése', 'Minden felhasználónak újra be kell jelentkeznie (a készülékeken lévő, még fel nem töltött adatok megmaradnak). Folytatod?', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  PropertiesService.getScriptProperties().setProperty('SESSION_SECRET', Utilities.getUuid() + Utilities.getUuid());
  ui.alert('Kész. Minden munkamenet érvénytelen.');
}

/* ===================== Web App belépési pontok ===================== */
function doGet() {
  return json({ ok: true, app: 'raktar', time: new Date().toISOString() });
}

function doPost(e) {
  var req;
  try {
    if (!e || !e.postData || e.postData.contents.length > MAX_REQUEST_BYTES) throw new Error('size');
    req = JSON.parse(e.postData.contents);
    if (!req || typeof req !== 'object') throw new Error('type');
  } catch (x) {
    return json({ ok: false, error: 'Hibás kérés.' });
  }
  try {
    // A hitelesítő mezők csak szövegek lehetnek (objektum / tömb nem)
    if (req.token != null && typeof req.token !== 'string') throw authError('Érvénytelen munkamenet.');
    if (req.action === 'login') return json(login(req.idToken));
    // Időmérés (ms) a válaszban: az app Fiók oldala mutatja, hol megy el az idő (timing)
    var sw = stopwatch();
    // Előbb a munkamenet aláírása és lejárata (táblázatolvasás nélkül); a felhasználó aktív voltát az
    // amúgy is beolvasott Felhasznalok lapból ellenőrizzük (nem olvassuk be kétszer).
    var email = tokenEmail(req.token);
    if (req.action === 'adatok') {
      // Ha a készülék adata még aktuális, nem olvassuk be és küldjük le újra az egészet
      var ver = dataVersion();
      if (req.version && req.version === ver) {
        var same = activeUser(email, readTable('Felhasznalok'));
        return json({ ok: true, user: publicUser(same), unchanged: true, version: ver, timing: sw.done() });
      }
      var db = readAll();
      sw.lap('read');
      var user = activeUser(email, db.Felhasznalok);
      return json({ ok: true, user: publicUser(user), data: snapshot(db, user), version: ver, timing: sw.done() });
    }
    if (req.action === 'szinkron') {
      var ops = Array.isArray(req.ops) ? req.ops : [];
      if (ops.length > MAX_OPS_PER_REQUEST) return json({ ok: false, error: 'Túl sok művelet egy kérésben.' });
      return json(sync(email, ops, sw));
    }
    if (req.action === 'alairas') {
      // Egy átadás aláírása (a teljes adattal nem jön le, mert nagy): csak akinek joga van, vagy akinek / akitől átadták
      var adb = { Felhasznalok: readTable('Felhasznalok'), Mozgasok: readTable('Mozgasok') };
      var auser = activeUser(email, adb.Felhasznalok);
      // Hitelesség: a tárolt lenyomat egyezik-e a mostani adatokból számolttal (null: régi, lenyomat nélküli aláírás)
      var sigRows = readTable('Alairasok').filter(function (s) { return s.bizonylat === String(req.bizonylat || ''); });
      sigRows.forEach(function (s) {
        s.hiteles = s.pecset ? safeEqual(sealOf(s, adb.Mozgasok, RaktarLogic.sealVersion(s.pecset)), s.pecset) : null;
      });
      return json({ ok: true, alairasok: RaktarLogic.signaturesFor(adb, sigRows, auser, String(req.bizonylat || '')) });
    }
    return json({ ok: false, error: 'Ismeretlen művelet.' });
  } catch (err) {
    // Csak a szándékosan a felhasználónak szánt üzenet megy ki (bejelentkezés, ismert állapotok); a nem várt
    // hiba részlete a szerver naplójába kerül (Apps Script → Végrehajtások), a válaszba nem.
    if (err && (err.auth || err.pub)) return json({ ok: false, error: err.message, auth: !!err.auth });
    console.error('Raktár – váratlan hiba (' + req.action + '): ' + (err && err.stack || err));
    return json({ ok: false, error: 'Szerverhiba – próbáld újra később.' });
  }
}

/** A felhasználónak megmutatható (nem bejelentkezési) hiba. */
function publicError(msg) { var e = new Error(msg); e.pub = true; return e; }

/* ===================== Adatverzió ===================== */
// Minden adatváltozáskor új értéket kap; a készülék ez alapján tudja, kell-e újra letöltenie az adatokat.
function dataVersion() {
  var props = PropertiesService.getScriptProperties();
  return props.getProperty('DATA_VERSION') || bumpVersion();
}
function bumpVersion() {
  var v = String(Date.now());
  PropertiesService.getScriptProperties().setProperty('DATA_VERSION', v);
  return v;
}
/** A Sheetben kézzel végzett módosítás is új verzió (egyszerű trigger, külön beállítás nem kell). */
function onEdit() { bumpVersion(); }

/**
 * Egyszerű stopper a szerver lépéseinek méréséhez: lap('név') az előző lap óta eltelt ms-ot jegyzi fel,
 * done() a teljes idővel együtt adja vissza: { auth, lock, read, apply, write, total } (ami az adott kérésben volt).
 */
function stopwatch() {
  var start = Date.now(), last = start, out = {};
  return {
    lap: function (name) { var now = Date.now(); out[name] = now - last; last = now; },
    done: function () { out.total = Date.now() - start; return out; }
  };
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ===================== Bejelentkezés ===================== */
function authError(msg) { var e = new Error(msg); e.auth = true; return e; }

function secret() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('SESSION_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('SESSION_SECRET', s);
  }
  return s;
}

function sign(payload) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secret()));
}

/*
 * Aláírások lenyomata (pecsét): HMAC-SHA256 az aláírásról és az átadás adatairól (RaktarLogic.sealPayload), egy csak
 * a szkriptben tárolt kulccsal. A Sheetet szerkesztő ember a kulcsot nem ismeri, így ha az aláírást vagy az átadás
 * adatait átírja, a lenyomat nem fog egyezni (az elismervényen „módosítva” jelzés). Külön kulcs, mint a munkameneté:
 * a munkamenetek érvénytelenítése (új SESSION_SECRET) nem teszi érvénytelenné a régi aláírásokat.
 */
function sealSecret() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('SEAL_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('SEAL_SECRET', s); }
  return s;
}
/** Lenyomat a megadott változattal (v1: régi, csak eszközsorok; v2: a bizonylat minden sora). */
function sealOf(sig, moves, ver) {
  var h = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(RaktarLogic.sealPayload(sig, moves, ver), sealSecret()));
  return ver === 'v2' ? 'v2.' + h : h;
}
/** A most rögzített aláírások lepecsételése (írás előtt) – mindig az új (v2) változattal. */
function sealSignatures(changes, db) {
  changes.forEach(function (c) {
    if (c.table === 'Alairasok' && !c.deleted) c.row.pecset = sealOf(c.row, db.Mozgasok, 'v2');
  });
}

function login(idToken) {
  if (!GOOGLE_CLIENT_ID) throw authError('A szerveren nincs beállítva a GOOGLE_CLIENT_ID.');
  if (!idToken) throw authError('Hiányzó Google token.');
  // Előszűrés helyben: a nyilvánvalóan hamis token nem terheli a Google-ellenőrzés kvótáját, és nem számít a
  // percenkénti korlátba (így szeméttel nem lehet kizárni a valódi bejelentkezőket). A valódi ellenőrzést
  // (aláírás) ezután is a Google végzi.
  if (!plausibleIdToken(idToken)) throw authError('Érvénytelen Google-bejelentkezés.');
  throttleLogin();
  var resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) throw authError('Érvénytelen Google-bejelentkezés.');
  var info = JSON.parse(resp.getContentText());
  if (info.aud !== GOOGLE_CLIENT_ID) throw authError('A token nem ehhez az alkalmazáshoz tartozik.');
  if (info.iss !== 'accounts.google.com' && info.iss !== 'https://accounts.google.com') throw authError('Érvénytelen token kiadó.');
  if (Number(info.exp) * 1000 < Date.now()) throw authError('A Google-bejelentkezés lejárt, próbáld újra.');
  if (String(info.email_verified) !== 'true') throw authError('Az e-mail-cím nincs megerősítve.');
  var email = String(info.email).toLowerCase();
  var u = findUser(email);
  if (!u || !u.aktiv) throw authError('Ehhez a fiókhoz (' + email + ') nincs hozzáférés. Kérd meg az admint, hogy vegyen fel.');
  var payload = email + '|' + (Date.now() + SESSION_DAYS * 86400000);
  var token = Utilities.base64EncodeWebSafe(payload, Utilities.Charset.UTF_8) + '.' + sign(payload);
  return { ok: true, token: token, user: publicUser(u) };
}

/**
 * A Google ID token (JWT) formai ellenőrzése az aláírás vizsgálata nélkül: három rész, olvasható tartalom,
 * ehhez az alkalmazáshoz szól (aud), Google adta ki (iss), és nem járt le. Ez NEM hitelesítés, csak előszűrő.
 */
function plausibleIdToken(idToken) {
  if (typeof idToken !== 'string' || idToken.length > 4096) return false;
  var parts = idToken.split('.');
  if (parts.length !== 3 || !parts[2]) return false;
  var c;
  try {
    var body = parts[1];
    while (body.length % 4) body += '='; // a JWT kitöltő karakter nélküli base64
    c = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(body)).getDataAsString('UTF-8'));
  } catch (x) {
    return true; // nem tudtuk kiolvasni: döntsön a Google (inkább menjen tovább, mint hogy valódi belépést utasítsunk el)
  }
  return !!c && c.aud === GOOGLE_CLIENT_ID &&
    (c.iss === 'accounts.google.com' || c.iss === 'https://accounts.google.com') &&
    Number(c.exp) * 1000 > Date.now();
}

/**
 * Bejelentkezési kísérletek korlátozása (percenként összesen LOGIN_PER_MINUTE).
 * Védi a napi Google-ellenőrzési (UrlFetch) kvótát a tömeges hamis bejelentkezési próbák ellen;
 * a már bejelentkezett felhasználókat nem érinti.
 */
var LOGIN_PER_MINUTE = 30;
function throttleLogin() {
  var cache = CacheService.getScriptCache();
  var key = 'login:' + Math.floor(Date.now() / 60000);
  var n = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(n), 120);
  if (n > LOGIN_PER_MINUTE) throw authError('Túl sok bejelentkezési kísérlet. Próbáld újra egy perc múlva.');
}

/** A munkamenet (token) ellenőrzése: érvényes aláírás és lejárat → a felhasználó e-mail-címe. */
function tokenEmail(token) {
  if (!token) throw authError('Nincs bejelentkezve.');
  var parts = String(token).split('.');
  if (parts.length !== 2) throw authError('Érvénytelen munkamenet.');
  var payload;
  try { payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString('UTF-8'); }
  catch (x) { throw authError('Érvénytelen munkamenet.'); }
  if (!safeEqual(sign(payload), parts[1])) throw authError('Érvénytelen munkamenet.');
  var p = payload.split('|');
  if (!(Number(p[1]) >= Date.now())) throw authError('A munkamenet lejárt, jelentkezz be újra.');
  return String(p[0]).toLowerCase();
}

/** A felhasználó a (már beolvasott) Felhasznalok sorai közül; hibát dob, ha nincs vagy nem aktív. */
function activeUser(email, users) {
  for (var i = 0; i < users.length; i++) if (users[i].email === email && users[i].aktiv) return users[i];
  throw authError('A hozzáférésed megszűnt.');
}

/** Időzítés-független összehasonlítás (az aláírás ne legyen karakterenként kitalálható). */
function safeEqual(a, b) {
  a = String(a); b = String(b);
  var diff = a.length ^ b.length;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i % (b.length || 1));
  return diff === 0;
}

function findUser(email) {
  var users = readTable('Felhasznalok');
  email = String(email).toLowerCase();
  for (var i = 0; i < users.length; i++) if (users[i].email === email) return users[i];
  return null;
}

function publicUser(u) { return { email: u.email, nev: u.nev, szerepkor: u.szerepkor }; }

/* ===================== Adatok ===================== */
/**
 * A felhasználónak küldött adat, jogosultság szerint szűrve (RaktarLogic.PERMS).
 * Amihez nincs joga (pl. árak, rendelések, beszállítók), az a válaszba sem kerül bele.
 */
function snapshot(db, user) {
  return RaktarLogic.filterSnapshot(db, user);
}

function sync(email, ops, sw) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw publicError('A szerver most foglalt, a feltöltés hamarosan újra próbálkozik.');
  sw.lap('lock');
  try {
    var db = readAll();
    sw.lap('read');
    var user = activeUser(email, db.Felhasznalok);
    var now = new Date().toISOString();
    var results = [], changes = [];
    ops.forEach(function (op) {
      var opId = op && typeof op === 'object' ? op.op_id : null;
      try {
        changes = changes.concat(RaktarLogic.applyOp(db, op, user, now));
        results.push({ op_id: opId, ok: true });
      } catch (err) {
        // Egy hibás (pl. sérült) művelet csak önmagát utasítsa el, ne akassza meg a készülék
        // összes többi feltöltését; a felhasználó a Fiók oldalon látja a hibaüzenetet.
        // Az ellenőrzés (validation) üzenete a felhasználónak szól; a nem várt hiba részlete csak a naplóba kerül
        if (!err.validation) console.error('Raktár – művelet feldolgozási hiba: ' + (err && err.stack || err));
        results.push({ op_id: opId, ok: false, error: err.validation ? err.message : 'Feldolgozási hiba (hibás szerkezetű művelet).' });
      }
    });
    sw.lap('apply');
    sealSignatures(changes, db);
    writeChanges(changes);
    SpreadsheetApp.flush();
    sw.lap('write');
    var ver = dataVersion(); // a writeChanges változás esetén már újat adott
    // A saját adat (név, szerepkör) a most feltöltött műveletekkel is változhatott: a friss állapotot küldjük vissza
    var me = activeUser(email, db.Felhasznalok);
    return { ok: true, results: results, user: publicUser(me), data: snapshot(db, me), version: ver, timing: sw.done() };
  } finally {
    lock.releaseLock();
  }
}

/* ===================== Sheet olvasás / írás ===================== */
// Újabb verzióban bevezetett lapok: ha még nincsenek, olvasáskor üresnek számítanak, az első íráskor létrejönnek
// (így a frissítés után a Táblák létrehozása menü futtatása nélkül is működik; a formázást az a menü teszi fel).
var OPTIONAL_SHEETS = { Igenyek: 1, Eszkozok: 1, Alairasok: 1, Cimkeivek: 1 };

function sheetOf(table, create) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(table);
  if (!sh && create && OPTIONAL_SHEETS[table]) {
    sh = ss.insertSheet(table);
    var cols = RaktarLogic.SCHEMA[table].cols.map(function (c) { return c[0]; });
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#e8eef5');
    sh.setFrozenRows(1);
  }
  if (!sh) throw publicError('Hiányzó munkalap: ' + table + ' (futtasd a Raktár → Táblák létrehozása menüt).');
  return sh;
}

/**
 * Átvezetés: a korábbi külön eszköznapló (Eszkoz_esemenyek lap) sorai a közös mozgásnaplóba (Mozgasok) kerülnek
 * (esemeny_id → mozgas_id, kinel → atvevo), a régi lap pedig „Eszkoz_esemenyek (régi)” nevet kap. Egyszer fut le,
 * az első adatolvasáskor; a már átvezetett sorokat (azonos azonosító) nem veszi fel újra. A régi aláírások lenyomata
 * ugyanazokból az értékekből számol, így ellenőrizhetők maradnak.
 */
function migrateToolEvents() {
  var ss = SpreadsheetApp.getActive();
  var old = ss.getSheetByName('Eszkoz_esemenyek');
  if (!old) return;
  var values = old.getDataRange().getValues();
  var header = values.length ? values[0].map(function (h) { return String(h).trim(); }) : [];
  var have = {};
  readTable('Mozgasok').forEach(function (m) { have[m.mozgas_id] = 1; });
  var changes = [];
  for (var i = 1; i < values.length; i++) {
    var raw = {};
    header.forEach(function (h, c) { if (h) raw[h] = values[i][c]; });
    var id = String(raw.esemeny_id || '').trim();
    if (!id || have[id]) continue;
    var row = RaktarLogic.normalize('Mozgasok', {
      mozgas_id: id, datum: raw.datum, tipus: raw.tipus, tetel_id: '', mennyiseg: 0, bizonylat: raw.bizonylat,
      felhasznalo: raw.felhasznalo, rogzitve: raw.rogzitve, megjegyzes: raw.megjegyzes, atvevo: raw.kinel,
      eszkoz_id: raw.eszkoz_id, allapot: raw.allapot });
    changes.push({ table: 'Mozgasok', row: row });
  }
  // A típus (tetel_id) az eszköz rekordjából
  if (changes.length) {
    var tools = {};
    readTable('Eszkozok').forEach(function (e) { tools[e.eszkoz_id] = e.tetel_id; });
    changes.forEach(function (c) { c.row.tetel_id = tools[c.row.eszkoz_id] || ''; });
    writeChanges(changes);
  }
  old.setName('Eszkoz_esemenyek (régi)');
}

function readAll() {
  migrateToolEvents();
  var db = {};
  RaktarLogic.TABLES.forEach(function (t) { db[t] = readTable(t); });
  return db;
}

/** A fejléc nevei alapján olvas, így a kézzel átrendezett / bővített oszlopok sem zavarnak. */
function readTable(table) {
  if (OPTIONAL_SHEETS[table] && !SpreadsheetApp.getActive().getSheetByName(table)) return [];
  var sh = sheetOf(table);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var header = values[0].map(function (h) { return String(h).trim(); });
  var key = RaktarLogic.SCHEMA[table].key;
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var raw = {};
    header.forEach(function (h, c) { if (h) raw[h] = values[i][c]; });
    var r = RaktarLogic.normalize(table, raw);
    if (!r[key]) continue;
    // Az írásnál a képlet-védelemhez tett vezető aposztrófot (ha a cellában bent maradt) levesszük
    RaktarLogic.SCHEMA[table].cols.forEach(function (c) {
      if (c[1] === 'str' && /^'[=+\-@]/.test(r[c[0]])) r[c[0]] = r[c[0]].slice(1);
    });
    r._row = i + 1;
    rows.push(r);
  }
  return rows;
}

function toCell(type, v) {
  if (type === 'date') return v ? new Date(v) : '';
  if (type === 'bool') return !!v;
  if (type === 'num') return (v === '' || v == null) ? '' : Number(v);
  var s = v == null ? '' : String(v);
  // Képlet-befecskendezés ellen: „=”, „+”, „-”, „@” kezdetű szöveg ne fusson le képletként a Sheetben
  // (a vezető aposztróf a cellában nem látszik, és visszaolvasáskor sem kerül az értékbe)
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

/** Az utolsó sor, amelyben a kulcsoszlop (pl. tetel_id) ki van töltve; 1, ha csak fejléc van. */
function lastDataRow(sh, header, table) {
  var keyCol = header.indexOf(RaktarLogic.SCHEMA[table].key) + 1;
  var last = sh.getLastRow();
  if (keyCol < 1 || last < 2) return 1;
  var vals = sh.getRange(2, keyCol, last - 1, 1).getValues();
  for (var i = vals.length - 1; i >= 0; i--) if (String(vals[i][0]).trim() !== '') return i + 2;
  return 1;
}

/**
 * A kulcs nélküli (üres) sorok törlése az adatsorok között, hogy minden adat a lap tetején,
 * folyamatosan legyen. A lap alján lévő üres sorokhoz nem nyúl.
 */
function compactSheet(sh, table) {
  var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  var last = lastDataRow(sh, header, table);
  if (last < 3) return 0;
  var keyCol = header.indexOf(RaktarLogic.SCHEMA[table].key) + 1;
  var vals = sh.getRange(2, keyCol, last - 1, 1).getValues();
  var removed = 0, i = vals.length - 1;
  // alulról felfelé, az összefüggő üres blokkokat egyben törli
  while (i >= 0) {
    if (String(vals[i][0]).trim() !== '') { i--; continue; }
    var end = i;
    while (i >= 0 && String(vals[i][0]).trim() === '') i--;
    var startRow = i + 1 + 2, count = end - i;
    sh.deleteRows(startRow, count);
    removed += count;
  }
  return removed;
}

/**
 * A munkalap fejléce; ha egy újabb verzióban bevezetett oszlop még hiányzik, a végére felveszi
 * (így egy bővítés után nem vész el adat akkor sem, ha a Táblák létrehozása menü még nem futott).
 */
function ensureColumns(sh, table) {
  var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  var missing = RaktarLogic.SCHEMA[table].cols.map(function (c) { return c[0]; })
    .filter(function (n) { return header.indexOf(n) < 0; });
  if (missing.length) {
    sh.getRange(1, header.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold').setBackground('#e8eef5');
    header = header.concat(missing);
  }
  return header;
}

function writeChanges(changes) {
  var byTable = {};
  changes.forEach(function (c) {
    var key = c.row[RaktarLogic.SCHEMA[c.table].key];
    var t = byTable[c.table] = byTable[c.table] || { order: [], map: {} };
    if (!t.map[key]) t.order.push(key);
    t.map[key] = c; // a rekord objektum maga a végső állapot
  });
  Object.keys(byTable).forEach(function (table) {
    var sh = sheetOf(table, true);
    var header = ensureColumns(sh, table);
    var types = {};
    RaktarLogic.SCHEMA[table].cols.forEach(function (c) { types[c[0]] = c[1]; });
    var inserts = [], deletes = [], updates = [];
    byTable[table].order.forEach(function (key) {
      var c = byTable[table].map[key];
      if (c.deleted) { if (c.row._row) deletes.push(c.row._row); return; }
      if (c.row._row) updates.push(c.row);
      else inserts.push(header.map(function (h) { return types[h] ? toCell(types[h], c.row[h]) : ''; }));
    });
    if (updates.length) {
      // Módosítások tömbösen: az egymás melletti sorok egy írással, és csak a séma oszlopaiba.
      // A kézzel felvett (sémán kívüli) oszlopokhoz nem nyúl – így azok értéke, képlete megmarad, és a lapot
      // sem kell előtte beolvasni. segs: a séma oszlopainak összefüggő szakaszai [első oszlop indexe, darab].
      var segs = [];
      header.forEach(function (h, i) {
        if (!types[h]) return;
        var last = segs[segs.length - 1];
        if (last && last[0] + last[1] === i) last[1]++; else segs.push([i, 1]);
      });
      updates.sort(function (a, b) { return a._row - b._row; });
      var run = [];
      var flush = function () {
        if (!run.length) return;
        segs.forEach(function (seg) {
          sh.getRange(run[0]._row, seg[0] + 1, run.length, seg[1]).setValues(run.map(function (r) {
            return header.slice(seg[0], seg[0] + seg[1]).map(function (h) { return toCell(types[h], r[h]); });
          }));
        });
        run = [];
      };
      updates.forEach(function (r) {
        if (run.length && r._row !== run[run.length - 1]._row + 1) flush();
        run.push(r);
      });
      flush();
    }
    if (inserts.length) {
      // A valódi utolsó adatsor után (a jelölőnégyzetes, de üres sorokat a getLastRow() adatnak látná)
      var start = lastDataRow(sh, header, table) + 1;
      var need = start + inserts.length - 1 - sh.getMaxRows();
      if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need);
      sh.getRange(start, 1, inserts.length, header.length).setValues(inserts);
    }
    // Törlés alulról felfelé, az egymás melletti sorok egyben
    deletes.sort(function (a, b) { return b - a; });
    for (var i = 0; i < deletes.length;) {
      var j = i;
      while (j + 1 < deletes.length && deletes[j + 1] === deletes[j] - 1) j++;
      sh.deleteRows(deletes[j], i === j ? 1 : j - i + 1);
      i = j + 1;
    }
  });
  if (changes.length) bumpVersion();
}

/* ===================== Telepítés ===================== */
var HEADER_NOTES = {
  Tetelek: 'Raktári tételek. Az „aktiv” FALSE értékkel elrejthető a tétel (törlés helyett).',
  Mozgasok: 'Mozgásnapló. LELTAR = megszámolt abszolút érték; BEERKEZES / KIVET = mennyiség; KORREKCIO = ± eltérés indoklással.',
  Rendeles_tetelek: 'A „beerkezett” oszlopot az app számolja. Kézi beérkezésnél ezt is frissítsd, és ha teljes, pipáld a „lezarva”-t.'
};

function setup() {
  var ss = SpreadsheetApp.getActive();
  RaktarLogic.TABLES.concat(RaktarLogic.SIDE_TABLES).forEach(function (table) {
    var sh = ss.getSheetByName(table) || ss.insertSheet(table);
    var cols = RaktarLogic.SCHEMA[table].cols;
    if (sh.getLastColumn() === 0) {
      sh.getRange(1, 1, 1, cols.length).setValues([cols.map(function (c) { return c[0]; })]);
    } else {
      // Meglévő lap: csak a hiányzó oszlopokat fűzi a végére
      var existing = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
      cols.forEach(function (c) {
        if (existing.indexOf(c[0]) < 0) sh.getRange(1, sh.getLastColumn() + 1).setValue(c[0]);
      });
    }
    var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, header.length).setFontWeight('bold').setBackground('#e8eef5');
    if (HEADER_NOTES[table]) sh.getRange(1, 1).setNote(HEADER_NOTES[table]);
    var maxRows = Math.max(sh.getMaxRows() - 1, 1);
    cols.forEach(function (c) {
      var col = header.indexOf(c[0]) + 1;
      var rng = sh.getRange(2, col, maxRows, 1);
      if (c[1] === 'str' || c[1] === 'long') rng.setNumberFormat('@');
      if (c[1] === 'date') rng.setNumberFormat('yyyy.mm.dd hh:mm');
      if (c[1] === 'bool') rng.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    });
    if (table === 'Mozgasok') {
      sh.getRange(2, header.indexOf('tipus') + 1, maxRows, 1).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(Object.keys(RaktarLogic.MOVE_TYPES).concat(Object.keys(RaktarLogic.TOOL_EVENTS)), true).build());
    }
    if (table === 'Eszkozok') {
      sh.getRange(2, header.indexOf('allapot') + 1, maxRows, 1).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(Object.keys(RaktarLogic.TOOL_STATE), true).build());
    }
    if (table === 'Igenyek') {
      sh.getRange(2, header.indexOf('statusz') + 1, maxRows, 1).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(Object.keys(RaktarLogic.IGENY_STATUS), true).build());
    }
    if (table === 'Felhasznalok') {
      sh.getRange(2, header.indexOf('szerepkor') + 1, maxRows, 1).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(Object.keys(RaktarLogic.ROLES), true).build());
    }
  });
  var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('Munkalap1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);

  // A korábbi verzió a lap aljára (kb. 1000. sor) írta az új sorokat: ezeket visszahúzzuk a tetejére
  var moved = 0;
  RaktarLogic.TABLES.forEach(function (table) { moved += compactSheet(sheetOf(table), table); });
  bumpVersion();

  renumberLists();

  // Első admin: a script tulajdonosa
  var me = Session.getEffectiveUser().getEmail().toLowerCase();
  if (me && !findUser(me)) {
    writeChanges([{ table: 'Felhasznalok', row: { email: me, nev: 'Admin', szerepkor: 'admin', aktiv: true, megjegyzes: 'Telepítéskor létrehozva' } }]);
  }
  secret();
  buildKeszletSheet();
  ensureKeszletTrigger();
  try {
    SpreadsheetApp.getUi().alert('Kész. A táblák rendben vannak.' + (moved ? ' (' + moved + ' üres sor eltávolítva az adatok közül.)' : ''));
  } catch (x) { /* a szkriptszerkesztőből futtatva nincs felugró ablak */ }
}

/**
 * Választólisták sorszámainak rendbetétele (pl. a korábbi importból maradt 999-es értékek):
 * típusonként a jelenlegi sorrendet (sorszám, majd ábécé) megtartva 1, 2, 3 … sorszámot ad.
 */
function renumberLists() {
  var byType = {}, changes = [];
  readTable('Listak').forEach(function (l) { (byType[l.tipus] = byType[l.tipus] || []).push(l); });
  Object.keys(byType).forEach(function (tipus) {
    byType[tipus].sort(function (a, b) { return (Number(a.sorrend) - Number(b.sorrend)) || String(a.ertek).localeCompare(String(b.ertek), 'hu'); })
      .forEach(function (l, i) { if (Number(l.sorrend) !== i + 1) { l.sorrend = i + 1; changes.push({ table: 'Listak', row: l }); } });
  });
  if (changes.length) writeChanges(changes);
}

/**
 * Készlet áttekintő lap: az app nélkül is mutatja az aktuális készletet, a rendelendő mennyiséget és az
 * esedékes leltárt. Az értékeket ugyanaz a számítás adja (RaktarLogic.computeStock), mint az appban, így
 * mindig egyezik vele. Nem képletes lap: a Raktár menüből és óránként automatikusan frissül.
 */
var KESZLET_HEADERS = ['Tétel ID', 'Megnevezés', 'Kategória', 'Raktár', 'Polc', 'Me.', 'Készlet', 'Min.', 'Cél', 'Úton',
  'Állapot', 'Rendelendő', 'Beszállító', 'Cikkszám', 'Egységár', 'Készletérték', 'Utolsó leltár', 'Leltár'];
var KESZLET_STATUS = { hiany: 'HIÁNY', figyelem: 'Fogyóban', ok: '' };

function buildKeszletSheet() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Keszlet') || ss.insertSheet('Keszlet', 0);
  var db = readAll();
  var st = RaktarLogic.computeStock(db, Date.now());
  var sup = {};
  db.Beszallitok.forEach(function (b) { sup[b.beszallito_id] = b.nev; });
  var rows = db.Tetelek.filter(function (t) { return t.aktiv; }).sort(function (a, b) {
    return String(a.raktar || '~').localeCompare(String(b.raktar || '~'), 'hu') || String(a.polc || '~').localeCompare(String(b.polc || '~'), 'hu') ||
      String(a.megnevezes).localeCompare(String(b.megnevezes), 'hu');
  }).map(function (t) {
    var s = st[t.tetel_id], f = s.forras;
    return [t.tetel_id, t.megnevezes, t.kategoria, t.raktar, t.polc, t.mertekegyseg, s.keszlet, t.min_keszlet, t.cel_keszlet, s.uton,
      KESZLET_STATUS[s.statusz] || '', s.javaslatKerekitve || '', f ? (sup[f.beszallito_id] || '') : '', f ? f.cikkszam : '',
      s.egysegar || '', s.ertek || '', s.leltarDatum ? new Date(s.leltarDatum) : '', s.esedekes ? 'ESEDÉKES' : ''];
  });
  sh.clear();
  sh.clearConditionalFormatRules();
  sh.getRange(1, 1, 1, KESZLET_HEADERS.length).setValues([KESZLET_HEADERS]).setFontWeight('bold').setBackground('#e8eef5');
  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);
  if (rows.length) {
    sh.getRange(2, 1, rows.length, KESZLET_HEADERS.length).setValues(rows);
    sh.getRange(2, 15, rows.length, 2).setNumberFormat('#,##0 "Ft"'); // Egységár, Készletérték
    sh.getRange(2, 17, rows.length, 1).setNumberFormat('yyyy.mm.dd');
    var all = sh.getRange(2, 1, rows.length, KESZLET_HEADERS.length);
    sh.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$K2="HIÁNY"').setBackground('#fde2e1').setRanges([all]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$K2="Fogyóban"').setBackground('#fdf1d6').setRanges([all]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setFontColor('#b42318').setBold(true)
        .setRanges([sh.getRange(2, 12, rows.length, 1)]).build()
    ]);
  }
  sh.getRange(1, 1).setNote('Számított lap – ne írj bele kézzel (a következő frissítés felülírja). Ugyanazzal a számítással készül, ' +
    'mint az appban. Frissítés: Raktár menü → Készlet lap frissítése, illetve óránként automatikusan. Utoljára: ' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy.MM.dd HH:mm'));
}

/** Óránkénti automatikus frissítés beállítása (egyszer; a Táblák létrehozása / ellenőrzése menü hívja). */
function ensureKeszletTrigger() {
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'buildKeszletSheet'; });
  if (!has) ScriptApp.newTrigger('buildKeszletSheet').timeBased().everyHours(1).create();
}

/* ===================== Tömeges import ===================== */
function importPrepareConfirm() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.alert('Tömeges import előkészítése',
    'A Beszallitok, Tetelek és Forrasok lapokon a kitöltött, de azonosító nélküli sorok azonosítót kapnak, ' +
    'az új tételek aktívak lesznek, a Forrasok lapon a tétel- és beszállítónevek azonosítóra cserélődnek. ' +
    'A meglévő (azonosítóval rendelkező) sorokhoz nem nyúl. Folytatod?', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  ui.alert('Import előkészítése', importPrepare().join('\n'), ui.ButtonSet.OK);
}

/**
 * Kézzel / tömegesen beillesztett sorok előkészítése:
 *  - Beszallitok: nev van, azonosító nincs → B-xxxxxx, aktív
 *  - Tetelek: megnevezes van, azonosító nincs → T-xxxxxx, aktív, alapértékek (db, 90 napos leltár)
 *  - Forrasok: tétel / beszállító megadható névvel is → azonosítóra cseréli; F-xxxxxx; kiszerelés 1;
 *    ha egy tételnek nincs elsődleges forrása, az első lesz az
 *  - Listak: az új kategóriák / mértékegységek / raktárak felkerülnek a választólistákra
 * Visszaad: összefoglaló sorok.
 */
function importPrepare() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var now = new Date(), msgs = [], used = {};
    var uniqueId = function (prefix) {
      var id;
      do { id = RaktarLogic.newId(prefix, 6); } while (used[id]);
      used[id] = 1;
      return id;
    };
    // Lap betöltése mátrixként; az utolsó sor az, ahol a megadott oszlopok valamelyike ki van töltve
    var load = function (table, fillCols) {
      var sh = sheetOf(table);
      var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
      var ix = {};
      header.forEach(function (h, i) { ix[h] = i; });
      var last = sh.getLastRow();
      var vals = last >= 2 ? sh.getRange(2, 1, last - 1, header.length).getValues() : [];
      var n = vals.length;
      while (n > 0 && fillCols.every(function (c) { return String(vals[n - 1][ix[c]]).trim() === ''; })) n--;
      vals = vals.slice(0, n);
      vals.forEach(function (row) { var k = String(row[ix[RaktarLogic.SCHEMA[table].key]]).trim(); if (k) used[k] = 1; });
      return { sh: sh, header: header, ix: ix, vals: vals, table: table };
    };
    var save = function (t) {
      if (t.vals.length) t.sh.getRange(2, 1, t.vals.length, t.header.length).setValues(t.vals);
    };
    var s = function (row, t, c) { return String(row[t.ix[c]] == null ? '' : row[t.ix[c]]).trim(); };

    // 1) Beszállítók
    var B = load('Beszallitok', ['beszallito_id', 'nev']);
    var nb = 0, supByName = {}, supIds = {};
    B.vals.forEach(function (row) {
      if (s(row, B, 'nev') && !s(row, B, 'beszallito_id')) {
        row[B.ix.beszallito_id] = uniqueId('B'); row[B.ix.aktiv] = true; row[B.ix.modositva] = now; nb++;
      }
      var id = s(row, B, 'beszallito_id');
      if (id) { supIds[id] = 1; supByName[s(row, B, 'nev').toLowerCase()] = id; }
    });
    save(B);

    // 2) Tételek
    var T = load('Tetelek', ['tetel_id', 'megnevezes']);
    var nt = 0, itemByName = {}, itemIds = {}, names = {}, dups = [];
    var listNew = { kategoria: {}, mertekegyseg: {}, raktar: {} };
    T.vals.forEach(function (row) {
      var nev = s(row, T, 'megnevezes');
      if (nev && !s(row, T, 'tetel_id')) {
        row[T.ix.tetel_id] = uniqueId('T');
        row[T.ix.aktiv] = true;
        if (!s(row, T, 'mertekegyseg')) row[T.ix.mertekegyseg] = 'db';
        if (s(row, T, 'leltar_ciklus_nap') === '') row[T.ix.leltar_ciklus_nap] = 90;
        row[T.ix.modositva] = now;
        nt++;
      }
      var id = s(row, T, 'tetel_id');
      if (!id) return;
      itemIds[id] = 1;
      var key = nev.toLowerCase();
      // Ismétlődő névnél nem egyértelmű, melyik tételről van szó → a forrás nem kapcsolódik névből
      if (names[key]) { dups.push(nev); itemByName[key] = null; } else { names[key] = 1; itemByName[key] = id; }
      ['kategoria', 'mertekegyseg', 'raktar'].forEach(function (f) { var v = s(row, T, f); if (v) listNew[f][v] = 1; });
    });
    save(T);

    // 3) Beszerzési források (név → azonosító)
    var F = load('Forrasok', ['forras_id', 'tetel_id', 'cikkszam']);
    var nf = 0, unresolved = [], hasPrimary = {}, firstOf = {};
    F.vals.forEach(function (row, i) {
      var tid = s(row, F, 'tetel_id'), bid = s(row, F, 'beszallito_id');
      if (!tid && !s(row, F, 'cikkszam')) return;
      if (tid && !itemIds[tid] && itemByName[tid.toLowerCase()]) row[F.ix.tetel_id] = tid = itemByName[tid.toLowerCase()];
      if (bid && !supIds[bid] && supByName[bid.toLowerCase()]) row[F.ix.beszallito_id] = bid = supByName[bid.toLowerCase()];
      if (!itemIds[tid] || !supIds[bid]) {
        // Nem azonosítható: nem kap azonosítót, így az app sem tölti be; javítás után a menü újrafuttatható
        if (!s(row, F, 'forras_id')) { unresolved.push((i + 2) + '. sor'); return; }
      }
      if (!s(row, F, 'forras_id')) {
        row[F.ix.forras_id] = uniqueId('F');
        if (s(row, F, 'kiszereles') === '' || Number(row[F.ix.kiszereles]) <= 0) row[F.ix.kiszereles] = 1;
        row[F.ix.modositva] = now;
        nf++;
      }
      if (row[F.ix.elsodleges] === true) hasPrimary[tid] = 1;
      if (firstOf[tid] === undefined) firstOf[tid] = i;
    });
    Object.keys(firstOf).forEach(function (tid) { if (!hasPrimary[tid]) F.vals[firstOf[tid]][F.ix.elsodleges] = true; });
    save(F);

    // 4) Választólisták kiegészítése
    // Az új értékek a lista végére kerülnek, ábécérendben, folytatólagos sorszámmal
    var existing = {}, maxOrder = {};
    readTable('Listak').forEach(function (l) {
      existing[l.tipus + '|' + l.ertek.toLowerCase()] = 1;
      maxOrder[l.tipus] = Math.max(maxOrder[l.tipus] || 0, Number(l.sorrend) || 0);
    });
    var listRows = [];
    Object.keys(listNew).forEach(function (tipus) {
      Object.keys(listNew[tipus]).sort(function (a, b) { return a.localeCompare(b, 'hu'); }).forEach(function (v) {
        if (existing[tipus + '|' + v.toLowerCase()]) return;
        maxOrder[tipus] = (maxOrder[tipus] || 0) + 1;
        listRows.push({ table: 'Listak', row: { lista_id: uniqueId('L'), tipus: tipus, ertek: v, sorrend: maxOrder[tipus], modositva: now.toISOString() } });
      });
    });
    if (listRows.length) writeChanges(listRows);

    bumpVersion(); // a közvetlen lapírás is új adat a készülékeknek
    msgs.push('Új beszállító: ' + nb, 'Új tétel: ' + nt, 'Új beszerzési forrás: ' + nf, 'Új listaelem (kategória / mértékegység / raktár): ' + listRows.length);
    if (dups.length) msgs.push('', 'FIGYELEM – ismétlődő tételnevek: ' + dups.slice(0, 10).join(', ') + (dups.length > 10 ? ' …' : ''));
    if (unresolved.length) msgs.push('', 'FIGYELEM – a Forrasok lapon nem azonosítható tétel vagy beszállító: ' + unresolved.slice(0, 15).join(', ') + (unresolved.length > 15 ? ' …' : '') +
      '\n(A tétel / beszállító oszlopba pontos nevet vagy azonosítót írj.)');
    return msgs;
  } finally {
    lock.releaseLock();
  }
}

/* ===================== Demo adatok ===================== */
function seedDemoDataConfirm() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.alert('Demo adatok', 'Ez TÖRLI a tételeket, beszállítókat, forrásokat, mozgásokat, rendeléseket, sablonokat és listákat, ' +
    'majd véletlenszerű próbaadatokkal tölti fel. A felhasználók NEM változnak. Folytatod?',
    ui.ButtonSet.YES_NO);
  if (r === ui.Button.YES) seedDemoData();
}

/**
 * Próbaadatok betöltése az éles Sheetbe.
 * BIZTONSÁG: felhasználót szándékosan NEM vesz fel (a demo felhasználók valós Google-fiókok is lehetnének).
 */
function seedDemoData() {
  var data = RaktarLogic.generateDemoData(Date.now());
  // A demo felhasználókra hivatkozó mezők a telepítő adminra mutassanak
  var me = Session.getEffectiveUser().getEmail().toLowerCase();
  data.Mozgasok.forEach(function (m) { m.felhasznalo = me; });
  data.Rendelesek.forEach(function (o) { o.letrehozta = me; });
  data.Leltar_sablonok.forEach(function (s) { s.letrehozta = me; });
  ['Tetelek', 'Beszallitok', 'Forrasok', 'Mozgasok', 'Rendelesek', 'Rendeles_tetelek', 'Leltar_sablonok', 'Listak', 'Email_sablonok'].forEach(function (table) {
    var sh = sheetOf(table);
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
    writeChanges(data[table].map(function (row) { return { table: table, row: row }; }));
  });
}
