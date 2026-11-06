// Beérkezés: rendelés alapján (pipálással) vagy rendelés nélkül.
import * as store from '../store.js';
import { html, fmtNum, fmtDate, parseNum, confirmDialog, toast, todayInput, dateInputToIso, help, ORDER_STATUS } from '../ui.js';
import { attachPicker } from './common.js';
import { ICONS } from '../icons.js';

const L = window.RaktarLogic;
let draft;
let loading = null;
const save = () => store.drafts.set('beerkezes', draft);

function openOrders() {
  const db = store.state.db;
  return db.Rendelesek.map(o => ({ o, info: L.orderInfo(db, o) }))
    .filter(x => x.info.statusz === 'nyitott' || x.info.statusz === 'reszben')
    .sort((a, b) => (a.o.datum < b.o.datum ? 1 : -1));
}

function startOrder(rid) {
  draft = { mode: 'rendeles', rendeles_id: rid, datum: todayInput(), szallitolevel: '', megjegyzes: '', lezar: false, lines: {} };
  save();
}
function startFree() {
  draft = { mode: 'szabad', beszallito_id: '', datum: todayInput(), szallitolevel: '', megjegyzes: '', items: [] };
  save();
}

function renderStart(root, ctx) {
  const list = openOrders();
  root.innerHTML = String(html`
    <div class="page-head"><h1>Beérkezés</h1>${help('Válaszd ki a megérkezett rendelést, és pipáld ki, mi jött meg. Hiányos szállításnál írd be a ténylegesen megjött mennyiséget – a maradék nyitva marad, vagy lezárhatod a rendelést. A beírt adatok a készüléken azonnal mentődnek.')}
      <div class="actions"><button class="btn" data-a="free">Rendelés nélküli beérkezés</button></div></div>
    <div class="card">
      <div class="card-head"><h2>Nyitott rendelések</h2><span class="badge badge-info">${list.length}</span></div>
      ${list.length ? list.map(({ o, info }) => {
        const open = info.sorok.filter(s => !s.lezarva);
        const [lbl, cls] = ORDER_STATUS[info.statusz];
        return html`<div class="list-item" data-r="${o.rendeles_id}">
          <div class="grow"><b>${store.supplierName(o.beszallito_id)}</b>
            <div class="small muted">${o.rendeles_id} · ${fmtDate(o.datum)} · ${open.length} nyitott sor</div></div>
          <span class="badge badge-${cls}">${lbl}</span><span aria-hidden="true">›</span></div>`;
      }) : html`<div class="empty">Nincs nyitott rendelés.</div>`}
    </div>`);
  root.onclick = e => {
    const r = e.target.closest('[data-r]');
    if (r) { startOrder(r.dataset.r); return ctx.rerender(); }
    if (e.target.closest('[data-a="free"]')) { startFree(); ctx.rerender(); }
  };
}

function headerFields() {
  return html`<div class="form-grid" style="margin-bottom:1rem">
    <label class="field"><span>Beérkezés dátuma</span><input type="date" data-f="datum" value="${draft.datum}" max="${todayInput()}"></label>
    <label class="field"><span>Szállítólevél / számla száma</span><input data-f="szallitolevel" value="${draft.szallitolevel}" placeholder="opcionális"></label>
    <label class="field span-2"><span>Megjegyzés</span><input data-f="megjegyzes" value="${draft.megjegyzes}" placeholder="opcionális"></label>
  </div>`;
}

