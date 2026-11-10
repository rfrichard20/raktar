// Több nézetben használt elemek.
import * as store from '../store.js';
import { ICONS } from '../icons.js';
import { html, raw, esc, matcher, fmtNum, fmtDate, modal, toast, parseNum, formValues, sec, confirmDialog, copyText, help, STATUS_TEXT, fmtMoney, todayInput, dateInputToIso, dateStamp, suggestInput, popover } from '../ui.js';

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
    const q = input.value.trim();
    const ex = opts.exclude ? opts.exclude() : new Set();
    const match = matcher(q);
    matches = opts.items().filter(t => !ex.has(t.tetel_id) &&
      match(`${t.megnevezes} ${t.kategoria} ${t.raktar || ''} ${t.polc} ${t.tetel_id} ${L.sourcesFor(store.state.db, t.tetel_id).map(f => f.cikkszam).join(' ')}`))
      .slice(0, 30);
    close();
    if (!q && !opts.showAll) return;
    const canCreate = opts.allowCreate !== false && store.can('raktaros') && q;
    list = document.createElement('div');
    list.className = 'picker-list';
    list.innerHTML = String(html`${matches.length
      ? matches.map((t, i) => html`<button type="button" data-i="${i}" class="${i === hl ? 'hl' : ''}">${label(t)}<div class="small muted">${t.kategoria || ''} · ${store.placeLabel(t)}</div></button>`)
      : html`<div class="empty small">Nincs ilyen tétel a törzsadatokban.</div>`}
      ${canCreate ? html`<button type="button" data-new class="picker-new">+ Új tétel felvétele: „${q}”</button>` : ''}`);
    wrap.appendChild(list);
    // Billentyűvel lépkedve a kijelölt sor mindig látszódjon (a lista görgetődik vele)
    list.querySelector('.hl')?.scrollIntoView({ block: 'nearest' });
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

/* ---------- Szűrő gomb (checkboxos legördülő a kereső mellett) ---------- */
/**
 * Listák szűrője: egy ikon gomb a kereső mellett (egy sorban), mögötte csoportonként checkboxos lista.
 * sel: { csoportkulcs: Set } – a kijelölt értékek; üres Set = nincs szűrés (mind látszik).
 * Használat: toolbarban `${filterButton(ui.f)}`, majd
 *   root.querySelector('[data-filter]').onclick = e => openFilter(e.currentTarget, groups, ui.f, frissítés);
 * groups(): [{ key, title, options: [[érték, felirat, darab?]] }] – az üres csoport nem jelenik meg.
 * A frissítés csak a listát rajzolja újra (a gomb a helyén marad, a darabszámot az openFilter frissíti).
 */
const filterCount = sel => Object.values(sel).reduce((a, s) => a + s.size, 0);
export function filterButton(sel) {
  const n = filterCount(sel);
  return html`<button type="button" class="btn filter-btn ${n ? 'on' : ''}" data-filter title="Szűrők" aria-label="Szűrők">${ICONS.filter}${n ? html`<span class="filter-n">${n}</span>` : ''}</button>`;
}
export function openFilter(btn, groups, sel, onChange) {
  const body = () => html`${groups().filter(g => g.options.length).map(g => html`<div class="pop-title">${g.title}</div>
    ${g.options.map(([v, l, n]) => html`<label class="pop-item"><input type="checkbox" data-g="${g.key}" value="${v}" ${sel[g.key].has(v) ? 'checked' : ''}>
      <span class="grow">${l}</span>${n != null ? html`<span class="small muted">${n}</span>` : ''}</label>`)}`)}
    <div class="pop-foot"><button type="button" class="btn btn-sm btn-link-danger" data-x="clear">Szűrők törlése</button>
      <button type="button" class="btn btn-sm btn-primary" data-x="ok">Kész</button></div>`;
  const changed = () => {
    const n = filterCount(sel);
    btn.classList.toggle('on', !!n);
    btn.querySelector('.filter-n')?.remove();
    if (n) btn.insertAdjacentHTML('beforeend', `<span class="filter-n">${n}</span>`);
    onChange();
  };
  popover(btn, body(), {
    minWidth: 260,
    onMount: (el, close) => {
      el.addEventListener('change', e => {
        const s = sel[e.target.dataset.g];
        if (!s) return;
        e.target.checked ? s.add(e.target.value) : s.delete(e.target.value);
        changed();
      });
      el.addEventListener('click', e => {
        const x = e.target.closest('[data-x]');
        if (!x) return;
        if (x.dataset.x === 'clear') { Object.values(sel).forEach(s => s.clear()); el.innerHTML = String(body()); changed(); } else close();
      });
    },
  });
}
/** Szűrő teljesül-e: üres Set = mind; egyébként az érték benne van. */
export const inSel = (set, v) => !set.size || set.has(v);
/** Felsorolás [érték, felirat, darab] alakban egy lista adott mezőjének értékeiből (darab: hány elem esik bele). */
export const countOptions = (values, list, field) => values.map(v => [v, v, list.filter(x => x[field] === v).length]);

