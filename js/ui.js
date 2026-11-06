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

const numFmt = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 2 });
const moneyFmt = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 });
export const fmtNum = n => (n == null || n === '' ? '–' : numFmt.format(n));
export const fmtMoney = n => moneyFmt.format(Math.round(n || 0)) + ' Ft';
export function fmtDate(iso, withTime) {
  if (!iso) return '–';
  const d = new Date(iso);
  if (isNaN(d)) return '–';
  const p = n => String(n).padStart(2, '0');
  let s = `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}.`;
  if (withTime) s += ` ${p(d.getHours())}:${p(d.getMinutes())}`;
  return s;
}
export function todayInput() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
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
export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
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
  const onKey = e => { if (e.key === 'Escape') close(null); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('click', async e => {
    if (e.target === back || e.target.closest('[data-close]')) return close(null);
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = actions[Number(b.dataset.act)];
    // Figyelem: a value lehet null / false (pl. Mégse) – ezt nem szabad „igen”-re cserélni
    const val = 'value' in a ? a.value : true;
    if (a.onClick) {
      const r = await a.onClick(back);
      if (r === false) return; // validációs hiba: maradjon nyitva
      close(r === undefined ? val : r);
    } else close(val);
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

export function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(() => toast('Vágólapra másolva', 'ok'));
  }
  const ta = document.createElement('textarea');
  ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('Vágólapra másolva', 'ok'); } catch { toast('A másolás nem sikerült', 'error'); }
  ta.remove();
  return Promise.resolve();
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
    let left = Math.min(r.left, window.innerWidth - w - 8);
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

export const STATUS_LABEL ={ hiany: 'Hiány', figyelem: 'Fogyóban', ok: 'Rendben' };
export const ORDER_STATUS = {
  nyitott: ['Nyitott', 'info'], reszben: ['Részben érkezett', 'warn'],
  teljesitve: ['Teljesítve', 'ok'], lezarva: ['Lezárva', 'muted'],
};
