// Mozgások: a közös mozgásnapló időrendben – anyag (leltár, beérkezés, kivét, korrekció) és eszköz (kiadás, visszavétel,
// szerviz, felülvizsgálat…) egy idővonalon: mi történt a raktárban.
import * as store from '../store.js';
import { html, help, matcher, todayInput } from '../ui.js';
import { showItemDetail, movesTable, movesLegend, filterButton, openFilter, inSel } from './common.js';
import { openTool } from './eszkozok.js';

const L = window.RaktarLogic;
const PERIODS = [['1', 'Ma'], ['7', '7 nap'], ['30', '30 nap'], ['egyeni', 'Egyéni']];
const LIMIT = 200;
const ui = { period: '1', tol: '', ig: '', q: '', all: false, f: { fajta: new Set(), tipus: new Set(), ki: new Set(), wh: new Set() } };
/** A közös napló egy sora: anyag- vagy eszközmozgás; a hely- és keresőszöveghez az eszköz / tétel adatai. */
const subject = m => (m.eszkoz_id ? store.get('Eszkozok', m.eszkoz_id) || {} : store.itemOrStub(m.tetel_id));

/** Helyi naptári nap kezdete (ms) egy ÉÉÉÉ-HH-NN értékből, eltolással napokban. */
const dayStart = (ymd, plusDays = 0) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d + plusDays).getTime(); };

/** A választott időszak [tól, ig) ms-ban. */
function range() {
  const today = todayInput();
  if (ui.period !== 'egyeni') return [dayStart(today, 1 - Number(ui.period)), dayStart(today, 1)];
  return [ui.tol ? dayStart(ui.tol) : 0, ui.ig ? dayStart(ui.ig, 1) : Infinity];
}

function filtered() {
  const [from, to] = range();
  const inRange = iso => { const t = Date.parse(iso); return t >= from && t < to; };
  const match = matcher(ui.q);
  return store.state.db.Mozgasok
    // A visszamenőleg rögzített mozgás a rögzítés napján is látszik (a dátuma szerinti napon is)
    .filter(m => inRange(m.datum) || (m.rogzitve && inRange(m.rogzitve)))
    .filter(m => {
      const t = subject(m);
      return inSel(ui.f.fajta, m.eszkoz_id ? 'eszkoz' : 'anyag') && inSel(ui.f.tipus, m.tipus) && inSel(ui.f.ki, m.felhasznalo) && inSel(ui.f.wh, t.raktar) &&
        match(`${t.azonosito || ''} ${t.megnevezes || ''} ${t.raktar || ''} ${t.polc || ''} ${m.bizonylat} ${m.atvevo ? store.userName(m.atvevo) : ''} ${m.munka || ''} ${m.megjegyzes || ''}`);
    })
    .sort((a, b) => (a.datum !== b.datum ? (a.datum < b.datum ? 1 : -1) : (a.rogzitve < b.rogzitve ? 1 : -1)));
}

function groups() {
  const db = store.state.db;
  const whs = store.warehouses();
  return [
    { key: 'fajta', title: 'Anyag / eszköz', options: [['anyag', 'Anyagmozgás'], ['eszkoz', 'Eszközmozgás']] },
    { key: 'tipus', title: 'Típus', options: [...Object.entries(L.MOVE_TYPES), ...Object.entries(L.TOOL_EVENTS)].map(([k, l]) => [k, l]) },
    { key: 'ki', title: 'Rögzítette', options: [...new Set(db.Mozgasok.map(m => m.felhasznalo).filter(Boolean))].map(e => [e, store.userName(e)]).sort((a, b) => a[1].localeCompare(b[1], 'hu')) },
    { key: 'wh', title: 'Raktár', options: whs.length > 1 ? whs.map(w => [w, w]) : [] },
  ];
}