/**
 * Tételfelvevő űrlapokon (kivét, rendelés nélküli beérkezés): a mennyiség beírása után Enterre a kurzor
 * visszaugrik a tételkeresőbe, így a következő tétel rögtön kereshető. Kapcsolható, a készüléken megmarad.
 * enterBackHtml() a kapcsoló, bindEnterBack(keresőmező) a működés (a kereső kártyáján belüli mennyiségmezőkre).
 */
export const enterBackHtml = () => html`<label class="check small nowrap" title="A mennyiség után Enterre a kurzor visszaugrik a tételkeresőbe">
  <input type="checkbox" data-enterback ${store.getPref('enterBack', true) ? 'checked' : ''}> Enter után vissza a keresőbe</label>`;
export function bindEnterBack(search) {
  const card = search.closest('.card');
  card.querySelector('[data-enterback]')?.addEventListener('change', e => store.setPref('enterBack', e.target.checked));
  card.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.dataset.k !== 'q') return;
    e.preventDefault();
    if (store.getPref('enterBack', true)) search.focus(); else e.target.blur();
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
        <label class="field"><span>Polc / hely</span>${suggestInput('polc', '', store.shelves(), 'pl. A1')}</label>
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
          try { await store.enqueue({ type: 'mentes', table: 'Listak', row: { lista_id: L.newId('L', 6), tipus, ertek: val, sorrend: store.nextListOrder(tipus) } }); }
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
  const items = store.activeItems().slice().sort(store.byPlace);
  const sel = new Set(tpl ? tplIds(tpl) : []);
  // Meglévő sablon szerkesztésekor alapból csak a benne lévő tételek látszanak
  const f = { q: '', only: !!(tpl && sel.size) };
  const fs = { cat: new Set(), wh: new Set() }; // szűrő (filterButton)
  const whs = store.warehouses();
  const groups = () => [
    { key: 'cat', title: 'Kategória', options: countOptions(store.categories(), items, 'kategoria') },
    { key: 'wh', title: 'Raktár', options: whs.length > 1 ? countOptions(whs, items, 'raktar') : [] },
  ];
  const visible = () => {
    const match = matcher(f.q);
    return items.filter(t => inSel(fs.cat, t.kategoria) && inSel(fs.wh, t.raktar) && (!f.only || sel.has(t.tetel_id)) &&
      match(`${t.megnevezes} ${t.kategoria} ${t.polc} ${t.raktar || ''}`));
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
          ${filterButton(fs)}
          <label class="check small nowrap"><input type="checkbox" data-f="only" ${f.only ? 'checked' : ''}> Csak a kijelöltek</label>
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
  el.querySelector('[data-f="only"]').addEventListener('change', e => { f.only = e.target.checked; refresh(); });
  el.querySelector('[data-list]').addEventListener('change', e => {
    const id = e.target.dataset.id;
    if (!id) return;
    e.target.checked ? sel.add(id) : sel.delete(id);
    el.querySelector('[data-count]').textContent = sel.size;
  });
  el.addEventListener('click', e => {
    const fb = e.target.closest('[data-filter]');
    if (fb) return openFilter(fb, groups, fs, refresh);
    const x = e.target.closest('[data-x]');
    if (!x) return;
    if (x.dataset.x === 'all') visible().forEach(t => sel.add(t.tetel_id));
    if (x.dataset.x === 'none') sel.clear();
    refresh();
  });
  if (onDone) m.done.then(onDone);
  return m;
}

/* ---------- E-mail összeállítása sablonból ---------- */
/**
 * Megrendelés / ajánlatkérés e-mail: sablonválasztás, szerkeszthető címzett, tárgy és szöveg.
 * lines: [{ megnevezes, cikkszam, q, me }]; rid: rendelésszám (ajánlatkérésnél nincs).
 */
