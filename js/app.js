// Alkalmazás váz: útvonalak, navigáció, szinkron jelző.
import * as store from './store.js';
import { html, toast, popover, fmtTime } from './ui.js';
import { ICONS } from './icons.js';
import attekinto from './views/attekinto.js';
import leltar from './views/leltar.js';
import beerkezes from './views/beerkezes.js';
import kivet from './views/kivet.js';
import rendelesek from './views/rendelesek.js';
import torzsadatok from './views/torzsadatok.js';
import kimutatasok from './views/kimutatasok.js';
import mozgasok from './views/mozgasok.js';
import igenyek from './views/igenyek.js';
import visszavetel from './views/visszavetel.js';
import eszkozok, { openTool } from './views/eszkozok.js';
import { setPlaceFilter } from './views/attekinto.js';
import { parseCode, scanCodes, canScan } from './qr.js';
import fiok from './views/fiok.js';
import login from './views/login.js';
import { attachPicker, showItemDetail } from './views/common.js';

/**
 * Menücsoportok (témák): asztalon az oldalsáv csoportcímei, mobilon a „Több” lista szakaszai, ebben a sorrendben.
 * Új menüpont: a ROUTES-ba, egy meglévő (vagy új) csoporttal.
 */
const GROUPS = { keszlet: 'Készlet', muveletek: 'Raktári műveletek', beszerzes: 'Beszerzés', beallitasok: 'Beállítások' };

