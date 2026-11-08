// Kimutatások: készletérték, rendelési költés, felhasználás és forgás.
import * as store from '../store.js';
import { html, fmtNum, fmtMoney, help, esc } from '../ui.js';
import { showItemDetail } from './common.js';

const L = window.RaktarLogic;
const ui = { period: 12, by: 'kategoria', usage: 'gyors' };
const MONTHS = ['jan.', 'febr.', 'márc.', 'ápr.', 'máj.', 'jún.', 'júl.', 'aug.', 'szept.', 'okt.', 'nov.', 'dec.'];

const compactFt = n => (n >= 1e6 ? fmtNum(Math.round(n / 1e5) / 10) + ' M Ft' : n >= 1e4 ? fmtNum(Math.round(n / 1e3)) + ' e Ft' : fmtMoney(n));
const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);

/** Szép tengely maximum (1 / 2 / 2,5 / 5 × 10^n). */
function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function compute() {
  const db = store.state.db;
  const st = store.state.stock;
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - ui.period + 1, 1);
  const fromIso = from.toISOString();
  const items = store.activeItems();

  // Készletérték
  let total = 0, noPrice = 0;
  items.forEach(t => { total += st[t.tetel_id].ertek || 0; if (st[t.tetel_id].keszlet > 0 && !st[t.tetel_id].egysegar) noPrice++; });
  const groupBy = key => {
    const m = new Map();
    items.forEach(t => {
      const s = st[t.tetel_id];
      if (!s.ertek) return;
      const k = key === 'kategoria' ? (t.kategoria || 'Kategória nélkül')
        : key === 'raktar' ? (t.raktar || 'Raktár nélkül')
          : (s.forras ? store.supplierName(s.forras.beszallito_id) : 'Forrás nélkül');
      const g = m.get(k) || { label: k, value: 0, n: 0 };
      g.value += s.ertek; g.n++;
      m.set(k, g);
    });
    return [...m.values()].sort((a, b) => b.value - a.value);
  };

  // Úton lévő érték
  let uton = 0;
  db.Rendeles_tetelek.forEach(l => { if (!l.lezarva) uton += Math.max(0, l.mennyiseg - l.beerkezett) * (l.egysegar || 0); });

  // Beszerzés havonta és beszállítónként – csak a TÉNYLEGESEN BEÉRKEZETT mennyiség, a beérkezés napján.
  // (A meg nem érkezett, lezárt vagy törölt rendelés így nem torzítja a kimutatást.)
  const months = [];
  for (let i = 0; i < ui.period; i++) {
    const d = new Date(from.getFullYear(), from.getMonth() + i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS[d.getMonth()], year: d.getFullYear(), value: 0, orders: new Set() });
  }
  const byMonth = new Map(months.map(m => [m.key, m]));
  const bySup = new Map();
  let spend = 0;
  db.Mozgasok.forEach(mv => {
    if (mv.tipus !== 'BEERKEZES' || mv.datum < fromIso) return;
    const line = mv.rendeles_sor_id ? store.get('Rendeles_tetelek', mv.rendeles_sor_id) : null;
    const order = line ? store.get('Rendelesek', line.rendeles_id) : null;
    // Ár: a rendelés egységára; rendelés nélküli beérkezésnél az elsődleges forrás ára
    const price = line && line.egysegar ? line.egysegar : (st[mv.tetel_id]?.egysegar || 0);
    const v = (mv.mennyiseg || 0) * price;
    if (!v) return;
    const d = new Date(mv.datum);
    const m = byMonth.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (m) { m.value += v; m.orders.add(mv.bizonylat || mv.mozgas_id); }
    const name = order ? store.supplierName(order.beszallito_id) : 'Rendelés nélküli beérkezés';
    const g = bySup.get(name) || { label: name, value: 0, n: 0, docs: new Set() };
    g.value += v; g.docs.add(mv.bizonylat || mv.mozgas_id); g.n = g.docs.size;
    bySup.set(name, g);
    spend += v;
  });

  // Felhasználás (leltárakból becsülve)
  const usage = L.usageStats(db, fromIso);
  let usageValue = 0;
  const rows = items.map(t => {
    const s = st[t.tetel_id];
    const u = usage[t.tetel_id] || { fogyas: 0, tobblet: 0, napiAtlag: 0 };
    const havi = u.napiAtlag * 30;
    const ertekFogyas = Math.round(u.fogyas * (s.egysegar || 0));
    usageValue += ertekFogyas;
    return { t, s, u, havi, ertekFogyas, fedezet: havi > 0 ? s.keszlet / havi : (s.keszlet > 0 ? Infinity : 0) };
  });
  return { total, noPrice, groupBy, uton, months, bySup: [...bySup.values()].sort((a, b) => b.value - a.value), spend, rows, usageValue };
}

