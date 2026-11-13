// Kiadás – ami kimegy a raktárból, egy bizonylaton: anyag (kivét: elfogy, csökkenti a készletet) és eszköz (kiadás:
// kölcsön, „kinél van”, aláírással). Kezdőlap (új kiadás + korábbi kiadások) → indító ablak (átvevő, munka…) → űrlap → lezárás.
// A félbehagyott kiadás a készüléken marad (vázlat), offline is folytatható. Eszközt csak raktáros adhat ki.
// (Az útvonal kulcsa történeti okból „kivet”, hogy a felhasználók menüsorrendje megmaradjon.)
import * as store from '../store.js';
import { html, fmtNum, fmtDate, parseNum, confirmDialog, toast, help, modal, matcher, compare, sortArrow, formValues, printDoc } from '../ui.js';
import { attachPicker, kivetFields, saveKivet, moveIcon, enterBackHtml, bindEnterBack } from './common.js';
import { attachToolPicker, toolAvailable, askSignatures, receiptHtml, printReceipt, openTool } from './eszkozok.js';
import { ICONS } from '../icons.js';
import { scanCodes, scanButton, codeItem } from '../qr.js';

const L = window.RaktarLogic;
// Vázlat: { fajta: 'kiadas', atvevo, munka, datum, megjegyzes, items: [{ tetel_id, q }], tools: [eszkoz_id] }.
// A korábbi (anyagkivét) vázlat is folytatható.
const slot = store.draftSlot('kivet', d => (d && d.items && d.atvevo ? { tools: [], ...d, fajta: 'kiadas' } : null));
const ui = { q: '', sort: 'datum', dir: -1, all: false };
const save = slot.save;
const canTools = () => store.can('raktaros');

/** Indító / módosító ablak a kiadás fejadataihoz. Visszaad: a megadott adatok, vagy null (Mégse). */
function headerDialog(current) {
  return modal({
    title: current ? 'Kiadás adatai' : 'Új kiadás',
    body: html`<div class="form-grid">${kivetFields(current || {})}</div>`,
    actions: [{ label: 'Mégse', value: null }, {
      label: current ? 'Mentés' : 'Indítás', kind: 'primary', onClick: el => {
        const v = formValues(el);
        if (!v.atvevo.trim()) { toast('Add meg, ki viszi el (átvevő).', 'error'); return false; }
        return v;
      },
    }],
  }).done;
}

/* ---------- Korábbi kiadások ---------- */
const nAnyag = w => w.sorok.filter(m => !m.eszkoz_id).length;
const nEszkoz = w => w.sorok.filter(m => m.eszkoz_id).length;
const countText = w => [nAnyag(w) && `${nAnyag(w)} anyag`, nEszkoz(w) && `${nEszkoz(w)} eszköz`].filter(Boolean).join(' · ');
// [kulcs, fejléc, rendezési érték, osztály]
const H_COLS = [
  ['datum', 'Dátum', w => w.datum, ''],
  ['atvevo', 'Átvevő', w => store.userName(w.atvevo), ''],
  ['munka', 'Munka / projekt', w => w.munka || '', ''],
  ['n', 'Tételek', w => w.sorok.length, ''],
  ['ki', 'Rögzítette', w => store.userName(w.felhasznalo), 'm-hide'],
];
const subjectName = m => (m.eszkoz_id ? (e => (e ? `${e.azonosito} ${e.megnevezes}` : ''))(store.get('Eszkozok', m.eszkoz_id)) : store.itemOrStub(m.tetel_id).megnevezes);

function historyBody() {
  const match = matcher(ui.q);
  const col = H_COLS.find(c => c[0] === ui.sort) || H_COLS[0];
  const list = L.withdrawals(store.state.db)
    .filter(w => match(`${w.bizonylat} ${store.userName(w.atvevo)} ${w.munka} ${w.megjegyzes} ${fmtDate(w.datum)} ${w.sorok.map(subjectName).join(' ')}`))
    .sort((a, b) => compare(col[2](a), col[2](b)) * ui.dir);
  const shown = ui.all ? list : list.slice(0, 15);
  return html`<table class="tbl cards fixed nochk">
    <colgroup><col style="width:16%"><col style="width:22%"><col><col style="width:16%"><col class="m-hide" style="width:18%"></colgroup>
    <thead><tr>${H_COLS.map(([k, l, , cls]) => html`<th class="sortable ${cls}" data-hsort="${k}">${l}<span class="arrow">${sortArrow(ui.sort === k, ui.dir)}</span></th>`)}</tr></thead>
    <tbody>${shown.length ? shown.map(w => html`<tr class="click" data-w="${w.bizonylat}" tabindex="0">
      <td class="c-main">${fmtDate(w.datum)}</td>
      <td class="c-f1" data-l="Átvevő">${store.userName(w.atvevo) || '–'}</td>
      <td class="c-f2" data-l="Munka">${w.munka || html`<span class="muted">–</span>`}</td>
      <td class="c-f3" data-l="Tételek">${countText(w)}</td>
      <td class="m-hide">${store.userName(w.felhasznalo)}</td>
    </tr>`) : html`<tr><td colspan="5" class="empty">${ui.q ? 'Nincs a keresésnek megfelelő kiadás.' : 'Még nincs rögzített kiadás.'}</td></tr>`}</tbody></table>
    ${list.length > shown.length ? html`<button class="btn btn-sm btn-block list-more" data-a="more">Összes megjelenítése (${list.length})</button>` : ''}`;
}

