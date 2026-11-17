/* KÖZÖS FÁJL – ne itt szerkeszd! Forrás: Kozos_Claude (d6b30c7), frissítés: Kozos_Claude\szinkron.ps1 · lenyomat: 3c7facdf2a544f12 */
// Közös UI-mag: biztonságos HTML sablon, formázás, keresés, értesítés, modális ablak, legördülő panel, űrlapsegédek.
// Az app saját js/ui.js-e ezt újraexportálja (export * from '../kozos/ui.js'), és mellé teszi a saját segédeit,
// így a nézetek továbbra is a './ui.js'-ből importálnak.

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
/** Saját, állandó HTML-részlet beillesztése escape nélkül (felhasználói / adatbázisból jövő szövegre SOHA). */
export const raw = s => new Raw(s);

export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmt(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(fmt).join('');
  if (v == null || v === false) return '';
  return esc(String(v));
}
/** Tagged template: a behelyettesített értékeket automatikusan escape-eli. */
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s + (i < vals.length ? fmt(vals[i]) : ''); });
  return new Raw(out);
}

// Ezres tagolás minden számnál (1 234). A magyar alapbeállítás csak 5 jegytől tagolna ('always' nélkül);
// régebbi böngészőben ilyenkor marad az alapértelmezett tagolás.
const numFmt = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 2, useGrouping: 'always' });
export const fmtNum = n => (n == null || n === '' ? '–' : numFmt.format(n));
/* Dátumok – minden formázás ezekből a segédekből megy, egységes alakban */
const p2 = n => String(n).padStart(2, '0');
/** Helyi dátum ÉÉÉÉ{sep}HH{sep}NN alakban (pl. bizonylatszámhoz '' elválasztóval, dátummezőhöz '-'). */
export const ymd = (d, sep) => `${d.getFullYear()}${sep}${p2(d.getMonth() + 1)}${sep}${p2(d.getDate())}`;
/** Óra:perc (pl. „Szinkronban · 14:05”). */
export const fmtTime = d => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
export function fmtDate(iso, withTime) {
  if (!iso) return '–';
  const d = new Date(iso);
  if (isNaN(d)) return '–';
  return `${ymd(d, '.')}.` + (withTime ? ' ' + fmtTime(d) : '');
}
/** Rendezett oszlop jelölése a fejlécben. */
export const sortArrow = (active, dir) => (active ? (dir > 0 ? ' ▲' : ' ▼') : '');
export function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
/**
 * Kereső szűrő: matcher('csavar 4x') → szöveg => igaz, ha a keresés minden szava szerepel benne
 * (kis- és nagybetű, ékezet nem számít). Üres keresésre mindig igaz.
 */
export function matcher(q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  return text => { const hay = norm(text); return words.every(w => hay.includes(w)); };
}

/* ---------- Értesítés ---------- */
export function toast(msg, kind = 'info', ms = 3500) {
  let host = document.getElementById('toasts');
  if (!host) { host = document.createElement('div'); host.id = 'toasts'; document.body.appendChild(host); }
  const el = document.createElement('div');
  el.className = 'toast toast-' + kind;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => { el.classList.add('hide'); setTimeout(() => el.remove(), 300); }, ms);
}

/* ---------- Modális ablak ---------- */
/**
 * modal({ title, body, actions:[{label, kind, value, onClick}], wide })
 * Visszaad: { el, close, done } – a done egy Promise, ami a gomb value-jával (vagy null-lal) teljesül.
 */
