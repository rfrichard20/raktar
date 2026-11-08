// Alkalmazás váz: útvonalak, navigáció, szinkron jelző.
import * as store from './store.js';
import { html, toast, popover, fmtTime } from './ui.js';
import { ICONS } from './icons.js';
import attekinto from './views/attekinto.js';
import leltar from './views/leltar.js';
import beerkezes from './views/beerkezes.js';
import rendelesek from './views/rendelesek.js';
import torzsadatok from './views/torzsadatok.js';
import kimutatasok from './views/kimutatasok.js';
import fiok from './views/fiok.js';
import login from './views/login.js';

const ROUTES = {
  attekinto: { view: attekinto, label: 'Áttekintő', icon: 'grid', role: 'olvaso' },
  leltar: { view: leltar, label: 'Leltár', icon: 'clipboard', role: 'raktaros' },
  beerkezes: { view: beerkezes, label: 'Beérkezés', icon: 'inbox', role: 'raktaros' },
  rendelesek: { view: rendelesek, label: 'Rendelés', icon: 'cart', role: 'rendeles' },
  kimutatasok: { view: kimutatasok, label: 'Kimutatás', icon: 'chart', role: 'kimutatas' },
  // Raktáros is eléri, de nála csak a Leltársablonok fül látszik
  torzsadatok: { view: torzsadatok, label: 'Törzsadatok', icon: 'database', role: 'raktaros' },
  fiok: { view: fiok, label: 'Fiók', icon: 'user', role: 'olvaso', bottom: true },
};

const $ = id => document.getElementById(id);
let current = null;

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, q] = h.split('?');
  return { name: name || 'attekinto', params: Object.fromEntries(new URLSearchParams(q || '')) };
}

export function go(path) { location.hash = '#/' + path; }

function renderNav(active) {
  const s = store.state;
  const orderCount = Object.values(s.stock).filter(x => x.javaslat > 0).length;
  const links = Object.entries(ROUTES).filter(([, r]) => store.can(r.role));
  $('nav').innerHTML = String(html`${links.map(([key, r]) => html`
    <a href="#/${key}" class="${key === active ? 'active' : ''} ${r.bottom ? 'nav-bottom' : ''}">
      ${ICONS[r.icon]}<span class="lbl">${r.label}</span>
      ${key === 'rendelesek' && orderCount ? html`<span class="count">${orderCount}</span>` : ''}
    </a>`)}`);
}

function renderStatus() {
  const s = store.state;
  const el = $('sync');
  if (!s.user) { el.hidden = true; return; }
  el.hidden = false;
  const n = store.myOutbox().length;
  let cls = 'ok', text;
  if (s.syncing) { cls = 'busy'; text = 'Szinkronizálás…'; }
  else if (s.authError) { cls = 'err'; text = 'Bejelentkezés szükséges'; }
  else if (!s.online) { cls = 'warn'; text = n ? `Offline · ${n} feltöltésre vár` : 'Offline'; }
  else if (s.lastError) { cls = 'err'; text = 'Szinkron hiba'; }
  else if (n) { cls = 'warn'; text = `${n} feltöltésre vár`; }
  else {
    const t = s.snapshotAt ? new Date(s.snapshotAt) : null;
    text = t ? `Szinkronban · ${fmtTime(t)}` : 'Szinkronban';
  }
  if (s.rejected.length) { cls = 'err'; text += ` · ${s.rejected.length} elutasítva`; }
  // Csak ikon (+ darabszám, ha vár valami feltöltésre); a szöveg rámutatásra / koppintásra látszik
  const icon = s.syncing ? 'sync' : cls === 'err' ? 'syncErr' : !s.online ? 'cloudOff' : n ? 'cloudUp' : 'cloudOk';
  el.className = 'sync-pill ' + cls;
  el.innerHTML = `${ICONS[icon]}${n ? `<span class="sync-n">${n}</span>` : ''}`;
  el.title = text + (s.lastError ? ` – ${s.lastError}` : '');
  el.setAttribute('aria-label', text);
  el.dataset.text = text;
  const initials = (s.user.nev || s.user.email).split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  $('userbtn').textContent = initials;
  $('userbtn').title = `${s.user.nev} (${s.user.email})`;
}

