// Leltár: teljes, kategória szerinti vagy esedékes tételek számlálása.
// A beírt értékek minden billentyűleütéskor a készüléken tárolódnak; lezáráskor kerülnek a kimenő sorba.
import * as store from '../store.js';
import { html, fmtNum, fmtDate, matcher, compare, sortArrow, dateStamp, parseNum, confirmDialog, toast, help, popover, modal, sec, todayInput, dateInputToIso, copyText } from '../ui.js';
import { addOffers, itemSelector, templates, tplIds, filterButton, openFilter, inSel, countOptions } from './common.js';

const L = window.RaktarLogic;
// Vázlat: { id, label, started, items: [tetel_id], counts: { tetel_id: { q, at } } }
const slot = store.draftSlot('leltar');
// cats / whs: indítás (raktár / kategória választó); cf: a számlálólap szűrője; sSel: korábbi leltárak szűrője
const ui = { q: '', cats: new Set(), whs: new Set(), sSel: { ki: new Set() },
  cf: { wh: new Set(), polc: new Set(), cat: new Set(), egyeb: new Set() } };

const save = slot.save;

const sortItems = ids => ids.map(id => store.get('Tetelek', id)).filter(Boolean).sort(store.byPlace).map(t => t.tetel_id);

function start(ids, label) {
  if (!ids.length) { toast('Nincs leltározandó tétel.', 'warn'); return; }
  const d = new Date();
  slot.draft = {
    id: `LT-${dateStamp(d)}-${L.newId('', 4)}`,
    label, started: d.toISOString(), items: sortItems(ids), counts: {},
  };
  ui.q = ''; Object.values(ui.cf).forEach(x => x.clear());
  save();
}

/* ---------- Korábbi leltárak ---------- */
const dateRange = s => (fmtDate(s.tol) === fmtDate(s.ig) ? fmtDate(s.ig) : `${fmtDate(s.tol)} – ${fmtDate(s.ig)}`);

// Táblázat oszlopai: [kulcs, fejléc, rendezési érték, osztály]
const S_COLS = [
  ['datum', 'Dátum', s => s.ig, ''], ['bizonylat', 'Bizonylat', s => s.bizonylat, 'm-hide'],
  ['ki', 'Rögzítette', s => s.kik.map(e => store.userName(e)).join(', '), ''],
  ['n', 'Tételek', s => s.n, 'num'], ['elteres', 'Eltérő', s => s.elteres, 'num'],
];

function sessionRows() {
  const all = L.inventorySessions(store.state.db);
  const f = ui.sf || (ui.sf = { q: '', sort: 'datum', dir: -1 });
  const match = matcher(f.q);
  const col = S_COLS.find(c => c[0] === f.sort) || S_COLS[0];
  const list = all.filter(s => (!ui.sSel.ki.size || s.kik.some(k => ui.sSel.ki.has(k))) &&
    match(`${s.bizonylat} ${fmtDate(s.ig)} ${s.kik.map(e => store.userName(e)).join(' ')}`))
    .sort((a, b) => compare(col[2](a), col[2](b)) * f.dir);
  return { all, list, f };
}

function sessionsBody() {
  const { list, f } = sessionRows();
  const shown = ui.allSessions ? list : list.slice(0, 10);
  return html`<table class="tbl cards fixed nochk">
    <colgroup><col style="width:22%"><col class="m-hide" style="width:24%"><col><col style="width:12%"><col style="width:12%"></colgroup>
    <thead><tr>${S_COLS.map(([k, l, , cls]) => html`<th class="sortable ${cls}" data-ssort="${k}">${l}<span class="arrow">${sortArrow(f.sort === k, f.dir)}</span></th>`)}</tr></thead>
    <tbody>${shown.length ? shown.map(s => html`<tr class="click" data-lt="${s.bizonylat}" tabindex="0">
      <td class="c-main">${dateRange(s)}${s.utolag ? html` <span class="badge badge-muted" title="Utólag rögzített leltár">utólag</span>` : ''}</td>
      <td class="m-hide">${s.bizonylat}</td>
      <td class="c-meta">${s.kik.map(e => store.userName(e)).join(', ')}</td>
      <td class="num c-f1" data-l="Tételek">${s.n}</td>
      <td class="num c-f2" data-l="Eltérő">${s.elteres ? html`<span class="t-warn">${s.elteres}</span>` : '0'}</td>
    </tr>`) : html`<tr><td colspan="5" class="empty small">Nincs a szűrésnek megfelelő leltár.</td></tr>`}</tbody></table>
    ${list.length > shown.length ? html`<button class="btn btn-sm btn-block list-more" data-a="moresessions">Összes megjelenítése (${list.length})</button>` : ''}`;
}

