// Beérkezés: rendelés alapján (pipálással) vagy rendelés nélkül.
import * as store from '../store.js';
import { html, fmtNum, fmtDate, parseNum, confirmDialog, toast, todayInput, dateInputToIso, help, matcher, compare, sortArrow, ORDER_STATUS } from '../ui.js';
import { attachPicker, enterBackHtml, bindEnterBack, filterButton, openFilter, inSel } from './common.js';
import { ICONS } from '../icons.js';

const L = window.RaktarLogic;
// Vázlat: rendelés alapján { mode: 'rendeles', rendeles_id, lines: { sor_id: { on, q } }, … }
// vagy rendelés nélkül { mode: 'szabad', beszallito_id, items: [{ tetel_id, q }], … }
const slot = store.draftSlot('beerkezes');
const save = slot.save;

function startOrder(rid) {
  slot.draft = { mode: 'rendeles', rendeles_id: rid, datum: todayInput(), szallitolevel: '', megjegyzes: '', lezar: false, lines: {} };
  save();
}
function startFree() {
  slot.draft = { mode: 'szabad', beszallito_id: '', datum: todayInput(), szallitolevel: '', megjegyzes: '', items: [] };
  save();
}

// Nyitott rendelések táblázata: [kulcs, fejléc, rendezési érték, osztály]
const ui = { q: '', f: { st: new Set() }, sort: 'datum', dir: -1 };
const O_COLS = [
  ['besz', 'Beszállító', x => store.supplierName(x.o.beszallito_id), ''],
  ['azon', 'Rendelés', x => x.o.rendeles_id, ''],
  ['datum', 'Dátum', x => x.o.datum, ''],
  ['nyitott', 'Nyitott sor', x => x.open, 'num'],
  ['statusz', 'Állapot', x => x.info.statusz, ''],
];

function startBody() {
  const match = matcher(ui.q);
  const col = O_COLS.find(c => c[0] === ui.sort) || O_COLS[2];
  const list = store.openOrders().map(x => ({ ...x, open: x.info.sorok.filter(s => !s.lezarva).length }))
    .filter(x => inSel(ui.f.st, x.info.statusz) && match(store.orderSearchText(x.o)))
    .sort((a, b) => compare(col[2](a), col[2](b)) * ui.dir);
  return html`<table class="tbl cards fixed nochk">
    <colgroup><col><col style="width:22%"><col style="width:14%"><col style="width:12%"><col style="width:17%"></colgroup>
    <thead><tr>${O_COLS.map(([k, l, , cls]) => html`<th class="sortable ${cls}" data-osort="${k}">${l}<span class="arrow">${sortArrow(ui.sort === k, ui.dir)}</span></th>`)}</tr></thead>
    <tbody>${list.length ? list.map(({ o, info, open }) => {
      const [lbl, cls] = ORDER_STATUS[info.statusz];
      return html`<tr class="click" data-r="${o.rendeles_id}" tabindex="0">
        <td class="c-main">${store.supplierName(o.beszallito_id)}${o.megjegyzes && o.megjegyzes !== 'Webshop' ? html`<div class="sub">${o.megjegyzes}</div>` : ''}</td>
        <td class="c-meta">${o.rendeles_id}${o.belso_azon ? html`<div class="muted">${o.belso_azon}</div>` : ''}</td>
        <td class="c-f1" data-l="Dátum">${fmtDate(o.datum)}</td>
        <td class="num c-f2" data-l="Nyitott sor">${open} / ${info.sorok.length}</td>
        <td class="c-f3" data-l="Állapot"><span class="badge badge-${cls}">${lbl}</span></td>
      </tr>`;
    }) : html`<tr><td colspan="5" class="empty">${ui.q || ui.f.st.size ? 'Nincs a szűrésnek megfelelő rendelés.' : 'Nincs nyitott rendelés.'}</td></tr>`}</tbody></table>`;
}

