// Több nézetben használt elemek.
import * as store from '../store.js';
import { html, raw, esc, norm, fmtNum, fmtDate, modal, toast, parseNum, formValues, sec, confirmDialog, STATUS_LABEL, fmtMoney } from '../ui.js';

const L = window.RaktarLogic;

/**
 * Kereső mező tételválasztáshoz. Gépelésre listát mutat, kiválasztáskor meghívja az onPick-et.
 * opts: { items: () => [], onPick(item), label?(item), exclude?: () => Set }
 */
export function attachPicker(input, opts) {
  const wrap = input.closest('.picker') || input.parentElement;
  let list = null, hl = 0, matches = [];
  const label = opts.label || (t => `${t.megnevezes}`);
  const close = () => { if (list) { list.remove(); list = null; } };
  const show = () => {
    const q = norm(input.value).trim();
    const ex = opts.exclude ? opts.exclude() : new Set();
    const words = q.split(/\s+/).filter(Boolean);
    matches = opts.items().filter(t => !ex.has(t.tetel_id)).filter(t => {
      const hay = norm(`${t.megnevezes} ${t.kategoria} ${t.polc} ${t.tetel_id} ${(L.sourcesFor(store.state.db, t.tetel_id).map(f => f.cikkszam).join(' '))}`);
      return words.every(w => hay.includes(w));
    }).slice(0, 30);
    close();
    if (!q && !opts.showAll) return;
    const canCreate = opts.allowCreate !== false && store.can('raktaros') && q;
    list = document.createElement('div');
    list.className = 'picker-list';
    list.innerHTML = (matches.length
      ? matches.map((t, i) => `<button type="button" data-i="${i}" class="${i === hl ? 'hl' : ''}">${esc(label(t))}<div class="small muted">${esc(t.kategoria || '')} · ${esc(store.placeLabel(t))}</div></button>`).join('')
      : '<div class="empty small">Nincs ilyen tétel a törzsadatokban.</div>')
      + (canCreate ? `<button type="button" data-new class="picker-new">+ Új tétel felvétele: „${esc(input.value.trim())}”</button>` : '');
    wrap.appendChild(list);
    list.addEventListener('mousedown', e => e.preventDefault());
    list.addEventListener('click', e => {
      const b = e.target.closest('[data-i]');
      if (b) return pick(matches[Number(b.dataset.i)]);
      if (e.target.closest('[data-new]')) {
        const name = input.value.trim();
        input.value = ''; close();
        quickAddItem(name, opts.defaultSupplier ? opts.defaultSupplier() : '').then(t => { if (t) opts.onPick(t); });
      }
    });
  };
  const pick = t => { if (!t) return; input.value = ''; close(); opts.onPick(t); };
  input.addEventListener('input', () => { hl = 0; show(); });
  input.addEventListener('focus', () => { if (opts.showAll) show(); });
  input.addEventListener('blur', () => setTimeout(close, 150));
  input.addEventListener('keydown', e => {
    if (!list) return;
    if (e.key === 'ArrowDown') { hl = Math.min(hl + 1, matches.length - 1); show(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { hl = Math.max(hl - 1, 0); show(); e.preventDefault(); }
    else if (e.key === 'Enter') { pick(matches[hl]); e.preventDefault(); }
    else if (e.key === 'Escape') close();
  });
}

/**
 * Egyszerűsített új tétel űrlap (munka közben, a folyamat megszakítása nélkül).
 * Visszaad: Promise<tétel | null>
 */
export function quickAddItem(name = '', supplierId = '') {
  const db = store.state.db;
  const sups = db.Beszallitok.filter(b => b.aktiv).sort((a, b) => a.nev.localeCompare(b.nev, 'hu'));
  const whs = store.warehouses();
  const id = L.newId('T', 6);
  let created = null;
  return modal({
    title: 'Új tétel gyors felvétele',
    body: html`
      ${sec('Alapadatok', html`
        <label class="field span-2"><span>Megnevezés *</span><input name="megnevezes" value="${name}"></label>
        <label class="field"><span>Kategória</span>${listSelect('kategoria', 'kategoria', '')}</label>
        <label class="field"><span>Mértékegység</span>${listSelect('mertekegyseg', 'mertekegyseg', '', { defaultFirst: true })}</label>`)}
      ${sec('Tárolás és készletszint', html`
        <label class="field"><span>Raktár</span>${listSelect('raktar', 'raktar', '')}</label>
        <label class="field"><span>Polc / hely</span><input name="polc" placeholder="pl. A1"></label>
        <label class="field"><span>Minimum készlet</span><input name="min_keszlet" inputmode="decimal" placeholder="0"></label>
        <label class="field"><span>Célkészlet</span><input name="cel_keszlet" inputmode="decimal" placeholder="0"></label>`)}
      ${sec(html`Beszerzési forrás <span style="font-weight:400;text-transform:none;letter-spacing:0">(opcionális)</span>`, html`
        <label class="field span-2"><span>Beszállító</span><select name="beszallito_id"><option value="">— nincs —</option>
          ${sups.map(b => html`<option value="${b.beszallito_id}" ${b.beszallito_id === supplierId ? 'selected' : ''}>${b.nev}</option>`)}</select></label>
        <label class="field"><span>Cikkszám</span><input name="cikkszam"></label>
        <label class="field"><span>Kiszerelés</span><input name="kiszereles" inputmode="decimal" placeholder="1"></label>
        ${store.can('arak') ? html`<label class="field"><span>Egységár (Ft)</span><input name="egysegar" inputmode="decimal" placeholder="0"></label>` : ''}`)}
      <p class="small muted" style="margin-top:.75rem">A további adatok (leltár gyakoriság, több forrás) később a Törzsadatoknál pontosíthatók.</p>`,
    onMount: el => bindListSelects(el),
    actions: [{ label: 'Mégse', value: null }, {
      label: 'Felvétel', kind: 'primary', onClick: async el => {
        const v = formValues(el);
        if (!v.megnevezes.trim()) { toast('A megnevezés kötelező.', 'error'); return false; }
        const op = {
          type: 'uj_tetel',
          tetel: { tetel_id: id, megnevezes: v.megnevezes, kategoria: v.kategoria, mertekegyseg: v.mertekegyseg || 'db',
            raktar: v.raktar || whs[0] || '', polc: v.polc, min_keszlet: parseNum(v.min_keszlet) || 0, cel_keszlet: parseNum(v.cel_keszlet) || 0,
            leltar_ciklus_nap: 90, aktiv: true, megjegyzes: '' },
          forras: v.beszallito_id ? { forras_id: L.newId('F', 8), beszallito_id: v.beszallito_id, cikkszam: v.cikkszam,
            kiszereles: parseNum(v.kiszereles) || 1, egysegar: parseNum(v.egysegar) || 0, link: '', megjegyzes: '' } : null,
        };
        try {
          await store.enqueue(op);
          created = store.get('Tetelek', id);
          toast('Tétel felvéve', 'ok');
        } catch (x) { toast(x.message, 'error', 6000); return false; }
      },
    }],
  }).done.then(() => created);
}

/* ---------- Választólisták (kategória, mértékegység, raktár) ---------- */
const NEW_LABEL = { kategoria: 'kategória', mertekegyseg: 'mértékegység', raktar: 'raktár' };

/**
 * Legördülő a Listak törzsadatból. Az adminnak „+ Új …” lehetőség is (bindListSelects kezeli).
 * defaultFirst: új rekordnál az első (pl. „db”) legyen kiválasztva; ha csak egy érték van, azt választja.
 */
export function listSelect(name, tipus, current, { defaultFirst = false } = {}) {
  const vals = L.listValues(store.state.db, tipus);
  let cur = current || '';
  if (!cur && (defaultFirst || vals.length === 1)) cur = vals[0] || '';
  const opts = !cur || vals.includes(cur) ? vals : [cur, ...vals];
  return html`<select name="${name}" data-list="${tipus}" data-prev="${cur}">
    <option value="">— válassz —</option>
    ${opts.map(v => html`<option value="${v}" ${v === cur ? 'selected' : ''}>${v}</option>`)}
    ${store.can('admin') ? html`<option value="__new">+ Új ${NEW_LABEL[tipus]}…</option>` : ''}
  </select>`;
}

/** A „+ Új …” választás kezelése egy űrlapon belül: rövid ablakban bekéri, listába menti, kiválasztja. */
export function bindListSelects(root) {
  root.addEventListener('change', async e => {
    const s = e.target;
    if (!s.matches || !s.matches('select[data-list]')) return;
    if (s.value !== '__new') { s.dataset.prev = s.value; return; }
    const tipus = s.dataset.list;
    const v = await modal({
      title: `Új ${NEW_LABEL[tipus]}`,
      body: html`<label class="field"><span>Megnevezés</span><input name="ertek" autocomplete="off"></label>
        <p class="small muted" style="margin-top:.5rem">Bekerül a ${L.LIST_TYPES[tipus].toLowerCase()} listájába (Törzsadatok → Listák), és később is választható lesz.</p>`,
      actions: [{ label: 'Mégse', value: null }, {
        label: 'Hozzáadás', kind: 'primary', onClick: async el => {
          const val = el.querySelector('[name=ertek]').value.trim();
          if (!val) { toast('Adj meg egy értéket.', 'warn'); return false; }
          const exists = L.listValues(store.state.db, tipus).find(x => x.toLowerCase() === val.toLowerCase());
          if (exists) return exists; // már van ilyen: azt választjuk
          const sorrend = (store.state.db.Listak || []).filter(l => l.tipus === tipus).length + 1;
          try { await store.enqueue({ type: 'mentes', table: 'Listak', row: { lista_id: L.newId('L', 6), tipus, ertek: val, sorrend } }); }
          catch (x) { toast(x.message, 'error'); return false; }
          return val;
        },
      }],
    }).done;
    if (!v || v === true) { s.value = s.dataset.prev || ''; return; }
    if (![...s.options].some(o => o.value === v)) {
      const o = document.createElement('option');
      o.value = v; o.textContent = v;
      s.insertBefore(o, s.querySelector('option[value="__new"]'));
    }
    s.value = v;
    s.dataset.prev = v;
  });
}

/* ---------- Leltársablonok és tételválasztó ---------- */
export const templates = () => (store.state.db.Leltar_sablonok || []).slice().sort((a, b) => a.nev.localeCompare(b.nev, 'hu'));
export const tplIds = s => String(s.tetelek || '').split(',').map(x => x.trim()).filter(Boolean);

/**
 * Tételválasztó ablak.
 *  mode 'start'    – egyedi leltár összeállítása, „Indítás” → onStart(ids)
 *  mode 'template' – leltársablon létrehozása / szerkesztése / törlése (név + tételek)
 */
export function itemSelector({ mode = 'start', tpl = null, onStart, onDone } = {}) {
  const items = store.activeItems().slice().sort((a, b) =>
    (a.raktar || '~').localeCompare(b.raktar || '~', 'hu') || (a.polc || '~').localeCompare(b.polc || '~', 'hu') || a.megnevezes.localeCompare(b.megnevezes, 'hu'));
  const sel = new Set(tpl ? tplIds(tpl) : []);
  const f = { q: '', cat: '', only: false };
  const visible = () => {
    const words = norm(f.q).split(/\s+/).filter(Boolean);
    return items.filter(t => (!f.cat || t.kategoria === f.cat) && (!f.only || sel.has(t.tetel_id)) &&
      words.every(w => norm(`${t.megnevezes} ${t.kategoria} ${t.polc} ${t.raktar || ''}`).includes(w)));
  };
  const listHtml = () => {
    const v = visible();
    return html`${v.map(t => html`<label class="pop-item"><input type="checkbox" data-id="${t.tetel_id}" ${sel.has(t.tetel_id) ? 'checked' : ''}>
      <span class="grow">${t.megnevezes}<span class="small muted d-block">${store.placeLabel(t)} · ${t.kategoria}</span></span></label>`)}
      ${v.length ? '' : html`<div class="empty small">Nincs találat.</div>`}`;
  };
  const isTpl = mode === 'template';
  const actions = isTpl ? [
    { label: 'Mégse', value: null },
    ...(tpl ? [{ label: 'Törlés', kind: 'danger', onClick: async () => {
      if (!(await confirmDialog('Sablon törlése', `Biztosan törlöd a(z) „${tpl.nev}” sablont?`, 'Törlés', 'danger'))) return false;
      try { await store.enqueue({ type: 'sablon_torles', sablon_id: tpl.sablon_id }); toast('Sablon törölve', 'ok'); }
      catch (x) { toast(x.message, 'error'); return false; }
    } }] : []),
    { label: 'Mentés', kind: 'primary', onClick: async el => {
      const nev = el.querySelector('[name=sablon_nev]').value.trim();
      if (!nev) { toast('Adj nevet a sablonnak.', 'warn'); el.querySelector('[name=sablon_nev]').focus(); return false; }
      if (!sel.size) { toast('Jelölj ki legalább egy tételt.', 'warn'); return false; }
      try {
        await store.enqueue({ type: 'sablon_mentes', sablon: { sablon_id: tpl ? tpl.sablon_id : L.newId('S', 6), nev, tetelek: [...sel].join(',') } });
        toast('Sablon mentve', 'ok');
      } catch (x) { toast(x.message, 'error'); return false; }
    } },
  ] : [
    { label: 'Mégse', value: null },
    { label: 'Indítás', kind: 'primary', onClick: () => {
      if (!sel.size) { toast('Jelölj ki legalább egy tételt.', 'warn'); return false; }
      onStart && onStart([...sel]);
    } },
  ];
  const m = modal({
    title: isTpl ? (tpl ? `Leltársablon: ${tpl.nev}` : 'Új leltársablon') : 'Egyedi leltár',
    wide: true,
    body: html`
      ${isTpl ? sec('Sablon', html`<label class="field span-2"><span>Név *</span><input name="sablon_nev" value="${tpl ? tpl.nev : ''}" placeholder="pl. Havi szilikonok és bitek"></label>`) : ''}
      <section class="fsec"><div class="fsec-title">Tételek</div>
        <div class="toolbar">
          <input type="search" data-f="q" placeholder="Keresés…">
          <select data-f="cat"><option value="">Minden kategória</option>${store.categories().map(c => html`<option>${c}</option>`)}</select>
          <label class="check small"><input type="checkbox" data-f="only"> Csak a kijelöltek</label>
        </div>
        <div class="toolbar" style="justify-content:space-between">
          <span><b data-count>${sel.size}</b> tétel kijelölve</span>
          <span><button type="button" class="btn btn-sm" data-x="all">Láthatók kijelölése</button> <button type="button" class="btn btn-sm btn-link-danger" data-x="none">Kijelölés törlése</button></span>
        </div>
        <div class="sel-list" data-list>${listHtml()}</div></section>`,
    actions,
  });
  const el = m.el;
  const refresh = () => { el.querySelector('[data-list]').innerHTML = String(listHtml()); el.querySelector('[data-count]').textContent = sel.size; };
  el.querySelector('[data-f="q"]').addEventListener('input', e => { f.q = e.target.value; refresh(); });
  el.querySelector('[data-f="cat"]').addEventListener('change', e => { f.cat = e.target.value; refresh(); });
  el.querySelector('[data-f="only"]').addEventListener('change', e => { f.only = e.target.checked; refresh(); });
  el.querySelector('[data-list]').addEventListener('change', e => {
    const id = e.target.dataset.id;
    if (!id) return;
    e.target.checked ? sel.add(id) : sel.delete(id);
    el.querySelector('[data-count]').textContent = sel.size;
  });
  el.addEventListener('click', e => {
    const x = e.target.closest('[data-x]');
    if (!x) return;
    if (x.dataset.x === 'all') visible().forEach(t => sel.add(t.tetel_id));
    if (x.dataset.x === 'none') sel.clear();
    refresh();
  });
  if (onDone) m.done.then(onDone);
  return m;
}

/* ---------- Mozgástípus ikonok ---------- */
const MOVE_SVG = {
  // vágólap pipával
  LELTAR: '<path d="M9 4h6v3H9z"/><rect x="5" y="5" width="14" height="16" rx="2"/><path d="m9 13 2 2 4-4"/>',
  // lefelé nyíl tálcába
  BEERKEZES: '<path d="M12 4v10m-4-4 4 4 4-4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  // felfelé nyíl tálcából
  KIVET: '<path d="M12 15V5m-4 4 4-4 4 4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  // ceruza
  KORREKCIO: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
};
export function moveIcon(tipus) {
  return raw(`<span class="mv-ico mv-${tipus}" title="${esc(L.MOVE_TYPES[tipus] || tipus)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${MOVE_SVG[tipus] || ''}</svg></span>`);
}
export function moveQty(m) {
  const n = fmtNum(Math.abs(m.mennyiseg));
  if (m.tipus === 'LELTAR') return '= ' + n;
  if (m.tipus === 'KIVET') return '− ' + n;
  return (m.mennyiseg < 0 ? '− ' : '+ ') + n;
}

export function statusBadge(st) {
  const s = st.statusz;
  return html`<span class="badge badge-${s === 'hiany' ? 'err' : s === 'figyelem' ? 'warn' : 'ok'}">${STATUS_LABEL[s]}</span>`;
}

/** Tétel részletei: készlet, források, mozgástörténet, korrekció. */
export function showItemDetail(tetelId) {
  const db = store.state.db;
  const t = store.get('Tetelek', tetelId);
  if (!t) return;
  const st = store.state.stock[tetelId];
  const src = L.sourcesFor(db, tetelId);
  const moves = db.Mozgasok.filter(m => m.tetel_id === tetelId)
    .sort((a, b) => (a.datum < b.datum ? 1 : -1)).slice(0, 40);
  const lines = db.Rendeles_tetelek.filter(l => l.tetel_id === tetelId && !l.lezarva);
  const me = t.mertekegyseg || '';
  const body = html`
    <div class="stats">
      <div class="stat ${st.statusz === 'hiany' ? 'err' : st.statusz === 'figyelem' ? 'warn' : ''}"><div class="v">${fmtNum(st.keszlet)}</div><div class="l">Aktuális készlet (${me})</div></div>
      <div class="stat"><div class="v">${fmtNum(t.min_keszlet)} / ${fmtNum(t.cel_keszlet)}</div><div class="l">Minimum / cél</div></div>
      <div class="stat info"><div class="v">${fmtNum(st.uton)}</div><div class="l">Úton (rendelve)</div></div>
      ${st.ertek && store.can('arak') ? html`<div class="stat"><div class="v">${fmtMoney(st.ertek)}</div><div class="l">Készletérték (${fmtMoney(st.egysegar)}/${me})</div></div>` : ''}
    </div>
    <dl class="kv small">
      <dt>Kategória</dt><dd>${t.kategoria || '—'}</dd>
      <dt>Hely</dt><dd>${[t.raktar, t.polc].filter(Boolean).join(' · ') || '—'}</dd>
      <dt>Utolsó leltár</dt><dd>${fmtDate(st.leltarDatum)} ${st.leltarDatum ? html`(${st.napjaLeltar} napja)` : ''} ${st.esedekes ? html`<span class="badge badge-warn">Esedékes</span>` : ''}</dd>
      <dt>Leltár ciklus</dt><dd>${t.leltar_ciklus_nap ? t.leltar_ciklus_nap + ' nap' : '—'}</dd>
      ${t.megjegyzes ? html`<dt>Megjegyzés</dt><dd>${t.megjegyzes}</dd>` : ''}
    </dl>
    ${store.can('rendeles') ? html`<h3 style="margin-top:1.25rem">Beszerzési források</h3>
    ${src.length ? html`<div class="table-wrap"><table class="tbl small"><thead><tr><th>Beszállító</th><th>Cikkszám</th><th class="num">Kiszerelés</th>${store.can('arak') ? html`<th class="num">Egységár</th>` : ''}<th></th></tr></thead><tbody>
      ${src.map(f => html`<tr><td>${store.supplierName(f.beszallito_id)} ${f.elsodleges ? html`<span class="badge badge-info">elsődleges</span>` : ''}</td>
        <td>${f.cikkszam}</td><td class="num">${fmtNum(f.kiszereles)} ${me}</td>${store.can('arak') ? html`<td class="num">${f.egysegar ? fmtMoney(f.egysegar) : '—'}</td>` : ''}
        <td>${(u => u ? html`<a href="${u}" target="_blank" rel="noopener">Webshop ↗</a>` : '')(L.productUrl(store.get('Beszallitok', f.beszallito_id), f))}</td></tr>`)}
    </tbody></table></div>` : html`<p class="muted small">Nincs megadva beszerzési forrás.</p>`}` : ''}
    ${lines.length && store.can('rendeles') ? html`<h3 style="margin-top:1.25rem">Nyitott rendelések</h3><ul class="small">${lines.map(l =>
      html`<li>${l.rendeles_id}: ${fmtNum(l.mennyiseg)} ${me} rendelve, ${fmtNum(l.beerkezett)} megérkezett</li>`)}</ul>` : ''}
    <h3 style="margin-top:1.25rem">Mozgások <span class="small muted" style="font-weight:400">(utolsó 40)</span></h3>
    ${moves.length ? html`<div class="move-list">${moves.map(m => html`<div class="move">
        ${moveIcon(m.tipus)}
        <div class="grow"><div>${fmtDate(m.datum, true)}</div>
          <div class="small muted">${m.bizonylat}${m.megjegyzes ? ' · ' + m.megjegyzes : ''} · ${store.userName(m.felhasznalo)}</div></div>
        <div class="move-q mv-${m.tipus}">${moveQty(m)} <span class="small muted">${me}</span></div>
      </div>`)}</div>
      <div class="small muted move-legend">${Object.keys(L.MOVE_TYPES).map(k => html`<span>${moveIcon(k)} ${L.MOVE_TYPES[k]}</span>`)}</div>`
      : html`<p class="muted small">Még nincs mozgás.</p>`}`;
  const actions = [{ label: 'Bezárás', value: null }];
  if (store.can('raktaros')) actions.unshift({ label: 'Korrekció…', value: 'korr' });
  if (store.can('admin')) actions.unshift({ label: 'Szerkesztés', value: 'edit' });
  modal({ title: t.megnevezes, body, actions, wide: true }).done.then(v => {
    if (v === 'korr') showCorrection(t);
    if (v === 'edit') location.hash = '#/torzsadatok?tetel=' + encodeURIComponent(t.tetel_id);
  });
}

function showCorrection(t) {
  const st = store.state.stock[t.tetel_id];
  const me = t.mertekegyseg;
  const calc = (el) => {
    const v = formValues(el);
    const n = parseNum(v.q);
    if (isNaN(n)) return { v, q: NaN };
    return { v, q: v.mode === 'uj' ? L.round3(n - st.keszlet) : n, n };
  };
  modal({
    title: 'Korrekció – ' + t.megnevezes,
    body: html`
      <p class="small muted">Leltár nélküli javítás (pl. sérült, elveszett, rosszul rögzített mennyiség).
        Jelenlegi készlet: <b>${fmtNum(st.keszlet)} ${me}</b>.</p>
      <div class="chip-list" style="margin-bottom:.75rem">
        <label class="chip on"><input type="radio" name="mode" value="uj" checked hidden> Új mennyiség</label>
        <label class="chip"><input type="radio" name="mode" value="elteres" hidden> Eltérés (+ / −)</label>
      </div>
      <div class="form-grid">
        <label class="field"><span id="qlabel">Tényleges mennyiség (${me})</span><input name="q" inputmode="decimal" placeholder="pl. ${fmtNum(Math.max(0, st.keszlet - 5))}"></label>
        <label class="field span-2"><span>Indoklás (kötelező)</span><input name="ok" placeholder="pl. sérült csomag"></label>
      </div>
      <p class="small" id="calc" style="margin-top:.5rem"></p>`,
    onMount: el => {
      const upd = () => {
        const { v, q, n } = calc(el);
        el.querySelectorAll('label.chip').forEach(c => c.classList.toggle('on', c.querySelector('input').checked));
        el.querySelector('#qlabel').textContent = v.mode === 'uj' ? `Tényleges mennyiség (${me})` : `Eltérés (+ / −, ${me})`;
        el.querySelector('#calc').textContent = isNaN(q) ? '' : v.mode === 'uj'
          ? `Eltérés: ${q > 0 ? '+' : ''}${fmtNum(q)} ${me}` : `Új készlet: ${fmtNum(L.round3(st.keszlet + n))} ${me}`;
      };
      el.addEventListener('input', upd);
      el.addEventListener('change', upd);
    },
    actions: [{ label: 'Mégse', value: null }, {
      label: 'Rögzítés', kind: 'primary', onClick: async el => {
        const { v, q } = calc(el);
        if (isNaN(q)) { toast('Adj meg egy számot.', 'error'); return false; }
        if (v.mode === 'uj' && parseNum(v.q) < 0) { toast('A mennyiség nem lehet negatív.', 'error'); return false; }
        if (!q) { toast('Nincs eltérés a jelenlegi készlethez képest.', 'warn'); return false; }
        if (v.mode === 'uj') v.ok = `${v.ok.trim()} (beállítva: ${fmtNum(parseNum(v.q))} ${me})`;
        if (!v.ok.trim() || v.ok.trim().startsWith('(beállítva')) { toast('Az indoklás kötelező.', 'error'); return false; }
        try {
          await store.enqueue({ type: 'mozgasok', rows: [{ mozgas_id: L.newId('M', 12), datum: new Date().toISOString(),
            tipus: 'KORREKCIO', tetel_id: t.tetel_id, mennyiseg: q, bizonylat: 'KORR', megjegyzes: v.ok.trim() }] });
          toast('Korrekció rögzítve', 'ok');
        } catch (e) { toast(e.message, 'error'); return false; }
      },
    }],
  });
}
