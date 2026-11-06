// Leltár: teljes, kategória szerinti vagy esedékes tételek számlálása.
// A beírt értékek minden billentyűleütéskor a készüléken tárolódnak; lezáráskor kerülnek a kimenő sorba.
import * as store from '../store.js';
import { html, fmtNum, fmtDate, norm, parseNum, confirmDialog, toast, help, popover, modal, sec } from '../ui.js';
import { ICONS } from '../icons.js';
import { attachPicker, itemSelector, templates, tplIds } from './common.js';

const L = window.RaktarLogic;
let draft;            // undefined: még nincs betöltve, null: nincs folyamatban lévő leltár
let loading = null;
const ui = { q: '', onlyMissing: false, cats: new Set(), whs: new Set() };

const save = () => store.drafts.set('leltar', draft);

function sortItems(ids) {
  return ids.map(id => store.get('Tetelek', id)).filter(Boolean)
    .sort((a, b) => (a.raktar || '~').localeCompare(b.raktar || '~', 'hu') || (a.polc || '~').localeCompare(b.polc || '~', 'hu') ||
      a.megnevezes.localeCompare(b.megnevezes, 'hu'))
    .map(t => t.tetel_id);
}

function start(ids, label) {
  if (!ids.length) { toast('Nincs leltározandó tétel.', 'warn'); return; }
  const d = new Date(), p = n => String(n).padStart(2, '0');
  draft = {
    id: `LT-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${L.newId('', 4)}`,
    label, started: d.toISOString(), items: sortItems(ids), counts: {},
  };
  ui.q = ''; ui.onlyMissing = false;
  save();
}

function recentSessions() {
  const map = {};
  for (const m of store.state.db.Mozgasok) {
    if (m.tipus !== 'LELTAR') continue;
    const s = map[m.bizonylat] = map[m.bizonylat] || { id: m.bizonylat, n: 0, datum: m.datum, who: m.felhasznalo };
    s.n++;
    if (m.datum > s.datum) s.datum = m.datum;
  }
  return Object.values(map).sort((a, b) => (a.datum < b.datum ? 1 : -1)).slice(0, 6);
}

function renderStart(root, ctx) {
  const items = store.activeItems();
  const st = store.state.stock;
  const due = items.filter(t => st[t.tetel_id].esedekes);
  const cats = store.categories();
  const whs = store.warehouses();
  // Raktárválasztás csak akkor számít, ha több raktár van
  const inWh = t => whs.length < 2 || !ui.whs.size || ui.whs.has(t.raktar);
  const selectedNow = () => items.filter(t => inWh(t) && ui.cats.has(t.kategoria));
  const selected = selectedNow();
  const selText = [...(whs.length > 1 ? ui.whs : []), ...ui.cats].join(', ');
  root.innerHTML = String(html`
    <div class="page-head"><h1>Leltár</h1>${help('Válaszd ki, mit számoltok meg. Részleges leltárnál a nem számolt tételek korábbi értéke marad érvényben. A beírt adatok a készüléken azonnal mentődnek, így internet nélkül is folytatható, és bezárás után sem vesznek el.')}</div>
    <div class="choice-row choice-row-3">
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
        <span class="grow" style="min-width:0"><b>Kategória szerint ▾</b>
          <span class="small muted d-block ellipsis">${selText || 'kattints a kiválasztáshoz'}</span></span>
        ${selected.length ? html`<button class="btn btn-sm btn-primary" data-a="cat">Indítás</button>` : ''}
      </div>
      <div class="card choice" data-a="custom" role="button" tabindex="0">
        <span class="big">${templates().length || '+'}</span>
        <span class="grow" style="min-width:0"><b>Egyedi / sablon ▾</b>
          <span class="small muted d-block ellipsis">${templates().length ? templates().map(s => s.nev).join(', ') : 'tételek kijelölése, sablon mentése'}</span></span>
      </div>
    </div>
    <div class="card" style="margin-top:1.5rem">
      <div class="card-head"><h2>Korábbi leltárak</h2></div>
      ${recentSessions().map(s => html`<div class="list-item" style="cursor:default"><div class="grow"><b>${s.id}</b>
        <div class="small muted">${fmtDate(s.datum)} · ${store.userName(s.who)}</div></div><span class="badge badge-muted">${s.n} tétel</span></div>`)}
    </div>`);

  const openPicker = anchor => {
    const count = c => items.filter(t => t.kategoria === c && inWh(t)).length;
    const body = () => html`
      ${whs.length > 1 ? html`<div class="pop-title">Raktár</div>${whs.map(w => html`<label class="pop-item"><input type="checkbox" data-wh="${w}" ${ui.whs.has(w) ? 'checked' : ''}><span class="grow">${w}</span></label>`)}` : ''}
      <div class="pop-title">Kategória</div>
      ${cats.map(c => html`<label class="pop-item"><input type="checkbox" data-cat="${c}" ${ui.cats.has(c) ? 'checked' : ''}><span class="grow">${c}</span><span class="small muted">${count(c)}</span></label>`)}
      <div class="pop-foot"><span class="small"><b>${selectedNow().length}</b> tétel</span>
        <span><button class="btn btn-sm btn-link-danger" data-x="clear">Törlés</button> <button class="btn btn-sm btn-primary" data-x="ok">Kész</button></span></div>`;
    popover(anchor, body(), {
      minWidth: 280,
      onClose: () => ctx.rerender(),
      onMount: (el, close) => {
        el.addEventListener('change', e => {
          const c = e.target.dataset.cat, w = e.target.dataset.wh;
          if (c) e.target.checked ? ui.cats.add(c) : ui.cats.delete(c);
          if (w) e.target.checked ? ui.whs.add(w) : ui.whs.delete(w);
          el.innerHTML = String(body());
        });
        el.addEventListener('click', e => {
          const x = e.target.closest('[data-x]');
          if (!x) return;
          if (x.dataset.x === 'clear') { ui.cats.clear(); ui.whs.clear(); el.innerHTML = String(body()); }
          else close();
        });
      },
    });
  };

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

  root.onclick = e => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    if (b.dataset.a === 'catpick') return openPicker(b);
    if (b.dataset.a === 'custom') return openCustom(b);
    if (b.dataset.a === 'due') start(due.map(t => t.tetel_id), 'Esedékes tételek');
    if (b.dataset.a === 'all') start(items.map(t => t.tetel_id), 'Teljes leltár');
    if (b.dataset.a === 'cat') start(selected.map(t => t.tetel_id), selText || 'Egyedi');
    ctx.rerender();
  };
  root.onkeydown = e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.dataset.a === 'catpick') { e.preventDefault(); openPicker(e.target); }
    if (e.target.dataset.a === 'custom') { e.preventDefault(); openCustom(e.target); }
  };
}

