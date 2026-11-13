// Igények: beszerzési igények (szerszám, anyag, bármi) rögzítése és követése.
// A szerelő csak a saját igényeit látja (a szerver csak azokat küldi el). A raktáros mindet kezeli: tételhez
// kapcsolja, rendelési listára teszi (onnantól a rendelés és a beérkezés frissíti az állapotot), elutasítja.
import * as store from '../store.js';
import { html, help, matcher, fmtNum, fmtDate, modal, toast, confirmDialog, formValues, parseNum, sec, suggestInput, todayInput, isoToInput, igenyStatus } from '../ui.js';
import { filterButton, openFilter, inSel, attachPicker, showItemDetail, quickAddItem } from './common.js';
import { addToOrderList } from './rendelesek.js';

const L = window.RaktarLogic;
const OPEN = ['uj', 'folyamatban', 'rendelve'];
const ui = { q: '', all: false, f: { statusz: new Set(), ki: new Set() } };

const all = () => store.state.db.Igenyek || [];
const isOpen = ig => OPEN.includes(ig.statusz);
const mine = ig => String(ig.igenylo).toLowerCase() === String(store.state.user?.email || '').toLowerCase();
/** Dátum mező → ISO (a nap közepe, hogy időzónától függetlenül ugyanaz a nap maradjon); üresre üres. */
const dayIso = v => { if (!v) return ''; const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d, 12).toISOString(); };
const overdue = ig => isOpen(ig) && ig.hatarido && isoToInput(ig.hatarido) < todayInput();
const qtyText = ig => (ig.mennyiseg ? `${fmtNum(ig.mennyiseg)} ${ig.mertekegyseg || ''}`.trim() : '–');
const badge = s => { const [l, c] = igenyStatus(s); return html`<span class="badge badge-${c}">${l}</span>`; };
const deadline = ig => (ig.hatarido ? html`<span class="${overdue(ig) ? 't-err' : ''}" title="${overdue(ig) ? 'Lejárt határidő' : ''}">${fmtDate(ig.hatarido)}</span>` : '–');
/** Sorjelölő csík (mint az Áttekintőben): piros = sürgős vagy lejárt határidő, sárga = 7 napon belüli határidő. */
const soon = ig => isOpen(ig) && ig.hatarido && !overdue(ig) && Date.parse(ig.hatarido) - Date.now() < 7 * 86400000;
const rowMark = ig => (isOpen(ig) && (ig.surgos || overdue(ig)) ? 'hiany' : soon(ig) ? 'figyelem' : '');
const markTitle = ig => [isOpen(ig) && ig.surgos && 'Sürgős', overdue(ig) && 'Lejárt határidő', soon(ig) && 'Közeli határidő'].filter(Boolean).join(', ');

function filtered() {
  const match = matcher(ui.q);
  return all()
    .filter(ig => (ui.all || isOpen(ig)) && inSel(ui.f.statusz, ig.statusz) && inSel(ui.f.ki, ig.igenylo) &&
      match(`${ig.megnevezes} ${ig.leiras} ${store.userName(ig.igenylo)} ${ig.valasz}`))
    // A nyitott sürgősek elöl, egyébként a legújabb
    .sort((a, b) => (Number(b.surgos && isOpen(b)) - Number(a.surgos && isOpen(a))) || (a.datum < b.datum ? 1 : -1));
}

function groups() {
  const users = [...new Set(all().map(ig => ig.igenylo))];
  return [
    { key: 'statusz', title: 'Állapot', options: Object.keys(L.IGENY_STATUS).filter(s => ui.all || OPEN.includes(s)).map(s => [s, L.IGENY_STATUS[s]]) },
    { key: 'ki', title: 'Igénylő', options: store.can('raktaros') && users.length > 1 ? users.map(u => [u, store.userName(u)]).sort((a, b) => a[1].localeCompare(b[1], 'hu')) : [] },
  ];
}