function renderOrder(root, ctx) {
  const db = store.state.db;
  const o = store.get('Rendelesek', draft.rendeles_id);
  if (!o) { draft = null; save(); return ctx.rerender(); }
  const info = L.orderInfo(db, o);
  const lines = info.sorok.filter(s => !s.lezarva);
  root.innerHTML = String(html`
    <div class="page-head"><h1>Beérkezés: ${store.supplierName(o.beszallito_id)}</h1>
      <span class="badge badge-muted">${o.rendeles_id}</span><span class="small muted">rendelve: ${fmtDate(o.datum)}</span></div>
    <div class="card card-pad">${headerFields()}</div>
    <div class="card">
      <div class="card-head"><h2>Tételek</h2><span class="grow"></span><button class="btn btn-sm" data-a="all">Mind megérkezett</button></div>
      ${lines.length ? html`<div class="table-wrap"><table class="tbl cards">
        <thead><tr><th style="width:40px"></th><th>Tétel</th><th class="num">Rendelt</th><th class="num">Már megjött</th><th class="num">Hátralévő</th><th class="w-qty">Most érkezett</th></tr></thead>
        <tbody>${lines.map(s => {
          const t = store.get('Tetelek', s.tetel_id) || { megnevezes: s.tetel_id, mertekegyseg: '' };
          const rem = L.round3(s.mennyiseg - s.beerkezett);
          const d = draft.lines[s.sor_id] || {};
          return html`<tr data-sor="${s.sor_id}" data-rem="${rem}">
            <td class="c-chk"><input type="checkbox" data-k="on" ${d.on ? 'checked' : ''} aria-label="Megérkezett"></td>
            <td class="c-main">${t.megnevezes}<div class="small muted" style="font-weight:400">${s.cikkszam}</div></td>
            <td class="num c-f1" data-l="Rendelt">${fmtNum(s.mennyiseg)} ${t.mertekegyseg}</td>
            <td class="num c-f2" data-l="Megjött">${fmtNum(s.beerkezett)}</td>
            <td class="num c-f3" data-l="Hátra">${fmtNum(rem)}</td>
            <td class="c-f4" data-l="Most érkezett"><input type="text" inputmode="decimal" data-k="q" value="${d.q ?? ''}" placeholder="${fmtNum(rem)}"></td>
          </tr>`;
        })}</tbody></table></div>` : html`<div class="empty">Ennek a rendelésnek nincs nyitott sora.</div>`}
      <div class="bb-note"><label class="check small"><input type="checkbox" data-f="lezar" ${draft.lezar ? 'checked' : ''}> A ki nem pipált / hiányzó mennyiségre nem várok (rendelés lezárása)</label></div>
      <div class="bottom-bar">
        <span class="grow"></span>
        <button class="btn btn-sm btn-link-danger" data-a="cancel">Mégse</button>
        <button class="btn btn-sm btn-primary" data-a="save">Rögzítés</button>
      </div>
    </div>`);
  bindHeader(root);
  const tbody = root.querySelector('tbody');
  if (tbody) {
    tbody.addEventListener('input', e => {
      const tr = e.target.closest('tr[data-sor]');
      const d = draft.lines[tr.dataset.sor] = draft.lines[tr.dataset.sor] || {};
      if (e.target.dataset.k === 'q') {
        d.q = e.target.value;
        const n = parseNum(d.q);
        d.on = !isNaN(n) && n > 0;
        tr.querySelector('[data-k="on"]').checked = d.on;
      }
      save();
    });
    tbody.addEventListener('change', e => {
      if (e.target.dataset.k !== 'on') return;
      const tr = e.target.closest('tr[data-sor]');
      const d = draft.lines[tr.dataset.sor] = draft.lines[tr.dataset.sor] || {};
      d.on = e.target.checked;
      const inp = tr.querySelector('[data-k="q"]');
      if (d.on && !inp.value) { inp.value = tr.dataset.rem; d.q = tr.dataset.rem; }
      if (!d.on) { inp.value = ''; d.q = ''; }
      save();
    });
  }
  root.onclick = async e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'all') {
      root.querySelectorAll('tr[data-sor]').forEach(tr => {
        draft.lines[tr.dataset.sor] = { on: true, q: tr.dataset.rem };
        tr.querySelector('[data-k="on"]').checked = true;
        tr.querySelector('[data-k="q"]').value = tr.dataset.rem;
      });
      save();
    }
    if (a === 'cancel') await cancel(ctx);
    if (a === 'save') {
      const rows = [];
      for (const s of lines) {
        const d = draft.lines[s.sor_id];
        if (!d || !d.on) continue;
        const q = parseNum(d.q);
        if (isNaN(q) || q <= 0) return toast('Érvénytelen mennyiség: ' + (store.get('Tetelek', s.tetel_id) || {}).megnevezes, 'error');
        rows.push({ mozgas_id: L.newId('M', 12), datum: dateInputToIso(draft.datum), tipus: 'BEERKEZES', tetel_id: s.tetel_id,
          mennyiseg: q, bizonylat: draft.szallitolevel || o.rendeles_id, rendeles_sor_id: s.sor_id, megjegyzes: draft.megjegyzes });
      }
      if (!rows.length && !draft.lezar) return toast('Pipáld ki a megérkezett tételeket.', 'warn');
      if (draft.lezar && !(await confirmDialog('Rendelés lezárása', 'A rendelés lezárul: a hiányzó mennyiségek nem jelennek meg „úton lévőként”, és a rendelési javaslat újra számol velük.', 'Rögzítés és lezárás'))) return;
      try {
        if (rows.length) await store.enqueue({ type: 'mozgasok', rows });
        if (draft.lezar) await store.enqueue({ type: 'rendeles_lezaras', rendeles_id: o.rendeles_id });
        draft = null; await store.drafts.del('beerkezes');
        toast('Beérkezés rögzítve', 'ok');
        ctx.rerender();
      } catch (x) { toast(x.message, 'error', 6000); }
    }
  };
}