function render() {
  const s = store.state;
  $('demo-badge').hidden = !store.isDemo;
  if (!s.user) {
    current = null;
    $('nav').innerHTML = '';
    document.body.classList.add('logged-out');
    renderStatus();
    $('userbtn').hidden = true;
    login.render($('view'));
    return;
  }
  document.body.classList.remove('logged-out');
  $('userbtn').hidden = false;
  let { name, params } = parseHash();
  if (!ROUTES[name] || !store.can(ROUTES[name].role)) {
    name = 'attekinto'; params = {};
    history.replaceState(null, '', '#/attekinto'); // a címsor is kövesse (nincs jog / ismeretlen oldal)
  }
  const r = ROUTES[name];
  const sameView = current && current.name === name;
  current = { name, params, view: r.view };
  renderNav(name);
  renderStatus();
  document.title = r.label + ' – Raktár';
  const scroll = sameView ? window.scrollY : 0;
  if (!sameView) { delete $('view').dataset.view; $('view').onclick = null; $('view').onchange = null; $('view').oninput = null; }
  r.view.render($('view'), params, { rerender: () => renderView(), go });
  if (sameView) window.scrollTo(0, scroll); else window.scrollTo(0, 0);
  revealActiveTabs();
}

function renderView() {
  if (!current) return render();
  const scroll = window.scrollY;
  current.view.render($('view'), current.params, { rerender: () => renderView(), go });
  window.scrollTo(0, scroll);
  revealActiveTabs();
}

/** A fülsávban az aktív fül látható (középre görgetve) – újrarajzolás után ne ugorjon a sáv elejére. */
function revealActiveTabs() {
  $('view').querySelectorAll('.tabs').forEach(t => {
    const a = t.querySelector('.active');
    if (!a || t.scrollWidth <= t.clientWidth) return;
    t.scrollLeft = Math.max(0, a.offsetLeft - (t.clientWidth - a.offsetWidth) / 2);
  });
}

/* ---------- Keresőmezők: saját, jól megnyomható törlőgomb ---------- */
// Minden input[type=search] köré (oldalon és felugró ablakban is) kerül egy törlőgomb.
function enhanceSearch(input) {
  if (input.dataset.enh) return;
  input.dataset.enh = '1';
  const wrap = document.createElement('span');
  wrap.className = 'search-wrap';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'search-clear';
  btn.title = 'Keresés törlése';
  btn.setAttribute('aria-label', 'Keresés törlése');
  btn.innerHTML = String(ICONS.x);
  wrap.appendChild(btn);
  const sync = () => wrap.classList.toggle('has-value', !!input.value);
  input.addEventListener('input', sync);
  btn.addEventListener('mousedown', e => e.preventDefault()); // a fókusz a mezőben marad
  btn.addEventListener('click', () => {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  });
  sync();
}
new MutationObserver(muts => {
  for (const m of muts) for (const n of m.addedNodes) {
    if (n.nodeType !== 1) continue;
    if (n.matches('input[type=search]')) enhanceSearch(n);
    n.querySelectorAll?.('input[type=search]').forEach(enhanceSearch);
  }
}).observe(document.body, { childList: true, subtree: true });

