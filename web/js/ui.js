// UI segédfüggvények. A közös mag (html sablon, formázás, keresés, toast, modal, popover, űrlapsegédek) a
// web/kozos/ui.js-ben van (KÖZÖS fájl, forrása a Kozos_Claude repó); itt csak a Raktár saját segédei.
// A nézetek mindent innen importálnak.
export * from '../kozos/ui.js';
import { html, ymd } from '../kozos/ui.js';

const moneyFmt = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0, useGrouping: 'always' });
export const fmtMoney = n => moneyFmt.format(Math.round(n || 0)) + ' Ft';
/** Mai dátum bizonylatszámhoz: ÉÉÉÉHHNN. */
export const dateStamp = (d = new Date()) => ymd(d, '');
/** Mai dátum dátummezőhöz: ÉÉÉÉ-HH-NN. */
export const todayInput = () => ymd(new Date(), '-');
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
/** Rendezéshez: számokat számként, minden mást magyar ábécé szerint hasonlít. */
export function compare(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''), 'hu');
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
