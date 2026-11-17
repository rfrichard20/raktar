/* KÖZÖS FÁJL – ne itt szerkeszd! Forrás: Kozos_Claude (d6b30c7), frissítés: Kozos_Claude\szinkron.ps1 · lenyomat: 9481dca8af13307c */
/**
 * Közös backend-mag (Apps Script): bejelentkezés, munkamenet, adatverzió, hibák, JSON-válasz.
 * Az Apps Script projektben külön „Kozos” nevű szkriptfájl; a projekt minden .gs fájlja közös térben fut,
 * így a Code.gs ezeket a függvényeket közvetlenül hívja.
 *
 * Az app Code.gs-ében kell lennie: GOOGLE_CLIENT_ID, SESSION_DAYS, readTable(lap), publicUser(sor).
 * Szkripttulajdonságok: SESSION_SECRET (munkamenet-kulcs, magától jön létre), DATA_VERSION.
 */

/* ===================== Hibák, válasz ===================== */
/** Bejelentkezési / jogosultsági hiba: a kliens kijelentkezteti a felhasználót. */
function authError(msg) { var e = new Error(msg); e.auth = true; return e; }

/** A felhasználónak megmutatható (nem bejelentkezési) hiba. */
function publicError(msg) { var e = new Error(msg); e.pub = true; return e; }

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

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

/* ===================== Bejelentkezés, munkamenet ===================== */
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

/**
 * Minden kiadott munkamenet érvénytelenítése (a titkos kulcs cseréjével); a Sheet menüjéből indul.
 * Pl. elveszett telefon esetén. Mindenkinek újra be kell jelentkeznie; a fel nem töltött adatok megmaradnak.
 */
function logoutEveryoneConfirm() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.alert('Mindenki kijelentkeztetése', 'Minden felhasználónak újra be kell jelentkeznie (a készülékeken lévő, még fel nem töltött adatok megmaradnak). Folytatod?', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  PropertiesService.getScriptProperties().setProperty('SESSION_SECRET', Utilities.getUuid() + Utilities.getUuid());
  ui.alert('Kész. Minden munkamenet érvénytelen.');
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