function sessionsHtml() {
  const { all, f } = sessionRows();
  const users = [...new Set(all.flatMap(s => s.kik))];
  return html`<div class="card" style="margin-top:1.5rem">
    <div class="card-head"><h2 class="grow">Korábbi leltárak</h2><span class="badge badge-muted">${all.length}</span></div>
    ${all.length ? html`<div class="toolbar card-toolbar">
      <input type="search" data-sq placeholder="Keresés (dátum, bizonylat, név)…" value="${f.q}">
      ${users.length > 1 ? filterButton(ui.sSel) : ''}
      ${help('Kattints egy sorra a leltár részleteiért (tételenként a megszámolt és a nyilvántartott érték). Az oszlopfejlécre kattintva rendezhetsz. „Eltérő”: ahány tételnél a megszámolt érték eltért a nyilvántartottól.')}
    </div>
    <div class="table-wrap" data-sbody>${sessionsBody()}</div>` : html`<div class="empty small">Még nincs rögzített leltár.</div>`}
  </div>`;
}

/** Egy leltár részletei: mikor, ki, és tételenként a megszámolt / nyilvántartott érték. */
function showSession(bizonylat) {
  const db = store.state.db;
  const s = L.inventorySessions(db).find(x => x.bizonylat === bizonylat);
  if (!s) return;
  const rows = L.inventoryDetails(db, bizonylat).map(r => ({ ...r, t: store.itemOrStub(r.tetel_id) }))
    .sort((a, b) => store.placeLabel(a.t).localeCompare(store.placeLabel(b.t), 'hu') || a.t.megnevezes.localeCompare(b.t.megnevezes, 'hu'));
  const diffs = rows.filter(r => r.elteres);
  const utolag = rows.some(r => r.megjegyzes === 'Utólag rögzített leltár');
  const f = { q: '', onlyDiff: false };
  const body = () => {
    const match = matcher(f.q);
    const list = rows.filter(r => (!f.onlyDiff || r.elteres) && match(`${r.t.megnevezes} ${store.placeLabel(r.t)}`));
    return html`<div class="table-wrap"><table class="tbl cards fixed nochk eq3">
      <colgroup><col><col style="width:16%"><col style="width:16%"><col style="width:16%"></colgroup>
      <thead><tr><th>Tétel</th><th class="num">Nyilvántartott</th><th class="num">Megszámolt</th><th class="num">Eltérés</th></tr></thead>
      <tbody>${list.map(r => html`<tr>
        <td class="c-main">${r.t.megnevezes}<div class="sub">${store.placeLabel(r.t)}</div></td>
        <td class="num c-f1" data-l="Nyilvántartott">${r.elotte === null ? '–' : fmtNum(r.elotte)}</td>
        <td class="num c-f2" data-l="Megszámolt"><b>${fmtNum(r.mennyiseg)}</b> <span class="small muted">${r.t.mertekegyseg}</span></td>
        <td class="num c-f3" data-l="Eltérés">${r.elteres ? html`<span class="${diffClass(r.elteres, r.elotte)}">${fmtDiff(r.elteres)}</span>` : html`<span class="muted">${r.elteres === 0 ? '✓' : '–'}</span>`}</td>
      </tr>`)}</tbody></table></div>
      ${list.length ? '' : html`<div class="empty small">Nincs találat.</div>`}`;
  };
  const m = modal({
    title: `Leltár – ${dateRange(s)}`,
    wide: true,
    body: html`
      <div class="facts facts-row">
        <div><dt>Leltár dátuma</dt><dd>${dateRange(s)}${utolag ? html` <span class="badge badge-muted">utólag</span>` : ''}</dd></div>
        <div><dt>Rögzítette</dt><dd>${s.kik.map(e => store.userName(e)).join(', ')}</dd></div>
        <div><dt>Feltöltve</dt><dd>${fmtDate(s.rogzitve, true)}</dd></div>
        <div><dt>Tételek</dt><dd>${rows.length} <span class="muted">· ebből</span> ${diffs.length ? html`<span class="t-warn">${diffs.length} eltérő</span>` : '0 eltérő'}</dd></div>
        <div><dt>Bizonylat</dt><dd class="small">${s.bizonylat}</dd></div>
      </div>
      <div class="toolbar" style="margin-top:1rem">
        <input type="search" data-q placeholder="Keresés a tételek között…">
        <label class="check small"><input type="checkbox" data-diff> Csak az eltérők</label>
        ${help(html`Nyilvántartott: amennyi a gép szerint a leltár pillanatában volt (az előző leltár + azóta beérkezett). Az eltérés a leltárak közötti fogyást vagy egy rögzítési hibát mutat. Az első leltárnál nincs összehasonlítási alap.<br><br><span class="t-ok">Zöld</span>: több volt a nyilvántartottnál (többlet). <span class="t-warn">Narancs</span>: hiány. <span class="t-err">Piros</span>: nagy hiány (5 egységnél és 30%-nál több).`)}
        <span class="grow"></span>
        <button class="btn btn-sm" data-copy title="Táblázatként a vágólapra (Excelbe illeszthető)">Másolás táblázatként</button>
      </div>
      <div data-body>${body()}</div>`,
    actions: [{ label: 'Bezárás', value: null }],
  });
  m.el.querySelector('[data-copy]').addEventListener('click', () => {
    const lines = [['Tétel', 'Hely', 'Nyilvántartott', 'Megszámolt', 'Eltérés', 'Mértékegység'].join('\t'),
      ...rows.map(r => [r.t.megnevezes, store.placeLabel(r.t), r.elotte ?? '', r.mennyiseg, r.elteres ?? '', r.t.mertekegyseg].join('\t'))];
    copyText(lines.join('\n'));
  });
  const refresh = () => { m.el.querySelector('[data-body]').innerHTML = String(body()); };
  m.el.querySelector('[data-q]').addEventListener('input', e => { f.q = e.target.value; refresh(); });
  m.el.querySelector('[data-diff]').addEventListener('change', e => { f.onlyDiff = e.target.checked; refresh(); });
}