function showWithdrawal(bizonylat) {
  const w = L.withdrawals(store.state.db).find(x => x.bizonylat === bizonylat);
  if (!w) return;
  const anyag = w.sorok.filter(m => !m.eszkoz_id), eszk = w.sorok.filter(m => m.eszkoz_id);
  const m = modal({
    title: `Kiadás – ${fmtDate(w.datum)}`,
    wide: true,
    body: html`
      <dl class="facts facts-row">
        <div><dt>Átvevő</dt><dd>${store.userName(w.atvevo) || '–'}</dd></div>
        <div><dt>Munka / projekt</dt><dd>${w.munka || '–'}</dd></div>
        <div><dt>Rögzítette</dt><dd>${store.userName(w.felhasznalo)}</dd></div>
        <div><dt>Feltöltve</dt><dd>${fmtDate(w.rogzitve, true)}</dd></div>
        <div><dt>Bizonylat</dt><dd class="small">${w.bizonylat}</dd></div>
        ${w.megjegyzes ? html`<div><dt>Megjegyzés</dt><dd>${w.megjegyzes}</dd></div>` : ''}
      </dl>
      ${anyag.length ? html`<h3 class="sec-h">Anyagok</h3><div class="table-wrap"><table class="tbl cards nochk eq3">
        <thead><tr><th>Tétel</th><th>Hely</th><th class="num">Mennyiség</th></tr></thead>
        <tbody>${anyag.map(mv => { const t = store.itemOrStub(mv.tetel_id); return html`<tr>
          <td class="c-main">${t.megnevezes}</td>
          <td class="c-f1" data-l="Hely">${t.raktar || t.polc ? store.placeLabel(t) : '–'}</td>
          <td class="num c-f2" data-l="Mennyiség"><span class="move-date">${moveIcon('KIVET')} <b>${fmtNum(mv.mennyiseg)}</b> <span class="small muted">${t.mertekegyseg}</span></span></td>
        </tr>`; })}</tbody></table></div>` : ''}
      ${eszk.length ? html`<h3 class="sec-h">Eszközök</h3><div class="table-wrap"><table class="tbl cards nochk">
        <thead><tr><th>Eszköz</th><th>Gyári szám</th></tr></thead>
        <tbody>${eszk.map(mv => { const e = store.get('Eszkozok', mv.eszkoz_id) || { azonosito: '?', megnevezes: mv.eszkoz_id }; return html`<tr class="click" data-tool="${e.azonosito}">
          <td class="c-main">${moveIcon('KIADAS')} <b>${e.azonosito}</b> ${e.megnevezes}</td><td class="c-f1" data-l="Gyári szám">${e.gyari_szam || '–'}</td></tr>`; })}</tbody></table></div>` : ''}`,
    actions: [{ label: 'Elismervény…', value: 'print' }, { label: 'Bezárás', value: null }],
    onMount: el => el.addEventListener('click', e => { const t = e.target.closest('[data-tool]'); if (t) { m.close(); openTool(t.dataset.tool); } }),
  });
  m.done.then(v => { if (v === 'print') printReceipt(bizonylat); });
}