function diffText(id) {
  const c = draft.counts[id];
  if (!c) return '';
  const st = store.state.stock[id];
  const t = store.get('Tetelek', id);
  const d = L.round3(c.q - st.keszlet);
  if (!d) return html`<span style="color:var(--ok)">✓ Egyezik a nyilvántartással</span>`;
  const big = Math.abs(d) > Math.max(5, st.keszlet * 0.3);
  return html`<span style="color:${big ? 'var(--err)' : 'var(--warn)'}">Eltérés a nyilvántartotthoz: ${d > 0 ? '+' : ''}${fmtNum(d)} ${t.mertekegyseg}</span>`;
}

function rowHtml(id) {
  const t = store.get('Tetelek', id);
  const st = store.state.stock[id];
  const c = draft.counts[id];
  return html`<div class="count-row ${c ? 'done' : ''}" data-id="${id}">
    <div><div class="name">${t.megnevezes}</div>
      <div class="meta">${store.placeLabel(t)} · nyilvántartott: ${fmtNum(st.keszlet)} ${t.mertekegyseg} · előző leltár: ${fmtDate(st.leltarDatum)}</div></div>
    <input type="text" inputmode="decimal" enterkeyhint="next" autocomplete="off" placeholder="${t.mertekegyseg}" value="${c ? String(c.q) : ''}" aria-label="${t.megnevezes} mennyiség">
    <div class="diff">${diffText(id)}</div>
  </div>`;
}

