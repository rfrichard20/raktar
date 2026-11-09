// Kivét – a Leltár mintájára: kezdőlap (kivétfajták + korábbi kivételek) → indító ablak (átvevő, munka…)
// → kivét űrlap (tételek) → lezárás. A félbehagyott kivét a készüléken marad (vázlat), offline is folytatható.
import * as store from '../store.js';
import { html, fmtNum, fmtDate, parseNum, confirmDialog, toast, help, modal, matcher, compare, sortArrow, formValues } from '../ui.js';
import { attachPicker, kivetFields, saveKivet, moveIcon } from './common.js';
import { ICONS } from '../icons.js';

const L = window.RaktarLogic;
// Vázlat: { fajta, atvevo, munka, datum, megjegyzes, items: [{ tetel_id, q }] }.
// A korábbi (fajta nélküli) vázlat is folytatható anyagkivétként.
const slot = store.draftSlot('kivet', d => (d && d.items && d.atvevo ? { fajta: 'anyag', ...d } : null));
const ui = { q: '', sort: 'datum', dir: -1, all: false };

/**
 * Kivétfajták – a kezdőlap kártyái. Új fajta (pl. szerszámkiadás saját mezőkkel) ide vehető fel;
 * a fajta a vázlatban is tárolódik, így az űrlap és a lezárás fajtánként eltérhet.
 */
const KINDS = {
  anyag: { title: 'Anyagkivét', sub: 'elvitt anyag – kinek, melyik munkára' },
};

const save = slot.save;

/** Indító / módosító ablak a kivét fejadataihoz. Visszaad: a megadott adatok, vagy null (Mégse). */
function headerDialog(fajta, current) {
  return modal({
    title: current ? 'Kivét adatai' : `Új ${KINDS[fajta].title.toLowerCase()}`,
    body: html`<div class="form-grid">${kivetFields(current || {})}</div>`,
    actions: [{ label: 'Mégse', value: null }, {
      label: current ? 'Mentés' : 'Indítás', kind: 'primary', onClick: el => {
        const v = formValues(el);
        if (!v.atvevo.trim()) { toast('Add meg, ki vitte el (átvevő).', 'error'); return false; }
        return v;
      },
    }],
  }).done;
}

/* ---------- Korábbi kivételek ---------- */
// [kulcs, fejléc, rendezési érték, osztály]
const H_COLS = [
  ['datum', 'Dátum', w => w.datum, ''],
  ['atvevo', 'Átvevő', w => store.userName(w.atvevo), ''],
  ['munka', 'Munka / projekt', w => w.munka || '', ''],
  ['n', 'Tételek', w => w.sorok.length, 'num'],
  ['ki', 'Rögzítette', w => store.userName(w.felhasznalo), 'm-hide'],
];

function historyBody() {
  const match = matcher(ui.q);
  const col = H_COLS.find(c => c[0] === ui.sort) || H_COLS[0];
  const list = L.withdrawals(store.state.db)
    .filter(w => match(`${w.bizonylat} ${store.userName(w.atvevo)} ${w.munka} ${w.megjegyzes} ${fmtDate(w.datum)} ${w.sorok.map(m => store.itemOrStub(m.tetel_id).megnevezes).join(' ')}`))
    .sort((a, b) => compare(col[2](a), col[2](b)) * ui.dir);
  const shown = ui.all ? list : list.slice(0, 15);
  return html`<table class="tbl cards fixed nochk">
    <colgroup><col style="width:16%"><col style="width:22%"><col><col style="width:10%"><col class="m-hide" style="width:20%"></colgroup>
    <thead><tr>${H_COLS.map(([k, l, , cls]) => html`<th class="sortable ${cls}" data-hsort="${k}">${l}<span class="arrow">${sortArrow(ui.sort === k, ui.dir)}</span></th>`)}</tr></thead>
    <tbody>${shown.length ? shown.map(w => html`<tr class="click" data-w="${w.bizonylat}" tabindex="0">
      <td class="c-main">${fmtDate(w.datum)}</td>
      <td class="c-f1" data-l="Átvevő">${store.userName(w.atvevo) || '–'}</td>
      <td class="c-f2" data-l="Munka">${w.munka || html`<span class="muted">–</span>`}</td>
      <td class="num c-f3" data-l="Tételek">${w.sorok.length}</td>
      <td class="m-hide">${store.userName(w.felhasznalo)}</td>
    </tr>`) : html`<tr><td colspan="5" class="empty">${ui.q ? 'Nincs a keresésnek megfelelő kivét.' : 'Még nincs rögzített kivét.'}</td></tr>`}</tbody></table>
    ${list.length > shown.length ? html`<button class="btn btn-sm btn-block list-more" data-a="more">Összes megjelenítése (${list.length})</button>` : ''}`;
}