function renderStart(root, ctx) {
  const items = store.activeItems();
  const st = store.state.stock;
  const due = items.filter(t => st[t.tetel_id].esedekes);
  const cats = store.categories();
  const whs = store.warehouses();
  // Raktárválasztás csak akkor számít, ha több raktár van
  // Raktár és kategória külön-külön is elég: üres választás = mind (de legalább az egyiknél kell választás)
  const multiWh = whs.length > 1;
  const inWh = t => !multiWh || !ui.whs.size || ui.whs.has(t.raktar);
  const inCat = t => !ui.cats.size || ui.cats.has(t.kategoria);
  const selectedNow = () => (ui.cats.size || (multiWh && ui.whs.size) ? items.filter(t => inWh(t) && inCat(t)) : []);
  const selected = selectedNow();
  const selText = [...(multiWh ? ui.whs : []), ...ui.cats].join(', ');
  root.innerHTML = String(html`
    <div class="page-head"><h1>Leltár</h1>${help('Válaszd ki, mit számoltok meg. Részleges leltárnál a nem számolt tételek korábbi értéke marad érvényben. A beírt adatok a készüléken azonnal mentődnek, így internet nélkül is folytatható, és bezárás után sem vesznek el.')}</div>
    <div class="choice-row">
      <button class="card choice" data-a="due">
        <span class="big">${due.length}</span>
        <span><b>Esedékes tételek</b><span class="small muted d-block">lejárt leltári ciklus</span></span>
      </button>
      <button class="card choice" data-a="all">
        <span class="big">${items.length}</span>
        <span><b>Teljes leltár</b><span class="small muted d-block">minden aktív tétel</span></span>
      </button>
      <div class="card choice" data-a="catpick" role="button" tabindex="0">
        <span class="big">${selected.length || '–'}</span>
        <span class="grow" style="min-width:0"><b>${multiWh ? 'Raktár / kategória' : 'Kategória szerint'} ▾</b>
          <span class="small muted d-block ellipsis">${selText || 'kattints a kiválasztáshoz'}</span></span>
        ${selected.length ? html`<button class="btn btn-sm btn-primary" data-a="cat">Indítás</button>` : ''}
      </div>
      <div class="card choice" data-a="custom" role="button" tabindex="0">
        <span class="big">${templates().length || '+'}</span>
        <span class="grow" style="min-width:0"><b>Egyedi / sablon ▾</b>
          <span class="small muted d-block ellipsis">${templates().length ? templates().map(s => s.nev).join(', ') : 'tételek kijelölése, sablon mentése'}</span></span>
      </div>
    </div>
    ${sessionsHtml()}`);

  // Raktár / kategória választó: a közös checkboxos legördülő (a kategóriák darabszáma a választott raktárakra értendő)
  const openPicker = anchor => openFilter(anchor, () => [
    { key: 'whs', title: 'Raktár', options: multiWh ? countOptions(whs, items, 'raktar') : [] },
    { key: 'cats', title: 'Kategória', options: cats.map(c => [c, c, items.filter(t => t.kategoria === c && inWh(t)).length]) },
  ], { whs: ui.whs, cats: ui.cats }, null, { summary: () => html`<b>${selectedNow().length}</b> tétel`, onClose: () => ctx.rerender() });

  const openCustom = anchor => {
    const list = templates();
    popover(anchor, html`
      ${list.length ? html`<div class="pop-title">Sablonok</div>${list.map(s => html`<button class="pop-item" data-s="${s.sablon_id}">
        <span class="grow"><b>${s.nev}</b><span class="small muted d-block">${tplIds(s).length} tétel</span></span><span class="muted">›</span></button>`)}`
        : html`<div class="small muted" style="padding:.4rem .5rem">Még nincs leltársablon.</div>`}
      <div class="pop-foot">
        <button class="btn btn-sm btn-primary" data-x="new">Tételek kijelölése…</button>
        <a href="#/torzsadatok?tab=sablonok" class="small" data-x="manage">Sablonok kezelése ›</a></div>`, {
      minWidth: 300,
      onMount: (el, close) => el.addEventListener('click', e => {
        const s = e.target.closest('[data-s]');
        if (s) { close(); const t = store.get('Leltar_sablonok', s.dataset.s); start(tplIds(t).filter(id => store.get('Tetelek', id)?.aktiv), t.nev); return ctx.rerender(); }
        if (e.target.closest('[data-x="manage"]')) return close();
        if (e.target.closest('[data-x="new"]')) {
          close();
          itemSelector({ mode: 'start', onStart: ids => { start(ids, 'Egyedi leltár'); ctx.rerender(); } });
        }
      }),
    });
  };

  // Korábbi leltárak: szűrés és rendezés csak a táblázatot frissíti (a kereső fókusza megmarad)
  const refreshSessions = () => { const b = root.querySelector('[data-sbody]'); if (b) b.innerHTML = String(sessionsBody()); };
  root.querySelector('[data-sq]')?.addEventListener('input', e => { ui.sf.q = e.target.value; refreshSessions(); });

  const sessionGroups = () => [{ key: 'ki', title: 'Rögzítette', options: [...new Set(L.inventorySessions(store.state.db).flatMap(s => s.kik))].map(u => [u, store.userName(u)]) }];
  root.onclick = e => {
    const fb = e.target.closest('[data-filter]');
    if (fb) return openFilter(fb, sessionGroups, ui.sSel, refreshSessions);
    const th = e.target.closest('[data-ssort]');
    if (th) {
      const k = th.dataset.ssort;
      ui.sf.dir = ui.sf.sort === k ? -ui.sf.dir : (k === 'datum' || k === 'n' || k === 'elteres' ? -1 : 1);
      ui.sf.sort = k;
      return refreshSessions();
    }
    const lt = e.target.closest('[data-lt]');
    if (lt) return showSession(lt.dataset.lt);
    const b = e.target.closest('[data-a]');
    if (!b) return;
    if (b.dataset.a === 'moresessions') { ui.allSessions = true; return refreshSessions(); }
    if (b.dataset.a === 'catpick') return openPicker(b);
    if (b.dataset.a === 'custom') return openCustom(b);
    if (b.dataset.a === 'due') start(due.map(t => t.tetel_id), 'Esedékes tételek');
    if (b.dataset.a === 'all') start(items.map(t => t.tetel_id), 'Teljes leltár');
    if (b.dataset.a === 'cat') start(selected.map(t => t.tetel_id), selText || 'Egyedi');
    ctx.rerender();
  };
}