/* ---------- Kiadás űrlap: sorok ---------- */
function itemRows() {
  return slot.draft.items.map((it, i) => {
    const t = store.itemOrStub(it.tetel_id);
    const st = store.state.stock[it.tetel_id] || { keszlet: 0 };
    const q = parseNum(it.q);
    return html`<tr data-i="${i}">
      <td class="c-main">${t.megnevezes}<div class="sub">${store.placeLabel(t)}</div></td>
      <td class="num c-f1" data-l="Készlet">${fmtNum(st.keszlet)} <span class="small muted">${t.mertekegyseg}</span></td>
      <td class="c-f2 c-span2" data-l="Kiadott"><input type="text" inputmode="decimal" data-k="q" value="${it.q}" placeholder="${t.mertekegyseg}" aria-label="${t.megnevezes} kiadott mennyiség">
        <div class="small t-warn" data-over>${q > st.keszlet ? 'Több, mint a készlet!' : ''}</div></td>
      <td class="c-act"><button class="icon-btn" data-a="del" title="Levétel" aria-label="Levétel">${ICONS.x}</button></td>
    </tr>`;
  });
}
function toolRows() {
  return slot.draft.tools.map(id => {
    const e = store.get('Eszkozok', id) || { azonosito: '?', megnevezes: id };
    return html`<tr data-t="${id}">
      <td class="c-main"><b>${e.azonosito}</b> ${e.megnevezes}<div class="sub">${[e.gyarto, e.tipus].filter(Boolean).join(' ')}${e.gyari_szam ? ` · ${e.gyari_szam}` : ''}</div></td>
      <td class="c-act"><button class="icon-btn" data-a="deltool" title="Levétel" aria-label="Levétel">${ICONS.x}</button></td>
    </tr>`;
  });
}

/* ---------- Kezdőlap ---------- */
function renderStart(root, ctx) {
  root.innerHTML = String(html`
    <div class="page-head"><h1>Kiadás</h1>${help(html`Ami kimegy a raktárból, egy bizonylaton: <b>anyag</b> (elfogy, csökkenti a készletet) és ${canTools() ? html`<b>eszköz</b> (kölcsön: látszik, kinél van, és az átvevő aláírhatja)` : 'eszköz (ezt a raktáros rögzíti)'}. Add meg, ki viszi és melyik munkára, majd keresd ki vagy olvasd be a tételeket.<br><br>Ha többet visznek el, mint a nyilvántartott, az is rögzíthető – a következő leltár rendezi az eltérést. Egy anyag gyorsan a tétel adatlapjáról is kiadható.`)}</div>
    <div class="choice-row">
      <button class="card choice" data-start><span class="big">${ICONS.out}</span>
        <span><b>Új kiadás</b><span class="small muted d-block">${canTools() ? 'anyag és / vagy eszköz – kinek, melyik munkára' : 'elvitt anyag – kinek, melyik munkára'}</span></span></button>
    </div>
    <div class="card" style="margin-top:1rem">
      <div class="card-head"><h2 class="grow">Korábbi kiadások</h2></div>
      <div class="toolbar card-toolbar"><input type="search" data-hq placeholder="Keresés (átvevő, munka, tétel, eszköz, dátum)…" value="${ui.q}"></div>
      <div class="table-wrap" data-hbody>${historyBody()}</div>
    </div>`);
  const refreshHistory = () => { root.querySelector('[data-hbody]').innerHTML = String(historyBody()); };
  root.querySelector('[data-hq]').addEventListener('input', e => { ui.q = e.target.value; refreshHistory(); });
  root.onclick = async e => {
    const th = e.target.closest('[data-hsort]');
    if (th) {
      const k = th.dataset.hsort;
      ui.dir = ui.sort === k ? -ui.dir : (k === 'datum' || k === 'n' ? -1 : 1);
      ui.sort = k;
      return refreshHistory();
    }
    const row = e.target.closest('[data-w]');
    if (row) return showWithdrawal(row.dataset.w);
    if (e.target.closest('[data-a="more"]')) { ui.all = true; return refreshHistory(); }
    if (e.target.closest('[data-start]')) {
      const v = await headerDialog();
      if (!v) return;
      slot.draft = { fajta: 'kiadas', ...v, items: [], tools: [] };
      save(); ctx.rerender();
      root.querySelector('#add')?.focus();
    }
  };
}