// A ROUTES sorrendje az alapértelmezett menüsorrend (mobilon az első NAV_MAX az alsó sávban)
const ROUTES = {
  // Készlet: anyagkészlet (fogyóanyag, mennyiségben) és eszközkészlet (egyedi darabok) – két nézet, közös csoport
  // short: rövid felirat a mobil alsó sávba (ha a teljes nem fér ki)
  attekinto: { view: attekinto, label: 'Anyagkészlet', short: 'Anyagok', icon: 'grid', role: 'olvaso', group: 'keszlet' },
  leltar: { view: leltar, label: 'Leltár', icon: 'clipboard', role: 'raktaros', group: 'muveletek',
    badge: () => ({ n: store.materials().filter(t => store.state.stock[t.tetel_id]?.esedekes).length, text: 'esedékes leltár' }) },
  beerkezes: { view: beerkezes, label: 'Beérkezés', icon: 'inbox', role: 'raktaros', group: 'muveletek',
    badge: () => ({ n: store.openOrders().length, text: 'várható szállítás' }) },
  // Kiadás: anyag (kivét) és eszköz (kiadás) egy bizonylaton – a szerelő csak anyagot (a kulcs történeti okból „kivet”)
  kivet: { view: kivet, label: 'Kiadás', icon: 'out', role: 'szerelo', group: 'muveletek' },
  // Visszavétel: a kiadott eszközök visszavétele (személyenként, aláírással)
  visszavetel: { view: visszavetel, label: 'Visszavétel', icon: 'in', role: 'raktaros', group: 'muveletek' },
  // Eszközök (eszközkészlet): mindenki látja (a szerelő a „Nálam” szűrővel a sajátjait); értesítés a raktárosnak: lejárt felülvizsgálat.
  // A menüsorban a Kivét után marad (mobilon az alsó sáv első négy helye ne változzon), az oldalsávon a Készlet csoportban jelenik meg.
  eszkozok: { view: eszkozok, label: 'Eszközök', icon: 'tool', role: 'olvaso', group: 'keszlet',
    badge: () => ({ n: store.can('raktaros') ? Object.values(store.state.db.Eszkozok ? store.L.toolStates(store.state.db) : {}).filter(s => s.felulvizsgalat === 'lejart').length : 0, text: 'lejárt felülvizsgálat' }) },
  // badge: a menüpont értesítése (darabszám + magyarázat); 0-nál nem látszik
  rendelesek: { view: rendelesek, label: 'Rendelés', icon: 'cart', role: 'rendeles', group: 'beszerzes',
    badge: () => ({ n: Object.values(store.state.stock).filter(x => x.javaslat > 0).length, text: 'pótolandó tétel' }) },
  // Igények: a szerelő a sajátjait, a raktáros mindet (értesítés: az új, még nem kezelt igények)
  igenyek: { view: igenyek, label: 'Igények', icon: 'request', role: 'szerelo', group: 'beszerzes',
    badge: () => ({ n: store.can('raktaros') ? (store.state.db.Igenyek || []).filter(i => i.statusz === 'uj').length : 0, text: 'új igény' }) },
  kimutatasok: { view: kimutatasok, label: 'Kimutatás', icon: 'chart', role: 'kimutatas', group: 'keszlet' },
  mozgasok: { view: mozgasok, label: 'Mozgások', icon: 'moves', role: 'mozgasok', group: 'keszlet' },
  // Raktáros is eléri, de nála csak a Leltársablonok fül látszik
  torzsadatok: { view: torzsadatok, label: 'Törzsadatok', icon: 'database', role: 'raktaros', group: 'beallitasok' },
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

/* ---------- Navigáció ---------- */
// A menü sorrendje a Fiók oldalon állítható (store.getNavOrder; alapból a ROUTES sorrendje), asztalon és mobilon is.
// Mobilon az alsó sávban az első NAV_MAX menüpont van kint, a többi – ugyanebben a sorrendben – a „Több” menüben.
const NAV_MAX = store.NAV_MAX;

/** A felhasználó számára elérhető menüpontok a saját sorrendjében (a Fiók nélkül: mobilon a jobb felső monogram). */
export function navRoutes() {
  const all = Object.entries(ROUTES).filter(([k, r]) => k !== 'fiok' && store.can(r.role)).map(([key, r]) => ({ key, label: r.label, icon: r.icon, group: r.group }));
  const own = store.getNavOrder() || [];
  const pos = k => { const i = own.indexOf(k); return i < 0 ? own.length + all.findIndex(r => r.key === k) : i; };
  return all.sort((a, b) => pos(a.key) - pos(b.key));
}
/** Mobilon kint lévő menüpontok kulcsai. Ha mind elfér (≤ NAV_MAX + 1), mind kint van, „Több” nélkül. */
export function navPinned() {
  const keys = navRoutes().map(r => r.key);
  return keys.length <= NAV_MAX + 1 ? keys : keys.slice(0, NAV_MAX);
}

/** Menüpontok csoportosítva: [{ key, title, items }] – csoportonként a saját sorrendben, üres csoport nélkül. */
export function navGroups(items = navRoutes()) {
  return Object.entries(GROUPS).map(([key, title]) => ({ key, title, items: items.filter(r => r.group === key) }))
    .filter(g => g.items.length);
}

/** Egy menüpont értesítése: { n, text } vagy null. */
const badgeOf = key => { const b = ROUTES[key].badge && ROUTES[key].badge(); return b && b.n > 0 ? b : null; };
const badgeHtml = (b, title) => (b ? html`<span class="count" title="${title || `${b.n} ${b.text}`}">${b.n}</span>` : '');

function renderNav(active) {
  const links = Object.entries(ROUTES).filter(([, r]) => store.can(r.role));
  const order = navRoutes().map(r => r.key);
  const pinned = navPinned();
  const extra = order.filter(k => !pinned.includes(k));
  // A „Több” gomb a benne lévő menüpontok értesítéseit összesítve mutatja (a listában menüpontonként látszanak)
  const extraBadges = extra.map(badgeOf).filter(Boolean);
  const moreBadge = extraBadges.length ? { n: extraBadges.reduce((a, b) => a + b.n, 0) } : null;
  // Sorrend CSS order-rel: mobilon a saját sorrend (--o), asztalon csoportonként, a csoporton belül a saját
  // sorrendben (--og; a csoportcím a csoport első eleme). A Fiók mindig a végén. Mobilon a .nav-extra helyett „Több” gomb.
  const groups = navGroups();
  const og = {};
  groups.forEach((g, gi) => g.items.forEach((r, i) => { og[r.key] = gi * 50 + i + 1; }));
  $('nav').innerHTML = String(html`${groups.map((g, gi) => html`<div class="nav-group" style="--og:${gi * 50}">${g.title}</div>`)}
    ${links.map(([key, r]) => html`
    <a href="#/${key}" style="--o:${order.includes(key) ? order.indexOf(key) : 99};--og:${og[key] ?? 999}" class="${key === active ? 'active' : ''} ${r.bottom ? 'nav-bottom' : ''} ${extra.includes(key) ? 'nav-extra' : ''}">
      ${ICONS[r.icon]}${r.short ? html`<span class="lbl"><span class="lbl-full">${r.label}</span><span class="lbl-short">${r.short}</span></span>` : html`<span class="lbl">${r.label}</span>`}${badgeHtml(badgeOf(key))}
    </a>`)}
    ${extra.length ? html`<button type="button" class="nav-more ${extra.includes(active) ? 'active' : ''}" data-navmore aria-label="További menüpontok">
      ${ICONS.more}<span class="lbl">Több</span>${badgeHtml(moreBadge, extraBadges.map(b => `${b.n} ${b.text}`).join(', '))}</button>` : ''}`);
}

// „Több”: a kint nem lévő menüpontok a gomb fölött, nagyobb (jól eltalálható) sorokkal, értesítéssel
$('nav').addEventListener('click', e => {
  const b = e.target.closest('[data-navmore]');
  if (!b) return;
  const pinned = navPinned();
  const extra = navRoutes().filter(r => !pinned.includes(r.key));
  // Több csoportnál csoportcímekkel (mint asztalon az oldalsáv)
  const groups = navGroups(extra);
  const item = r => { const bd = badgeOf(r.key); return html`<a class="pop-item ${current && current.name === r.key ? 'sel' : ''}" href="#/${r.key}">${ICONS[r.icon]}
      <span class="grow">${r.label}${bd ? html`<span class="small muted d-block">${bd.n} ${bd.text}</span>` : ''}</span>${badgeHtml(bd)}</a>`; };
  popover(b, html`<div class="nav-pop">${groups.length > 1
    ? groups.map(g => html`<div class="pop-title">${g.title}</div>${g.items.map(item)}`)
    : extra.map(item)}</div>`, {
    minWidth: 220,
    onMount: (p, close) => p.addEventListener('click', ev => { if (ev.target.closest('a')) close(); }),
  });
});

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
    $('gsearch').hidden = $('gsearch-btn').hidden = $('scan-btn').hidden = true;
    $('ptitle').textContent = '';
    login.render($('view'));
    return;
  }
  document.body.classList.remove('logged-out');
  $('userbtn').hidden = false;
  $('gsearch').hidden = $('gsearch-btn').hidden = false;
  $('scan-btn').hidden = !canScan();
  let { name, params } = parseHash();
  // QR-címke linkje (#/q?…): az Áttekintőre lép, és onnan nyitja meg, amire a kód mutat
  if (name === 'q') {
    const code = parseCode(location.hash);
    history.replaceState(null, '', '#/attekinto');
    name = 'attekinto'; params = {};
    setTimeout(() => openCode(code), 0);
  }
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
  afterRender();
}