export function emailDialog({ supId, lines, rid = '', tipus = 'rendeles', title }) {
  const db = store.state.db;
  const sup = store.get('Beszallitok', supId) || { nev: '', email: '', kapcsolattarto: '' };
  const tpls = L.emailTemplates(db);
  const ofType = tpls.filter(s => s.tipus === tipus);
  const pick = ofType.find(s => s.sablon_id === sup.email_sablon) || ofType[0] || tpls[0];
  const kontakt = String(sup.kapcsolattarto || '').trim();
  const vals = {
    beszallito: sup.nev, kapcsolattarto: kontakt || 'Partnerünk', keresztnev: kontakt ? kontakt.split(/\s+/).pop() : '',
    tetelek: L.emailItemList(lines.map(l => ({ ...l, qText: `${fmtNum(l.q)} ${l.me || ''}`.trim() }))),
    rendelesszam: rid || '–', belso_azon: (rid && store.get('Rendelesek', rid)?.belso_azon) || '–', datum: fmtDate(new Date().toISOString()),
    felado: store.state.user?.nev || '', felado_email: store.state.user?.email || '',
  };
  const fill = s => ({ targy: L.fillTemplate(s.targy, vals), szoveg: L.fillTemplate(s.szoveg, vals) });
  const first = fill(pick);
  const m = modal({
    title: title || (tipus === 'ajanlat' ? `Ajánlatkérés – ${sup.nev}` : `Megrendelés – ${sup.nev}`),
    wide: true,
    body: html`
      <div class="form-grid">
        <label class="field"><span>Sablon</span><select name="sablon">
          ${Object.entries(L.EMAIL_TYPES).map(([k, lbl]) => html`<optgroup label="${lbl}">${tpls.filter(s => s.tipus === k).map(s =>
            html`<option value="${s.sablon_id}" ${s === pick ? 'selected' : ''}>${s.nev}</option>`)}</optgroup>`)}</select></label>
        <label class="field"><span>Címzett</span><input name="to" type="email" value="${sup.email || ''}" placeholder="beszállító e-mail címe"></label>
        <label class="field span-2"><span>Tárgy</span><input name="targy" value="${first.targy}"></label>
      </div>
      <label class="field" style="margin-top:.75rem"><span>Szöveg (szerkeszthető)</span>
        <textarea name="szoveg" class="mail-body" spellcheck="true">${first.szoveg}</textarea></label>
      <p class="small muted" style="margin-top:.5rem">A sablonok a Törzsadatok → E-mail sablonok fülön szerkeszthetők; a beszállítónál beállítható az alapértelmezett.</p>`,
    actions: [
      { label: 'Másolás', onClick: el => { copyText(el.querySelector('[name=szoveg]').value); return false; } },
      { label: 'E-mail megnyitása', kind: 'primary', onClick: el => {
        const to = el.querySelector('[name=to]').value.trim();
        const subject = el.querySelector('[name=targy]').value;
        const body = el.querySelector('[name=szoveg]').value;
        location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        return false;
      } },
      { label: 'Kész', value: true },
    ],
  });
  m.el.querySelector('[name=sablon]').addEventListener('change', e => {
    const s = tpls.find(x => x.sablon_id === e.target.value);
    if (!s) return;
    const f = fill(s);
    m.el.querySelector('[name=targy]').value = f.targy;
    m.el.querySelector('[name=szoveg]').value = f.szoveg;
  });
  return m;
}


/* ---------- Mozgástípus ikonok ---------- */
const MOVE_SVG = {
  LELTAR: '<path d="M5 9h14M5 15h14"/>',            // „=” – megszámolt érték
  BEERKEZES: '<path d="M12 4v15m-6-6 6 6 6-6"/>',    // lefelé nyíl – be
  KIVET: '<path d="M12 20V5m-6 6 6-6 6 6"/>',         // felfelé nyíl – ki
  KORREKCIO: '<path d="M5 19l1-4L16 5l3 3L9 18z"/>',  // ceruza – javítás
};
export function moveIcon(tipus) {
  return raw(`<span class="mv-ico mv-${esc(tipus)}" title="${esc(L.MOVE_TYPES[tipus] || tipus)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${MOVE_SVG[tipus] || ''}</svg></span>`);
}
/** Mozgás mennyisége előjellel: + beérkezés, − kivét, korrekciónál a saját előjele; leltárnál a megszámolt érték (előjel nélkül). */
export function moveQty(m) {
  const n = fmtNum(Math.abs(m.mennyiseg));
  if (m.tipus === 'LELTAR') return n;
  return (m.tipus === 'KIVET' || m.mennyiseg < 0 ? '− ' : '+ ') + n;
}