function showWithdrawal(bizonylat) {
  const w = L.withdrawals(store.state.db).find(x => x.bizonylat === bizonylat);
  if (!w) return;
  modal({
    title: `Kivét – ${fmtDate(w.datum)}`,
    wide: true,
    body: html`
      <dl class="facts facts-row">
        <div><dt>Átvevő</dt><dd>${store.userName(w.atvevo) || '–'}</dd></div>
        <div><dt>Munka / projekt</dt><dd>${w.munka || '–'}</dd></div>
        <div><dt>Rögzítette</dt><dd>${store.userName(w.felhasznalo)}</dd></div>
        <div><dt>Feltöltve</dt><dd>${fmtDate(w.rogzitve, true)}</dd></div>
        <div><dt>Bizonylat</dt><dd class="small">${w.bizonylat}</dd></div>
        ${w.megjegyzes ? html`<div><dt>Megjegyzés</dt><dd>${w.megjegyzes}</dd></div>` : ''}
      </dl>
      <div class="table-wrap" style="margin-top:1rem"><table class="tbl cards nochk eq3">
        <thead><tr><th>Tétel</th><th>Hely</th><th class="num">Mennyiség</th></tr></thead>
        <tbody>${w.sorok.map(m => { const t = store.itemOrStub(m.tetel_id); return html`<tr>
          <td class="c-main">${t.megnevezes}</td>
          <td class="c-f1" data-l="Hely">${t.raktar || t.polc ? store.placeLabel(t) : '–'}</td>
          <td class="num c-f2" data-l="Mennyiség"><span class="move-date">${moveIcon('KIVET')} <b>${fmtNum(m.mennyiseg)}</b> <span class="small muted">${t.mertekegyseg}</span></span></td>
        </tr>`; })}</tbody></table></div>`,
    actions: [{ label: 'Bezárás', value: null }],
  });
}

/* ---------- Új kivét ---------- */
function itemRows() {
  return slot.draft.items.map((it, i) => {
    const t = store.itemOrStub(it.tetel_id);
    const st = store.state.stock[it.tetel_id] || { keszlet: 0 };
    const q = parseNum(it.q);
    return html`<tr data-i="${i}">
      <td class="c-main">${t.megnevezes}<div class="sub">${store.placeLabel(t)}</div></td>
      <td class="num c-f1" data-l="Készlet">${fmtNum(st.keszlet)} <span class="small muted">${t.mertekegyseg}</span></td>
      <td class="c-f2 c-span2" data-l="Kivét"><input type="text" inputmode="decimal" data-k="q" value="${it.q}" placeholder="${t.mertekegyseg}" aria-label="${t.megnevezes} kivett mennyiség">
        <div class="small t-warn" data-over>${q > st.keszlet ? 'Több, mint a készlet!' : ''}</div></td>
      <td class="c-act"><button class="icon-btn" data-a="del" title="Levétel" aria-label="Levétel">${ICONS.x}</button></td>
    </tr>`;
  });
}

/* ---------- Kezdőlap ---------- */
function renderStart(root, ctx) {
  root.innerHTML = String(html`
    <div class="page-head"><h1>Kivét</h1>${help(html`Az elvitt anyagok rögzítése. Válaszd ki a kivét fajtáját, add meg, ki vitte el és melyik munkára, majd keresd ki a tételeket. A kivét lezáráskor csökkenti a készletet; ha többet visznek el, mint a nyilvántartott, az is rögzíthető – a következő leltár rendezi az eltérést.<br><br>Egy tétel gyorsan a tétel adatlapjáról is kivehető („Kivét…”).`)}</div>
    <div class="choice-row">${Object.entries(KINDS).map(([k, d]) => html`
      <button class="card choice" data-start="${k}"><span class="big">${ICONS.out}</span>
        <span><b>${d.title}</b><span class="small muted d-block">${d.sub}</span></span></button>`)}</div>
    <div class="card" style="margin-top:1rem">
      <div class="card-head"><h2 class="grow">Korábbi kivételek</h2></div>
      <div class="toolbar card-toolbar"><input type="search" data-hq placeholder="Keresés (átvevő, munka, tétel, dátum)…" value="${ui.q}"></div>
      <div class="table-wrap" data-hbody>${historyBody()}</div>
    </div>`);
  const refreshHistory = () => { root.querySelector('[data-hbody]').innerHTML = String(historyBody()); };
  root.querySelector('[data-hq]').addEventListener('input', e => { ui.q = e.target.value; refreshHistory(); });
  root.onclick = async e => {
    const th = e.target.closest('[data-hsort]');
    if (th) {
      const k = th.dataset.hsort;
      ui.dir = ui.sort === k ? -ui.dir : (k === 'datum' || k === 'n' ? -1 : 1);
      ui.sort = k;
      return refreshHistory();
    }
    const row = e.target.closest('[data-w]');
    if (row) return showWithdrawal(row.dataset.w);
    if (e.target.closest('[data-a="more"]')) { ui.all = true; return refreshHistory(); }
    const st = e.target.closest('[data-start]');
    if (st) {
      const v = await headerDialog(st.dataset.start);
      if (!v) return;
      slot.draft = { fajta: st.dataset.start, ...v, items: [] };
      save(); ctx.rerender();
      root.querySelector('#add')?.focus();
    }
  };
}