function renderStart(root, ctx) {
  const count = store.openOrders().length;
  root.innerHTML = String(html`
    <div class="page-head"><h1>Beérkezés</h1>${help(html`Válaszd ki a megérkezett rendelést, és pipáld ki, mi jött meg. Hiányos szállításnál írd be a ténylegesen megjött mennyiséget – a maradék nyitva marad, vagy lezárhatod a rendelést. A beírt adatok a készüléken azonnal mentődnek.<br><br>„Rendelés nélkül”: olyan áru rögzítése, amihez nem készült rendelés az appban.`)}
      <div class="actions"><button class="btn" data-a="free" title="Rendelés nélküli beérkezés rögzítése">+ Rendelés nélkül</button></div></div>
    <div class="card">
      <div class="card-head"><h2 class="grow">Nyitott rendelések</h2><span class="badge badge-info">${count}</span></div>
      ${count ? html`<div class="toolbar card-toolbar">
        <input type="search" data-oq placeholder="Keresés (beszállító, rendelésszám, azonosító)…" value="${ui.q}">
        ${filterButton(ui.f)}
      </div>` : ''}
      <div class="table-wrap" data-obody>${startBody()}</div>
    </div>`);
  const refresh = () => { root.querySelector('[data-obody]').innerHTML = String(startBody()); };
  const groups = () => [{ key: 'st', title: 'Állapot', options: ['nyitott', 'reszben'].map(k => [k, ORDER_STATUS[k][0]]) }];
  root.querySelector('[data-oq]')?.addEventListener('input', e => { ui.q = e.target.value; refresh(); });
  root.onclick = e => {
    const fb = e.target.closest('[data-filter]');
    if (fb) return openFilter(fb, groups, ui.f, refresh);
    const th = e.target.closest('[data-osort]');
    if (th) { const k = th.dataset.osort; ui.dir = ui.sort === k ? -ui.dir : (k === 'datum' || k === 'nyitott' ? -1 : 1); ui.sort = k; return refresh(); }
    const r = e.target.closest('[data-r]');
    if (r) { startOrder(r.dataset.r); return ctx.rerender(); }
    if (e.target.closest('[data-a="free"]')) { startFree(); ctx.rerender(); }
  };
}

function headerFields() {
  return html`<div class="form-grid" style="margin-bottom:1rem">
    <label class="field"><span>Beérkezés dátuma</span><input type="date" data-f="datum" value="${slot.draft.datum}" max="${todayInput()}"></label>
    <label class="field"><span>Szállítólevél / számla száma</span><input data-f="szallitolevel" value="${slot.draft.szallitolevel}" placeholder="opcionális"></label>
    <label class="field span-2"><span>Megjegyzés</span><input data-f="megjegyzes" value="${slot.draft.megjegyzes}" placeholder="opcionális"></label>
  </div>`;
}

