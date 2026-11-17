// Eszközleltár (a Leltár oldalon): megvan-e minden eszköz, aminek a raktárban kell lennie. Hely(ek) választása → lista
// polconként → kipipálás vagy címke-beolvasás → lezárás: a meglévők „Leltári ellenőrzés” mozgást kapnak (a napló és az
// adatlap mutatja, mikor látták utoljára), a hiányzók igény szerint elveszettnek jelölhetők. Vázlatban, offline is folytatható.
import * as store from '../store.js';
import { html, help, matcher, fmtDate, modal, toast, confirmDialog, dateStamp } from '../ui.js';
import { scanCodes, scanButton, codeItem } from '../qr.js';

const L = window.RaktarLogic;
// Vázlat: { id, label, started, ids: [eszkoz_id], found: { eszkoz_id: időpont } }
export const toolSlot = store.draftSlot('eszkozleltar');
const ui = { q: '' };
const placeKey = e => `${e.raktar || ''}|${e.polc || ''}`;
const placeLabel = e => [e.raktar, e.polc].filter(Boolean).join(' · ') || 'Hely nélkül';

/** A raktárban lévő (ellenőrizhető) eszközök. */
const inStock = () => {
  const st = L.toolStates(store.state.db);
  return (store.state.db.Eszkozok || []).filter(e => e.allapot !== 'selejtezve' && e.allapot !== 'elveszett' && st[e.eszkoz_id].hely === 'raktar');
};

/** Választókártya a Leltár kezdőlapjára. */
export function toolCheckCard() {
  const n = inStock().length;
  return html`<button class="card choice" data-a="toolcheck"><span class="big">${n}</span>
    <span><b>Eszközök ellenőrzése</b><span class="small muted d-block">megvan-e minden eszköz a helyén</span></span></button>`;
}

/** Indítás: a helyek (raktár · polc) kiválasztása, majd a vázlat. */
export async function startToolCheck(ctx) {
  const list = inStock();
  if (!list.length) return toast('Nincs a raktárban lévő eszköz.', 'warn');
  const places = new Map();
  list.forEach(e => { const k = placeKey(e); if (!places.has(k)) places.set(k, { label: placeLabel(e), n: 0 }); places.get(k).n++; });
  const keys = [...places.keys()].sort((a, b) => a.localeCompare(b, 'hu', { numeric: true }));
  const sel = await modal({
    title: 'Eszközök ellenőrzése',
    body: html`<p class="small muted" style="margin-top:0">Válaszd ki, mely helyeken ellenőrzöd az eszközöket (a raktárban lévőket; a kiadottak a Visszavétel oldalon látszanak).</p>
      <div class="check-list">
        <label class="check-row"><input type="checkbox" data-all checked><span class="grow"><b>Minden hely (${list.length} eszköz)</b></span></label>
        ${keys.map(k => html`<label class="check-row"><input type="checkbox" data-k="${k}" checked><span class="grow">${places.get(k).label}</span><span class="small muted">${places.get(k).n} db</span></label>`)}
      </div>`,
    onMount: el => el.addEventListener('change', e => {
      if (e.target.matches('[data-all]')) el.querySelectorAll('[data-k]').forEach(c => { c.checked = e.target.checked; });
      else el.querySelector('[data-all]').checked = [...el.querySelectorAll('[data-k]')].every(c => c.checked);
    }),
    actions: [{ label: 'Mégse', value: null }, { label: 'Indítás', kind: 'primary', onClick: el => {
      const ks = [...el.querySelectorAll('[data-k]:checked')].map(c => c.dataset.k);
      if (!ks.length) { toast('Válassz legalább egy helyet.', 'warn'); return false; }
      return ks;
    } }],
  }).done;
  if (!sel) return;
  const chosen = new Set(sel);
  const d = new Date();
  toolSlot.draft = {
    id: `ET-${dateStamp(d)}-${L.newId('', 4)}`,
    label: chosen.size === keys.length ? 'Minden hely' : sel.map(k => places.get(k).label).join(', '),
    started: d.toISOString(),
    ids: list.filter(e => chosen.has(placeKey(e))).sort((a, b) => placeKey(a).localeCompare(placeKey(b), 'hu', { numeric: true }) || a.azonosito.localeCompare(b.azonosito, 'hu', { numeric: true })).map(e => e.eszkoz_id),
    found: {},
  };
  ui.q = '';
  toolSlot.save();
  ctx.rerender();
}