/** A mozgások jelmagyarázata (súgóba). */
export const movesLegend = () => html`<b>Jelölések</b><br>${Object.keys(L.MOVE_TYPES).map(k => html`<span class="legend-row">${moveIcon(k)} ${L.MOVE_TYPES[k]}</span>`)}
  <br>A mennyiség a változás előjellel (+ be, − ki); leltárnál a megszámolt mennyiség.`;

/**
 * Mozgások táblázata (tétel adatlap, Mozgások oldal): elöl a típus ikonja, a végén az előjeles mennyiség
 * jobbra igazítva, így az ikonok és a számok is oszlopba rendeződnek.
 * withItem: a tétel neve is látszik (több tétel mozgásai), a sor kattintható → a tétel adatlapja.
 */
export function movesTable(moves, { withItem = false } = {}) {
  const extra = m => html`${m.atvevo || m.munka ? html`<div class="small">${[m.atvevo && `Átvevő: ${store.userName(m.atvevo)}`, m.munka && `Munka: ${m.munka}`].filter(Boolean).join(' · ')}</div>` : ''}${m.megjegyzes ? html`<div class="small muted">${m.megjegyzes}</div>` : ''}`;
  return html`<table class="tbl cards nochk moves-tbl">
    <thead><tr><th class="c-ico"><span class="sr-only">Típus</span></th><th>Dátum</th>${withItem ? html`<th>Tétel</th>` : ''}<th>Bizonylat</th><th>Rögzítette</th><th class="num">Mennyiség</th></tr></thead>
    <tbody>${moves.map(m => {
      const t = store.itemOrStub(m.tetel_id);
      return html`<tr ${withItem ? html`class="click" data-id="${m.tetel_id}" tabindex="0"` : ''}>
        <td class="c-ico">${moveIcon(m.tipus)}</td>
        <td class="${withItem ? 'm-hide' : 'c-main'} nowrap">${fmtDate(m.datum, true)}</td>
        ${withItem ? html`<td class="c-main">${t.megnevezes}<div class="sub">${store.placeLabel(t)}</div></td>` : ''}
        <td class="c-meta">${withItem ? html`<span class="m-only">${fmtDate(m.datum, true)} · </span>` : ''}${m.bizonylat}${extra(m)}</td>
        <td class="c-f2">${store.userName(m.felhasznalo)}</td>
        <td class="num c-f1"><span class="move-q mv-${m.tipus}">${moveQty(m)}</span> <span class="small muted">${t.mertekegyseg}</span></td>
      </tr>`;
    })}</tbody></table>`;
}

/* ---------- Anyagkivét (Kivét oldal és gyors kivét az adatlapról) ---------- */
/**
 * A kivét fejadatai űrlapmezőként: átvevő, munka / projekt, dátum, megjegyzés.
 * v: korábbi értékek (pl. vázlatból). Az átvevőnél és a munkánál a korábbi értékek felajánlva.
 */
export function kivetFields(v = {}) {
  const db = store.state.db;
  const users = (db.Felhasznalok || []).map(u => u.nev || u.email).sort((a, b) => a.localeCompare(b, 'hu'));
  const munkak = store.recentValues(db.Mozgasok.filter(m => m.tipus === 'KIVET'), 'munka', 'datum');
  return html`
    <label class="field"><span>Átvevő *</span>${suggestInput('atvevo', v.atvevo ?? store.userName(store.state.user.email), users, 'ki vitte el')}</label>
    <label class="field"><span>Munka / projekt</span>${suggestInput('munka', v.munka, munkak, 'pl. MiniCRM azonosító')}</label>
    <label class="field"><span>Dátum</span><input type="date" name="datum" value="${v.datum || todayInput()}" max="${todayInput()}"></label>
    <label class="field span-2"><span>Megjegyzés</span><input name="megjegyzes" value="${v.megjegyzes || ''}" placeholder="opcionális"></label>`;
}

