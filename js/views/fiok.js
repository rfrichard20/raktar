// Fiók és szinkron állapot.
import * as store from '../store.js';
import { html, fmtDate, confirmDialog, toast } from '../ui.js';

const L = window.RaktarLogic;

const OP_LABEL = {
  mozgasok: op => {
    const t = op.rows[0] ? L.MOVE_TYPES[op.rows[0].tipus] : '';
    return `${t} – ${op.rows.length} tétel${op.rows[0] && op.rows[0].bizonylat ? ' (' + op.rows[0].bizonylat + ')' : ''}`;
  },
  rendeles: op => `Új rendelés – ${op.sorok.length} tétel`,
  rendeles_lezaras: op => `Rendelés lezárása (${op.rendeles_id})`,
  mentes: op => `Mentés: ${op.table}`,
  torles: op => `Törlés: ${op.table}`,
  uj_tetel: op => `Új tétel: ${op.tetel.megnevezes}`,
  forras_ar: () => 'Beszerzési ár frissítése',
  sablon_mentes: op => `Leltár sablon mentése: ${op.sablon.nev}`,
  sablon_torles: () => 'Leltár sablon törlése',
};
const opLabel = op => (OP_LABEL[op.type] ? OP_LABEL[op.type](op) : op.type);

export default {
  render(root, params, ctx) {
    const s = store.state;
    const demo = store.isDemo ? store.backend : null;
    root.innerHTML = String(html`
      <div class="page-head"><h1>Fiók és szinkron</h1></div>
      <div class="card card-pad">
        <dl class="kv">
          <dt>Név</dt><dd>${s.user.nev}</dd>
          <dt>E-mail</dt><dd>${s.user.email}</dd>
          <dt>Szerepkör</dt><dd>${L.ROLE_LABELS[s.user.szerepkor] || s.user.szerepkor}</dd>
          <dt>Kapcsolat</dt><dd>${s.online ? 'Online' : 'Offline'}</dd>
          <dt>Utolsó szinkron</dt><dd>${fmtDate(s.snapshotAt, true)}</dd>
          ${s.lastError ? html`<dt>Utolsó hiba</dt><dd style="color:var(--err)">${s.lastError}</dd>` : ''}
        </dl>
        <div class="toolbar" style="margin-top:1rem;margin-bottom:0">
          <button class="btn btn-primary" data-a="sync" ${s.syncing ? 'disabled' : ''}>Szinkronizálás most</button>
          <button class="btn" data-a="logout">Kijelentkezés</button>
        </div>
      </div>

      <div class="card card-pad">
        <h2>Megjelenés</h2>
        <p class="small muted">Az Automatikus az eszközöd világos/sötét beállítását követi. A választás csak ezen az eszközön érvényes.</p>
        <div class="chip-list" id="theme-opts">
          ${[['auto', 'Automatikus'], ['light', 'Világos'], ['dark', 'Sötét']].map(([v, l]) => html`
            <button class="chip ${window.RaktarTheme.get() === v ? 'on' : ''}" data-a="theme" data-v="${v}">${l}</button>`)}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Feltöltésre vár</h2><span class="badge badge-${s.outbox.length ? 'warn' : 'ok'}">${s.outbox.length}</span></div>
        ${s.outbox.length ? html`${s.outbox.map(op => html`
          <div class="list-item" style="cursor:default">
            <div class="grow"><div>${opLabel(op)}</div><div class="small muted">${fmtDate(op.created, true)}
              ${op.localError ? html` · <span style="color:var(--err)">${op.localError}</span>` : ''}</div></div>
            <button class="btn btn-sm btn-danger" data-a="discard" data-id="${op.op_id}">Elvetés</button>
          </div>`)}` : html`<div class="empty">Minden adat fel van töltve.</div>`}
      </div>

      ${s.rejected.length ? html`<div class="card">
        <div class="card-head"><h2>A szerver által elutasított műveletek</h2></div>
        ${s.rejected.map((r, i) => html`
          <div class="list-item" style="cursor:default">
            <div class="grow"><div>${opLabel(r.op)}</div><div class="small" style="color:var(--err)">${r.error}</div>
              <div class="small muted">${fmtDate(r.at, true)}</div></div>
            <button class="btn btn-sm" data-a="dismiss" data-i="${i}">Tudomásul vettem</button>
          </div>`)}
      </div>` : ''}

      ${demo ? html`<div class="card card-pad">
        <h2>Demo beállítások</h2>
        <p class="small muted">Demo módban az adatok csak ebben a böngészőben vannak. Az offline működést itt kipróbálhatod.</p>
        <label class="check"><input type="checkbox" data-a="offline" ${demo.offline ? 'checked' : ''}> Szimulált offline mód (a szerver „elérhetetlen”)</label>
        <div class="toolbar" style="margin-top:1rem;margin-bottom:0">
          <button class="btn" data-a="switch">Felhasználóváltás</button>
          <button class="btn btn-danger" data-a="reset">Demo adatok újragenerálása</button>
        </div>
      </div>` : ''}`);

    root.onclick = async e => {
      const b = e.target.closest('[data-a]');
      if (!b || b.type === 'checkbox') return;
      const a = b.dataset.a;
      if (a === 'sync') store.sync();
      if (a === 'theme') {
        window.RaktarTheme.set(b.dataset.v);
        root.querySelectorAll('[data-a=theme]').forEach(x => x.classList.toggle('on', x === b));
      }
      if (a === 'logout' || a === 'switch') {
        if (s.outbox.length && !(await confirmDialog('Kijelentkezés', `${s.outbox.length} művelet még nincs feltöltve. Ezek a következő bejelentkezéskor töltődnek fel. Kijelentkezel?`, 'Kijelentkezés'))) return;
        store.logout();
      }
      if (a === 'discard' && await confirmDialog('Elvetés', 'Biztosan elveted ezt a még fel nem töltött műveletet? Nem vonható vissza.', 'Elvetés', 'danger')) {
        store.discardOutboxItem(b.dataset.id);
      }
      if (a === 'dismiss') store.dismissRejected(Number(b.dataset.i));
      if (a === 'reset' && await confirmDialog('Demo adatok', 'Minden demo adat (és a feltöltésre váró műveletek) törlődik, és új véletlen adatok készülnek.', 'Újragenerálás', 'danger')) {
        await demo.reset();
        for (const op of [...s.outbox]) await store.discardOutboxItem(op.op_id);
        await store.sync();
        toast('Új demo adatok betöltve', 'ok');
      }
    };
    root.onchange = e => {
      if (e.target.dataset.a === 'offline') {
        demo.offline = e.target.checked;
        toast(e.target.checked ? 'Szimulált offline mód BE' : 'Szimulált offline mód KI – szinkronizálás…', 'info');
        if (!e.target.checked) store.sync(); else ctx.rerender();
      }
    };
  },
};