/** Az ellenőrzés lapja: polconként az eszközök, kipipálással / beolvasással. */
export function renderToolCheck(root, ctx) {
  const d = toolSlot.draft;
  const tools = d.ids.map(id => store.get('Eszkozok', id)).filter(Boolean);
  const rowsHtml = () => {
    const match = matcher(ui.q);
    let last = null;
    const out = [];
    tools.filter(e => match(`${e.azonosito} ${e.megnevezes} ${e.gyari_szam} ${placeLabel(e)}`)).forEach(e => {
      const p = placeLabel(e);
      if (p !== last) { out.push(html`<div class="group-title"><span>${p}</span><span></span><span class="num">Megvan</span></div>`); last = p; }
      const ok = !!d.found[e.eszkoz_id];
      out.push(html`<label class="count-row tool-check ${ok ? 'done' : ''}" data-id="${e.eszkoz_id}">
        <div><div class="name"><b>${e.azonosito}</b> ${e.megnevezes}</div><div class="meta">${[e.gyarto, e.tipus].filter(Boolean).join(' ')}${e.gyari_szam ? ` · ${e.gyari_szam}` : ''}</div></div>
        <span></span>
        <span class="num"><input type="checkbox" ${ok ? 'checked' : ''} aria-label="${e.azonosito} megvan"></span>
      </label>`);
    });
    return out.length ? html`${out}` : html`<div class="empty small">Nincs találat.</div>`;
  };
  const progress = () => {
    const n = tools.filter(e => d.found[e.eszkoz_id]).length;
    root.querySelector('#prog').textContent = `${n} / ${tools.length}`;
    root.querySelector('#bar').style.width = (tools.length ? n / tools.length * 100 : 0) + '%';
    root.querySelector('#bbar').classList.toggle('complete', tools.length > 0 && n === tools.length);
  };
  root.innerHTML = String(html`
    <div class="page-head"><h1>Eszközleltár: ${d.label}</h1>
      ${help('Pipáld ki, ami megvan – vagy telefonon olvasd be egymás után a címkéket. Lezáráskor a meglévők „Leltári ellenőrzés” bejegyzést kapnak; a hiányzókat elveszettnek jelölheted (később, ha előkerülnek, az állapot visszaállítható). Ha olyan eszköz kerül elő, ami nem ezen a helyen van nyilvántartva, beolvasva felkerül a listára.')}
      <span class="badge badge-muted">${d.id}</span><span class="small muted">indítva: ${fmtDate(d.started, true)}</span></div>
    <div class="card">
      <div class="card-head sticky-search"><div class="toolbar head-main" style="margin:0">
        <input type="search" id="tq" placeholder="Keresés (azonosító, név, hely)…" value="${ui.q}">
        ${scanButton('scan', 'Eszközcímkék beolvasása')}</div></div>
      <div class="count-list" id="tlist">${rowsHtml()}</div>
      <div class="bottom-bar" id="bbar">
        <div class="bb-prog"><span><b id="prog"></b> <span class="bb-done-text">– minden eszköz megvan</span></span>
          <div class="progress"><div id="bar"></div></div></div>
        <button class="btn btn-sm btn-link-danger" data-a="discard">Elvetés</button>
        <button class="btn btn-sm btn-primary bb-main" data-a="finish">Lezárás</button>
      </div>
    </div>`);
  progress();
  const list = root.querySelector('#tlist');
  const redraw = () => { list.innerHTML = String(rowsHtml()); progress(); };
  root.querySelector('#tq').addEventListener('input', e => { ui.q = e.target.value; redraw(); });
  list.addEventListener('change', e => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    if (e.target.checked) d.found[row.dataset.id] = new Date().toISOString(); else delete d.found[row.dataset.id];
    row.classList.toggle('done', e.target.checked);
    toolSlot.save();
    progress();
  });
  root.onclick = async e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'scan') return scanCodes({ title: 'Eszközök beolvasása', keepOpen: true, hint: 'Olvasd be egymás után a megtalált eszközök címkéjét, majd „Kész”.', onCode: c => {
      const x = c && c.tipus === 'eszkoz' ? codeItem(c) : null;
      if (!x || !inStock().some(t => t.eszkoz_id === x.eszkoz_id)) return false; // kiadott / szervizben lévő / selejtezett: nem itt
      if (!d.ids.includes(x.eszkoz_id)) { d.ids.push(x.eszkoz_id); tools.push(x); }
      d.found[x.eszkoz_id] = new Date().toISOString();
      toolSlot.save();
      redraw();
      return `✓ ${x.azonosito} ${x.megnevezes} – megvan (${Object.keys(d.found).length} / ${d.ids.length})`;
    } });
    if (a === 'discard') {
      if (!(await confirmDialog('Eszközleltár elvetése', 'A kipipált adatok elvesznek. Biztosan elveted?', 'Elvetés', 'danger'))) return;
      await toolSlot.clear(); return ctx.rerender();
    }
    if (a === 'finish') await toolSlot.once(() => finish(ctx, tools));
  };
}

