// Áttekintő: készlet táblázat szűrőkkel.
import * as store from '../store.js';
import { html, fmtNum, fmtDate, fmtMoney, norm } from '../ui.js';
import { statusBadge, showItemDetail } from './common.js';

const ui = { q: '', cat: '', wh: '', filter: '', sort: 'polc', dir: 1 };

const FILTERS = {
  '': ['Minden aktív tétel', () => true],
  hiany: ['Hiány (min. alatt)', (t, s) => s.statusz === 'hiany'],
  figyelem: ['Fogyóban', (t, s) => s.statusz === 'figyelem'],
  rendelendo: ['Rendelendő', (t, s) => s.javaslat > 0],
  uton: ['Úton lévő', (t, s) => s.uton > 0],
  esedekes: ['Esedékes leltár', (t, s) => s.esedekes],
};

const COLS = [
  ['megnevezes', 'Megnevezés'], ['polc', 'Hely'], ['keszlet', 'Készlet', 'num'], ['min', 'Min.', 'num'],
  ['cel', 'Cél', 'num'], ['uton', 'Úton', 'num'], ['leltar', 'Utolsó leltár'], ['statusz', 'Állapot'],
];
const STATUS_ORDER = { hiany: 0, figyelem: 1, ok: 2 };

function sortVal(t, s, key) {
  switch (key) {
    case 'keszlet': return s.keszlet;
    case 'min': return t.min_keszlet;
    case 'cel': return t.cel_keszlet;
    case 'uton': return s.uton;
    case 'leltar': return s.leltarDatum || '';
    case 'statusz': return STATUS_ORDER[s.statusz];
    case 'polc': return (t.raktar || '~') + ' ' + (t.polc || '~') + ' ' + norm(t.megnevezes);
    default: return norm(t.megnevezes);
  }
}

function rows() {
  const stock = store.state.stock;
  const words = norm(ui.q).split(/\s+/).filter(Boolean);
  const f = FILTERS[ui.filter][1];
  return store.activeItems()
    .filter(t => !ui.cat || t.kategoria === ui.cat)
    .filter(t => !ui.wh || t.raktar === ui.wh)
    .filter(t => { const hay = norm(`${t.megnevezes} ${t.kategoria} ${t.raktar || ''} ${t.polc} ${t.tetel_id}`); return words.every(w => hay.includes(w)); })
    .filter(t => f(t, stock[t.tetel_id]))
    .sort((a, b) => {
      const x = sortVal(a, stock[a.tetel_id], ui.sort), y = sortVal(b, stock[b.tetel_id], ui.sort);
      return (x < y ? -1 : x > y ? 1 : 0) * ui.dir;
    });
}

function statsHtml() {
  const items = store.activeItems();
  const st = store.state.stock;
  const c = k => items.filter(t => FILTERS[k][1](t, st[t.tetel_id])).length;
  const box = (k, v, l, cls) => html`<button class="stat ${cls} ${ui.filter === k ? 'sel' : ''}" data-filter="${k}"><div class="v">${v}</div><div class="l">${l}</div></button>`;
  return html`
    ${box('', items.length, 'Aktív tétel', '')}
    ${box('hiany', c('hiany'), 'Hiány (min. alatt)', 'err')}
    ${box('figyelem', c('figyelem'), 'Fogyóban', 'warn')}
    ${box('rendelendo', c('rendelendo'), 'Rendelendő', 'warn')}
    ${box('uton', c('uton'), 'Úton lévő', 'info')}
    ${box('esedekes', c('esedekes'), 'Esedékes leltár', '')}`;
}

