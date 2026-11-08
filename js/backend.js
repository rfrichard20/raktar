// Backend réteg: valódi (Apps Script) vagy demo (helyi, böngészőben tárolt) kiszolgáló.
import { CONFIG } from './config.js';
import * as idb from './idb.js';

const L = window.RaktarLogic;
export const isDemo = !CONFIG.API_URL;

function networkError(msg = 'Nincs kapcsolat a szerverrel.') {
  const e = new Error(msg); e.network = true; return e;
}

/* ===================== Apps Script ===================== */
class RemoteBackend {
  async call(payload) {
    let res;
    try {
      res = await fetch(CONFIG.API_URL, {
        method: 'POST',
        // text/plain: így a böngésző nem küld CORS előkérést (az Apps Script nem kezeli)
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow',
      });
    } catch {
      throw networkError();
    }
    if (!res.ok) throw networkError('Szerverhiba (' + res.status + ').');
    let data;
    try { data = await res.json(); } catch { throw networkError('Érvénytelen válasz a szervertől.'); }
    if (!data.ok) { const e = new Error(data.error || 'Ismeretlen hiba'); e.auth = !!data.auth; throw e; }
    return data;
  }
  login(idToken) { return this.call({ action: 'login', idToken }); }
  fetchAll(token) { return this.call({ action: 'adatok', token }); }
  sync(token, ops) { return this.call({ action: 'szinkron', token, ops }); }
}

/* ===================== Demo ===================== */
// Ugyanazt a logikát (RaktarLogic.applyOp) futtatja, mint a valódi szerver, csak a böngészőben.
class DemoBackend {
  constructor() { this.db = null; }
  async load() {
    if (this.db) return this.db;
    let data = await idb.get('demo:db');
    if (!data) { data = L.generateDemoData(Date.now()); await idb.set('demo:db', data); }
    this.db = data;
    return data;
  }
  async save() { await idb.set('demo:db', L.exportDb(this.db)); }
  async reset() { this.db = L.generateDemoData(Date.now(), Math.floor(Math.random() * 1e9)); await this.save(); }
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
  async fetchAll(token) {
    await this.delay();
    const user = await this.user(String(token).replace(/^demo:/, ''));
    return { ok: true, user, data: this.snapshot(user) };
  }
  async sync(token, ops) {
    await this.delay();
    const user = await this.user(String(token).replace(/^demo:/, ''));
    const now = new Date().toISOString();
    const results = ops.map(op => {
      try { L.applyOp(this.db, op, user, now); return { op_id: op.op_id, ok: true }; }
      catch (e) { return { op_id: op && op.op_id, ok: false, error: e.validation ? e.message : 'Feldolgozási hiba: ' + e.message }; }
    });
    await this.save();
    return { ok: true, results, user, data: this.snapshot(user) };
  }
}

export const backend = isDemo ? new DemoBackend() : new RemoteBackend();
