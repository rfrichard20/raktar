/* KÖZÖS FÁJL – ne itt szerkeszd! Forrás: Kozos_Claude (d6b30c7), frissítés: Kozos_Claude\szinkron.ps1 · lenyomat: 84dc4adf7b703c32 */
// Egyszerű kulcs-érték tár IndexedDB-ben (offline adatok, vázlatok, kimenő sor, nagy fájlok).
// Ha az IndexedDB nem elérhető, localStorage-ra esik vissza (oda csak kis adat fér).
// Az appok közös originen futnak (GitHub Pages) → mindegyik saját adatbázisnevet és localStorage-előtagot ad meg.
// Használat az app saját js/idb.js-ében:  export const { get, set, del, keys } = createStore('raktar', 'raktar:');

const STORE = 'kv';

export function createStore(dbName, lsPrefix) {
  let dbPromise = null;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName, 1);
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

  async function get(key) {
    const db = await open();
    if (!db) {
      try { const v = localStorage.getItem(lsPrefix + key); return v == null ? undefined : JSON.parse(v); } catch { return undefined; }
    }
    return tx('readonly', s => s.get(key));
  }

  async function set(key, value) {
    const db = await open();
    if (!db) {
      try { localStorage.setItem(lsPrefix + key, JSON.stringify(value)); } catch { /* tele a tár */ }
      return;
    }
    return tx('readwrite', s => s.put(value, key));
  }

  /** Az összes kulcs (pl. a letöltött adatok törléséhez kijelentkezéskor). */
  async function keys() {
    const db = await open();
    if (!db) {
      try { return Object.keys(localStorage).filter(k => k.startsWith(lsPrefix)).map(k => k.slice(lsPrefix.length)); } catch { return []; }
    }
    return tx('readonly', s => s.getAllKeys());
  }

  async function del(key) {
    const db = await open();
    if (!db) { try { localStorage.removeItem(lsPrefix + key); } catch { /* */ } return; }
    return tx('readwrite', s => s.delete(key));
  }

  return { get, set, del, keys };
}