/**
 * Kivét rögzítése. items: [{ tetel_id, q }], meta: { atvevo, munka, datum (ÉÉÉÉ-HH-NN), megjegyzes }.
 * Ellenőriz (átvevő, mennyiségek), túlkivétnél megerősítést kér. Visszaad: true, ha rögzítve; különben false.
 */
export async function saveKivet(items, meta) {
  const atvevoText = String(meta.atvevo || '').trim();
  if (!atvevoText) { toast('Add meg, ki vitte el (átvevő).', 'error'); return false; }
  if (!items.length) { toast('Adj hozzá legalább egy tételt.', 'warn'); return false; }
  for (const it of items) {
    if (!(it.q > 0)) { toast('Hiányzó vagy hibás mennyiség: ' + store.itemOrStub(it.tetel_id).megnevezes, 'error'); return false; }
  }
  if (meta.datum && meta.datum > todayInput()) { toast('A dátum nem lehet a jövőben.', 'error'); return false; }
  // Túlkivét: engedjük (a nyilvántartás eltérhet a valóságtól), de jelezzük
  const over = items.filter(it => it.q > (store.state.stock[it.tetel_id]?.keszlet ?? 0));
  if (over.length && !(await confirmDialog('Több, mint a nyilvántartott készlet',
    `${over.map(it => store.itemOrStub(it.tetel_id).megnevezes).join(', ')}: a kivett mennyiség több, mint a nyilvántartott készlet. ` +
    'A kivét rögzíthető, a készlet negatívba fordul; a következő leltár rendezi. Rögzíted?', 'Rögzítés'))) return false;
  // Átvevő: ha egy felhasználó nevét vagy e-mail-címét adták meg, az e-mail-cím kerül tárolásra (névváltozás után is azonosítható)
  const lower = atvevoText.toLowerCase();
  const user = (store.state.db.Felhasznalok || []).find(u => String(u.nev || '').toLowerCase() === lower || u.email === lower);
  const datum = dateInputToIso(meta.datum || todayInput());
  const bizonylat = `KI-${dateStamp(new Date(datum))}-${L.newId('', 4)}`;
  try {
    await store.enqueue({ type: 'mozgasok', rows: items.map(it => ({
      mozgas_id: L.newId('M', 12), datum, tipus: 'KIVET', tetel_id: it.tetel_id, mennyiseg: it.q, bizonylat,
      atvevo: user ? user.email : atvevoText, munka: String(meta.munka || '').trim(), megjegyzes: String(meta.megjegyzes || '').trim() })) });
    toast('Kivét rögzítve', 'ok');
    return true;
  } catch (x) { toast(x.message, 'error', 6000); return false; }
}

