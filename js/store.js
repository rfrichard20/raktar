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

function recompute() {
  const empty = {};
  L.TABLES.forEach(t => { empty[t] = []; });
  const db = state.snapshot ? L.cloneDb(state.snapshot) : empty;
  for (const op of state.outbox) {
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
  if (snap) { state.snapshot = snap.data; state.snapshotAt = snap.at; }
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
  // Másik felhasználó: a régi gyorsítótárat eldobjuk (a kimenő sor marad, az új felhasználó nevében megy fel)
  if (state.user && state.user.email !== user.email) {
    state.snapshot = null;
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
  state.user = null; state.token = null; state.snapshot = null;
  await Promise.all([idb.del('session'), idb.del('snapshot')]);
  recompute();
  emit();
}

/** Új művelet felvétele a kimenő sorba; azonnal látszik a felületen, és szinkronizál. */
export async function enqueue(op) {
  op.op_id = L.newId('OP', 12);
  op.created = new Date().toISOString();
  // Helyi ellenőrzés: ha a logika már itt elutasítja, nem kerül a sorba
  const test = L.cloneDb(state.db);
  L.applyOp(test, op, state.user, op.created); // hibát dob, ha érvénytelen
  state.outbox.push(op);
  await persist();
  recompute();
  emit();
  sync();
  return op;
}

let syncPromise = null;
let syncAgain = false;
export function sync() {
  if (!state.token) return Promise.resolve();
  if (syncPromise) { syncAgain = true; return syncPromise; } // futás közben érkezett új művelet → utána újra
  syncPromise = doSync().finally(() => {
    syncPromise = null;
    if (syncAgain) {
      syncAgain = false;
      if (state.outbox.length && state.online) sync();
    }
  });
  return syncPromise;
}

async function doSync() {
  state.syncing = true;
  emit('status');
  const sent = state.outbox.slice();
  try {
    const res = sent.length ? await backend.sync(state.token, sent) : await backend.fetchAll(state.token);
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
    if (res.user) {
      state.user = res.user;
      await idb.set('session', { token: state.token, user: res.user });
    }
    state.online = true;
    state.lastError = null;
    await Promise.all([idb.set('snapshot', { data: state.snapshot, at: state.snapshotAt }), persist()]);
  } catch (e) {
    if (e.network) { state.online = false; state.lastError = e.message; }
    else if (e.auth) {
      // Lejárt / visszavont hozzáférés: a letöltött adatot azonnal töröljük a készülékről,
      // és újra be kell jelentkezni. A még fel nem töltött rögzítések (outbox) megmaradnak.
      state.authError = e.message; state.lastError = e.message;
      state.user = null; state.token = null; state.snapshot = null; state.snapshotAt = null;
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

/* ---------- Vázlatok (űrlapok helyi mentése) ---------- */
export const drafts = {
  get: key => idb.get('draft:' + key),
  set: (key, val) => idb.set('draft:' + key, val),
  del: key => idb.del('draft:' + key),
};

/* ---------- Kényelmi lekérdezések ---------- */
export const get = (table, id) => L.get(state.db, table, id);
export const items = () => state.db.Tetelek;
export const activeItems = () => state.db.Tetelek.filter(t => t.aktiv);
export const supplierName = id => (get('Beszallitok', id) || {}).nev || '—';
export const userName = email => {
  const u = (state.db.Felhasznalok || []).find(x => x.email === email);
  return u ? u.nev || email : email || '—';
};
export const warehouses = () => [...new Set(state.db.Tetelek.filter(t => t.aktiv).map(t => t.raktar || '').filter(Boolean))].sort((a, b) => a.localeCompare(b, 'hu'));
/** Hely felirat: több raktár esetén „Raktár · Polc”, egyébként csak a polc. */
export const placeLabel = t => {
  const multi = warehouses().length > 1;
  return [multi ? t.raktar : '', t.polc].filter(Boolean).join(' · ') || '—';
};
export const categories = () => [...new Set(state.db.Tetelek.map(t => t.kategoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'hu'));
export { isDemo, backend, L };