export function modal({ title, body, actions = [], wide = false, onMount }) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = String(html`
    <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head"><h2>${title}</h2><button class="icon-btn" data-close aria-label="Bezárás">✕</button></div>
      <div class="modal-body">${body}</div>
      ${actions.length ? html`<div class="modal-foot">${actions.map((a, i) =>
        html`<button class="btn ${a.kind ? 'btn-' + a.kind : ''}" data-act="${i}">${a.label}</button>`)}</div>` : ''}
    </div>`);
  document.body.appendChild(back);
  document.body.classList.add('modal-open');
  let resolve;
  const done = new Promise(r => { resolve = r; });
  const close = (val = null) => {
    back.remove();
    if (!document.querySelector('.modal-back')) document.body.classList.remove('modal-open');
    document.removeEventListener('keydown', onKey);
    resolve(val);
  };
  // Módosított űrlap: a felhasználó által átírt (name attribútumos) mező után
  // a mentés nélküli bezárás (✕, háttér, Esc, Mégse) megerősítést kér.
  let dirty = false, asking = false, busy = false;
  const markDirty = e => { if (e.isTrusted && e.target.name && e.target.closest('.modal-body')) dirty = true; };
  back.addEventListener('input', markDirty);
  back.addEventListener('change', markDirty);
  const cancel = async (val = null) => {
    if (dirty) {
      if (asking) return;
      asking = true;
      const ok = await confirmDialog('Elveted a módosításokat?', 'A beírt adatok nincsenek mentve, bezáráskor elvesznek.', 'Elvetés', 'danger');
      asking = false;
      if (!ok) return;
    }
    close(val);
  };
  // Esc csak a legfelső ablakra hat (megerősítő ablak nyitva lehet felette)
  // (nyitott legördülő / találati lista esetén az Esc csak azt zárja be)
  const onKey = e => {
    if (e.key !== 'Escape' || [...document.querySelectorAll('.modal-back')].pop() !== back) return;
    if (document.querySelector('.popover') || back.querySelector('.picker-list')) return;
    cancel(null);
  };
  document.addEventListener('keydown', onKey);
  // Csak akkor zár a háttérre kattintás, ha a lenyomás is a háttéren kezdődött
  // (különben egy beviteli mezőben kezdett, az ablakon kívül elengedett kijelölés bezárná).
  let downOnBack = false;
  back.addEventListener('pointerdown', e => { downOnBack = e.target === back; });
  back.addEventListener('click', async e => {
    if (e.target === back) { if (downOnBack) cancel(null); downOnBack = false; return; }
    if (e.target.closest('[data-close]')) return cancel(null);
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = actions[Number(b.dataset.act)];
    // Figyelem: a value lehet null / false (pl. Mégse) – ezt nem szabad „igen”-re cserélni
    const val = 'value' in a ? a.value : true;
    if (a.onClick) {
      // Dupla kattintás / koppintás ellen: amíg az előző mentés fut, a gombok nem indítanak újat
      // (különben pl. egy korrekció vagy rendelés kétszer kerülne rögzítésre)
      if (busy) return;
      busy = true;
      let r;
      try { r = await a.onClick(back); } finally { busy = false; }
      if (r === false) return; // validációs hiba: maradjon nyitva
      close(r === undefined ? val : r);
    } else if (val === null || val === false) cancel(val);
    else close(val);
  });
  const el = back.querySelector('.modal');
  if (onMount) onMount(el, close);
  const first = el.querySelector('input:not([type=checkbox]), select, textarea');
  if (first && window.matchMedia('(pointer:fine)').matches) setTimeout(() => first.focus(), 30);
  return { el, close, done };
}

export function confirmDialog(title, text, okLabel = 'OK', kind = 'primary') {
  return modal({
    title, body: html`<p>${text}</p>`,
    actions: [{ label: 'Mégse', value: false }, { label: okLabel, kind, value: true }],
  }).done.then(v => v === true);
}

/**
 * Szabad szöveges mező, amely felajánlja a korábbi / lehetséges értékeket (a böngésző beépített
 * javaslatlistája, <datalist>): gépeléskor szűr, de bármi beírható. Ellenőrzött (zárt) listához nem ez kell,
 * hanem legördülő választó.
 */
let dlSeq = 0;
export function suggestInput(name, value, values, placeholder = '') {
  const id = 'dl-' + (++dlSeq);
  const opts = [...new Set((values || []).map(v => String(v ?? '').trim()).filter(Boolean))];
  return html`<input name="${name}" list="${id}" value="${value ?? ''}" placeholder="${placeholder}" autocomplete="off"><datalist id="${id}">${opts.map(v => html`<option value="${v}">`)}</datalist>`;
}