/** Gyors kivét egy tételből (a tétel adatlapjáról). */
function showKivet(t) {
  const st = store.state.stock[t.tetel_id];
  return modal({
    title: 'Kivét – ' + t.megnevezes,
    body: html`
      <p class="small muted">Nyilvántartott készlet: <b>${fmtNum(st.keszlet)} ${t.mertekegyseg}</b> · ${store.placeLabel(t)}</p>
      <div class="form-grid">
        <label class="field"><span>Mennyiség (${t.mertekegyseg}) *</span><input name="q" inputmode="decimal" placeholder="${t.mertekegyseg}"></label>
        ${kivetFields()}
      </div>`,
    actions: [{ label: 'Mégse', value: null }, {
      label: 'Kivét rögzítése', kind: 'primary', onClick: async el => {
        const v = formValues(el);
        return (await saveKivet([{ tetel_id: t.tetel_id, q: parseNum(v.q) }], v)) || false;
      },
    }],
  });
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
  const canKivet = store.can('szerelo'), canKorr = store.can('raktaros'), canEdit = store.can('admin');
  const stLabel = STATUS_TEXT[st.statusz];
  const body = html`
    <div class="detail-head">
      <div class="detail-hero st-${st.statusz}">
        <div class="hero-label">Aktuális készlet</div>
        <div class="hero-value">${fmtNum(st.keszlet)} <span class="hero-unit">${me}</span></div>
        <div class="hero-status"><span class="legend-bar st-${st.statusz}"></span>${stLabel}</div>
        <dl class="hero-levels">
          <div><dt>Minimum</dt><dd>${fmtNum(t.min_keszlet)} <span class="muted">${me}</span></dd></div>
          <div><dt>Cél</dt><dd>${fmtNum(t.cel_keszlet)} <span class="muted">${me}</span></dd></div>
        </dl>
      </div>
      <dl class="facts">
        <dt>Hely</dt><dd>${store.placeLabel(t)}</dd>
        <dt>Kategória</dt><dd>${t.kategoria || '—'}</dd>
        <dt>Úton (rendelve)</dt><dd>${st.uton ? `${fmtNum(st.uton)} ${me}` : '–'}</dd>
        <dt>Utolsó leltár</dt><dd>${fmtDate(st.leltarDatum)}${st.leltarDatum ? html` <span class="muted">(${st.napjaLeltar} napja)</span>` : ''}${st.esedekes ? html` <span class="badge badge-warn">esedékes</span>` : ''}</dd>
        <dt>Leltár gyakoriság</dt><dd>${t.leltar_ciklus_nap ? t.leltar_ciklus_nap + ' nap' : '—'}</dd>
        ${st.ertek && store.can('arak') ? html`<dt>Készletérték</dt><dd>${fmtMoney(st.ertek)} <span class="muted">(${fmtMoney(st.egysegar)}/${me})</span></dd>` : ''}
        ${t.megjegyzes ? html`<dt>Megjegyzés</dt><dd>${t.megjegyzes}</dd>` : ''}
      </dl>
    </div>
    ${canKivet ? html`<div class="detail-actions">
      <button class="btn" data-d="kivet">${ICONS.out} Kivét…</button>
      ${canKorr ? html`<button class="btn" data-d="bevet">${ICONS.in} Bevét…</button>
        <button class="btn" data-d="korr">${ICONS.adjust} Korrekció…</button>` : ''}
      ${canEdit ? html`<button class="btn" data-d="edit">${ICONS.edit} Szerkesztés</button>` : ''}
    </div>` : ''}
    ${store.can('rendeles') ? html`<h3 class="sec-h">Beszerzési források</h3>
    ${src.length ? html`<div class="table-wrap"><table class="tbl small cards nochk detail-tbl"><thead><tr><th>Beszállító</th><th>Cikkszám</th><th class="num">Kiszerelés</th>${store.can('arak') ? html`<th class="num">Egységár</th>` : ''}<th></th></tr></thead><tbody>
      ${src.map(f => html`<tr><td class="c-main">${store.supplierName(f.beszallito_id)} ${f.elsodleges ? html`<span class="star-on" title="Elsődleges forrás">${ICONS.star}</span>` : ''}</td>
        <td class="c-f1" data-l="Cikkszám">${f.cikkszam || '—'}</td><td class="num c-f2" data-l="Kiszerelés">${fmtNum(f.kiszereles)} ${me}</td>${store.can('arak') ? html`<td class="num c-f3" data-l="Egységár">${f.egysegar ? fmtMoney(f.egysegar) : '—'}</td>` : ''}
        <td class="c-act">${(u => u ? html`<a href="${u}" target="_blank" rel="noopener">Webshop ↗</a>` : '')(L.productUrl(store.get('Beszallitok', f.beszallito_id), f))}</td></tr>`)}
    </tbody></table></div>` : html`<p class="muted small">Nincs megadva beszerzési forrás.</p>`}` : ''}
    ${lines.length && store.can('rendeles') ? html`<h3 class="sec-h">Nyitott rendelések</h3>
      <div class="table-wrap"><table class="tbl small cards nochk detail-tbl"><thead><tr><th>Rendelés</th><th>Beszállító</th><th class="num">Rendelt</th><th class="num">Megérkezett</th></tr></thead>
      <tbody>${lines.map(l => { const o = store.get('Rendelesek', l.rendeles_id) || {}; return html`<tr>
        <td class="c-main">${l.rendeles_id}${o.belso_azon ? html` <span class="muted">· ${o.belso_azon}</span>` : ''}<div class="sub">${fmtDate(o.datum)}</div></td>
        <td class="c-act">${store.supplierName(o.beszallito_id)}</td>
        <td class="num c-f1" data-l="Rendelt">${fmtNum(l.mennyiseg)} ${me}</td><td class="num c-f2" data-l="Megérkezett">${fmtNum(l.beerkezett)}</td></tr>`; })}</tbody></table></div>` : ''}
    <h3 class="sec-h">Mozgások <span class="small muted" style="font-weight:400">(utolsó 40 – az összes a Mozgások oldalon)</span>
      ${help(movesLegend())}</h3>
    ${moves.length ? html`<div class="table-wrap">${movesTable(moves)}</div>` : html`<p class="muted small">Még nincs mozgás.</p>`}`;
  const dlg = modal({ title: t.megnevezes, body, actions: [{ label: 'Bezárás', value: null }], wide: true });
  // A művelet ablaka az adatlap fölött nyílik; bezárása után az adatlap frissült adatokkal újranyílik (nyitva marad)
  dlg.el.addEventListener('click', async e => {
    const b = e.target.closest('[data-d]');
    if (!b) return;
    const action = { korr: showCorrection, kivet: showKivet, bevet: showBevet,
      edit: async x => (await import('./torzsadatok.js')).editItem(x) }[b.dataset.d];
    if (!action) return;
    const r = action(t); // modális ablak ({ done }) vagy Promise
    await (r && r.done ? r.done : r);
    dlg.close();
    showItemDetail(t.tetel_id);
  });
}