function bodyHtml() {
  const list = filtered();
  const showWho = store.can('igenyek');
  if (!list.length) return html`<div class="empty">${all().length ? 'Nincs a szűrésnek megfelelő igény.' : 'Még nincs igény. Az „Új igény” gombbal rögzíthetsz.'}</div>`;
  return html`<div class="table-wrap"><table class="tbl cards fixed nochk marked">
    <colgroup><col><col style="width:24%"><col style="width:12%"><col style="width:12%"><col style="width:13%"></colgroup>
    <thead><tr><th>Igény</th><th>Igényelve</th><th class="num">Mennyiség</th><th>Határidő</th><th>Állapot</th></tr></thead>
    <tbody>${list.map(ig => html`<tr class="click ${rowMark(ig) ? `st-row-${rowMark(ig)}` : ''}" data-ig="${ig.igeny_id}" tabindex="0" ${markTitle(ig) ? html`title="${markTitle(ig)}"` : ''}>
      <td class="c-main">${ig.megnevezes}${ig.leiras ? html`<div class="sub">${ig.leiras}</div>` : ''}</td>
      <td class="c-meta">${fmtDate(ig.datum)}${showWho ? html` · ${store.userName(ig.igenylo)}` : ''}</td>
      <td class="num c-f1" data-l="Mennyiség">${qtyText(ig)}</td>
      <td class="c-f2" data-l="Határidő">${deadline(ig)}</td>
      <td class="c-f3" data-l="Állapot">${badge(ig.statusz)}</td>
    </tr>`)}</tbody></table></div>`;
}