/* ---------- Kivét űrlap ---------- */
function renderForm(root, ctx) {
  const kind = KINDS[slot.draft.fajta] || KINDS.anyag;
  root.innerHTML = String(html`
    <div class="page-head"><h1>${kind.title}</h1></div>
    <div class="card card-pad">
      <dl class="facts facts-row facts-plain">
        <div><dt>Átvevő</dt><dd>${slot.draft.atvevo}</dd></div>
        <div><dt>Munka / projekt</dt><dd>${slot.draft.munka || '–'}</dd></div>
        <div><dt>Dátum</dt><dd>${fmtDate(slot.draft.datum)}</dd></div>
        ${slot.draft.megjegyzes ? html`<div><dt>Megjegyzés</dt><dd>${slot.draft.megjegyzes}</dd></div>` : ''}
        <div class="facts-act"><button class="btn btn-sm" data-a="edit">${ICONS.edit} Módosítás</button></div>
      </dl>
    </div>
    <div class="card">
      <div class="card-head sticky-search"><div class="picker head-main"><input id="add" placeholder="+ Tétel keresése és hozzáadása…" autocomplete="off"></div></div>
      ${slot.draft.items.length ? html`<div class="table-wrap"><table class="tbl cards nochk fixed">
        <colgroup><col><col style="width:18%"><col style="width:22%"><col style="width:56px"></colgroup>
        <thead><tr><th>Tétel</th><th class="num">Készlet</th><th>Kivett mennyiség</th><th></th></tr></thead>
        <tbody data-items>${itemRows()}</tbody></table></div>`
        : html`<div class="empty">Keresd ki a kivett tételeket, és add hozzá őket.</div>`}
      <div class="bottom-bar"><span class="grow small muted">${slot.draft.items.length ? `${slot.draft.items.length} tétel` : ''}</span>
        <button class="btn btn-sm btn-link-danger" data-a="cancel">Elvetés</button>
        <button class="btn btn-sm btn-primary" data-a="save" ${slot.draft.items.length ? '' : 'disabled'}>Kivét lezárása</button></div>
    </div>`);

  attachPicker(root.querySelector('#add'), {
    items: store.activeItems,
    exclude: () => new Set(slot.draft.items.map(x => x.tetel_id)),
    onPick: t => {
      slot.draft.items.push({ tetel_id: t.tetel_id, q: '' });
      save(); ctx.rerender();
      const inputs = root.querySelectorAll('[data-k="q"]');
      if (inputs.length) inputs[inputs.length - 1].focus();
    },
  });
  root.querySelector('[data-items]')?.addEventListener('input', e => {
    const tr = e.target.closest('tr[data-i]');
    if (!tr || e.target.dataset.k !== 'q') return;
    const it = slot.draft.items[Number(tr.dataset.i)];
    it.q = e.target.value;
    const q = parseNum(it.q), st = store.state.stock[it.tetel_id] || { keszlet: 0 };
    tr.querySelector('[data-over]').textContent = q > st.keszlet ? 'Több, mint a készlet!' : '';
    save();
  });

  root.onclick = async e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'edit') {
      const v = await headerDialog(slot.draft.fajta, slot.draft);
      if (v) { Object.assign(slot.draft, v); save(); ctx.rerender(); }
    }
    if (a === 'del') { slot.draft.items.splice(Number(e.target.closest('tr').dataset.i), 1); save(); return ctx.rerender(); }
    if (a === 'cancel') {
      if (slot.draft.items.length && !(await confirmDialog('Elvetés', 'A beírt kivét elvész. Biztosan elveted?', 'Elvetés', 'danger'))) return;
      await slot.clear(); return ctx.rerender();
    }
    if (a === 'save') {
      await slot.once(async () => {
        const ok = await saveKivet(slot.draft.items.map(it => ({ tetel_id: it.tetel_id, q: parseNum(it.q) })), slot.draft);
        if (ok) { await slot.clear(); ctx.rerender(); }
      });
    }
  };
}

export default {
  // Kivét közben nem rajzoljuk újra (fókusz, gépelés megmarad); a kezdőlap frissülhet
  get liveUpdate() { return !slot.draft; },
  render(root, params, ctx) {
    if (!slot.ready(root, ctx)) return;
    if (slot.draft) renderForm(root, ctx); else renderStart(root, ctx);
  },
};