/** Űrlap mezők kiolvasása name attribútum alapján. */
export function formValues(root) {
  const out = {};
  root.querySelectorAll('[name]').forEach(el => {
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else out[el.name] = el.value;
  });
  return out;
}

/** Szöveg a vágólapra (a böngésző beépített vágólapkezelőjével; az app mindig biztonságos kapcsolaton fut). */
export function copyText(text) {
  return navigator.clipboard.writeText(text)
    .then(() => toast('Vágólapra másolva', 'ok'), () => toast('A másolás nem sikerült', 'error'));
}

/* ---------- Legördülő panel (popover) ---------- */
let openPop = null;
export function closePopover() { if (openPop) { const p = openPop; openPop = null; p.close(); } }
/**
 * Egy elemhez kötött kis lebegő panel. Kívülre kattintva, Esc-re, vagy a nyitó gombra
 * újra kattintva bezárul (váltógomb-viselkedés, minden legördülőnél egységesen).
 * Ahol több hely van (alatta / fölötte), oda nyílik; ha egyik oldalon sem fér el, görgethető lesz.
 * popover(anchor, tartalom, { onMount(el, close), onClose(), minWidth }) → { el, close } | null (ha bezárta)
 */
export function popover(anchor, content, { onMount, onClose, minWidth } = {}) {
  // Ugyanarra a nyitó elemre újra kattintva: csak bezárás (ne nyíljon újra)
  if (openPop && openPop.anchor === anchor) { closePopover(); return null; }
  closePopover();
  const el = document.createElement('div');
  el.className = 'popover';
  if (minWidth) el.style.minWidth = minWidth + 'px';
  el.innerHTML = String(content);
  document.body.appendChild(el);
  const place = () => {
    el.style.maxHeight = '';
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    // clientWidth: a görgetősáv nélküli szélesség (az innerWidth-szel a panel a görgetősáv alá lógna, és vízszintes görgetés jelenne meg)
    let left = Math.min(r.left, document.documentElement.clientWidth - w - 8);
    // Mobilon az alsó menüsáv (fix) eltakarná a panel alját: azt a helyet nem számoljuk
    const nav = document.getElementById('nav');
    const bottomBar = nav && getComputedStyle(nav).position === 'fixed' && nav.offsetHeight < window.innerHeight / 2 ? nav.offsetHeight : 0;
    const below = window.innerHeight - bottomBar - r.bottom - 12, above = r.top - 12;
    const h = el.offsetHeight;
    let top;
    if (h <= below) top = r.bottom + 4;                 // alatta elfér
    else if (h <= above) top = r.top - h - 4;           // fölötte elfér
    else if (below >= above) { el.style.maxHeight = Math.max(120, below) + 'px'; top = r.bottom + 4; } // egyik sem: a nagyobbik oldal, görgethetően
    else { el.style.maxHeight = Math.max(120, above) + 'px'; top = r.top - el.offsetHeight - 4; }
    el.style.left = Math.max(8, left) + window.scrollX + 'px';
    el.style.top = Math.max(8, top) + window.scrollY + 'px';
  };
  place();
  const onDoc = e => { if (!el.contains(e.target) && !anchor.contains(e.target)) close(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    anchor.setAttribute('aria-expanded', 'false');
    el.remove();
    document.removeEventListener('mousedown', onDoc, true);
    document.removeEventListener('touchstart', onDoc, true);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', place);
    if (openPop && openPop.el === el) openPop = null;
    if (onClose) onClose();
  };
  setTimeout(() => {
    document.addEventListener('mousedown', onDoc, true);
    document.addEventListener('touchstart', onDoc, true);
  }, 0);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', place);
  anchor.setAttribute('aria-expanded', 'true');
  openPop = { el, close, anchor };
  if (onMount) onMount(el, close);
  return openPop;
}

/** Űrlap szekció címmel. layout: 'grid' (több oszlop) vagy 'col' (egymás alatt). */
export function sec(title, body, layout = 'grid') {
  return html`<section class="fsec"><div class="fsec-title">${title}</div><div class="${layout === 'col' ? 'form-col' : 'form-grid'}">${body}</div></section>`;
}