/**
 * Leltáreltérés színe az előjel szerint: több van (többlet) → zöld; kevesebb (hiány) → narancs,
 * nagy hiány (> 5 egység és > 30%) → piros. A számlálásnál és a leltár részleteinél egyformán.
 */
function diffClass(d, nyilv) {
  if (d > 0) return 't-ok';
  return -d > Math.max(5, (nyilv || 0) * 0.3) ? 't-err' : 't-warn';
}
const fmtDiff = d => `${d > 0 ? '+' : ''}${fmtNum(d)}`;

/** Az „Eltérés” oszlop tartalma: üres, amíg nincs megszámolva; 0 szürkén; egyébként előjellel, a mérték szerinti színnel. */
function diffCell(id) {
  const c = slot.draft.counts[id];
  if (!c) return '';
  const st = store.state.stock[id];
  const d = L.round3(c.q - st.keszlet);
  if (!d) return html`<span class="muted" title="Egyezik a nyilvántartással">0</span>`;
  return html`<span class="${diffClass(d, st.keszlet)}" title="${d > 0 ? 'Többlet' : 'Hiány'} a nyilvántartotthoz képest">${fmtDiff(d)}</span>`;
}

// Sor: név + adatok | eltérés (fix oszlop – beíráskor nem mozdul a lista) | megszámolt mennyiség
function rowHtml(id) {
  const t = store.get('Tetelek', id);
  const st = store.state.stock[id];
  const c = slot.draft.counts[id];
  return html`<div class="count-row ${c ? 'done' : ''}" data-id="${id}">
    <div><div class="name">${t.megnevezes}</div>
      <div class="meta">${store.placeLabel(t)} · nyilvántartott: ${fmtNum(st.keszlet)} ${t.mertekegyseg} · előző leltár: ${fmtDate(st.leltarDatum)}</div></div>
    <div class="diff">${diffCell(id)}</div>
    <input type="text" inputmode="decimal" enterkeyhint="next" autocomplete="off" placeholder="${t.mertekegyseg}" value="${c ? String(c.q) : ''}" aria-label="${t.megnevezes} mennyiség">
  </div>`;
}