/* ---------- Kiadás űrlap ---------- */
function renderForm(root, ctx) {
  const d = slot.draft;
  const n = d.items.length + d.tools.length;
  root.innerHTML = String(html`
    <div class="page-head"><h1>Kiadás</h1></div>
    <div class="card card-pad">
      <dl class="facts facts-row facts-plain">
        <div><dt>Átvevő</dt><dd>${d.atvevo}</dd></div>
        <div><dt>Munka / projekt</dt><dd>${d.munka || '–'}</dd></div>
        <div><dt>Dátum</dt><dd>${fmtDate(d.datum)}</dd></div>
        ${d.megjegyzes ? html`<div><dt>Megjegyzés</dt><dd>${d.megjegyzes}</dd></div>` : ''}
        <div class="facts-act"><button class="btn btn-sm" data-a="edit">${ICONS.edit} Módosítás</button></div>
      </dl>
    </div>
    <div class="card">
      <div class="card-head sticky-search"><div class="picker head-main"><input id="add" placeholder="+ Anyag keresése és hozzáadása…" autocomplete="off"></div>${scanButton('scan', canTools() ? 'Tétel- vagy eszközcímke beolvasása' : 'Tételcímke beolvasása')}${enterBackHtml()}</div>
      <h3 class="sec-h" style="margin:.75rem 1rem .25rem">Anyagok</h3>
      ${d.items.length ? html`<div class="table-wrap"><table class="tbl cards nochk fixed">
        <colgroup><col><col style="width:18%"><col style="width:22%"><col style="width:56px"></colgroup>
        <thead><tr><th>Tétel</th><th class="num">Készlet</th><th>Kiadott mennyiség</th><th></th></tr></thead>
        <tbody data-items>${itemRows()}</tbody></table></div>`
        : html`<div class="empty small">Keresd ki fent az elvitt anyagokat.</div>`}
      ${canTools() ? html`
        <h3 class="sec-h" style="margin:1rem 1rem .25rem">Eszközök</h3>
        <div class="toolbar" style="margin:0 1rem .5rem"><div class="picker grow" style="max-width:420px"><input id="addtool" placeholder="+ Eszköz keresése (azonosító, név)…" autocomplete="off"></div></div>
        ${d.tools.length ? html`<div class="table-wrap"><table class="tbl cards nochk fixed"><colgroup><col><col style="width:56px"></colgroup>
          <thead><tr><th>Eszköz</th><th></th></tr></thead><tbody>${toolRows()}</tbody></table></div>`
          : html`<div class="empty small">Ha eszközt is visz, keresd ki vagy olvasd be a címkéjét.</div>`}` : ''}
      <div class="bottom-bar"><span class="grow small muted">${n ? [d.items.length && `${d.items.length} anyag`, d.tools.length && `${d.tools.length} eszköz`].filter(Boolean).join(' · ') : ''}</span>
        <button class="btn btn-sm btn-link-danger" data-a="cancel">Elvetés</button>
        <button class="btn btn-sm btn-primary" data-a="save" ${n ? '' : 'disabled'}>Kiadás lezárása</button></div>
    </div>`);

  bindEnterBack(root.querySelector('#add'));
  attachPicker(root.querySelector('#add'), {
    items: store.materials, // eszköztípust nem: az eszközök darabonként, lent
    exclude: () => new Set(d.items.map(x => x.tetel_id)),
    onPick: t => addLine(t.tetel_id),
  });
  const toolInput = root.querySelector('#addtool');
  if (toolInput) attachToolPicker(toolInput, { items: () => (store.state.db.Eszkozok || []).filter(e => toolAvailable(e) && !d.tools.includes(e.eszkoz_id)), onPick: e => addTool(e) });
  // Anyag a listára (keresőből vagy címke beolvasásával); ha már rajta van, a mennyiségére ugrik
  function addLine(id) {
    let i = d.items.findIndex(x => x.tetel_id === id);
    if (i < 0) { d.items.push({ tetel_id: id, q: '' }); save(); ctx.rerender(); i = d.items.length - 1; }
    const inp = root.querySelector(`tr[data-i="${i}"] [data-k="q"]`);
    if (inp) { inp.scrollIntoView({ block: 'center' }); inp.focus(); }
  }
  function addTool(e) {
    if (!d.tools.includes(e.eszkoz_id)) { d.tools.push(e.eszkoz_id); save(); ctx.rerender(); }
    root.querySelector('#addtool')?.focus();
  }
  root.querySelector('[data-items]')?.addEventListener('input', e => {
    const tr = e.target.closest('tr[data-i]');
    if (!tr || e.target.dataset.k !== 'q') return;
    const it = d.items[Number(tr.dataset.i)];
    it.q = e.target.value;
    const q = parseNum(it.q), st = store.state.stock[it.tetel_id] || { keszlet: 0 };
    tr.querySelector('[data-over]').textContent = q > st.keszlet ? 'Több, mint a készlet!' : '';
    save();
  });

  root.onclick = async e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    // Beolvasás egymás után: a tételcímke az anyagokhoz (a mennyiség utána írható), az eszközcímke az eszközökhöz
    if (a === 'scan') return scanCodes({ title: 'Tétel / eszköz beolvasása', keepOpen: true,
      hint: canTools() ? 'Olvasd be egymás után a tételek és eszközök címkéjét, majd „Kész”.' : 'Olvasd be egymás után a tételek címkéjét, majd „Kész”.',
      onCode: c => {
        const x = codeItem(c);
        if (c && c.tipus === 'tetel' && x && x.aktiv && !L.isToolItem(x)) {
          if (!d.items.some(it => it.tetel_id === x.tetel_id)) { d.items.push({ tetel_id: x.tetel_id, q: '' }); save(); ctx.rerender(); }
          return `✓ ${x.megnevezes} – a mennyiséget a listában írd be`;
        }
        if (c && c.tipus === 'eszkoz' && x && canTools() && toolAvailable(x)) {
          if (!d.tools.includes(x.eszkoz_id)) { d.tools.push(x.eszkoz_id); save(); ctx.rerender(); }
          return `✓ ${x.azonosito} ${x.megnevezes}`;
        }
        return false;
      } });
    if (a === 'edit') {
      const v = await headerDialog(d);
      if (v) { Object.assign(d, v); save(); ctx.rerender(); }
    }
    if (a === 'del') { d.items.splice(Number(e.target.closest('tr').dataset.i), 1); save(); return ctx.rerender(); }
    if (a === 'deltool') { d.tools = d.tools.filter(x => x !== e.target.closest('tr').dataset.t); save(); return ctx.rerender(); }
    if (a === 'cancel') {
      if ((d.items.length || d.tools.length) && !(await confirmDialog('Elvetés', 'A beírt kiadás elvész. Biztosan elveted?', 'Elvetés', 'danger'))) return;
      await slot.clear(); return ctx.rerender();
    }
    if (a === 'save') await slot.once(() => finish(ctx));
  };
}