function bodyHtml() {
  const list = filtered();
  const shown = ui.all ? list : list.slice(0, LIMIT);
  const byType = [...Object.keys(L.MOVE_TYPES), ...Object.keys(L.TOOL_EVENTS)].map(k => [k, list.filter(m => m.tipus === k).length]).filter(x => x[1]);
  return html`<div class="tbl-foot">${list.length} mozgás${byType.length ? ` · ${byType.map(([k, n]) => `${n} ${L.moveLabel(k).toLowerCase()}`).join(' · ')}` : ''}</div>
    ${list.length ? html`<div class="table-wrap">${movesTable(shown, { withItem: true })}</div>
      ${list.length > shown.length ? html`<button class="btn btn-sm btn-block list-more" data-a="more">Összes megjelenítése (${list.length})</button>` : ''}`
      : html`<div class="empty">${ui.period === '1' && !ui.q ? 'Ma még nem volt mozgás.' : 'Nincs a szűrésnek megfelelő mozgás.'}</div>`}`;
}

export default {
  render(root) {
    // Már kirajzolva (pl. szinkron után): csak a lista frissül, a kereső fókusza megmarad
    if (root.dataset.view === 'mozgasok' && root.querySelector('[data-body]')) { root.querySelector('[data-body]').innerHTML = String(bodyHtml()); return; }
    root.dataset.view = 'mozgasok';
    root.innerHTML = String(html`
      <div class="page-head"><h1>Mozgások</h1>${help(html`Minden mozgás egy idővonalon, a legújabb elöl: az anyagok (leltár, beérkezés, kivét, korrekció) és az eszközök (kiadás, visszavétel, szerviz, felülvizsgálat…). A visszamenőleg rögzített mozgás (pl. utólagos leltár) a rögzítés napján is megjelenik. A sorra kattintva megnyílik a tétel, ill. az eszköz adatlapja.<br><br>${movesLegend(true)}`)}</div>
      <div class="card">
        <div class="toolbar card-toolbar">
          <div class="seg" role="group" aria-label="Időszak">${PERIODS.map(([v, l]) => html`<button class="${ui.period === v ? 'on' : ''}" data-period="${v}">${l}</button>`)}</div>
          ${ui.period === 'egyeni' ? html`<span class="date-range"><input type="date" data-d="tol" value="${ui.tol}" max="${todayInput()}" aria-label="Kezdő nap">
            <span class="muted">–</span><input type="date" data-d="ig" value="${ui.ig}" max="${todayInput()}" aria-label="Utolsó nap"></span>` : ''}
        </div>
        <div class="toolbar card-toolbar">
          <input type="search" data-q placeholder="Keresés (tétel, hely, bizonylat, átvevő, munka)…" value="${ui.q}">
          ${filterButton(ui.f)}
        </div>
        <div data-body>${bodyHtml()}</div>
      </div>`);
    const refresh = () => { root.querySelector('[data-body]').innerHTML = String(bodyHtml()); };
    root.querySelector('[data-q]').addEventListener('input', e => { ui.q = e.target.value; ui.all = false; refresh(); });
    root.querySelectorAll('[data-d]').forEach(inp => inp.addEventListener('change', () => { ui[inp.dataset.d] = inp.value; refresh(); }));
    root.onclick = e => {
      const p = e.target.closest('[data-period]');
      if (p) {
        ui.period = p.dataset.period; ui.all = false;
        delete root.dataset.view; // az időszak sor változik (egyéni dátummezők) → teljes újrarajzolás
        return this.render(root);
      }
      const fb = e.target.closest('[data-filter]');
      if (fb) return openFilter(fb, groups, ui.f, refresh);
      if (e.target.closest('[data-a="more"]')) { ui.all = true; return refresh(); }
      const tool = e.target.closest('tr[data-tool]');
      if (tool) return openTool(tool.dataset.tool);
      const tr = e.target.closest('tr[data-id]');
      if (tr) showItemDetail(tr.dataset.id);
    };
  },
};