/* ---------- Legyintéses fülváltás (érintőképernyő) ---------- */
// A lap tartalmán vízszintes legyintés: következő / előző fül. Nem indul beviteli mezőn,
// a fülsávon, kapcsolón, illetve vízszintesen görgethető elemen (pl. széles táblázat).
(function swipeTabs() {
  const view = $('view');
  let sw = null;
  const scrollsX = el => {
    for (let n = el; n && n !== view; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if ((ox === 'auto' || ox === 'scroll') && n.scrollWidth > n.clientWidth + 2) return true;
    }
    return false;
  };
  view.addEventListener('touchstart', e => {
    sw = null;
    if (e.touches.length !== 1 || !view.querySelector('.tabs')) return;
    const t = e.target;
    if (t.closest('input, textarea, select, .tabs, .seg, .chip-list') || scrollsX(t)) return;
    sw = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, { passive: true });
  view.addEventListener('touchend', e => {
    if (!sw) return;
    const p = e.changedTouches[0];
    const dx = p.clientX - sw.x, dy = p.clientY - sw.y, dt = Date.now() - sw.t;
    sw = null;
    if (Math.abs(dx) < 70 || Math.abs(dx) < 2 * Math.abs(dy) || dt > 700) return;
    const tabs = [...view.querySelectorAll('.tabs [data-tab]')];
    const i = tabs.findIndex(b => b.classList.contains('active'));
    const next = tabs[i + (dx < 0 ? 1 : -1)];
    if (next) next.click();
  }, { passive: true });
})();

store.subscribe(kind => {
  renderStatus();
  if (kind === 'status') return;
  const s = store.state;
  if (!s.user || !current) return render();
  renderNav(current.name);
  // Az éppen kitöltés alatt álló űrlapokat nem rajzoljuk újra (fókusz, gépelés megmarad)
  if (current.view.liveUpdate === false) { current.view.onData && current.view.onData(); return; }
  renderView();
});

window.addEventListener('hashchange', render);

// Szinkron ikon: koppintásra kis panel az állapottal és a teendőkkel
$('sync').addEventListener('click', e => {
  e.preventDefault();
  const s = store.state;
  const el = $('sync');
  const t = s.snapshotAt ? new Date(s.snapshotAt) : null;
  const last = t ? fmtTime(t) : '–';
  popover(el, html`<div style="padding:.35rem .5rem;max-width:260px">
      <b>${el.dataset.text || ''}</b>
      <div class="small muted" style="margin-top:.2rem">Utolsó szinkron: ${last}${store.myOutbox().length ? ` · ${store.myOutbox().length} művelet vár feltöltésre` : ''}</div>
      ${s.lastError ? html`<div class="small" style="color:var(--err);margin-top:.3rem">${s.lastError}</div>` : ''}
    </div>
    <div class="pop-foot"><button class="btn btn-sm" data-x="sync" ${s.syncing ? 'disabled' : ''}>Szinkronizálás most</button><a class="small" href="#/fiok" data-x="more">Részletek ›</a></div>`, {
    minWidth: 240,
    onMount: (p, close) => p.addEventListener('click', ev => {
      const x = ev.target.closest('[data-x]');
      if (!x) return;
      if (x.dataset.x === 'sync') store.sync();
      close();
    }),
  });
});

// Súgó ikonok: koppintásra nyit/zár, máshova kattintva bezár
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-help]');
  document.querySelectorAll('.help.open').forEach(h => { if (!btn || h !== btn.parentElement) h.classList.remove('open'); });
  if (btn) { e.stopPropagation(); btn.parentElement.classList.toggle('open'); }
}, true);

// Gépelés jelzése (mobilon a CSS ilyenkor elrejti az alsó navigációt, hogy több hely maradjon)
const isTextInput = el => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes(el.type)));
let typingTimer;
document.addEventListener('focusin', e => { if (isTextInput(e.target)) { clearTimeout(typingTimer); document.body.classList.add('typing'); } });
document.addEventListener('focusout', () => {
  clearTimeout(typingTimer);
  // Rövid késleltetés: mezőről mezőre lépéskor ne villogjon
  typingTimer = setTimeout(() => { if (!isTextInput(document.activeElement)) document.body.classList.remove('typing'); }, 150);
});

(async function start() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service worker hiba', e));
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  try {
    await store.init();
  } catch (e) {
    console.error(e);
    toast('Hiba az indításkor: ' + e.message, 'error', 8000);
  }
  render();
})();