/** A számlálólap szűrő csoportjai: a leltárban lévő tételek raktárai, polcai, kategóriái (darabszámmal). */
function countGroups(ids) {
  const items = ids.map(id => store.get('Tetelek', id));
  const uniq = f => [...new Set(items.map(t => t[f]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'hu', { numeric: true }));
  const whs = uniq('raktar');
  return [
    { key: 'wh', title: 'Raktár', options: whs.length > 1 ? countOptions(whs, items, 'raktar') : [] },
    { key: 'polc', title: 'Polc / hely', options: countOptions(uniq('polc'), items, 'polc') },
    { key: 'cat', title: 'Kategória', options: countOptions(uniq('kategoria'), items, 'kategoria') },
    { key: 'egyeb', title: 'Egyéb', options: [['hianyzo', 'Csak a számolatlanok']] },
  ];
}

function renderCount(root, ctx) {
  const ids = slot.draft.items.filter(id => store.get('Tetelek', id));
  let lastPolc = null;
  const parts = [];
  for (const id of ids) {
    const t0 = store.get('Tetelek', id); const polc = t0.polc || t0.raktar ? store.placeLabel(t0) : 'Polc nélkül';
    // A polccím egyben az oszlopok fejléce is (ragadós)
    if (polc !== lastPolc) { parts.push(html`<div class="group-title" data-group="${polc}"><span>${polc}</span><span class="num">Eltérés</span><span class="num">Megszámolt</span></div>`); lastPolc = polc; }
    parts.push(rowHtml(id));
  }
  root.innerHTML = String(html`
    <div class="page-head"><h1>Leltár: ${slot.draft.label}</h1>
      <span class="badge badge-muted">${slot.draft.id}</span><span class="small muted">indítva: ${fmtDate(slot.draft.started, true)}</span></div>
    <div class="card">
      <div class="card-head sticky-search">
        <div class="toolbar head-main" style="margin:0">
          <input type="search" id="q" placeholder="Keresés / tétel hozzáadása…" title="Szűrés a listában; ami nincs a leltárban, a lista alján hozzáadható" value="${ui.q}">
          ${filterButton(ui.cf)}
        </div>
      </div>
      <div class="count-list" id="list">${parts}</div>
      <div id="offers"></div>
      <div class="bottom-bar" id="bbar">
        <div class="bb-prog"><span><b id="prog"></b> <span class="bb-done-text">– minden tétel megszámolva</span></span>
          <div class="progress"><div id="bar"></div></div></div>
        <button class="btn btn-sm btn-link-danger" data-a="discard" title="Leltár elvetése">Elvetés</button>
        <button class="btn btn-sm btn-primary bb-main" data-a="finish">Lezárás<span class="bb-done-text">&nbsp;és feltöltés</span></button>
      </div>
    </div>`);

  const list = root.querySelector('#list');
  const progress = () => {
    const done = ids.filter(id => slot.draft.counts[id]).length;
    root.querySelector('#prog').textContent = `${done} / ${ids.length}`;
    root.querySelector('#bar').style.width = (ids.length ? done / ids.length * 100 : 0) + '%';
    // Csak akkor nagy a lezáró sáv, ha minden tétel megvan
    root.querySelector('#bbar').classList.toggle('complete', ids.length > 0 && done === ids.length);
  };
  const applyFilter = () => {
    const match = matcher(ui.q);
    const groups = {};
    list.querySelectorAll('.count-row').forEach(row => {
      const t = store.get('Tetelek', row.dataset.id);
      const show = match(`${t.megnevezes} ${t.polc} ${t.raktar || ''} ${t.kategoria}`) &&
        inSel(ui.cf.wh, t.raktar) && inSel(ui.cf.polc, t.polc) && inSel(ui.cf.cat, t.kategoria) &&
        !(ui.cf.egyeb.has('hianyzo') && slot.draft.counts[row.dataset.id]);
      row.hidden = !show;
      const g = t.polc || t.raktar ? store.placeLabel(t) : 'Polc nélkül';
      groups[g] = groups[g] || show;
    });
    list.querySelectorAll('.group-title').forEach(g => { g.hidden = !groups[g.dataset.group]; });
    // A keresésre illő, de a leltárban nem szereplő tételek a lista alján hozzáadhatók (egy mező: szűrés + hozzáadás)
    const offers = root.querySelector('#offers');
    const n = addOffers(offers, ui.q, { title: 'Nincs a leltárban', exclude: new Set(slot.draft.items), onPick: addItem });
    if (!n && !offers.innerHTML && !Object.values(groups).some(Boolean)) offers.innerHTML = '<div class="empty small">Nincs a szűrésnek megfelelő tétel.</div>';
  };
  // Tétel felvétele a folyamatban lévő leltárba: a helyére kerül (bejárási sorrend), és rögtön számolható
  const addItem = t => {
    slot.draft.items = sortItems([...slot.draft.items, t.tetel_id]);
    Object.values(ui.cf).forEach(x => x.clear()); // a szűrő ne rejtse el az új tételt (a keresés marad)
    save();
    ctx.rerender();
    const inp = root.querySelector(`.count-row[data-id="${t.tetel_id}"] input`);
    if (inp) { inp.scrollIntoView({ block: 'center' }); inp.focus(); }
  };
  progress();
  applyFilter();

  list.addEventListener('input', e => {
    const row = e.target.closest('.count-row');
    if (!row) return;
    const id = row.dataset.id;
    const v = e.target.value.trim();
    const q = parseNum(v);
    if (v === '') delete slot.draft.counts[id];
    else if (!isNaN(q) && q >= 0) slot.draft.counts[id] = { q, at: new Date().toISOString() };
    else { e.target.style.borderColor = 'var(--err)'; return; }
    e.target.style.borderColor = '';
    row.classList.toggle('done', !!slot.draft.counts[id]);
    row.querySelector('.diff').innerHTML = String(diffCell(id));
    save();
    progress();
  });
  list.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    e.preventDefault();
    const inputs = [...list.querySelectorAll('.count-row:not([hidden]) input')];
    const next = inputs[inputs.indexOf(e.target) + 1];
    // Natív fókusz-görgetés: a böngésző kezeli a billentyűzetet, a CSS scroll-margin a ragadós sávokat
    if (next) { next.focus(); next.select(); } else e.target.blur();
  });
  list.addEventListener('focusin', e => { if (e.target.tagName === 'INPUT') e.target.select(); });
  root.querySelector('#q').addEventListener('input', e => { ui.q = e.target.value; applyFilter(); });

  root.onclick = async e => {
    const fb = e.target.closest('[data-filter]');
    if (fb) return openFilter(fb, () => countGroups(ids), ui.cf, applyFilter);
    const b = e.target.closest('[data-a]');
    if (!b) return;
    if (b.dataset.a === 'discard') {
      if (!(await confirmDialog('Leltár elvetése', 'A beírt értékek elvesznek. Biztosan elveted?', 'Elvetés', 'danger'))) return;
      await slot.clear(); ctx.rerender();
    }
    if (b.dataset.a === 'finish') {
      const counted = ids.filter(id => slot.draft.counts[id]);
      if (!counted.length) return toast('Még egy tételt sem számoltál meg.', 'warn');
      await slot.once(() => finish(counted));
    }
  };

  // Lezárás: dátum bekérése, majd a megszámolt tételek rögzítése egy műveletben
  async function finish(counted) {
      const missing = ids.length - counted.length;
      const today = todayInput();
      const datum = await modal({
        title: 'Leltár lezárása',
        body: html`<p>${counted.length} tétel kerül rögzítésre.${missing ? ` ${missing} tétel nincs megszámolva – ezeknél a korábbi érték marad.` : ''}</p>
          ${store.state.online ? '' : html`<div class="notice notice-info small">Jelenleg nincs kapcsolat: az adatok a készüléken maradnak, és automatikusan feltöltődnek, amint lesz internet.</div>`}
          ${sec(html`Leltár dátuma ${help('Korábbi (pl. papíron vezetett) leltár utólagos felvitelénél állítsd a tényleges dátumra. A készletszámítás a dátum szerinti sorrendet követi, így a későbbi mozgások helyesen számolódnak rá.')}`,
            html`<label class="field"><span>Dátum</span><input type="date" name="datum" value="${today}" max="${today}"></label>`)}`,
        actions: [{ label: 'Mégse', value: null }, {
          label: 'Lezárás és feltöltés', kind: 'primary', onClick: el => {
            const v = el.querySelector('[name=datum]').value;
            if (!v) { toast('Adj meg dátumot.', 'warn'); return false; }
            if (v > today) { toast('A leltár dátuma nem lehet a jövőben.', 'warn'); return false; }
            return v;
          },
        }],
      }).done;
      if (!datum) return;
      // Visszamenőleges leltár: minden tétel a választott napon (déli időponttal), a bizonylat is ezt a dátumot kapja
      const past = datum !== today;
      const pastIso = past ? dateInputToIso(datum) : null;
      const bizonylat = past ? `LT-${datum.replace(/-/g, '')}-${slot.draft.id.split('-').pop()}` : slot.draft.id;
      try {
        await store.enqueue({ type: 'mozgasok', rows: counted.map(id => ({
          mozgas_id: L.newId('M', 12), datum: past ? pastIso : slot.draft.counts[id].at, tipus: 'LELTAR', tetel_id: id,
          mennyiseg: slot.draft.counts[id].q, bizonylat, megjegyzes: past ? 'Utólag rögzített leltár' : '' })) });
        await slot.clear();
        toast('Leltár rögzítve', 'ok');
        ctx.go('attekinto');
      } catch (x) { toast(x.message, 'error', 6000); }
  }
}

export default {
  get liveUpdate() { return !slot.draft; },
  render(root, params, ctx) {
    if (!slot.ready(root, ctx)) return;
    if (!slot.draft) renderStart(root, ctx); else renderCount(root, ctx);
  },
};