/** Lezárás: a meglévők ellenőrzés-bejegyzést kapnak, a hiányzók igény szerint elveszettnek jelölhetők. */
async function finish(ctx, tools) {
  const d = toolSlot.draft;
  const found = tools.filter(e => d.found[e.eszkoz_id]);
  const missing = tools.filter(e => !d.found[e.eszkoz_id]);
  if (!found.length && !missing.length) return;
  const v = await modal({
    title: 'Eszközleltár lezárása',
    body: html`<p>${found.length} eszköz megvan${missing.length ? html`, <b class="t-warn">${missing.length} hiányzik</b>` : ' – minden megvan'}.</p>
      ${missing.length ? html`<div class="check-list" style="max-height:30vh">${missing.map(e => html`<div class="check-row"><span class="grow"><b>${e.azonosito}</b> ${e.megnevezes}</span><span class="small muted">${placeLabel(e)}</span></div>`)}</div>
        <label class="check" style="margin-top:.75rem"><input type="checkbox" name="lost"> A hiányzókat jelöld <b>elveszettnek</b></label>
        <p class="small muted">Ha nem jelölöd, a nyilvántartásban maradnak; érdemes előbb utánanézni (pl. nincs-e valakinél rögzítetlenül).</p>` : ''}`,
    actions: [{ label: 'Mégse', value: null }, { label: 'Lezárás', kind: 'primary', onClick: el => ({ lost: !!el.querySelector('[name=lost]')?.checked }) }],
  }).done;
  if (!v) return;
  const now = new Date().toISOString();
  const rows = [
    ...found.map(e => ({ mozgas_id: L.newId('M', 12), tipus: 'ELLENORZES', eszkoz_id: e.eszkoz_id, datum: d.found[e.eszkoz_id] || now, bizonylat: d.id, megjegyzes: '' })),
    ...(v.lost ? missing.map(e => ({ mozgas_id: L.newId('M', 12), tipus: 'ALLAPOT', eszkoz_id: e.eszkoz_id, allapot: 'elveszett', datum: now, bizonylat: d.id, megjegyzes: 'Eszközleltárkor nem volt meg' })) : []),
  ];
  if (!rows.length) { await toolSlot.clear(); return ctx.rerender(); }
  try {
    await store.enqueue({ type: 'mozgasok', bizonylat: d.id, rows });
    await toolSlot.clear();
    toast(`Eszközleltár rögzítve: ${found.length} megvan${missing.length ? `, ${missing.length} hiányzik` : ''}`, 'ok', 5000);
    ctx.rerender();
  } catch (x) { toast(x.message, 'error', 6000); }
}