/**
 * Bevét egy tételből (az adatlapról). Ha a tételnek van nyitott rendelése, alapból ahhoz kötve rögzül
 * (a rendelés teljesül), de „rendelés nélkül” is választható.
 */
function showBevet(t) {
  const db = store.state.db;
  const me = t.mertekegyseg;
  const lines = db.Rendeles_tetelek.filter(l => l.tetel_id === t.tetel_id && !l.lezarva).map(l => {
    const o = store.get('Rendelesek', l.rendeles_id) || {};
    return { l, o, rem: L.round3(l.mennyiseg - l.beerkezett) };
  }).filter(x => x.o.rendeles_id).sort((a, b) => (a.o.datum < b.o.datum ? -1 : 1)); // a legrégebbi elöl
  return modal({
    title: 'Bevét – ' + t.megnevezes,
    body: html`
      <p class="small muted">Nyilvántartott készlet: <b>${fmtNum(store.state.stock[t.tetel_id].keszlet)} ${me}</b> · ${store.placeLabel(t)}</p>
      <div class="form-grid">
        ${lines.length ? html`<label class="field span-2"><span>Rendelés</span><select name="sor">
          ${lines.map(x => html`<option value="${x.l.sor_id}">${x.o.rendeles_id} · ${store.supplierName(x.o.beszallito_id)} · ${fmtDate(x.o.datum)} – hátra ${fmtNum(x.rem)} ${me}</option>`)}
          <option value="">Rendelés nélkül</option></select></label>` : ''}
        <label class="field"><span>Mennyiség (${me}) *</span><input name="q" inputmode="decimal" placeholder="${lines.length ? fmtNum(lines[0].rem) : me}"></label>
        <label class="field"><span>Dátum</span><input type="date" name="datum" value="${todayInput()}" max="${todayInput()}"></label>
        <label class="field"><span>Szállítólevél / számla</span><input name="szallitolevel" placeholder="opcionális"></label>
        <label class="field span-2"><span>Megjegyzés</span><input name="megjegyzes" placeholder="opcionális"></label>
      </div>`,
    onMount: el => el.querySelector('[name=sor]')?.addEventListener('change', e => {
      const x = lines.find(y => y.l.sor_id === e.target.value);
      el.querySelector('[name=q]').placeholder = x ? fmtNum(x.rem) : me;
    }),
    actions: [{ label: 'Mégse', value: null }, {
      label: 'Bevét rögzítése', kind: 'primary', onClick: async el => {
        const v = formValues(el);
        const q = parseNum(v.q);
        if (!(q > 0)) { toast('Adj meg egy pozitív mennyiséget.', 'error'); return false; }
        if (v.datum > todayInput()) { toast('A dátum nem lehet a jövőben.', 'error'); return false; }
        const x = lines.find(y => y.l.sor_id === v.sor);
        try {
          await store.enqueue({ type: 'mozgasok', rows: [{ mozgas_id: L.newId('M', 12), datum: dateInputToIso(v.datum || todayInput()),
            tipus: 'BEERKEZES', tetel_id: t.tetel_id, mennyiseg: q, bizonylat: v.szallitolevel.trim() || (x ? x.o.rendeles_id : 'Rendelés nélkül'),
            rendeles_sor_id: x ? x.l.sor_id : '', megjegyzes: v.megjegyzes.trim() }] });
          toast('Bevét rögzítve', 'ok');
        } catch (err) { toast(err.message, 'error', 6000); return false; }
      },
    }],
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
  return modal({
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
