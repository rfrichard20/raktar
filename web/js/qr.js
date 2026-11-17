// QR-kódok: a címkék linkje, a kód kirajzolása (címkenyomtatás) és a kamerás beolvasás.
// A címkén egy link van (pl. …/raktar/#/q?t=T001): bármelyik telefon kamerájával megnyitja az appot a megfelelő helyen,
// az appon belüli beolvasó pedig ugyanezt értelmezi. Adat nincs a kódban, a megnyitáshoz belépés kell.
// A két QR-könyvtár (js/vendor) csak akkor töltődik be, amikor kell.
import { html, modal, toast } from './ui.js';
import * as store from './store.js';
import { ICONS } from './icons.js';

const scripts = {};
function loadScript(src) {
  return scripts[src] || (scripts[src] = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = () => { delete scripts[src]; rej(new Error('A QR-modul nem tölthető be (nincs kapcsolat?).')); };
    document.head.appendChild(s);
  }));
}

/** Az app címe, erre mutat a címke linkje (élesben pl. https://…/raktar/). */
const appBase = () => location.origin + location.pathname.replace(/[^/]*$/, '');
const enc = encodeURIComponent;
/** A címkék linkje: tétel (azonosító), eszköz (címkekód), hely (raktár + polc). */
export const codeLink = {
  tetel: id => `${appBase()}#/q?t=${enc(id)}`,
  eszkoz: azon => `${appBase()}#/q?e=${enc(azon)}`,
  hely: (r, p) => `${appBase()}#/q?r=${enc(r || '')}&p=${enc(p || '')}`,
};

/**
 * Beolvasott szöveg értelmezése → { tipus: 'tetel', id } | { tipus: 'eszkoz', azonosito } | { tipus: 'hely', r, p } | null.
 * A saját link mellett a puszta eszköz- vagy tételazonosítót is felismeri.
 */
export function parseCode(text) {
  text = String(text || '').trim();
  const i = text.indexOf('#/q?');
  if (i >= 0) {
    const p = new URLSearchParams(text.slice(i + 4));
    if (p.get('t')) return { tipus: 'tetel', id: p.get('t') };
    if (p.get('e')) return { tipus: 'eszkoz', azonosito: p.get('e') };
    if (p.has('p')) return { tipus: 'hely', r: p.get('r') || '', p: p.get('p') || '' };
    return null;
  }
  const lower = text.toLowerCase();
  const e = (store.state.db.Eszkozok || []).find(x => String(x.azonosito).toLowerCase() === lower);
  if (e) return { tipus: 'eszkoz', azonosito: e.azonosito };
  if (store.get('Tetelek', text)) return { tipus: 'tetel', id: text };
  return null;
}
/** A kódhoz tartozó rekord (tétel / eszköz), ha ismert. */
export const codeItem = c => (!c ? null : c.tipus === 'tetel' ? store.get('Tetelek', c.id)
  : c.tipus === 'eszkoz' ? (store.state.db.Eszkozok || []).find(x => x.azonosito === c.azonosito) : null);

/* ---------- Kirajzolás ---------- */
export const loadQr = () => loadScript('js/vendor/qrcode.js');
/** QR-kód SVG-ként (előtte: await loadQr()). M szintű hibajavítás, 4 modulnyi csendes zóna. */
export function qrSvg(text) {
  const q = window.qrcode(0, 'M');
  q.addData(text, 'Byte');
  q.make();
  const n = q.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return html`<svg class="qr" viewBox="-4 -4 ${n + 8} ${n + 8}" shape-rendering="crispEdges" aria-hidden="true"><path d="${d}" fill="currentColor"/></svg>`;
}

/* ---------- Beolvasás ---------- */
export const canScan = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
/** Beolvasó gomb a keresők mellé (csak érintőképernyős készüléken látszik – CSS .scan-inline). */
export const scanButton = (action = 'scan', title = 'QR-kód beolvasása') => (canScan()
  ? html`<button type="button" class="icon-btn scan-inline" data-a="${action}" title="${title}" aria-label="${title}">${ICONS.scan}</button>` : '');

/**
 * Kamerás beolvasó ablak. onCode(kód | null, nyers szöveg) → üzenet (string), vagy false, ha a kódot nem fogadta el.
 * keepOpen: több kód egymás után (pl. eszközök kijelölése); különben az első elfogadott kód után bezárul.
 * Androidon a böngésző beépített olvasóját használja, ahol nincs (iPhone, Windows), a jsQR könyvtárat.
 */
export async function scanCodes({ title = 'Kód beolvasása', hint = 'Tartsd a QR-kódot a keretbe.', onCode, keepOpen = false }) {
  if (!canScan()) return toast('Ezen a készüléken / böngészőben nem érhető el a kamera.', 'error');
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); }
  catch { return toast('A kamera nem érhető el. Engedélyezd a kamerát a böngészőben az oldalhoz.', 'error', 6000); }
  const m = modal({
    title,
    body: html`<div class="scan"><video playsinline muted></video><div class="scan-frame" aria-hidden="true"></div></div>
      <p class="small muted scan-msg" data-msg>${hint}</p>`,
    actions: [{ label: keepOpen ? 'Kész' : 'Mégse', value: null }],
  });
  let alive = true;
  m.done.then(() => { alive = false; stream.getTracks().forEach(t => t.stop()); });
  const video = m.el.querySelector('video');
  video.srcObject = stream;
  try { await video.play(); } catch { /* némított videó: a legtöbb böngésző engedi */ }
  let detector = null;
  if ('BarcodeDetector' in window) {
    try { if ((await window.BarcodeDetector.getSupportedFormats()).includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch { /* nincs */ }
  }
  if (!detector) {
    try { await loadScript('js/vendor/jsQR.js'); } catch (x) { toast(x.message, 'error'); m.close(); return; }
  }
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const msg = m.el.querySelector('[data-msg]');
  let last = '', lastAt = 0;
  const read = async () => {
    if (video.readyState < 2) return null;
    if (detector) return (await detector.detect(video))[0]?.rawValue || null;
    const w = video.videoWidth, h = video.videoHeight, s = Math.min(1, 720 / Math.max(w, h));
    cv.width = Math.round(w * s); cv.height = Math.round(h * s);
    ctx.drawImage(video, 0, 0, cv.width, cv.height);
    return window.jsQR(ctx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, { inversionAttempts: 'dontInvert' })?.data || null;
  };
  const tick = async () => {
    if (!alive) return;
    try {
      const text = await read();
      // Ugyanazt a kódot (a kamera előtt tartva) csak kis szünet után veszi újra
      if (text && (text !== last || Date.now() - lastAt > 2500)) {
        last = text; lastAt = Date.now();
        const code = parseCode(text);
        const res = await onCode(code, text);
        if (res !== false) navigator.vibrate?.(60);
        if (res !== false && !keepOpen) { m.close(); return; }
        msg.textContent = res === false ? (code ? 'Ez a kód itt nem használható.' : 'Ismeretlen kód.') : res || '✓ Beolvasva';
        msg.className = `small scan-msg ${res === false ? 't-warn' : 't-ok'}`;
      }
    } catch { /* egy-egy képkocka hibája nem állítja meg */ }
    setTimeout(tick, 200);
  };
  tick();
}
