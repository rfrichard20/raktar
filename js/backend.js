// Backend réteg: valódi (Apps Script) vagy demo (helyi, böngészőben tárolt) kiszolgáló.
import { CONFIG } from './config.js';
import * as idb from './idb.js';

const L = window.RaktarLogic;
export const isDemo = !CONFIG.API_URL;

function networkError(msg = 'Nincs kapcsolat a szerverrel.') {
  const e = new Error(msg); e.network = true; return e;
}

/* ===================== Apps Script ===================== */
// Egy kérés legfeljebb ennyi ideig tarthat: a „beragadt” kapcsolat ne akassza meg a további szinkronokat.
// (Megszakítás után az újraküldés biztonságos: a szerver a már feldolgozott műveleteket kihagyja.)
const REQUEST_TIMEOUT = 60000;

class RemoteBackend {
  async call(payload) {
    let res;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT);
    try {
      res = await fetch(CONFIG.API_URL, {
        method: 'POST',
        // text/plain: így a böngésző nem küld CORS előkérést (az Apps Script nem kezeli)
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow',
        signal: ctrl.signal,
      });
    } catch {
      throw networkError(ctrl.signal.aborted ? 'A szerver nem válaszolt időben – újrapróbálás hamarosan.' : undefined);
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw networkError('Szerverhiba (' + res.status + ').');
    let data;
    try {
      const text = await res.text();
      data = JSON.parse(text);
      data.bytes = text.length; // a válasz mérete (szinkron mérés, Fiók oldal)
    } catch { throw networkError('Érvénytelen válasz a szervertől.'); }
    if (!data.ok) { const e = new Error(data.error || 'Ismeretlen hiba'); e.auth = !!data.auth; throw e; }
    return data;
  }
  login(idToken) { return this.call({ action: 'login', idToken }); }
  /** Teljes adat; ha a megadott verzió még aktuális, csak { unchanged: true } jön vissza (gyors). */
  fetchAll(token, version) { return this.call({ action: 'adatok', token, version }); }
  sync(token, ops) { return this.call({ action: 'szinkron', token, ops }); }
}

/* ===================== Demo ===================== */
// Ugyanazt a logikát (RaktarLogic.applyOp) futtatja, mint a valódi szerver, csak a böngészőben.
class DemoBackend {
  constructor() { this.db = null; this.version = String(Date.now()); }
  async load() {
    if (this.db) return this.db;
    let data = await idb.get('demo:db');
    if (!data) { data = L.generateDemoData(Date.now()); await idb.set('demo:db', data); }
    this.db = data;
    return data;
  }
  async save() { await idb.set('demo:db', L.exportDb(this.db)); }
  async reset() { this.db = L.generateDemoData(Date.now(), Math.floor(Math.random() * 1e9)); this.version = String(Date.now()); await this.save(); }
  get offline() { try { return localStorage.getItem('raktar:demoOffline') === '1'; } catch { return false; } }
  set offline(v) { try { localStorage.setItem('raktar:demoOffline', v ? '1' : '0'); } catch { /* */ } }
  async delay() {
    await new Promise(r => setTimeout(r, 250 + Math.random() * 350));
    if (this.offline || !navigator.onLine) throw networkError('Nincs kapcsolat (demo: szimulált offline).');
  }
  async users() { const db = await this.load(); return db.Felhasznalok.filter(u => u.aktiv); }
  async user(email) {
    const db = await this.load();
    const u = db.Felhasznalok.find(x => x.email === email && x.aktiv);
    if (!u) { const e = new Error('A felhasználó nem létezik vagy inaktív.'); e.auth = true; throw e; }
    return { email: u.email, nev: u.nev, szerepkor: u.szerepkor };
  }
  snapshot(user) {
    // Ugyanaz a szűrés, mint a valódi szerveren
    return JSON.parse(JSON.stringify(L.filterSnapshot(this.db, user)));
  }
  async login(email) {
    await this.delay();
    const user = await this.user(email);
    return { ok: true, token: 'demo:' + email, user };
  }
  async fetchAll(token, version) {
    await this.delay();
    const user = await this.user(String(token).replace(/^demo:/, ''));
    if (version && version === this.version) return { ok: true, user, unchanged: true, version, bytes: 60 };
    return this.measured({ ok: true, user, data: this.snapshot(user), version: this.version });
  }
  /** Demo: a válasz mérete, mint a valódi szervernél (a szerver lépéseinek idejét itt nem lehet mérni). */
  measured(res) { res.bytes = JSON.stringify(res).length; return res; }
  async sync(token, ops) {
    await this.delay();
    const user = await this.user(String(token).replace(/^demo:/, ''));
    const now = new Date().toISOString();
    let changed = 0;
    const results = ops.map(op => {
      try { changed += L.applyOp(this.db, op, user, now).length; return { op_id: op.op_id, ok: true }; }
      catch (e) { if (!e.validation) console.error(e); return { op_id: op && op.op_id, ok: false, error: e.validation ? e.message : 'Feldolgozási hiba (hibás szerkezetű művelet).' }; }
    });
    if (changed) this.version = String(Date.now());
    await this.save();
    return this.measured({ ok: true, results, user, data: this.snapshot(user), version: this.version });
  }
}

export const backend = isDemo ? new DemoBackend() : new RemoteBackend();
