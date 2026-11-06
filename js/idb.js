// Egyszerű kulcs-érték tár IndexedDB-ben (offline adatok, vázlatok, kimenő sor).
// Ha az IndexedDB nem elérhető, localStorage-ra esik vissza.
const DB_NAME = 'raktar';
const STORE = 'kv';
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch(() => null);
  }
  return dbPromise;
}

function tx(mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    if (!db) return resolve(fn(null));
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export async function get(key) {
  const db = await open();
  if (!db) {
    try { const v = localStorage.getItem('raktar:' + key); return v == null ? undefined : JSON.parse(v); } catch { return undefined; }
  }
  return tx('readonly', s => s.get(key));
}

export async function set(key, value) {
  const db = await open();
  if (!db) {
    try { localStorage.setItem('raktar:' + key, JSON.stringify(value)); } catch { /* tele a tár */ }
    return;
  }
  return tx('readwrite', s => s.put(value, key));
}

export async function del(key) {
  const db = await open();
  if (!db) { try { localStorage.removeItem('raktar:' + key); } catch { /* */ } return; }
  return tx('readwrite', s => s.delete(key));
}
