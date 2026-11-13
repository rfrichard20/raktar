// UI segédfüggvények: biztonságos HTML sablon, formázás, modális ablak, értesítés.

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
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
const moneyFmt = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0, useGrouping: 'always' });
export const fmtNum = n => (n == null || n === '' ? '–' : numFmt.format(n));
export const fmtMoney = n => moneyFmt.format(Math.round(n || 0)) + ' Ft';
/* Dátumok – minden formázás ezekből a segédekből megy, egységes alakban */
const p2 = n => String(n).padStart(2, '0');
/** Helyi dátum ÉÉÉÉ{sep}HH{sep}NN alakban (pl. bizonylatszámhoz '' elválasztóval). */
const ymd = (d, sep) => `${d.getFullYear()}${sep}${p2(d.getMonth() + 1)}${sep}${p2(d.getDate())}`;
/** Óra:perc (pl. „Szinkronban · 14:05”). */
export const fmtTime = d => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
export function fmtDate(iso, withTime) {
  if (!iso) return '–';
  const d = new Date(iso);
  if (isNaN(d)) return '–';
  return `${ymd(d, '.')}.` + (withTime ? ' ' + fmtTime(d) : '');
}
/** Mai dátum bizonylatszámhoz: ÉÉÉÉHHNN. */
export const dateStamp = (d = new Date()) => ymd(d, '');
/** Mai dátum dátummezőhöz: ÉÉÉÉ-HH-NN. */
export const todayInput = () => ymd(new Date(), '-');
/** Rendezett oszlop jelölése a fejlécben. */
export const sortArrow = (active, dir) => (active ? (dir > 0 ? ' ▲' : ' ▼') : '');
/** Dátum mező (ÉÉÉÉ-HH-NN) → ISO; ha ma van, a pontos időt használja. */
export function dateInputToIso(v) {
  if (!v || v === todayInput()) return new Date().toISOString();
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}
export function parseNum(v) {
  if (v == null) return NaN;
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return NaN;
  return Number(s);
}
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
/** Rendezéshez: számokat számként, minden mást magyar ábécé szerint hasonlít. */
export function compare(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''), 'hu');
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
 * javaslatlistája, <datalist>): gépeléskor szűr, de bármi beírható. Ellenőrzött listához (kategória,
 * mértékegység, raktár) NEM ez kell, hanem a listSelect (common.js).
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
 * popover(anchor, tartalom, { onMount(el, close), onClose() }) → { el, close } | null (ha bezárta)
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
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    // clientWidth: a görgetősáv nélküli szélesség (az innerWidth-szel a panel a görgetősáv alá lógna, és vízszintes görgetés jelenne meg)
    let left = Math.min(r.left, document.documentElement.clientWidth - w - 8);
    let top = r.bottom + 4;
    if (top + h > window.innerHeight - 8 && r.top - h - 4 > 8) top = r.top - h - 4; // felfelé, ha alul nincs hely
    el.style.left = Math.max(8, left) + window.scrollX + 'px';
    el.style.top = top + window.scrollY + 'px';
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

/** Kis „?” súgó ikon: asztalon rámutatásra, érintőképernyőn koppintásra nyílik. */
export function help(text) {
  return html`<span class="help"><button type="button" class="help-btn" aria-label="Súgó" data-help>?</button><span class="help-pop" role="tooltip">${text}</span></span>`;
}

/** Készletállapot szövege (adatlap, sorjelölő súgója) – egy helyen. */
export const STATUS_TEXT = { hiany: 'Hiány – a minimum alatt', figyelem: 'Fogyóban – közel a minimumhoz', ok: 'Rendben' };
export const ORDER_STATUS = {
  nyitott: ['Nyitott', 'info'], reszben: ['Részben érkezett', 'warn'],
  teljesitve: ['Teljesítve', 'ok'], lezarva: ['Lezárva', 'muted'],
};
/** Igény állapota: [felirat, badge szín]. A feliratok a logikából (L.IGENY_STATUS) jönnek. */
const IGENY_BADGE = { uj: 'info', folyamatban: 'warn', rendelve: 'info', teljesitve: 'ok', elutasitva: 'muted' };
export const igenyStatus = s => [(window.RaktarLogic.IGENY_STATUS || {})[s] || s, IGENY_BADGE[s] || 'muted'];
/* ---------- Aláírás ---------- */
const SIG_W = 600, SIG_H = 200;
/**
 * Aláírópad egy konténerben (ujjal / egérrel). A rajz SVG vonalakként (M/L parancsok, egész koordináták,
 * 600×200-as rácson) tárolódik: kicsi, és megjelenítéskor semmi nem futhat belőle.
 * Visszaad: { value() → rajz szövege ('' ha üres), clear() }.
 */
export function signaturePad(host) {
  host.innerHTML = String(html`<div class="sig-pad"><canvas width="${SIG_W}" height="${SIG_H}" aria-label="Aláírás helye"></canvas>
    <span class="sig-hint">Írd alá ujjal vagy egérrel</span><button type="button" class="btn btn-sm sig-clear">Törlés</button></div>`);
  const cv = host.querySelector('canvas'), ctx = cv.getContext('2d');
  const strokes = [];
  let cur = null;
  const pt = e => { const r = cv.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / r.width * SIG_W), Math.round((e.clientY - r.top) / r.height * SIG_H)]; };
  const draw = () => {
    ctx.clearRect(0, 0, SIG_W, SIG_H);
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = getComputedStyle(cv).color;
    strokes.forEach(s => { ctx.beginPath(); s.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); if (s.length === 1) ctx.lineTo(s[0][0] + 0.1, s[0][1]); ctx.stroke(); });
    host.querySelector('.sig-pad').classList.toggle('has', strokes.length > 0);
  };
  cv.addEventListener('pointerdown', e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); cur = [pt(e)]; strokes.push(cur); draw(); });
  cv.addEventListener('pointermove', e => {
    if (!cur) return;
    const p = pt(e), l = cur[cur.length - 1];
    if (Math.abs(p[0] - l[0]) + Math.abs(p[1] - l[1]) >= 2) { cur.push(p); draw(); } // a közeli pontok kimaradnak (kisebb méret)
  });
  const end = () => { cur = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  host.querySelector('.sig-clear').addEventListener('click', () => { strokes.length = 0; draw(); });
  return {
    value: () => strokes.map(s => s.map(([x, y], i) => `${i ? 'L' : 'M'}${Math.max(0, Math.min(SIG_W, x))} ${Math.max(0, Math.min(SIG_H, y))}`).join(' ')).join(' '),
    clear: () => { strokes.length = 0; draw(); },
  };
}
/** Tárolt aláírás megjelenítése (csak érvényes vonalrajz). */
export const signatureSvg = rajz => (/^[ML0-9 .\-]+$/.test(rajz || '')
  ? html`<svg class="sig" viewBox="0 0 ${SIG_W} ${SIG_H}" aria-label="Aláírás"><path d="${rajz}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  : '');

/**
 * Nyomtatható dokumentum (pl. elismervény): a tartalom a #print-root-ba kerül, nyomtatáskor csak az látszik.
 * A böngésző nyomtatási ablakából PDF-be is menthető.
 */
export function printDoc(content) {
  let root = document.getElementById('print-root');
  if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
  root.innerHTML = String(content);
  document.body.classList.add('print-doc');
  const done = () => { document.body.classList.remove('print-doc'); root.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}

/** ISO dátum → dátum mező értéke (ÉÉÉÉ-HH-NN, helyi idő szerint); üresre üres. */
export const isoToInput = iso => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? ymd(d, '-') : ''; };