function renderOrder(root, ctx) {
  const db = store.state.db;
  const o = store.get('Rendelesek', slot.draft.rendeles_id);
  if (!o) { slot.clear(); return ctx.rerender(); }
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
          const t = store.itemOrStub(s.tetel_id);
          const rem = L.round3(s.mennyiseg - s.beerkezett);
          const d = slot.draft.lines[s.sor_id] || {};
          return html`<tr data-sor="${s.sor_id}" data-rem="${rem}">
            <td class="c-chk"><input type="checkbox" data-k="on" ${d.on ? 'checked' : ''} aria-label="Megérkezett"></td>
            <td class="c-main">${t.megnevezes}<div class="sub">${s.cikkszam}</div></td>
            <td class="num c-f1" data-l="Rendelt">${fmtNum(s.mennyiseg)} ${t.mertekegyseg}</td>
            <td class="num c-f2" data-l="Megjött">${fmtNum(s.beerkezett)}</td>
            <td class="num c-f3" data-l="Hátra">${fmtNum(rem)}</td>
            <td class="c-f4" data-l="Most érkezett"><input type="text" inputmode="decimal" data-k="q" value="${d.q ?? ''}" placeholder="${fmtNum(rem)}"></td>
          </tr>`;
        })}</tbody></table></div>` : html`<div class="empty">Ennek a rendelésnek nincs nyitott sora.</div>`}
      <div class="bb-note"><label class="check small"><input type="checkbox" data-f="lezar" ${slot.draft.lezar ? 'checked' : ''}> A ki nem pipált / hiányzó mennyiségre nem várok (rendelés lezárása)</label></div>
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
      const d = slot.draft.lines[tr.dataset.sor] = slot.draft.lines[tr.dataset.sor] || {};
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
      const d = slot.draft.lines[tr.dataset.sor] = slot.draft.lines[tr.dataset.sor] || {};
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
        slot.draft.lines[tr.dataset.sor] = { on: true, q: tr.dataset.rem };
        tr.querySelector('[data-k="on"]').checked = true;
        tr.querySelector('[data-k="q"]').value = tr.dataset.rem;
      });
      save();
    }
    if (a === 'cancel') await cancel(ctx);
    if (a === 'save') {
      const rows = [];
      for (const s of lines) {
        const d = slot.draft.lines[s.sor_id];
        if (!d || !d.on) continue;
        const q = parseNum(d.q);
        if (isNaN(q) || q <= 0) return toast('Érvénytelen mennyiség: ' + (store.get('Tetelek', s.tetel_id) || {}).megnevezes, 'error');
        rows.push({ mozgas_id: L.newId('M', 12), datum: dateInputToIso(slot.draft.datum), tipus: 'BEERKEZES', tetel_id: s.tetel_id,
          mennyiseg: q, bizonylat: slot.draft.szallitolevel || o.rendeles_id, rendeles_sor_id: s.sor_id, megjegyzes: slot.draft.megjegyzes });
      }
      if (!rows.length && !slot.draft.lezar) return toast('Pipáld ki a megérkezett tételeket.', 'warn');
      await slot.once(async () => {
        try {
          if (slot.draft.lezar && !(await confirmDialog('Rendelés lezárása', 'A rendelés lezárul: a hiányzó mennyiségek nem jelennek meg „úton lévőként”, és a rendelési javaslat újra számol velük.', 'Rögzítés és lezárás'))) return;
          const lezar = slot.draft.lezar;
          if (rows.length) {
            await store.enqueue({ type: 'mozgasok', rows });
            // A beérkezés rögzítve: a vázlat azonnal törlődik, hogy egy újabb „Rögzítés” ne vigye fel kétszer
            await slot.clear();
          }
          if (lezar) {
            try { await store.enqueue({ type: 'rendeles_lezaras', rendeles_id: o.rendeles_id }); }
            catch (x) { if (slot.draft) throw x; toast('A beérkezés rögzítve, de a rendelés lezárása nem sikerült: ' + x.message, 'error', 8000); }
          }
          await slot.clear();
          toast('Beérkezés rögzítve', 'ok');
          ctx.rerender();
        } catch (x) { toast(x.message, 'error', 6000); }
      });
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
          ${sups.map(b => html`<option value="${b.beszallito_id}" ${b.beszallito_id === slot.draft.beszallito_id ? 'selected' : ''}>${b.nev}</option>`)}</select></label>
      </div>
      ${headerFields()}
    </div>
    <div class="card">
      <div class="card-head sticky-search"><div class="picker head-main"><input id="add" placeholder="+ Tétel keresése és hozzáadása…" autocomplete="off"></div>${enterBackHtml()}</div>
      ${slot.draft.items.length ? html`<div class="table-wrap"><table class="tbl cards nochk"><thead><tr><th>Tétel</th><th class="w-qty">Mennyiség</th><th style="width:50px"></th></tr></thead>
        <tbody>${slot.draft.items.map((it, i) => {
          const t = store.itemOrStub(it.tetel_id);
          return html`<tr data-i="${i}"><td class="c-main">${t.megnevezes}<div class="sub">${store.placeLabel(t)} · ${t.mertekegyseg}</div></td>
            <td class="c-f1" data-l="Mennyiség"><input type="text" inputmode="decimal" data-k="q" value="${it.q}" placeholder="${t.mertekegyseg}"></td>
            <td class="c-act"><div class="row-icons"><button class="icon-btn" data-a="del" data-i="${i}" aria-label="Törlés" title="Törlés">${ICONS.x}</button></div></td></tr>`;
        })}</tbody></table></div>` : html`<div class="empty">Keress rá a beérkezett tételekre, és add hozzá őket.</div>`}
      <div class="bottom-bar"><span class="grow"></span>
        <button class="btn btn-sm btn-link-danger" data-a="cancel">Mégse</button>
        <button class="btn btn-sm btn-primary" data-a="save">Rögzítés</button></div>
    </div>`);
  bindHeader(root);
  bindEnterBack(root.querySelector('#add'));
  attachPicker(root.querySelector('#add'), {
    items: () => {
      const list = store.activeItems();
      if (!slot.draft.beszallito_id) return list;
      const has = new Set(db.Forrasok.filter(f => f.beszallito_id === slot.draft.beszallito_id).map(f => f.tetel_id));
      return [...list.filter(t => has.has(t.tetel_id)), ...list.filter(t => !has.has(t.tetel_id))];
    },
    exclude: () => new Set(slot.draft.items.map(x => x.tetel_id)),
    defaultSupplier: () => slot.draft.beszallito_id,
    onPick: t => {
      slot.draft.items.push({ tetel_id: t.tetel_id, q: '' });
      save(); ctx.rerender();
      const inputs = root.querySelectorAll('[data-k="q"]');
      if (inputs.length) inputs[inputs.length - 1].focus();
    },
  });
  root.querySelector('tbody')?.addEventListener('input', e => {
    const tr = e.target.closest('tr[data-i]');
    slot.draft.items[Number(tr.dataset.i)].q = e.target.value;
    save();
  });
  root.onclick = async e => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    if (b.dataset.a === 'del') { slot.draft.items.splice(Number(b.dataset.i), 1); save(); ctx.rerender(); }
    if (b.dataset.a === 'cancel') await cancel(ctx);
    if (b.dataset.a === 'save') {
      if (!slot.draft.items.length) return toast('Adj hozzá legalább egy tételt.', 'warn');
      const rows = [];
      for (const it of slot.draft.items) {
        const q = parseNum(it.q);
        if (isNaN(q) || q <= 0) return toast('Hiányzó vagy hibás mennyiség: ' + store.itemOrStub(it.tetel_id).megnevezes, 'error');
        const sup = slot.draft.beszallito_id ? store.supplierName(slot.draft.beszallito_id) : '';
        rows.push({ mozgas_id: L.newId('M', 12), datum: dateInputToIso(slot.draft.datum), tipus: 'BEERKEZES', tetel_id: it.tetel_id,
          mennyiseg: q, bizonylat: slot.draft.szallitolevel || 'Rendelés nélkül', megjegyzes: [sup, slot.draft.megjegyzes].filter(Boolean).join(' – ') });
      }
      await slot.once(async () => {
        try {
          await store.enqueue({ type: 'mozgasok', rows });
          await slot.clear();
          toast('Beérkezés rögzítve', 'ok');
          ctx.rerender();
        } catch (x) { toast(x.message, 'error', 6000); }
      });
    }
  };
}

function bindHeader(root) {
  root.querySelectorAll('[data-f]').forEach(el => {
    el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
      slot.draft[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
      save();
    });
  });
}

async function cancel(ctx) {
  if (!(await confirmDialog('Mégse', 'A beírt adatok elvesznek. Biztosan kilépsz?', 'Kilépés', 'danger'))) return;
  await slot.clear();
  ctx.rerender();
}

export default {
  get liveUpdate() { return !slot.draft; },
  render(root, params, ctx) {
    if (!slot.ready(root, ctx)) return;
    if (params.r) {
      const rid = params.r;
      delete params.r;
      history.replaceState(null, '', '#/beerkezes');
      if (slot.draft && !(slot.draft.mode === 'rendeles' && slot.draft.rendeles_id === rid)) {
        toast('Egy másik beérkezés rögzítése folyamatban van – előbb fejezd be vagy vesd el.', 'warn', 6000);
      } else if (!slot.draft && store.get('Rendelesek', rid)) startOrder(rid);
    }
    if (!slot.draft) renderStart(root, ctx);
    else if (slot.draft.mode === 'rendeles') renderOrder(root, ctx);
    else renderFree(root, ctx);
  },
};