/** Lezárás: eszköznél aláírás (ajánlott), majd egy bizonylaton rögzít; eszköznél elismervény nyomtatható. */
async function finish(ctx) {
  const d = slot.draft;
  const items = d.items.map(it => ({ tetel_id: it.tetel_id, q: parseNum(it.q) }));
  // A mennyiségek az aláírás előtt (ne kelljen újra aláírni egy elírás miatt)
  const bad = items.find(it => !(it.q > 0));
  if (bad) return toast('Hiányzó vagy hibás mennyiség: ' + store.itemOrStub(bad.tetel_id).megnevezes, 'error');
  // Közben (pl. másik készülékről) kiadott / szervizbe került eszköz: jelezzük, és kihagyjuk
  const tools = d.tools.filter(id => toolAvailable(store.get('Eszkozok', id)));
  if (tools.length < d.tools.length && !(await confirmDialog('Nem kiadható eszköz', `${d.tools.length - tools.length} eszköz időközben már nem kiadható (ki van adva vagy szervizben). A többivel folytatod?`, 'Folytatás'))) return;
  let alairasok = [];
  const who = store.userName(store.personKey(d.atvevo));
  if (tools.length) {
    const sigs = await askSignatures({ title: 'Kiadás – aláírás', personLabel: 'átvevő', ownLabel: 'átadó', personName: who,
      summary: html`<p class="small muted" style="margin-top:0">${[items.length && `${items.length} anyag`, `${tools.length} eszköz`].filter(Boolean).join(' és ')} kiadása: ${who}${d.munka ? ` · ${d.munka}` : ''}</p>` });
    if (!sigs) return;
    alairasok = sigs;
  }
  const bizonylat = await saveKivet(items, d, { tools, alairasok });
  if (!bizonylat) return;
  const receipt = { tipus: 'KIADAS', bizonylat, datum: new Date().toISOString(), kinel: store.personKey(d.atvevo), munka: d.munka, megjegyzes: d.megjegyzes,
    rows: tools.map(id => ({ e: store.get('Eszkozok', id) })), anyag: items.map(it => ({ t: store.itemOrStub(it.tetel_id), q: it.q })),
    sigs: alairasok, atado: store.state.user.email };
  await slot.clear();
  ctx.rerender();
  if (tools.length && await confirmDialog('Elismervény', 'Kinyomtatod (vagy PDF-be mented) az átadás-átvételi elismervényt?', 'Nyomtatás')) printDoc(receiptHtml(receipt));
}

export default {
  // Kiadás közben nem rajzoljuk újra (fókusz, gépelés megmarad); a kezdőlap frissülhet
  get liveUpdate() { return !slot.draft; },
  render(root, params, ctx) {
    if (!slot.ready(root, ctx)) return;
    if (slot.draft) renderForm(root, ctx); else renderStart(root, ctx);
  },
};