function renderCount(root, ctx) {
  const ids = draft.items.filter(id => store.get('Tetelek', id));
  let lastPolc = null;
  const parts = [];
  for (const id of ids) {
    const t0 = store.get('Tetelek', id); const polc = t0.polc || t0.raktar ? store.placeLabel(t0) : 'Polc nélkül';
    if (polc !== lastPolc) { parts.push(html`<div class="group-title" data-group="${polc}">${polc}</div>`); lastPolc = polc; }
    parts.push(rowHtml(id));
  }
  root.innerHTML = String(html`
    <div class="page-head"><h1>Leltár: ${draft.label}</h1>
      <span class="badge badge-muted">${draft.id}</span><span class="small muted">indítva: ${fmtDate(draft.started, true)}</span></div>
    <div class="card">
      <div class="card-head sticky-bar" style="top:var(--top-h)">
        <div class="toolbar" style="margin:0;flex:1">
          <input type="search" id="q" placeholder="Szűrés a listában…" value="${ui.q}">
          <label class="check small"><input type="checkbox" id="miss" ${ui.onlyMissing ? 'checked' : ''}> Csak a még nem számoltak</label>
          <div class="picker" style="flex:1 1 220px;max-width:320px"><input id="add" placeholder="+ Tétel hozzáadása a leltárhoz…" autocomplete="off"></div>
        </div>
      </div>
      <div class="count-list" id="list">${parts}</div>
      <div class="bottom-bar" id="bbar">
        <div class="bb-prog"><span><b id="prog"></b> <span class="bb-done-text">– minden tétel megszámolva</span></span>
          <div class="progress"><div id="bar"></div></div></div>
        <button class="btn btn-sm btn-link-danger" data-a="discard" title="Leltár elvetése">Elvetés</button>
        <button class="btn btn-sm btn-primary bb-main" data-a="finish">Lezárás<span class="bb-done-text">&nbsp;és feltöltés</span></button>
      </div>
    </div>`);

  const list = root.querySelector('#list');
  const progress = () => {
    const done = ids.filter(id => draft.counts[id]).length;
    root.querySelector('#prog').textContent = `${done} / ${ids.length}`;
    root.querySelector('#bar').style.width = (ids.length ? done / ids.length * 100 : 0) + '%';
    // Csak akkor nagy a lezáró sáv, ha minden tétel megvan
    root.querySelector('#bbar').classList.toggle('complete', ids.length > 0 && done === ids.length);
  };
  const applyFilter = () => {
    const words = norm(ui.q).split(/\s+/).filter(Boolean);
    const groups = {};
    list.querySelectorAll('.count-row').forEach(row => {
      const t = store.get('Tetelek', row.dataset.id);
      const hay = norm(`${t.megnevezes} ${t.polc} ${t.raktar || ''} ${t.kategoria}`);
      const show = words.every(w => hay.includes(w)) && !(ui.onlyMissing && draft.counts[row.dataset.id]);
      row.hidden = !show;
      const g = t.polc || t.raktar ? store.placeLabel(t) : 'Polc nélkül';
      groups[g] = groups[g] || show;
    });
    list.querySelectorAll('.group-title').forEach(g => { g.hidden = !groups[g.dataset.group]; });
  };
  progress();
  applyFilter();

  list.addEventListener('input', e => {
    const row = e.target.closest('.count-row');
    if (!row) return;
    const id = row.dataset.id;
    const v = e.target.value.trim();
    const q = parseNum(v);
    if (v === '') delete draft.counts[id];
    else if (!isNaN(q) && q >= 0) draft.counts[id] = { q, at: new Date().toISOString() };
    else { e.target.style.borderColor = 'var(--err)'; return; }
    e.target.style.borderColor = '';
    row.classList.toggle('done', !!draft.counts[id]);
    row.querySelector('.diff').innerHTML = String(diffText(id));
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
  root.querySelector('#miss').addEventListener('change', e => { ui.onlyMissing = e.target.checked; applyFilter(); });
  attachPicker(root.querySelector('#add'), {
    items: store.activeItems,
    exclude: () => new Set(draft.items),
    onPick: t => {
      draft.items = sortItems([...draft.items, t.tetel_id]);
      save();
      ctx.rerender();
      const inp = root.querySelector(`.count-row[data-id="${t.tetel_id}"] input`);
      if (inp) { inp.scrollIntoView({ block: 'center' }); inp.focus(); }
    },
  });

  root.onclick = async e => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    if (b.dataset.a === 'discard') {
      if (!(await confirmDialog('Leltár elvetése', 'A beírt értékek elvesznek. Biztosan elveted?', 'Elvetés', 'danger'))) return;
      draft = null; await store.drafts.del('leltar'); ctx.rerender();
    }
    if (b.dataset.a === 'finish') {
      const counted = ids.filter(id => draft.counts[id]);
      if (!counted.length) return toast('Még egy tételt sem számoltál meg.', 'warn');
      const missing = ids.length - counted.length;
      const ok = await confirmDialog('Leltár lezárása',
        `${counted.length} tétel kerül rögzítésre.` + (missing ? ` ${missing} tétel nincs megszámolva – ezeknél a korábbi érték marad.` : '') +
        (store.state.online ? '' : ' Jelenleg nincs kapcsolat: az adatok a készüléken maradnak, és automatikusan feltöltődnek, amint lesz internet.'),
        'Lezárás és feltöltés');
      if (!ok) return;
      try {
        await store.enqueue({ type: 'mozgasok', rows: counted.map(id => ({
          mozgas_id: L.newId('M', 12), datum: draft.counts[id].at, tipus: 'LELTAR', tetel_id: id,
          mennyiseg: draft.counts[id].q, bizonylat: draft.id, megjegyzes: '' })) });
        draft = null;
        await store.drafts.del('leltar');
        toast('Leltár rögzítve', 'ok');
        ctx.go('attekinto');
      } catch (x) { toast(x.message, 'error', 6000); }
    }
  };
}

export default {
  get liveUpdate() { return !draft; },
  render(root, params, ctx) {
    if (draft === undefined) {
      root.innerHTML = '<p class="muted">Betöltés…</p>';
      loading = loading || store.drafts.get('leltar').then(d => { draft = d || null; });
      loading.then(() => ctx.rerender());
      return;
    }
    if (!draft) renderStart(root, ctx); else renderCount(root, ctx);
  },
};