function renderView() {
  if (!current) return render();
  const scroll = window.scrollY;
  current.view.render($('view'), current.params, { rerender: () => renderView(), go });
  window.scrollTo(0, scroll);
  afterRender();
}

/** Minden kirajzolás után: mobilon az oldal címe a felső sávba kerül; az aktív fül látható. */
function afterRender() {
  const h1 = $('view').querySelector('.page-head h1');
  const pt = $('ptitle');
  pt.innerHTML = '';
  const txt = document.createElement('span');
  txt.className = 'ptitle-text';
  txt.textContent = h1 ? h1.textContent : (current ? ROUTES[current.name].label : '');
  pt.append(txt);
  // A cím melletti súgó is a sávba kerül (másolat; a súgókezelő minden [data-help] gombon működik)
  const helpEl = h1 && h1.nextElementSibling && h1.nextElementSibling.classList.contains('help') ? h1.nextElementSibling : null;
  if (helpEl) pt.append(helpEl.cloneNode(true));
  revealActiveTabs();
  measureStickyHeads();
}

/** Kártya ragadós fejléce (.card > .sticky-search): a magassága a kártyán --head-h, hogy az alatta ragadó
 *  elemek (táblázatfejléc, leltár polccím) pontosan alá kerüljenek – akkor is, ha mobilon több sorba törik. */
