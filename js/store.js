// Alkalmazás állapot: utolsó szerver-pillanatkép + helyi kimenő sor (outbox) + szinkron.
// A felület mindig a "pillanatkép + még fel nem töltött műveletek" eredményét mutatja,
// így offline rögzített adatok is azonnal látszanak.
import * as idb from './idb.js';
import { backend, isDemo } from './backend.js';
import { CONFIG } from './config.js';

const L = window.RaktarLogic;

export const state = {
  user: null,          // {email, nev, szerepkor}
  token: null,
  snapshot: null,      // utolsó szerver adat
  snapshotAt: null,
  version: null,       // a szerver adatverziója a pillanatképnél (változatlan adatot nem tölt le újra)
  outbox: [],          // feltöltésre váró műveletek
  rejected: [],        // a szerver által elutasított műveletek (hibaüzenettel)
  syncing: false,
  online: navigator.onLine,
  lastError: null,
  authError: null,
  db: null,            // pillanatkép + outbox alkalmazva
  stock: {},           // számított készlet tételenként
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(kind = 'data') { listeners.forEach(fn => { try { fn(kind); } catch (e) { console.error(e); } }); }

// Szerepkör ('raktaros') vagy láthatósági jog ('arak', 'rendeles', 'kimutatas') – lásd RaktarLogic.PERMS
export const can = what => L.can(state.user, what);

// Egy szinkron kérésben legfeljebb ennyi művelet megy fel (a szerver 200 fölött az egészet elutasítaná)
const SYNC_BATCH = 100;

/** A művelet a bejelentkezett felhasználóé-e (régi, címke nélküli műveletek: igen). */
const isMine = op => !op.by || (state.user && op.by === state.user.email);
/** A bejelentkezett felhasználó feltöltésre váró műveletei. */
export const myOutbox = () => state.outbox.filter(isMine);

function recompute() {
  const empty = {};
  L.TABLES.forEach(t => { empty[t] = []; });
  const db = state.snapshot ? L.cloneDb(state.snapshot) : empty;
  // Más felhasználó (közös készüléken korábban rögzített) műveletei csak az ő bejelentkezésekor kerülnek fel
  for (const op of state.outbox) {
    if (!isMine(op)) { op.localError = null; continue; }
    try { L.applyOp(db, op, state.user, op.created); op.localError = null; }
    catch (e) { op.localError = e.message; }
  }
  state.db = db;
  state.stock = L.computeStock(db, Date.now());
}

async function persist() {
  await Promise.all([
    idb.set('outbox', state.outbox),
    idb.set('rejected', state.rejected),
  ]);
}

export async function init() {
  const [session, snap, outbox, rejected] = await Promise.all([
    idb.get('session'), idb.get('snapshot'), idb.get('outbox'), idb.get('rejected'),
  ]);
  if (session) { state.user = session.user; state.token = session.token; }
  if (snap) { state.snapshot = snap.data; state.snapshotAt = snap.at; state.version = snap.version || null; }
  state.outbox = outbox || [];
  state.rejected = rejected || [];
  recompute();
  window.addEventListener('online', () => { state.online = true; emit('status'); sync(); });
  window.addEventListener('offline', () => { state.online = false; emit('status'); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
  setInterval(() => { if (document.visibilityState === 'visible') sync(); }, CONFIG.SYNC_INTERVAL);
  if (state.user) sync();
}

export async function setSession(token, user) {
  // Másik felhasználó: a régi gyorsítótárat eldobjuk. A kimenő sor marad, de mindenki csak a saját
  // rögzítéseit tölti fel (op.by), így más nevében rögzített adat nem kerül fel az ő nevében.
  if (state.user && state.user.email !== user.email) {
    state.snapshot = null; state.version = null;
    await idb.del('snapshot');
  }
  state.token = token;
  state.user = user;
  state.authError = null;
  await idb.set('session', { token, user });
  recompute();
  emit();
  return sync();
}

export async function logout() {
  state.user = null; state.token = null; state.snapshot = null; state.version = null;
  await Promise.all([idb.del('session'), idb.del('snapshot')]);
  recompute();
  emit();
}

/** Új művelet felvétele a kimenő sorba; azonnal látszik a felületen, és szinkronizál. */
export async function enqueue(op) {
  op.op_id = L.newId('OP', 12);
  op.created = new Date().toISOString();
  op.by = state.user && state.user.email; // a rögzítő: csak az ő nevében töltődik fel
  // Helyi ellenőrzés: ha a logika már itt elutasítja, nem kerül a sorba
  const test = L.cloneDb(state.db);
  L.applyOp(test, op, state.user, op.created); // hibát dob, ha érvénytelen
  state.outbox.push(op);
  await persist();
  recompute();
  emit();
  syncSoon();
  return op;
}

// Kötegelés: a gyorsan egymás után rögzített műveletek (pl. tétel + forrásai) rövid várakozás után
// egy kérésben mennek fel, nem külön-külön.
const BATCH_DELAY = 800;
let batchTimer = null;
function syncSoon() {
  clearTimeout(batchTimer);
  batchTimer = setTimeout(sync, BATCH_DELAY);
}

// Hiba után (pl. időtúllépés, szerverhiba) magától újrapróbál, egyre ritkábban: 15 mp, 30 mp … legfeljebb 3 perc.
let retryTimer = null, retryDelay = 15000;
function scheduleRetry() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(sync, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 180000);
}

let syncPromise = null;
let syncAgain = false;
export function sync() {
  if (!state.token) return Promise.resolve();
  clearTimeout(batchTimer);
  if (syncPromise) { syncAgain = true; return syncPromise; } // futás közben érkezett új művelet → utána újra
  syncPromise = doSync().finally(() => {
    syncPromise = null;
    if (syncAgain) {
      syncAgain = false;
      if (myOutbox().length && state.online && state.token && !state.lastError) sync();
    }
  });
  return syncPromise;
}

async function doSync() {
  clearTimeout(retryTimer);
  state.syncing = true;
  emit('status');
  const mine = myOutbox();
  const sent = mine.slice(0, SYNC_BATCH);
  if (mine.length > sent.length) syncAgain = true; // a többi a következő körben
  try {
    // Feltöltendő nélkül: csak akkor jön le az adat, ha a szerveren változott (verzió)
    const res = sent.length ? await backend.sync(state.token, sent) : await backend.fetchAll(state.token, state.snapshot ? state.version : null);
    if (res.unchanged) {
      state.snapshotAt = new Date().toISOString();
      state.online = true; state.lastError = null; retryDelay = 15000;
      if (res.user) state.user = res.user;
      return;
    }
    if (sent.length) {
      const byId = new Map((res.results || []).map(r => [r.op_id, r]));
      const failed = [];
      for (const op of sent) {
        const r = byId.get(op.op_id);
        if (r && !r.ok) failed.push({ op, error: r.error, at: new Date().toISOString() });
      }
      const sentIds = new Set(sent.map(o => o.op_id));
      state.outbox = state.outbox.filter(o => !sentIds.has(o.op_id));
      if (failed.length) state.rejected.push(...failed);
    }
    state.snapshot = res.data;
    state.snapshotAt = new Date().toISOString();
    state.version = res.version || null;
    if (res.user) {
      state.user = res.user;
      await idb.set('session', { token: state.token, user: res.user });
    }
    state.online = true;
    state.lastError = null;
    retryDelay = 15000;
    await Promise.all([idb.set('snapshot', { data: state.snapshot, at: state.snapshotAt, version: state.version }), persist()]);
  } catch (e) {
    if (!e.auth) scheduleRetry();
    if (e.network) { state.online = false; state.lastError = e.message; }
    else if (e.auth) {
      // Lejárt / visszavont hozzáférés: a letöltött adatot azonnal töröljük a készülékről,
      // és újra be kell jelentkezni. A még fel nem töltött rögzítések (outbox) megmaradnak.
      state.authError = e.message; state.lastError = e.message;
      state.user = null; state.token = null; state.snapshot = null; state.snapshotAt = null; state.version = null;
      await Promise.all([idb.del('session'), idb.del('snapshot')]);
    }
    else { state.lastError = e.message; }
  } finally {
    state.syncing = false;
    recompute();
    emit();
  }
}

export async function dismissRejected(i) {
  state.rejected.splice(i, 1);
  await persist();
  emit('status');
}

export async function discardOutboxItem(opId) {
  state.outbox = state.outbox.filter(o => o.op_id !== opId);
  await persist();
  recompute();
  emit();
}

/* ---------- Eszközszintű beállítások (a készüléken tárolva; privát módban az alapérték marad) ---------- */
export function getPref(key, def) {
  try { const v = localStorage.getItem('raktar:' + key); return v === null ? def : JSON.parse(v); } catch { return def; }
}
export function setPref(key, value) {
  try { localStorage.setItem('raktar:' + key, JSON.stringify(value)); } catch { /* privát mód */ }
  emit('pref');
}

/* ---------- Menü sorrendje (eszközszintű beállítás; null = alapértelmezett) ---------- */
// Mobilon az első NAV_MAX menüpont az alsó sávban van, a többi ugyanebben a sorrendben a „Több” menüben.
export const NAV_MAX = 4;
export function getNavOrder() { const v = getPref('navOrder', null); return Array.isArray(v) ? v : null; }
export const setNavOrder = keys => setPref('navOrder', keys || null);

/* ---------- Vázlatok (folyamatban lévő űrlapok helyi mentése) ---------- */
export const drafts = {
  get: key => idb.get('draft:' + key),
  set: (key, val) => idb.set('draft:' + key, val),
  del: key => idb.del('draft:' + key),
};
/**
 * Egy folyamat (leltár, beérkezés, kivét, rendelési lista) vázlata: a készüléken tárolódik, így offline és
 * bezárás után is folytatható. slot.draft: undefined = még nincs betöltve, null = nincs folyamatban.
 * init(tárolt érték) → a használható vázlat (pl. régi formátum átalakítása / eldobása).
 */
export function draftSlot(key, init = d => d || null) {
  let loading = null, busy = false;
  const slot = {
    draft: undefined,
    save: () => drafts.set(key, slot.draft),
    clear: () => { slot.draft = null; return drafts.del(key); },
    /** Igaz, ha a vázlat be van töltve; különben „Betöltés…” jelenik meg, és betöltés után újrarajzol. */
    ready(root, ctx) {
      if (slot.draft !== undefined) return true;
      root.innerHTML = '<p class="muted">Betöltés…</p>';
      loading = loading || drafts.get(key).then(d => { slot.draft = init(d); });
      loading.then(() => ctx.rerender());
      return false;
    },
    /** Rögzítés dupla koppintás ellen: amíg az előző fut, újat nem indít. */
    async once(fn) {
      if (busy) return;
      busy = true;
      try { return await fn(); } finally { busy = false; }
    },
  };
  return slot;
}

/* ---------- Kényelmi lekérdezések ---------- */
export const get = (table, id) => L.get(state.db, table, id);
/** Tétel azonosító alapján; ha már nincs meg (pl. törölt), egy helyettesítő, hogy a lista ne álljon le. */
export const itemOrStub = id => get('Tetelek', id) || { tetel_id: id, megnevezes: id, mertekegyseg: '' };
export const items = () => state.db.Tetelek;
export const activeItems = () => state.db.Tetelek.filter(t => t.aktiv);
export const supplierName = id => (get('Beszallitok', id) || {}).nev || '—';
/** Rendelés kereshető szövege (beszállító, rendelésszám, belső azonosító, megjegyzés). */
/** Nyitott vagy részben teljesült rendelések állapotadatokkal ({ o, info }), a legújabb elöl. */
export const openOrders = () => state.db.Rendelesek.map(o => ({ o, info: L.orderInfo(state.db, o) }))
  .filter(x => x.info.statusz === 'nyitott' || x.info.statusz === 'reszben')
  .sort((a, b) => (a.o.datum < b.o.datum ? 1 : -1));
export const orderSearchText =o => `${supplierName(o.beszallito_id)} ${o.rendeles_id} ${o.belso_azon || ''} ${o.megjegyzes || ''}`;
export const userName = email => {
  const u = (state.db.Felhasznalok || []).find(x => x.email === email);
  return u ? u.nev || email : email || '—';
};
export const warehouses = () => [...new Set(state.db.Tetelek.filter(t => t.aktiv).map(t => t.raktar || '').filter(Boolean))].sort((a, b) => a.localeCompare(b, 'hu'));
/** Egy mező eddigi értékei, a legutóbb használt elöl (javaslatlistához: suggestInput). */
export const recentValues = (rows, field, dateField) => [...new Set((rows || []).slice()
  .sort((a, b) => (a[dateField] < b[dateField] ? 1 : -1)).map(r => r[field]).filter(Boolean))].slice(0, 50);
/** A tételeknél használt polc / hely értékek ábécérendben. */
export const shelves = () => [...new Set(state.db.Tetelek.map(t => t.polc).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'hu'));
/** Hely felirat: „Raktár · Polc” (ami ki van töltve). */
export const placeLabel = t => [t.raktar, t.polc].filter(Boolean).join(' · ') || '—';
/** Tételek bejárási sorrendje: raktár, polc, név (a hely nélküliek a végén) – leltár, tételválasztó. */
export const byPlace = (a, b) => (a.raktar || '~').localeCompare(b.raktar || '~', 'hu') ||
  (a.polc || '~').localeCompare(b.polc || '~', 'hu') || a.megnevezes.localeCompare(b.megnevezes, 'hu');
/** Új választólista-elem sorszáma: a típus legnagyobb sorszáma + 1 (törlés után sem ütközik). */
export const nextListOrder = tipus => Math.max(0, ...(state.db.Listak || []).filter(l => l.tipus === tipus).map(l => Number(l.sorrend) || 0)) + 1;
export const categories = () => [...new Set(state.db.Tetelek.map(t => t.kategoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'hu'));
export { isDemo, backend, L };