function bodyHtml(list) {
  const st = store.state.stock;
  if (!list.length) return html`<tr><td colspan="8" class="empty">Nincs a szűrésnek megfelelő tétel.</td></tr>`;
  return html`${list.map(t => {
    const s = st[t.tetel_id];
    const me = t.mertekegyseg;
    return html`<tr class="click ${s.statusz === 'hiany' ? 'row-err' : s.statusz === 'figyelem' ? 'row-warn' : ''}" data-id="${t.tetel_id}">
      <td class="main">${t.megnevezes}<div class="small muted">${t.kategoria}</div></td>
      <td data-l="Hely">${store.placeLabel(t)}</td>
      <td class="num" data-l="Készlet"><b>${fmtNum(s.keszlet)}</b> <span class="muted small">${me}</span></td>
      <td class="num m-hide">${fmtNum(t.min_keszlet)}</td>
      <td class="num m-hide">${fmtNum(t.cel_keszlet)}</td>
      <td class="num" data-l="Úton">${s.uton ? fmtNum(s.uton) : html`<span class="muted">–</span>`}</td>
      <td class="nowrap" data-l="Leltár">${fmtDate(s.leltarDatum)} ${s.esedekes ? html`<span class="badge badge-warn">esedékes</span>` : ''}</td>
      <td>${statusBadge(s)}</td>
    </tr>`;
  })}`;
}

function update(root) {
  const list = rows();
  root.querySelector('#stats').innerHTML = String(statsHtml());
  root.querySelector('#tbody').innerHTML = String(bodyHtml(list));
  const value = !store.can('arak') ? 0 : list.reduce((a, t) => a + (store.state.stock[t.tetel_id].ertek || 0), 0);
  root.querySelector('#count').innerHTML = `${list.length} tétel` + (value ? ` · <span title="Aktuális készlet × elsődleges beszerzési ár">készletérték: <b>${fmtMoney(value)}</b></span>` : '');
  root.querySelectorAll('th[data-sort]').forEach(th => {
    th.querySelector('.arrow').textContent = th.dataset.sort === ui.sort ? (ui.dir > 0 ? ' ▲' : ' ▼') : '';
  });
}

export default {
  render(root) {
    if (root.dataset.view === 'attekinto' && root.querySelector('#tbody')) {
      // Már kirajzolva: csak az adatokat frissítjük (a kereső fókusza megmarad)
      const sel = root.querySelector('#cat');
      const cats = store.categories();
      if (sel.options.length - 1 !== cats.length) sel.innerHTML = String(html`<option value="">Minden kategória</option>${cats.map(c => html`<option ${c === ui.cat ? 'selected' : ''}>${c}</option>`)}`);
      return update(root);
    }
    root.dataset.view = 'attekinto';
    root.innerHTML = String(html`
      <div class="page-head"><h1>Készlet áttekintő</h1></div>
      <div class="stats" id="stats"></div>
      <div class="card">
        <div class="card-head">
          <div class="toolbar" style="margin:0;flex:1">
            <input type="search" id="q" placeholder="Keresés név, polc, kategória szerint…" value="${ui.q}">
            <select id="cat"><option value="">Minden kategória</option>${store.categories().map(c => html`<option ${c === ui.cat ? 'selected' : ''}>${c}</option>`)}</select>
            ${store.warehouses().length > 1 ? html`<select id="wh"><option value="">Minden raktár</option>${store.warehouses().map(w => html`<option ${w === ui.wh ? 'selected' : ''}>${w}</option>`)}</select>` : ''}
          </div>
          <span class="muted small" id="count"></span>
        </div>
        <div class="table-wrap">
          <table class="tbl responsive">
            <thead><tr>${COLS.map(([k, l, cls]) => html`<th class="sortable ${cls || ''}" data-sort="${k}">${l}<span class="arrow"></span></th>`)}</tr></thead>
            <tbody id="tbody"></tbody>
          </table>
        </div>
      </div>`);
    update(root);

    root.querySelector('#q').addEventListener('input', e => { ui.q = e.target.value; update(root); });
    root.querySelector('#cat').addEventListener('change', e => { ui.cat = e.target.value; update(root); });
    root.querySelector('#wh')?.addEventListener('change', e => { ui.wh = e.target.value; update(root); });
    root.onclick = e => {
      const st = e.target.closest('[data-filter]');
      if (st) { ui.filter = ui.filter === st.dataset.filter ? '' : st.dataset.filter; return update(root); }
      const th = e.target.closest('th[data-sort]');
      if (th) { if (ui.sort === th.dataset.sort) ui.dir *= -1; else { ui.sort = th.dataset.sort; ui.dir = 1; } return update(root); }
      const tr = e.target.closest('tr[data-id]');
      if (tr) showItemDetail(tr.dataset.id);
    };
  },
};