function renderFree(root, ctx) {
  const db = store.state.db;
  const sups = db.Beszallitok.filter(b => b.aktiv).sort((a, b) => a.nev.localeCompare(b.nev, 'hu'));
  root.innerHTML = String(html`
    <div class="page-head"><h1>Rendelés nélküli beérkezés</h1></div>
    <div class="card card-pad">
      <div class="form-grid" style="margin-bottom:1rem">
        <label class="field"><span>Beszállító</span><select data-f="beszallito_id"><option value="">— nincs megadva —</option>
          ${sups.map(b => html`<option value="${b.beszallito_id}" ${b.beszallito_id === draft.beszallito_id ? 'selected' : ''}>${b.nev}</option>`)}</select></label>
      </div>
      ${headerFields()}
    </div>
    <div class="card">
      <div class="card-head"><div class="picker" style="flex:1;max-width:420px"><input id="add" placeholder="+ Tétel keresése és hozzáadása…" autocomplete="off"></div></div>
      ${draft.items.length ? html`<div class="table-wrap"><table class="tbl cards"><thead><tr><th>Tétel</th><th class="w-qty">Mennyiség</th><th style="width:50px"></th></tr></thead>
        <tbody>${draft.items.map((it, i) => {
          const t = store.get('Tetelek', it.tetel_id) || { megnevezes: it.tetel_id, mertekegyseg: '' };
          return html`<tr data-i="${i}" class="cards-free"><td class="c-main">${t.megnevezes}<div class="small muted" style="font-weight:400">${store.placeLabel(t)} · ${t.mertekegyseg}</div></td>
            <td class="c-f1" data-l="Mennyiség"><input type="text" inputmode="decimal" data-k="q" value="${it.q}" placeholder="${t.mertekegyseg}"></td>
            <td class="c-act"><div class="row-icons"><button class="icon-btn" data-a="del" data-i="${i}" aria-label="Törlés" title="Törlés">${ICONS.x}</button></div></td></tr>`;
        })}</tbody></table></div>` : html`<div class="empty">Keress rá a beérkezett tételekre, és add hozzá őket.</div>`}
      <div class="bottom-bar"><span class="grow"></span>
        <button class="btn btn-sm btn-link-danger" data-a="cancel">Mégse</button>
        <button class="btn btn-sm btn-primary" data-a="save">Rögzítés</button></div>
    </div>`);
  bindHeader(root);
  attachPicker(root.querySelector('#add'), {
    items: () => {
      const list = store.activeItems();
      if (!draft.beszallito_id) return list;
      const has = new Set(db.Forrasok.filter(f => f.beszallito_id === draft.beszallito_id).map(f => f.tetel_id));
      return [...list.filter(t => has.has(t.tetel_id)), ...list.filter(t => !has.has(t.tetel_id))];
    },
    exclude: () => new Set(draft.items.map(x => x.tetel_id)),
    defaultSupplier: () => draft.beszallito_id,
    onPick: t => {
      draft.items.push({ tetel_id: t.tetel_id, q: '' });
      save(); ctx.rerender();
      const inputs = root.querySelectorAll('[data-k="q"]');
      if (inputs.length) inputs[inputs.length - 1].focus();
    },
  });
  root.querySelector('tbody')?.addEventListener('input', e => {
    const tr = e.target.closest('tr[data-i]');
    draft.items[Number(tr.dataset.i)].q = e.target.value;
    save();
  });
  root.onclick = async e => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    if (b.dataset.a === 'del') { draft.items.splice(Number(b.dataset.i), 1); save(); ctx.rerender(); }
    if (b.dataset.a === 'cancel') await cancel(ctx);
    if (b.dataset.a === 'save') {
      if (!draft.items.length) return toast('Adj hozzá legalább egy tételt.', 'warn');
      const rows = [];
      for (const it of draft.items) {
        const q = parseNum(it.q);
        if (isNaN(q) || q <= 0) return toast('Hiányzó vagy hibás mennyiség: ' + store.get('Tetelek', it.tetel_id).megnevezes, 'error');
        const sup = draft.beszallito_id ? store.supplierName(draft.beszallito_id) : '';
        rows.push({ mozgas_id: L.newId('M', 12), datum: dateInputToIso(draft.datum), tipus: 'BEERKEZES', tetel_id: it.tetel_id,
          mennyiseg: q, bizonylat: draft.szallitolevel || 'Rendelés nélkül', megjegyzes: [sup, draft.megjegyzes].filter(Boolean).join(' – ') });
      }
      try {
        await store.enqueue({ type: 'mozgasok', rows });
        draft = null; await store.drafts.del('beerkezes');
        toast('Beérkezés rögzítve', 'ok');
        ctx.rerender();
      } catch (x) { toast(x.message, 'error', 6000); }
    }
  };
}