/* ---------- Diagram elemek ---------- */
function hbars(list, total, unit = v => fmtMoney(v)) {
  const top = list.slice(0, 10);
  const rest = list.slice(10);
  if (rest.length) top.push({ label: `Egyéb (${rest.length})`, value: rest.reduce((a, g) => a + g.value, 0), n: rest.reduce((a, g) => a + g.n, 0) });
  const max = Math.max(...top.map(g => g.value), 1);
  if (!top.length) return html`<div class="empty small">Nincs adat.</div>`;
  return html`<div class="hbars" role="table">${top.map(g => html`
    <div class="hbar-row" role="row" data-tip="${g.label}\n${unit(g.value)} · ${pct(g.value, total)}%${g.n ? ` · ${g.n} ${g.unitN || 'tétel'}` : ''}">
      <span class="hbar-label" role="cell">${g.label}</span>
      <span class="hbar-track" aria-hidden="true"><span class="hbar" style="width:${Math.max(0.5, g.value / max * 100)}%"></span></span>
      <span class="hbar-val" role="cell">${unit(g.value)}</span>
      <span class="hbar-share muted" role="cell">${pct(g.value, total)}%</span>
    </div>`)}</div>`;
}

function columns(months) {
  const max = niceMax(Math.max(...months.map(m => m.value), 0));
  const ticks = [0, max / 2, max];
  const peak = months.reduce((a, m) => (m.value > a.value ? m : a), months[0]);
  return html`<div class="cols-chart" role="img" aria-label="Beérkezett beszerzés havonta">
    <div class="cols-grid" aria-hidden="true">${ticks.slice().reverse().map(t => html`<div class="cols-tick"><span>${t ? compactFt(t) : '0'}</span></div>`)}</div>
    <div class="cols ${months.length > 6 ? 'dense' : ''}">${months.map(m => html`<div class="col" data-tip="${m.label} ${m.year}\n${fmtMoney(m.value)}${m.orders.size ? ` · ${m.orders.size} szállítás` : ''}">
        <div class="col-bar-wrap">${m === peak && m.value ? html`<span class="col-peak">${compactFt(m.value)}</span>` : ''}
          <div class="col-bar" style="height:${m.value / max * 100}%"></div></div>
        <span class="col-label">${m.label}</span></div>`)}</div>
  </div>`;
}

function usageTable(rows) {
  let list, note;
  if (ui.usage === 'gyors') {
    list = rows.filter(r => r.u.fogyas > 0).sort((a, b) => b.ertekFogyas - a.ertekFogyas || b.u.fogyas - a.u.fogyas);
    note = 'A felhasználás értéke szerint csökkenő sorrendben.';
  } else if (ui.usage === 'allo') {
    list = rows.filter(r => r.s.ertek > 0 && r.fedezet > 12).sort((a, b) => b.s.ertek - a.s.ertek);
    note = 'Több mint 12 hónapra elegendő (vagy nem fogyó) készlet, a lekötött érték szerint.';
  } else {
    list = rows.filter(r => r.u.tobblet > 0).sort((a, b) => b.u.tobblet * (b.s.egysegar || 0) - a.u.tobblet * (a.s.egysegar || 0));
    note = 'A leltárkor több volt, mint a nyilvántartott – valószínűleg rögzítetlen beérkezés vagy korábbi elszámolási hiba.';
  }
  const fed = r => (r.fedezet === Infinity ? 'nem fogy' : r.fedezet > 36 ? '> 3 év' : r.fedezet >= 1 ? `~${fmtNum(Math.round(r.fedezet))} hó` : r.havi > 0 ? '< 1 hó' : '–');
  return html`<p class="small muted card-note">${note}</p>
    ${list.length ? html`<div class="table-wrap"><table class="tbl cards nochk flow">
      <thead><tr><th>Tétel</th>${ui.usage === 'tobblet' ? html`<th class="num">Többlet</th>` : html`<th class="num">Felhasználás</th><th class="num">Havi átlag</th>`}
        <th class="num">Készlet</th><th class="num">Elég kb.</th><th class="num">${ui.usage === 'allo' ? 'Készletérték' : 'Érték'}</th></tr></thead>
      <tbody>${list.slice(0, 15).map(r => html`<tr class="click" data-id="${r.t.tetel_id}">
        <td class="c-main">${r.t.megnevezes}<div class="sub">${r.t.kategoria}</div></td>
        ${ui.usage === 'tobblet' ? html`<td class="num" data-l="Többlet">+${fmtNum(r.u.tobblet)} ${r.t.mertekegyseg}</td>`
          : html`<td class="num" data-l="Felhasználás">${fmtNum(Math.round(r.u.fogyas))} ${r.t.mertekegyseg}</td><td class="num" data-l="Havi átlag">${fmtNum(Math.round(r.havi * 10) / 10)}</td>`}
        <td class="num" data-l="Készlet">${fmtNum(r.s.keszlet)}</td>
        <td class="num" data-l="Elég kb.">${fed(r)}</td>
        <td class="num" data-l="Érték">${fmtMoney(ui.usage === 'allo' ? r.s.ertek : ui.usage === 'tobblet' ? r.u.tobblet * (r.s.egysegar || 0) : r.ertekFogyas)}</td>
      </tr>`)}</tbody></table></div>
      ${list.length > 15 ? html`<div class="tbl-foot">+ ${list.length - 15} további tétel</div>` : ''}`
      : html`<div class="empty small">Nincs ilyen tétel a választott időszakban.</div>`}`;
}