const headObserver = new ResizeObserver(entries => entries.forEach(e => fitHead(e.target)));
const fitHead = h => h.parentElement?.style.setProperty('--head-h', h.offsetHeight + 'px');
function measureStickyHeads() {
  headObserver.disconnect(); // az előző kirajzolás fejlécei már nincsenek az oldalon
  $('view').querySelectorAll('.card > .sticky-search').forEach(h => { fitHead(h); headObserver.observe(h); });
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
  const ico = document.createElement('span');
  ico.className = 'search-ico';
  ico.innerHTML = String(ICONS.search);
  wrap.append(ico, input);
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

/** Eszközszintű megjelenési beállítások alkalmazása (Fiók oldal). */
const applyPrefs = () => document.body.classList.toggle('no-help', !store.getPref('help', true));
applyPrefs();

store.subscribe(kind => {
  renderStatus();
  // 'status': csak a szinkron állapota változott – a nézetek maradnak; a Fiók oldal ezt is mutatja (gomb, mérések)
  if (kind === 'status') { if (current && current.name === 'fiok' && store.state.user) renderView(); return; }
  if (kind === 'pref') applyPrefs();
  const s = store.state;
  if (!s.user || !current) return render();
  renderNav(current.name);
  // Az éppen kitöltés alatt álló űrlapokat nem rajzoljuk újra (fókusz, gépelés megmarad)
  if (current.view.liveUpdate === false) { current.view.onData && current.view.onData(); return; }
  renderView();
});

window.addEventListener('hashchange', render);

/* ---------- QR-kód megnyitása (címke linkje vagy a felső sáv beolvasója) ---------- */
/** Tétel → adatlap; eszköz → az Eszközök oldalon az adatlapja; hely → az Áttekintő az adott polc tételeivel. */
function openCode(code) {
  if (!code) { toast('Ismeretlen vagy már nem létező kód.', 'warn'); return false; }
  if (code.tipus === 'tetel') {
    if (!store.get('Tetelek', code.id)) { toast('Ez a tétel már nincs a nyilvántartásban.', 'warn'); return false; }
    showItemDetail(code.id);
  } else if (code.tipus === 'eszkoz') {
    if (!store.can(ROUTES.eszkozok.role)) return false;
    if (current?.name !== 'eszkozok') go('eszkozok');
    setTimeout(() => { if (!openTool(code.azonosito)) toast('Nincs ilyen eszköz: ' + code.azonosito, 'warn'); }, 50);
  } else if (code.tipus === 'hely') {
    setPlaceFilter(code.r, code.p);
    delete $('view').dataset.view;
    if (current?.name === 'attekinto') render(); else go('attekinto');
  }
  return true;
}
(function scanButton() {
  const btn = $('scan-btn');
  btn.innerHTML = String(ICONS.scan);
  btn.addEventListener('click', () => scanCodes({
    title: 'QR-kód beolvasása',
    hint: 'Tétel-, polc- vagy eszközcímke. A kód megnyitja a hozzá tartozó adatlapot vagy listát.',
    onCode: code => (openCode(code) ? '' : false),
  }));
})();

/* ---------- Gyors tételkereső a felső sávban ---------- */
// Bármelyik oldalról: név / cikkszám / polc → a tétel adatlapja. Mobilon a nagyító ikon nyitja, és a sávot kitölti.
(function globalSearch() {
  const box = $('gsearch'), input = $('gq'), btn = $('gsearch-btn');
  btn.innerHTML = String(ICONS.search);
  enhanceSearch(input); // nagyító ikon + törlőgomb, mint minden keresőben
  const close = () => { document.body.classList.remove('gsearch-open'); input.value = ''; input.dispatchEvent(new Event('input')); input.blur(); };
  attachPicker(input, {
    items: () => (store.state.user ? store.activeItems() : []),
    allowCreate: false,
    onPick: t => { close(); showItemDetail(t.tetel_id); },
  });
  btn.addEventListener('click', () => { document.body.classList.add('gsearch-open'); input.focus(); });
  $('gsearch-close').addEventListener('click', close);
  input.addEventListener('keydown', e => { if (e.key === 'Escape' && !box.querySelector('.picker-list')) close(); });
})();

/* ---------- Mobilon a felső sáv lefelé görgetéskor elrejtőzik, felfelé visszajön ---------- */
(function autoHideBar() {
  let lastY = window.scrollY;
  window.addEventListener('scroll', () => {
    const y = window.scrollY, body = document.body;
    if (window.innerWidth >= 700 || body.classList.contains('gsearch-open') || y < 60) { body.classList.remove('bar-hidden'); lastY = y; return; }
    if (Math.abs(y - lastY) < 10) return; // apró mozgásra (pl. billentyűzet) ne villogjon
    body.classList.toggle('bar-hidden', y > lastY);
    lastY = y;
  }, { passive: true });
})();

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

// Kattintható sorok és kártyák billentyűzettel is: Enter / szóköz = kattintás.
// Elég a sornak tabindex="0" (tr.click), illetve a nem-gomb elemnek role="button" + tabindex="0".
document.addEventListener('keydown', e => {
  if ((e.key !== 'Enter' && e.key !== ' ') || !e.target.matches('tr.click[tabindex], [role=button][tabindex]')) return;
  e.preventDefault();
  e.target.click();
});

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