/** Új igény / módosítás űrlapja. */
async function editIgeny(ig) {
  const isNew = !ig;
  const v = ig || { megnevezes: '', leiras: '', mennyiseg: 1, mertekegyseg: 'db', link: '', surgos: false, hatarido: '' };
  // A raktáros egy kolléga nevében is felveheti az igényt (pl. telefonon szóltak): választható igénylő, alapból ő maga
  const boss = store.can('raktaros');
  const me = store.state.user.email;
  const users = (store.state.db.Felhasznalok || []).filter(u => u.aktiv !== false || u.email === v.igenylo)
    .sort((a, b) => (a.nev || a.email).localeCompare(b.nev || b.email, 'hu'));
  const res = await modal({
    title: isNew ? 'Új igény' : 'Igény módosítása',
    body: html`
      ${boss ? sec('Ki kéri?', html`<label class="field span-2"><span>Igénylő ${help('Ha egy kolléga nevében veszed fel (pl. szólt telefonon), válaszd ki őt: az igény az ő listájában is megjelenik, és ő is követheti. A rögzítő (te) külön elmentődik.')}</span>
        <select name="igenylo">${users.map(u => html`<option value="${u.email}" ${u.email === (v.igenylo || me) ? 'selected' : ''}>${u.nev || u.email}${u.email === me ? ' (én)' : ''}</option>`)}</select></label>`) : ''}
      ${sec('Mire van szükség?', html`
        <label class="field span-2"><span>Megnevezés *</span><input name="megnevezes" value="${v.megnevezes}" placeholder="pl. akkus fúrógép, SDS fúrószár 8 mm" maxlength="200"></label>
        <label class="field span-2"><span>Leírás</span><textarea name="leiras" maxlength="2000" placeholder="Mire kell, milyen legyen, mi a gond a régivel…">${v.leiras}</textarea></label>
        <label class="field"><span>Mennyiség</span><input name="mennyiseg" inputmode="decimal" value="${v.mennyiseg ? String(v.mennyiseg) : ''}"></label>
        <label class="field"><span>Mértékegység</span>${suggestInput('mertekegyseg', v.mertekegyseg, L.listValues(store.state.db, 'mertekegyseg'))}</label>
        <label class="field span-2"><span>Link (ha van konkrét termék)</span><input name="link" type="url" inputmode="url" value="${v.link}" placeholder="https://…"></label>`)}
      ${sec(html`Sürgősség <span style="font-weight:400;text-transform:none;letter-spacing:0">(nem kötelező)</span>`, html`
        <label class="field"><span>Határidő</span><input type="date" name="hatarido" value="${isoToInput(v.hatarido)}" ${isNew ? html`min="${todayInput()}"` : ''}></label>
        <label class="check" style="align-self:end;min-height:40px"><input type="checkbox" name="surgos" ${v.surgos ? 'checked' : ''}> Sürgős</label>`)}`,
    actions: [{ label: 'Mégse', value: null }, {
      label: isNew ? 'Rögzítés' : 'Mentés', kind: 'primary', onClick: async el => {
        const f = formValues(el);
        const q = f.mennyiseg.trim() === '' ? 0 : parseNum(f.mennyiseg);
        if (!f.megnevezes.trim()) { toast('A megnevezés kötelező.', 'warn'); return false; }
        if (isNaN(q) || q < 0) { toast('Hibás mennyiség.', 'warn'); return false; }
        if (f.link.trim() && !/^https?:\/\//i.test(f.link.trim())) { toast('A link http:// vagy https:// kezdetű legyen.', 'warn'); return false; }
        const igeny = { igeny_id: ig ? ig.igeny_id : L.newId('I', 10), megnevezes: f.megnevezes, leiras: f.leiras, mennyiseg: q,
          mertekegyseg: f.mertekegyseg, link: f.link.trim(), surgos: f.surgos, hatarido: dayIso(f.hatarido), ...(boss ? { igenylo: f.igenylo } : {}) };
        try { await store.enqueue({ type: 'igeny', igeny }); }
        catch (x) { toast(x.message, 'error', 6000); return false; }
        toast(isNew ? 'Igény rögzítve' : 'Mentve', 'ok');
        return true;
      },
    }],
  }).done;
  return res;
}

/** Művelet az igényen (állapot, válasz, tétel) – hibánál üzenet, siker esetén igaz. */
async function manage(id, fields, okText) {
  try { await store.enqueue({ type: 'igeny_kezeles', igeny_id: id, ...fields }); }
  catch (x) { toast(x.message, 'error', 6000); return false; }
  if (okText) toast(okText, 'ok');
  return true;
}

/** Egy igény adatlapja; a raktárosnak a kezelés (tétel, rendelési lista, állapot, válasz) is. */
function showIgeny(id) {
  const ig = store.get('Igenyek', id);
  if (!ig) return;
  const t = ig.tetel_id ? store.get('Tetelek', ig.tetel_id) : null;
  const line = ig.rendeles_sor_id ? store.get('Rendeles_tetelek', ig.rendeles_sor_id) : null;
  const closed = ig.statusz === 'teljesitve' || ig.statusz === 'elutasitva';
  const boss = store.can('raktaros');
  const canEdit = !closed && (boss || (mine(ig) && ig.statusz === 'uj'));
  const canDelete = ig.statusz !== 'rendelve' && (boss || (mine(ig) && ig.statusz === 'uj'));
  const manageable = boss && !closed && ig.statusz !== 'rendelve';
  const reopen = () => showIgeny(id);

  const m = modal({
    title: ig.megnevezes,
    wide: boss,
    body: html`
      <div class="facts facts-row">
        <div><dt>Állapot</dt><dd>${badge(ig.statusz)}</dd></div>
        ${ig.surgos ? html`<div><dt>Sürgősség</dt><dd class="${isOpen(ig) ? 't-err' : ''}">Sürgős</dd></div>` : ''}
        <div><dt>Igénylő</dt><dd>${store.userName(ig.igenylo)}${ig.rogzitette && ig.rogzitette !== ig.igenylo ? html` <span class="small muted">(rögzítette: ${store.userName(ig.rogzitette)})</span>` : ''}</dd></div>
        <div><dt>Igényelve</dt><dd>${fmtDate(ig.datum, true)}</dd></div>
        <div><dt>Mennyiség</dt><dd>${qtyText(ig)}</dd></div>
        <div><dt>Határidő</dt><dd>${deadline(ig)}</dd></div>
        ${t ? html`<div><dt>Tétel</dt><dd><a href="#" data-x="item">${t.megnevezes}</a></dd></div>` : ''}
        ${line && line.rendeles_id ? html`<div><dt>Rendelés</dt><dd>${line.rendeles_id}</dd></div>` : ''}
      </div>
      ${ig.leiras ? html`<p style="white-space:pre-line;margin-top:1rem">${ig.leiras}</p>` : ''}
      ${ig.link ? html`<p class="small"><a href="${ig.link}" target="_blank" rel="noopener">${ig.link.replace(/^https?:\/\//, '').slice(0, 80)} ↗</a></p>` : ''}
      ${ig.valasz && !manageable ? html`<div class="notice notice-info small" style="margin-top:1rem"><b>${store.userName(ig.kezelte)}:</b> ${ig.valasz}</div>` : ''}
      ${manageable ? html`
        ${sec('Tétel', html`
          <div class="toolbar" style="margin:0">
            <div class="picker grow"><input data-pick placeholder="${t ? 'Másik tétel keresése…' : 'Meglévő tétel keresése…'}" autocomplete="off"></div>
            <button class="btn btn-sm" data-x="newitem" title="Új tétel felvétele az igény adataival">+ Új tétel az igényből</button>
          </div>
          <p class="small muted" style="margin:.35rem 0 0">Ha megvan a konkrét termék, kapcsold tételhez, és tedd a rendelési listára. A rendelés és a beérkezés az igény állapotát is frissíti.</p>`, 'col')}
        ${sec('Válasz az igénylőnek', html`<textarea name="valasz" maxlength="2000" placeholder="pl. ajánlatot kértem; a raktárban van tartalék; elutasítás oka…">${ig.valasz}</textarea>`, 'col')}
        <div class="toolbar" style="margin-top:.75rem">
          ${t && store.can('rendeles') ? html`<button class="btn btn-sm btn-primary" data-x="order">Rendelési listára</button>` : ''}
          ${ig.statusz === 'uj' ? html`<button class="btn btn-sm" data-x="progress" title="Jelzi az igénylőnek, hogy foglalkozol vele">Folyamatban</button>` : ''}
          <button class="btn btn-sm" data-x="done" title="Pl. a raktárban megvolt, vagy rendelés nélkül beszerezted">Teljesítve</button>
          <button class="btn btn-sm" data-x="answer">Válasz mentése</button>
          <span class="grow"></span>
          <button class="btn btn-sm btn-link-danger" data-x="reject">Elutasítás</button>
        </div>` : ''}
      ${boss && ig.statusz === 'rendelve' ? html`<p class="small muted" style="margin-top:1rem">Megrendelve: az állapotot a beérkezés (teljesítve), ill. a rendelés törlése vagy lezárása frissíti.</p>` : ''}`,
    actions: [
      ...(canDelete ? [{ label: mine(ig) && !boss ? 'Visszavonás' : 'Törlés', kind: 'link-danger', onClick: async () => {
        if (!(await confirmDialog('Igény törlése', `„${ig.megnevezes}” igény végleg törlődik. Folytatod?`, 'Törlés', 'danger'))) return false;
        try { await store.enqueue({ type: 'igeny_torles', igeny_id: id }); toast('Igény törölve', 'ok'); }
        catch (x) { toast(x.message, 'error', 6000); return false; }
      } }] : []),
      ...(canEdit ? [{ label: 'Módosítás', value: 'edit' }] : []),
      { label: 'Bezárás', value: null },
    ],
    onMount: el => {
      const pick = el.querySelector('[data-pick]');
      const link = async item => { if (await manage(id, { tetel_id: item.tetel_id, ...(ig.statusz === 'uj' ? { statusz: 'folyamatban' } : {}) }, 'Tétel kapcsolva')) { m.close(); reopen(); } };
      if (pick) attachPicker(pick, { items: store.activeItems, allowCreate: false, onPick: link });
      const valasz = () => el.querySelector('[name=valasz]')?.value.trim() ?? '';
      let busy = false;
      el.addEventListener('click', async e => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        e.preventDefault();
        if (b.dataset.x === 'item') return showItemDetail(t.tetel_id);
        if (busy) return;
        busy = true;
        try {
          const x = b.dataset.x;
          if (x === 'newitem') { const item = await quickAddItem(ig.megnevezes, '', { mertekegyseg: ig.mertekegyseg }); if (item) await link(item); }
          if (x === 'order') {
            await addToOrderList(t.tetel_id, id, ig.mennyiseg);
            await manage(id, { valasz: valasz(), ...(ig.statusz === 'uj' ? { statusz: 'folyamatban' } : {}) });
            toast('A rendelési listára került', 'ok');
            m.close();
          }
          if (x === 'progress' && await manage(id, { statusz: 'folyamatban', valasz: valasz() }, 'Folyamatban')) m.close();
          if (x === 'done' && await manage(id, { statusz: 'teljesitve', valasz: valasz() }, 'Igény teljesítve')) m.close();
          if (x === 'answer' && await manage(id, { valasz: valasz() }, 'Válasz mentve')) m.close();
          if (x === 'reject') {
            if (!valasz()) { toast('Írd meg az elutasítás okát a válasz mezőbe.', 'warn'); el.querySelector('[name=valasz]').focus(); return; }
            if (await manage(id, { statusz: 'elutasitva', valasz: valasz() }, 'Igény elutasítva')) m.close();
          }
        } finally { busy = false; }
      });
    },
  });
  m.done.then(async v => { if (v === 'edit' && await editIgeny(store.get('Igenyek', id))) reopen(); });
}

export default {
  render(root) {
    // Már kirajzolva (pl. szinkron után): csak a lista frissül, a kereső fókusza megmarad
    if (root.dataset.view === 'igenyek' && root.querySelector('[data-body]')) { root.querySelector('[data-body]').innerHTML = String(bodyHtml()); return; }
    root.dataset.view = 'igenyek';
    const n = all().length;
    root.innerHTML = String(html`
      <div class="page-head"><h1>Igények</h1>${help(html`Ha valamire szükség van (szerszám, anyag, bármi), itt rögzítheted. A sürgősség és a határidő nem kötelező.<br><br>
        <b>Jelölések</b><br><span class="legend-bar st-hiany"></span> piros csík: sürgős, vagy lejárt a határidő<br><span class="legend-bar st-figyelem"></span> sárga csík: 7 napon belüli határidő<br><br>
        ${store.can('igenyek') ? 'Minden igény látszik. Egy igényre kattintva kapcsolhatod tételhez, teheted a rendelési listára, vagy válaszolhatsz rá. A megrendelt igény a beérkezéskor magától teljesítetté válik.'
          : 'Csak a saját igényeid látszanak. Amíg „Új” állapotú, módosíthatod vagy visszavonhatod; utána a raktár kezeli, és itt látod az állapotát, válaszát.'}`)}
        <div class="actions"><button class="btn btn-primary" data-a="new">+ Új igény</button></div></div>
      <div class="card">
        <div class="toolbar card-toolbar">
          <div class="seg" role="group" aria-label="Megjelenítés">
            <button class="${ui.all ? '' : 'on'}" data-a="open">Nyitott (${all().filter(isOpen).length})</button>
            <button class="${ui.all ? 'on' : ''}" data-a="all">Összes (${n})</button></div>
        </div>
        <div class="toolbar card-toolbar">
          <input type="search" data-q placeholder="Keresés (megnevezés, leírás, igénylő)…" value="${ui.q}">
          ${filterButton(ui.f)}
        </div>
        <div data-body>${bodyHtml()}</div>
      </div>`);
    const refresh = () => { root.querySelector('[data-body]').innerHTML = String(bodyHtml()); };
    root.querySelector('[data-q]').addEventListener('input', e => { ui.q = e.target.value; refresh(); });
    root.onclick = async e => {
      const fb = e.target.closest('[data-filter]');
      if (fb) return openFilter(fb, groups, ui.f, refresh);
      const b = e.target.closest('[data-a]');
      if (b) {
        if (b.dataset.a === 'new') return editIgeny();
        ui.all = b.dataset.a === 'all';
        if (!ui.all) [...ui.f.statusz].filter(s => !OPEN.includes(s)).forEach(s => ui.f.statusz.delete(s));
        delete root.dataset.view;
        return this.render(root);
      }
      const tr = e.target.closest('tr[data-ig]');
      if (tr) showIgeny(tr.dataset.ig);
    };
    root.onkeydown = e => { const tr = e.target.closest?.('tr[data-ig]'); if (tr && e.key === 'Enter') showIgeny(tr.dataset.ig); };
  },
};