function bindHeader(root) {
  root.querySelectorAll('[data-f]').forEach(el => {
    el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
      draft[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
      save();
    });
  });
}

async function cancel(ctx) {
  if (!(await confirmDialog('Mégse', 'A beírt adatok elvesznek. Biztosan kilépsz?', 'Kilépés', 'danger'))) return;
  draft = null;
  await store.drafts.del('beerkezes');
  ctx.rerender();
}

export default {
  get liveUpdate() { return !draft; },
  render(root, params, ctx) {
    if (draft === undefined) {
      root.innerHTML = '<p class="muted">Betöltés…</p>';
      loading = loading || store.drafts.get('beerkezes').then(d => { draft = d || null; });
      loading.then(() => ctx.rerender());
      return;
    }
    if (params.r) {
      const rid = params.r;
      delete params.r;
      history.replaceState(null, '', '#/beerkezes');
      if (draft && !(draft.mode === 'rendeles' && draft.rendeles_id === rid)) {
        toast('Egy másik beérkezés rögzítése folyamatban van – előbb fejezd be vagy vesd el.', 'warn', 6000);
      } else if (!draft && store.get('Rendelesek', rid)) startOrder(rid);
    }
    if (!draft) renderStart(root, ctx);
    else if (draft.mode === 'rendeles') renderOrder(root, ctx);
    else renderFree(root, ctx);
  },
};