/* ---------- Oldal ---------- */
export default {
  render(root, params, ctx) {
    const d = compute();
    const whs = store.warehouses();
    if (ui.by === 'raktar' && whs.length < 2) ui.by = 'kategoria';
    const groups = d.groupBy(ui.by);
    const seg = (key, opts) => html`<div class="seg" role="group">${opts.map(([v, l]) => html`<button class="${ui[key] === v ? 'on' : ''}" data-set="${key}" data-v="${v}">${l}</button>`)}</div>`;
    root.innerHTML = String(html`
      <div class="page-head"><h1>Kimutatások</h1>
        ${help('A készletérték az aktuális készlet × az elsődleges beszerzési forrás egységára. A felhasználás a leltárak közötti fogyásból becsült (amíg a kivét nincs rögzítve), ezért a leltárak gyakoriságától függ a pontossága.')}</div>

      <section class="report-section">
        <div class="report-section-head"><h2>Jelenlegi állapot</h2><span class="sub">a mai készlet alapján – az időszak nem befolyásolja</span></div>
        <div class="stats">
          <div class="stat"><div class="v">${compactFt(d.total)}</div><div class="l">Teljes készletérték</div></div>
          <div class="stat"><div class="v">${compactFt(d.uton)}</div><div class="l">Úton lévő (megrendelt) érték</div></div>
          ${d.noPrice ? html`<div class="stat warn" title="Ezeknek a tételeknek van készlete, de nincs beszerzési áruk, így nem számítanak a készletértékbe."><div class="v">${d.noPrice}</div><div class="l">Tétel ár nélkül</div></div>` : ''}
        </div>
        <div class="card">
          <div class="card-head"><h2 class="grow">Készletérték megoszlása</h2>
            ${seg('by', [['kategoria', 'Kategória'], ...(whs.length > 1 ? [['raktar', 'Raktár']] : []), ['beszallito', 'Beszállító']])}</div>
          <div class="card-pad">${hbars(groups, d.total)}</div>
        </div>
      </section>

      <section class="report-section">
        <div class="report-section-head"><h2>Időszak</h2><span class="sub">${d.months[0].label} ${d.months[0].year} – ma</span>
          ${seg('period', [[3, '3 hónap'], [6, '6 hónap'], [12, '12 hónap']])}</div>
        <div class="stats">
          <div class="stat"><div class="v">${compactFt(d.spend)}</div><div class="l" title="Csak a ténylegesen beérkezett mennyiség, a beérkezés napján">Beérkezett beszerzés</div></div>
          <div class="stat"><div class="v">${compactFt(d.usageValue)}</div><div class="l">Becsült felhasználás</div></div>
        </div>
        <div class="report-grid">
          <div class="card">
            <div class="card-head"><h2 class="grow">Beérkezett beszerzés havonta</h2></div>
            <div class="card-pad">${columns(d.months)}</div>
          </div>
          <div class="card">
            <div class="card-head"><h2 class="grow">Beérkezett beszerzés beszállítónként</h2></div>
            <div class="card-pad">${hbars(d.bySup.map(g => ({ ...g, unitN: 'szállítás' })), d.spend)}</div>
          </div>
        </div>
        <div class="card" style="margin-top:1rem">
          <div class="card-head"><h2 class="grow">Felhasználás és forgás</h2>
            ${seg('usage', [['gyors', 'Leggyorsabban fogyók'], ['allo', 'Álló készlet'], ['tobblet', 'Leltártöbblet']])}</div>
          ${usageTable(d.rows)}
        </div>
      </section>
      <div class="chart-tip" hidden></div>`);

    root.onclick = e => {
      const s = e.target.closest('[data-set]');
      if (s) { const v = s.dataset.v; ui[s.dataset.set] = /^\d+$/.test(v) ? Number(v) : v; return ctx.rerender(); }
      const tr = e.target.closest('tr[data-id]');
      if (tr) showItemDetail(tr.dataset.id);
    };
    // Tooltip: rámutatásra (asztal) vagy koppintásra (mobil)
    const tip = root.querySelector('.chart-tip');
    const show = (el, x, y) => {
      tip.innerHTML = esc(el.dataset.tip).replace(/\n/, '</b><br>').replace(/^/, '<b>');
      tip.hidden = false;
      const w = tip.offsetWidth;
      tip.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, x - w / 2)) + 'px';
      tip.style.top = (y - tip.offsetHeight - 12) + 'px';
    };
    root.onpointermove = e => {
      const el = e.target.closest('[data-tip]');
      if (!el) { tip.hidden = true; return; }
      show(el, e.clientX, e.clientY);
    };
    root.onpointerdown = root.onpointermove; // érintőképernyő: koppintásra
    root.onpointerleave = () => { tip.hidden = true; };
  },
};
