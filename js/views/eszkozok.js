// Eszközök: szerszámok, eszközök egyedi nyilvántartása – kinél van, milyen állapotban, mikor esedékes a felülvizsgálat.
// Minden változás (kiadás, visszavétel, szerviz, állapot, felülvizsgálat, selejtezés) a naplóba kerül; a hely és a
// „kinél” a naplóból számolódik (L.toolStates). Kiadás / visszavétel aláírható, és elismervény nyomtatható róla.
import * as store from '../store.js';
import { html, help, matcher, fmtDate, fmtNum, modal, toast, confirmDialog, formValues, sec, suggestInput, todayInput, isoToInput, dateInputToIso, dateStamp, signaturePad, signatureSvg, printDoc } from '../ui.js';
import { filterButton, openFilter, inSel, countOptions, listSelect, bindListSelects, quickAddItem, showItemDetail } from './common.js';
import { openLabels } from './cimkek.js';
import { scanCodes, scanButton, codeItem } from '../qr.js';
import { ICONS } from '../icons.js';

const L = window.RaktarLogic;
const STATE_BADGE = { rendben: 'ok', javitando: 'warn', szervizben: 'info', selejtezve: 'muted', elveszett: 'err' };
const CYCLES = [[0, 'Nincs'], [90, '3 havonta'], [180, 'Félévente'], [365, 'Évente'], [730, '2 évente']];
// stat: a felső számkártyák szűrője (mint az Anyagkészletben) – '' | 'kiadva' | 'raktar' | 'szerviz' | 'hibas' | 'lejart'
const ui = { tab: 'lista', seg: 'aktiv', q: '', stat: '', f: { hely: new Set(), allapot: new Set(), kat: new Set(), fv: new Set(), wh: new Set(), tip: new Set() } };

const tools = () => store.state.db.Eszkozok || [];
// Az eszközök mozgásai a közös mozgásnaplóban (Mozgasok: eszkoz_id-vel; atvevo: kinek / kitől / szerviz)
const events = () => store.state.db.Mozgasok.filter(m => m.eszkoz_id);
const states = () => L.toolStates(store.state.db);
const me = () => String(store.state.user?.email || '').toLowerCase();
const personName = p => (p && p.includes('@') ? store.userName(p) : p || '–');
const toolName = e => `${e.azonosito} · ${e.megnevezes}`;
const stateBadge = a => html`<span class="badge badge-${STATE_BADGE[a] || 'muted'}">${L.TOOL_STATE[a] || a}</span>`;
/** Tárolási hely felirata („Raktár · Polc”), ha meg van adva. */
const placeOf = e => [e.raktar, e.polc].filter(Boolean).join(' · ');
const where = (s, e) => (s.hely === 'kiadva' ? personName(s.kinel) : s.hely === 'szerviz' ? `Szerviz${s.kinel ? ': ' + s.kinel : ''}`
  : `Raktárban${e && placeOf(e) ? ' · ' + placeOf(e) : ''}`);
const fvText = s => (s.felulvizsgalat === 'lejart' ? html`<span class="t-err">${s.kovetkezo ? fmtDate(s.kovetkezo) : 'nincs adat'}</span>`
  : s.felulvizsgalat === 'kozel' ? html`<span class="t-warn">${fmtDate(s.kovetkezo)}</span>` : s.kovetkezo ? fmtDate(s.kovetkezo) : '–');
/** Sorjelölő csík (mint az Áttekintőben): piros = lejárt felülvizsgálat, javítandó, elveszett; sárga = közeli felülvizsgálat. */
const rowMark = (e, s) => (s.felulvizsgalat === 'lejart' || e.allapot === 'javitando' || e.allapot === 'elveszett' ? 'hiany' : s.felulvizsgalat === 'kozel' ? 'figyelem' : '');
const markTitle = (e, s) => [s.felulvizsgalat === 'lejart' && 'Lejárt felülvizsgálat', s.felulvizsgalat === 'kozel' && 'Közeli felülvizsgálat',
  e.allapot === 'javitando' && 'Javítandó', e.allapot === 'elveszett' && 'Elveszett'].filter(Boolean).join(', ');

/* ---------- Lista ---------- */
const STATS = {
  '': ['Aktív eszköz', () => true, ''],
  kiadva: ['Kiadva', (e, s) => s.hely === 'kiadva', ''],
  raktar: ['Raktárban', (e, s) => s.hely === 'raktar', ''],
  szerviz: ['Szervizben', (e, s) => s.hely === 'szerviz', 'info'],
  hibas: ['Javítandó / elveszett', e => e.allapot === 'javitando' || e.allapot === 'elveszett', 'warn'],
  lejart: ['Lejárt felülvizsgálat', (e, s) => s.felulvizsgalat === 'lejart', 'err'],
};
/** Számkártyák (kattintásra szűrnek), mint az Anyagkészletben. */
function statsHtml(st) {
  const act = tools().filter(e => e.allapot !== 'selejtezve');
  return html`${Object.entries(STATS).map(([k, [l, f, cls]]) => html`<button class="stat ${cls} ${ui.stat === k ? 'sel' : ''}" data-stat="${k}">
    <div class="v">${act.filter(e => f(e, st[e.eszkoz_id])).length}</div><div class="l">${l}</div></button>`)}`;
}

function filtered(st) {
  const match = matcher(ui.q);
  const statOk = STATS[ui.stat][1];
  return tools().filter(e => {
    const s = st[e.eszkoz_id];
    if (ui.seg === 'selejt' ? e.allapot !== 'selejtezve' : e.allapot === 'selejtezve') return false;
    if (ui.seg !== 'selejt' && !statOk(e, s)) return false;
    if (ui.seg === 'nalam' && !(s.hely === 'kiadva' && String(s.kinel).toLowerCase() === me())) return false;
    return inSel(ui.f.hely, s.hely) && inSel(ui.f.allapot, e.allapot) && inSel(ui.f.kat, e.kategoria) &&
      inSel(ui.f.fv, s.felulvizsgalat) && inSel(ui.f.wh, e.raktar || '') && inSel(ui.f.tip, e.tetel_id || '-') && match(`${e.azonosito} ${e.megnevezes} ${e.kategoria} ${e.gyarto} ${e.tipus} ${e.gyari_szam} ${where(s, e)}`);
  }).sort((a, b) => a.azonosito.localeCompare(b.azonosito, 'hu', { numeric: true }));
}

function groups() {
  const list = tools().filter(e => e.allapot !== 'selejtezve');
  const cats = [...new Set(list.map(e => e.kategoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'hu'));
  const types = store.toolTypes().sort((a, b) => a.megnevezes.localeCompare(b.megnevezes, 'hu'));
  return [
    { key: 'tip', title: 'Típus', options: types.length ? [...types.map(t => [t.tetel_id, t.megnevezes, list.filter(e => e.tetel_id === t.tetel_id).length]),
      ['-', '— típus nélkül —', list.filter(e => !e.tetel_id).length]] : [] },
    { key: 'hely', title: 'Hol van', options: [['raktar', 'Raktárban'], ['kiadva', 'Kiadva'], ['szerviz', 'Szervizben']] },
    { key: 'allapot', title: 'Állapot', options: Object.keys(L.TOOL_STATE).filter(k => k !== 'selejtezve').map(k => [k, L.TOOL_STATE[k]]) },
    { key: 'fv', title: 'Felülvizsgálat', options: [['lejart', 'Lejárt'], ['kozel', '30 napon belül']] },
    { key: 'kat', title: 'Kategória', options: countOptions(cats, list, 'kategoria') },
    { key: 'wh', title: 'Raktár', options: (whs => (whs.length > 1 ? countOptions(whs, list, 'raktar') : []))([...new Set(list.map(e => e.raktar).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'hu'))) },
  ];
}

function listHtml() {
  const st = states();
  const list = filtered(st);
  if (!list.length) return html`<div class="empty">${tools().length ? 'Nincs a szűrésnek megfelelő eszköz.' : 'Még nincs eszköz. Az „Új eszköz” gombbal vehetsz fel.'}</div>`;
  return html`<div class="table-wrap"><table class="tbl cards fixed nochk marked">
    <colgroup><col style="width:11%"><col><col style="width:22%"><col style="width:13%"><col style="width:13%"></colgroup>
    <thead><tr><th>Azonosító</th><th>Eszköz</th><th>Hol van</th><th>Állapot</th><th>Felülvizsgálat</th></tr></thead>
    <tbody>${list.map(e => {
      const s = st[e.eszkoz_id], mark = rowMark(e, s), title = markTitle(e, s);
      return html`<tr class="click ${mark ? `st-row-${mark}` : ''}" data-e="${e.eszkoz_id}" tabindex="0" ${title ? html`title="${title}"` : ''}>
        <td class="m-hide nowrap"><b>${e.azonosito}</b></td>
        <td class="c-main"><b class="m-only">${e.azonosito} · </b>${e.megnevezes}<div class="sub">${[e.gyarto, e.tipus].filter(Boolean).join(' ')}${e.gyari_szam ? ` · ${e.gyari_szam}` : ''}</div></td>
        <td class="c-f1" data-l="Hol van">${s.hely === 'raktar' ? html`<span class="muted">${placeOf(e) || 'Raktárban'}</span>` : where(s)}${s.miota ? html`<div class="small muted">${fmtDate(s.miota)} óta</div>` : ''}</td>
        <td class="c-f2" data-l="Állapot">${stateBadge(e.allapot)}</td>
        <td class="c-f3" data-l="Felülvizsg.">${fvText(s)}</td>
      </tr>`;
    })}</tbody></table></div>`;
}

/** „Kinél mi van”: személyenként (és szervizenként) a nála lévő eszközök – pl. kilépéskor. */
function peopleHtml(q = ui.q) {
  const st = states();
  const by = new Map();
  tools().forEach(e => {
    const s = st[e.eszkoz_id];
    if (s.hely === 'raktar') return;
    const k = `${s.hely}|${s.kinel}`;
    if (!by.has(k)) by.set(k, { hely: s.hely, kinel: s.kinel, list: [] });
    by.get(k).list.push({ e, s });
  });
  const match = matcher(q);
  const rows = [...by.values()].filter(p => match(`${personName(p.kinel)} ${p.list.map(x => toolName(x.e)).join(' ')}`))
    .sort((a, b) => (a.hely === b.hely ? personName(a.kinel).localeCompare(personName(b.kinel), 'hu') : a.hely === 'kiadva' ? -1 : 1));
  if (!rows.length) return html`<div class="empty">Jelenleg nincs kiadott eszköz.</div>`;
  const boss = store.can('raktaros');
  return html`${rows.map(p => html`<div class="person-block">
    <div class="person-head"><b class="grow">${p.hely === 'szerviz' ? `Szerviz: ${p.kinel || '–'}` : personName(p.kinel)}</b>
      <span class="badge badge-muted">${p.list.length} eszköz</span>
      ${p.hely === 'kiadva' ? html`<button class="btn btn-sm" data-a="plist" data-k="${p.kinel}" title="Nyomtatható lista a nála lévő eszközökről (pl. kilépéskor)">Lista nyomtatása</button>
        ${boss ? html`<button class="btn btn-sm" data-a="ret" data-k="${p.kinel}">Visszavétel…</button>` : ''}` : ''}</div>
    ${p.list.sort((a, b) => a.e.azonosito.localeCompare(b.e.azonosito, 'hu', { numeric: true })).map(({ e, s }) => html`<div class="list-row click" data-e="${e.eszkoz_id}">
      <span class="grow"><b>${e.azonosito}</b> ${e.megnevezes}</span>
      <span class="small muted nowrap">${fmtDate(s.miota)} óta</span>${e.allapot !== 'rendben' ? html` ${stateBadge(e.allapot)}` : ''}</div>`)}
  </div>`)}`;
}

/* ---------- Eszköz űrlap ---------- */
const typeOptions = cur => html`<option value="">— nincs megadva —</option>
  ${store.toolTypes().sort((a, b) => a.megnevezes.localeCompare(b.megnevezes, 'hu')).map(t => html`<option value="${t.tetel_id}" ${t.tetel_id === cur ? 'selected' : ''}>${t.megnevezes}</option>`)}
  <option value="__new">+ Új eszköztípus…</option>`;

/**
 * Új eszköz / módosítás. type: az eszköztípus (Tetelek, keszletezes = eszkoz) – új darabnál előtölti a nevet, kategóriát, helyet.
 * Exportálva: a tétel (eszköztípus) adatlapjáról is nyílik.
 */
export async function editTool(e, type = null) {
  const isNew = !e;
  const code = isNew ? L.nextToolCode(store.state.db) : e.azonosito;
  const v = e || { megnevezes: type ? type.megnevezes : '', kategoria: type ? type.kategoria : '', gyarto: '', tipus: '', gyari_szam: '', beszerzes_datum: '',
    felulvizsgalat_nap: 0, megjegyzes: '', raktar: type ? type.raktar : '', polc: type ? type.polc : '', tetel_id: type ? type.tetel_id : '' };
  const cats = [...new Set(tools().map(x => x.kategoria).filter(Boolean))];
  const makers = [...new Set(tools().map(x => x.gyarto).filter(Boolean))];
  const cyc = Number(v.felulvizsgalat_nap) || 0;
  return modal({
    title: isNew ? 'Új eszköz' : `Eszköz módosítása – ${e.azonosito}`,
    body: html`
      ${sec('Alapadatok', html`
        <label class="field span-2"><span>Típus ${help('Az eszköztípus a cikktörzsben (Törzsadatok → Tételek, „Eszköz” készletezéssel): ott vannak a beszállítók, cikkszámok, és a min. / cél darabszám a rendelési javaslathoz. Több azonos eszköz (pl. 3 db ugyanolyan fúró) egy típushoz tartozik.')}</span>
          <select name="tetel_id">${typeOptions(v.tetel_id)}</select></label>
        <label class="field"><span>Azonosító ${help('A címkére kerülő egyedi kód. Újnál a következő sorszámot ajánlja fel; ha már van saját jelölésetek, átírható.')}</span><input name="azonosito" value="${code}" maxlength="30" autocomplete="off"></label>
        <label class="field"><span>Kategória</span>${suggestInput('kategoria', v.kategoria, cats, 'pl. Elektromos kéziszerszám')}</label>
        <label class="field span-2"><span>Megnevezés *</span><input name="megnevezes" value="${v.megnevezes}" placeholder="pl. Akkus fúró-csavarozó 18 V" maxlength="200"></label>
        <label class="field"><span>Gyártó</span>${suggestInput('gyarto', v.gyarto, makers)}</label>
        <label class="field"><span>Modell</span><input name="tipus" value="${v.tipus}" placeholder="pl. DDF484"></label>
        <label class="field"><span>Gyári szám</span><input name="gyari_szam" value="${v.gyari_szam}"></label>
        <label class="field"><span>Beszerzés dátuma</span><input type="date" name="beszerzes_datum" value="${isoToInput(v.beszerzes_datum)}" max="${todayInput()}"></label>`)}
      ${sec(html`Tárolási hely ${help('Ahol az eszköz bent van (ide kerül vissza visszavételkor). A polccímke beolvasásakor az itt tárolt eszközök is megjelennek.')}`, html`
        <label class="field"><span>Raktár</span>${listSelect('raktar', 'raktar', v.raktar || (isNew ? store.warehouses()[0] || '' : ''))}</label>
        <label class="field"><span>Polc / hely</span>${suggestInput('polc', v.polc || '', [...new Set([...tools().map(x => x.polc), ...store.shelves()].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'hu')), 'pl. SZ1')}</label>`)}
      ${sec(html`Időszakos felülvizsgálat ${help('Pl. elektromos kéziszerszámok érintésvédelmi felülvizsgálata. Az esedékességet az utolsó rögzített felülvizsgálattól (ennek hiányában a beszerzéstől) számolja; a lejártakat piros csík jelzi.')}`, html`
        <label class="field"><span>Gyakoriság</span><select name="felulvizsgalat_nap">${CYCLES.map(([n, l]) => html`<option value="${n}" ${n === cyc ? 'selected' : ''}>${l}</option>`)}
          ${cyc && !CYCLES.some(c => c[0] === cyc) ? html`<option value="${cyc}" selected>${cyc} naponta</option>` : ''}</select></label>`)}
      ${sec('Megjegyzés', html`<textarea name="megjegyzes" maxlength="2000">${v.megjegyzes}</textarea>`, 'col')}`,
    onMount: el => {
      bindListSelects(el);
      // Típusváltás: üres mezőket a típus adataival tölt ki; „+ Új eszköztípus…”: gyors felvétel, majd kiválasztja
      const sel = el.querySelector('[name=tetel_id]');
      let prev = sel.value;
      sel.addEventListener('change', async () => {
        let t = null;
        if (sel.value === '__new') {
          t = await quickAddItem(el.querySelector('[name=megnevezes]').value.trim(), '', { keszletezes: 'eszkoz', mertekegyseg: 'db' });
          sel.innerHTML = String(typeOptions(t ? t.tetel_id : prev));
          if (!t) return;
        } else t = store.get('Tetelek', sel.value);
        prev = sel.value;
        if (!t) return;
        const fill = (name, val) => { const inp = el.querySelector(`[name=${name}]`); if (inp && !inp.value.trim() && val) inp.value = val; };
        fill('megnevezes', t.megnevezes); fill('kategoria', t.kategoria); fill('polc', t.polc);
      });
    },
    actions: [{ label: 'Mégse', value: null }, {
      label: isNew ? 'Felvétel' : 'Mentés', kind: 'primary', onClick: async el => {
        const f = formValues(el);
        if (!f.megnevezes.trim()) { toast('A megnevezés kötelező.', 'warn'); return false; }
        const azon = f.azonosito.trim().toUpperCase();
        const eszkoz = { eszkoz_id: e ? e.eszkoz_id : L.newId('E', 10), azonosito: azon, megnevezes: f.megnevezes, kategoria: f.kategoria,
          gyarto: f.gyarto, tipus: f.tipus, gyari_szam: f.gyari_szam, beszerzes_datum: f.beszerzes_datum ? dateInputToIso(f.beszerzes_datum) : '',
          felulvizsgalat_nap: Number(f.felulvizsgalat_nap) || 0, tetel_id: f.tetel_id === '__new' ? '' : f.tetel_id, megjegyzes: f.megjegyzes,
          raktar: f.raktar || '', polc: (f.polc || '').trim() };
        // autoKod: a felajánlott sorszámot nem írták át → ha közben (offline) máshol kiosztották, a szerver a következőt adja
        try { await store.enqueue({ type: 'eszkoz_mentes', eszkoz, autoKod: isNew && azon === code }); }
        catch (x) { toast(x.message, 'error', 6000); return false; }
        toast(isNew ? `Eszköz felvéve (${azon})` : 'Mentve', 'ok');
      },
    }],
  }).done;
}

/* ---------- Elismervény ---------- */
const DOC_TITLE = { KIADAS: 'Átadás-átvételi elismervény', VISSZAVETEL: 'Eszköz visszavételi elismervény' };
const DOC_TEXT = {
  KIADAS: 'Alulírott a fenti eszközöket hiánytalanul, működőképes állapotban átvettem. Rendeltetésszerű használatukért és megóvásukért felelősséggel tartozom, munkaviszonyom / megbízásom megszűnésekor visszaadom.',
  VISSZAVETEL: 'A fenti eszközöket a megjelölt állapotban visszavettük.',
};
/**
 * Elismervény tartalma. d: { tipus, bizonylat, datum, kinel, munka?, rows: [{ e, allapot? }] (eszközök),
 * anyag?: [{ t, q }] (a közös kiadás anyagai), sigs: [{ nev, rajz, szerep }], atado }
 */
export function receiptHtml(d) {
  const sig = d.sigs.find(s => s.szerep !== 'raktar');
  const own = d.sigs.find(s => s.szerep === 'raktar');
  const blank = html`<div style="height:4rem"></div>`;
  const anyag = d.anyag || [];
  return html`<div class="doc">
    <h1>${DOC_TITLE[d.tipus] || 'Elismervény'}</h1>
    <div class="doc-meta">
      <span>Bizonylat:</span><b>${d.bizonylat}</b>
      <span>Dátum:</span><span>${fmtDate(d.datum, true)}</span>
      <span>${d.tipus === 'KIADAS' ? 'Átvevő' : 'Visszaadó'}:</span><b>${personName(d.kinel)}</b>
      <span>${d.tipus === 'KIADAS' ? 'Átadó' : 'Átvevő'} (raktár):</span><span>${store.userName(d.atado)}</span>
      ${d.munka ? html`<span>Munka / projekt:</span><span>${d.munka}</span>` : ''}
    </div>
    ${d.rows.length ? html`<table><thead><tr><th>Azonosító</th><th>Eszköz</th><th>Gyártó, modell</th><th>Gyári szám</th>${d.tipus === 'VISSZAVETEL' ? html`<th>Állapot</th>` : ''}</tr></thead>
      <tbody>${d.rows.map(r => html`<tr><td>${r.e.azonosito}</td><td>${r.e.megnevezes}</td><td>${[r.e.gyarto, r.e.tipus].filter(Boolean).join(' ')}</td><td>${r.e.gyari_szam}</td>
        ${d.tipus === 'VISSZAVETEL' ? html`<td>${L.TOOL_STATE[r.allapot] || 'Rendben'}</td>` : ''}</tr>`)}</tbody></table>` : ''}
    ${anyag.length ? html`<table><thead><tr><th>Anyag</th><th>Mennyiség</th></tr></thead>
      <tbody>${anyag.map(a => html`<tr><td>${a.t.megnevezes}</td><td>${fmtNum(a.q)} ${a.t.mertekegyseg}</td></tr>`)}</tbody></table>` : ''}
    <p>${d.rows.length ? DOC_TEXT[d.tipus] || '' : 'Alulírott a fenti anyagokat átvettem.'}${d.rows.length && anyag.length ? ' A felsorolt anyagokat átvettem.' : ''}</p>
    ${d.megjegyzes ? html`<p>Megjegyzés: ${d.megjegyzes}</p>` : ''}
    <div class="doc-signs">
      <div>${own ? signatureSvg(own.rajz) : blank}<div class="doc-sign">${d.tipus === 'KIADAS' ? 'átadó' : 'átvevő'} (${store.userName(d.atado)})</div></div>
      <div>${sig ? signatureSvg(sig.rajz) : blank}<div class="doc-sign">${d.tipus === 'KIADAS' ? 'átvevő' : 'visszaadó'} (${sig ? sig.nev : personName(d.kinel)})</div></div>
    </div>
    ${sealNote(d)}</div>`;
}
/**
 * Az elismervény alján: elektronikus rögzítés, és ha a szerver ellenőrizte, a lenyomat eredménye
 * (sértetlen + ellenőrző kód, ill. figyelmeztetés, ha a rögzítés után módosították).
 */
function sealNote(d) {
  if (!d.sigs.length) return '';
  const base = `Elektronikusan rögzítve az alkalmazásban: ${fmtDate(d.datum, true)}, rögzítette: ${store.userName(d.atado)}.`;
  if (d.sigs.some(s => s.hiteles === false)) return html`<p class="doc-note doc-bad">${base} FIGYELEM: az aláírás vagy az átadás adatai a rögzítés után módosultak – az elismervény adatai nem egyeznek az eredetivel.</p>`;
  if (d.sigs.every(s => s.hiteles === true)) return html`<p class="doc-note">${base} Sértetlenség ellenőrizve (ellenőrző kód: ${d.sigs.map(s => s.kod).join(', ')}).</p>`;
  return html`<p class="doc-note">${base}</p>`;
}

/** Egy korábbi átadás (kiadás / visszavétel) elismervénye a bizonylat minden sorából; az aláírást a szerverről kéri le (csak online). */
export async function printReceipt(bizonylat) {
  const all = store.state.db.Mozgasok.filter(m => m.bizonylat === bizonylat && (m.eszkoz_id || m.tipus === 'KIVET'));
  if (!all.length) return;
  let sigs = [];
  try { sigs = await store.signatures(bizonylat); }
  catch (x) { toast('Az aláírás csak online tölthető le – az elismervény aláírás nélkül készül.', 'warn', 5000); }
  if (sigs.some(s => s.hiteles === false)) toast('Figyelem: ennek az átadásnak az adatai vagy az aláírása a rögzítés után módosultak.', 'error', 8000);
  const evs = all.filter(m => m.eszkoz_id), first = evs[0] || all[0];
  const rows = evs.map(ev => ({ e: store.get('Eszkozok', ev.eszkoz_id) || { azonosito: '?', megnevezes: ev.eszkoz_id }, allapot: ev.allapot }));
  const anyag = all.filter(m => !m.eszkoz_id).map(m => ({ t: store.itemOrStub(m.tetel_id), q: m.mennyiseg }));
  printDoc(receiptHtml({ tipus: evs.length ? first.tipus : 'KIADAS', bizonylat, datum: first.datum, kinel: first.atvevo, munka: first.munka,
    rows, anyag, sigs, atado: first.felhasznalo, megjegyzes: first.megjegyzes }));
}

/** Nyomtatható lista egy személynél lévő eszközökről (pl. kilépéskor), aláírási helyekkel. */
function printPersonList(kinel) {
  const st = states();
  const list = tools().filter(e => st[e.eszkoz_id].hely === 'kiadva' && st[e.eszkoz_id].kinel === kinel);
  printDoc(html`<div class="doc"><h1>Nála lévő eszközök</h1>
    <div class="doc-meta"><span>Személy:</span><b>${personName(kinel)}</b><span>Dátum:</span><span>${fmtDate(new Date().toISOString(), true)}</span></div>
    <table><thead><tr><th>Azonosító</th><th>Megnevezés</th><th>Gyári szám</th><th>Kiadva</th><th>Visszaadva</th></tr></thead>
      <tbody>${list.map(e => html`<tr><td>${e.azonosito}</td><td>${e.megnevezes}</td><td>${e.gyari_szam}</td><td>${fmtDate(st[e.eszkoz_id].miota)}</td><td></td></tr>`)}</tbody></table>
    <div class="doc-signs"><div><div style="height:4rem"></div><div class="doc-sign">raktár</div></div><div><div style="height:4rem"></div><div class="doc-sign">${personName(kinel)}</div></div></div></div>`);
}

/** Kiadható-e most az eszköz (raktárban van, nem selejtezett / elveszett). */
export const toolAvailable = (e, st = states()) => !!e && st[e.eszkoz_id]?.hely === 'raktar' && e.allapot !== 'selejtezve' && e.allapot !== 'elveszett';

/**
 * Eszközkereső egy beviteli mezőhöz (a tételkereső mintájára, .picker-list): gépelésre a találatok, kattintásra / Enterre onPick(eszköz).
 * opts: { items: () => [eszköz], onPick(eszköz) }
 */
export function attachToolPicker(input, { items, onPick }) {
  const wrap = input.closest('.picker') || input.parentElement;
  let list = null, found = [], hl = 0;
  const close = () => { if (list) { list.remove(); list = null; } };
  const show = () => {
    close();
    const q = input.value.trim();
    if (!q) return;
    const match = matcher(q);
    found = items().filter(e => match(`${e.azonosito} ${e.megnevezes} ${e.kategoria} ${e.gyari_szam}`)).slice(0, 20);
    list = document.createElement('div');
    list.className = 'picker-list';
    list.innerHTML = String(found.length ? html`${found.map((e, i) => html`<button type="button" data-i="${i}" class="${i === hl ? 'hl' : ''}"><b>${e.azonosito}</b> ${e.megnevezes}
      <div class="small muted">${[e.kategoria, placeOf(e)].filter(Boolean).join(' · ')}</div></button>`)}` : html`<div class="empty small">Nincs kiadható ilyen eszköz.</div>`);
    wrap.appendChild(list);
    list.addEventListener('mousedown', ev => ev.preventDefault());
    list.addEventListener('click', ev => { const b = ev.target.closest('[data-i]'); if (b) pick(found[Number(b.dataset.i)]); });
  };
  const pick = e => { if (!e) return; input.value = ''; close(); onPick(e); };
  input.addEventListener('input', () => { hl = 0; show(); });
  input.addEventListener('blur', () => setTimeout(close, 150));
  input.addEventListener('keydown', ev => {
    if (!list) return;
    if (ev.key === 'ArrowDown') { hl = Math.min(hl + 1, found.length - 1); show(); ev.preventDefault(); }
    else if (ev.key === 'ArrowUp') { hl = Math.max(hl - 1, 0); show(); ev.preventDefault(); }
    else if (ev.key === 'Enter') { pick(found[hl]); ev.preventDefault(); }
    else if (ev.key === 'Escape') close();
  });
}

/**
 * Aláírások bekérése egy átadáshoz: a személyé (ajánlott) és opcionálisan a rögzítő raktárosé.
 * Visszaad: [aláírás] (üres, ha aláírás nélkül rögzítik), vagy null (Mégse).
 */
export async function askSignatures({ title, personLabel, ownLabel, personName: who, summary }) {
  let pad = null, ownPad = null;
  return modal({
    title,
    body: html`${summary || ''}
      ${sec(html`Aláírás – ${personLabel}: ${who} <span style="font-weight:400;text-transform:none;letter-spacing:0">(ajánlott)</span>`, html`<div data-sig></div>`, 'col')}
      <button type="button" class="btn btn-sm" data-own style="margin-top:.75rem">+ Saját aláírásom (${ownLabel})</button>
      <div data-ownsec hidden>${sec(html`Aláírás – ${ownLabel}: ${store.userName(store.state.user.email)}`, html`<div data-sig2></div>`, 'col')}</div>`,
    onMount: el => {
      pad = signaturePad(el.querySelector('[data-sig]'));
      el.querySelector('[data-own]').addEventListener('click', ev => {
        ev.target.hidden = true;
        el.querySelector('[data-ownsec]').hidden = false;
        ownPad = signaturePad(el.querySelector('[data-sig2]'));
      });
    },
    actions: [{ label: 'Mégse', value: null }, {
      label: 'Rögzítés', kind: 'primary', onClick: async () => {
        const rajz = pad.value(), own = ownPad ? ownPad.value() : '';
        if (!rajz && !(await confirmDialog('Aláírás nélkül?', 'Az átadás aláírás nélkül kerül rögzítésre. Folytatod?', 'Rögzítés'))) return false;
        return [
          ...(rajz ? [{ alairas_id: L.newId('A', 10), nev: who, szerep: 'szemely', rajz }] : []),
          ...(own ? [{ alairas_id: L.newId('A', 10), nev: store.userName(store.state.user.email), szerep: 'raktar', rajz: own }] : []),
        ];
      },
    }],
  }).done;
}

/** A „Kinél mi van” lista (személyenként a kint lévő eszközök) – az Eszközök oldal füle és a Visszavétel oldal is ezt mutatja. */
export { peopleHtml, printPersonList };

/* ---------- Kiadás / visszavétel ---------- */
/**
 * Kiadás vagy visszavétel több eszközre, egy bizonylaton, opcionális aláírással.
 * preset: { ids: [eszkoz_id], kinel } – pl. az adatlapról vagy a „Kinél mi van” listáról.
 */
export async function handover(tipus, preset = {}) {
  const kiadas = tipus === 'KIADAS';
  const st = states();
  const holders = [...new Set(tools().map(e => st[e.eszkoz_id]).filter(s => s.hely === 'kiadva').map(s => s.kinel))];
  if (!kiadas && !holders.length) return toast('Nincs kiadott eszköz.', 'warn');
  const avail = e => (kiadas ? st[e.eszkoz_id].hely === 'raktar' && e.allapot !== 'selejtezve' && e.allapot !== 'elveszett' : st[e.eszkoz_id].hely === 'kiadva');
  const pre = new Set(preset.ids || []);
  let pad = null, ownPad = null;
  const listFor = (kinel, q) => {
    const match = matcher(q);
    return tools().filter(e => avail(e) && (kiadas || st[e.eszkoz_id].kinel === kinel) && (pre.has(e.eszkoz_id) || match(`${e.azonosito} ${e.megnevezes} ${e.kategoria}`)))
      .sort((a, b) => a.azonosito.localeCompare(b.azonosito, 'hu', { numeric: true }));
  };
  const rowsHtml = (kinel, q) => {
    const list = listFor(kinel, q);
    return list.length ? html`${list.map(e => html`<label class="check-row">
        <input type="checkbox" data-id="${e.eszkoz_id}" ${pre.has(e.eszkoz_id) ? 'checked' : ''}>
        <span class="grow"><b>${e.azonosito}</b> ${e.megnevezes}${e.allapot !== 'rendben' ? html` ${stateBadge(e.allapot)}` : ''}</span>
        ${kiadas ? '' : html`<select data-st="${e.eszkoz_id}" aria-label="Állapot visszavételkor"><option value="">Rendben</option><option value="javitando">Javítandó</option><option value="elveszett">Elveszett</option></select>`}
      </label>`)}` : html`<div class="empty small">${kiadas ? 'Nincs kiadható eszköz a raktárban.' : 'Válaszd ki, kitől veszed vissza.'}</div>`;
  };
  const kinel0 = preset.kinel || '';
  const res = await modal({
    title: kiadas ? 'Eszközök kiadása' : 'Eszközök visszavétele',
    wide: true,
    body: html`
      ${sec(kiadas ? 'Kinek' : 'Kitől', kiadas
        ? html`<label class="field span-2"><span>Átvevő *</span>${suggestInput('kinel', kinel0 ? personName(kinel0) : '', store.userNames(), 'kolléga neve, vagy külsős (név, cég)')}</label>`
        : html`<label class="field span-2"><span>Visszaadó *</span><select name="kinel"><option value="">— válassz —</option>
            ${holders.map(h => html`<option value="${h}" ${h === kinel0 ? 'selected' : ''}>${personName(h)}</option>`)}</select></label>`)}
      ${sec('Eszközök', html`
        <div class="toolbar" style="margin-bottom:.5rem">
          ${kiadas ? html`<input type="search" data-q placeholder="Keresés (azonosító, név)…">` : ''}
          ${scanButton('scanpick', 'Eszközcímkék beolvasása (kijelölés)')}</div>
        <div class="check-list" data-list>${rowsHtml(kinel0, '')}</div>`, 'col')}
      ${sec('Megjegyzés', html`<input name="megjegyzes" placeholder="opcionális" maxlength="500">`, 'col')}
      ${sec(html`Aláírás – ${kiadas ? 'átvevő' : 'visszaadó'} <span style="font-weight:400;text-transform:none;letter-spacing:0">(ajánlott)</span>`, html`<div data-sig></div>`, 'col')}
      <button type="button" class="btn btn-sm" data-own style="margin-top:.75rem">+ Saját aláírásom (${kiadas ? 'átadó' : 'átvevő'})</button>
      <div data-ownsec hidden>${sec(html`Aláírás – ${kiadas ? 'átadó' : 'átvevő'}: ${store.userName(store.state.user.email)}`, html`<div data-sig2></div>`, 'col')}</div>`,
    onMount: el => {
      pad = signaturePad(el.querySelector('[data-sig]'));
      // A raktáros saját aláírása opcionális (a bejelentkezés amúgy is azonosítja): gombra nyílik
      el.querySelector('[data-own]').addEventListener('click', e => {
        e.target.hidden = true;
        el.querySelector('[data-ownsec]').hidden = false;
        ownPad = signaturePad(el.querySelector('[data-sig2]'));
      });
      const list = el.querySelector('[data-list]');
      const kinelOf = () => el.querySelector('[name=kinel]').value;
      // A kijelölés a keresés / személyváltás után is megmarad
      list.addEventListener('change', e => { const id = e.target.dataset.id; if (id) { if (e.target.checked) pre.add(id); else pre.delete(id); } });
      el.querySelector('[data-q]')?.addEventListener('input', e => { list.innerHTML = String(rowsHtml('', e.target.value)); });
      if (!kiadas) el.querySelector('[name=kinel]').addEventListener('change', () => {
        pre.clear(); listFor(kinelOf(), '').forEach(e => pre.add(e.eszkoz_id)); // a nála lévők alapból kijelölve
        list.innerHTML = String(rowsHtml(kinelOf(), ''));
      });
      // Címkék beolvasása egymás után: a beolvasott eszköz kijelölődik
      el.querySelector('[data-a="scanpick"]')?.addEventListener('click', () => scanCodes({
        title: kiadas ? 'Kiadandó eszközök beolvasása' : 'Visszavett eszközök beolvasása', keepOpen: true,
        hint: 'Olvasd be egymás után az eszközök címkéjét, majd „Kész”.',
        onCode: c => {
          const e = c && c.tipus === 'eszkoz' ? codeItem(c) : null;
          if (!e || !avail(e) || (!kiadas && st[e.eszkoz_id].kinel !== kinelOf())) return false;
          pre.add(e.eszkoz_id);
          list.innerHTML = String(rowsHtml(kiadas ? '' : kinelOf(), el.querySelector('[data-q]')?.value || ''));
          return `✓ ${e.azonosito} kijelölve – összesen ${pre.size}`;
        },
      }));
      if (!kiadas && kinel0 && !preset.ids) { listFor(kinel0, '').forEach(e => pre.add(e.eszkoz_id)); list.innerHTML = String(rowsHtml(kinel0, '')); }
    },
    actions: [{ label: 'Mégse', value: null }, {
      label: kiadas ? 'Kiadás rögzítése' : 'Visszavétel rögzítése', kind: 'primary', onClick: async el => {
        const kinelText = el.querySelector('[name=kinel]').value.trim();
        if (!kinelText) { toast(kiadas ? 'Add meg, kinek adod ki.' : 'Válaszd ki, kitől veszed vissza.', 'warn'); return false; }
        const ids = [...pre].filter(id => { const e = store.get('Eszkozok', id); return e && avail(e) && (kiadas || st[id].kinel === kinelText); });
        if (!ids.length) { toast('Jelölj ki legalább egy eszközt.', 'warn'); return false; }
        const kinel = kiadas ? store.personKey(kinelText) : kinelText;
        const megjegyzes = el.querySelector('[name=megjegyzes]').value.trim();
        const rajz = pad.value();
        if (!rajz && !(await confirmDialog('Aláírás nélkül?', 'Az átadás aláírás nélkül kerül rögzítésre. Folytatod?', 'Rögzítés'))) return false;
        const now = new Date();
        const bizonylat = `${kiadas ? 'AT' : 'VV'}-${dateStamp(now)}-${L.newId('', 4)}`;
        const rows = ids.map(id => ({ mozgas_id: L.newId('M', 12), eszkoz_id: id, tipus: tipus, datum: now.toISOString(), atvevo: kinel, bizonylat,
          allapot: kiadas ? '' : (el.querySelector(`[data-st="${id}"]`)?.value || ''), megjegyzes }));
        const ownRajz = ownPad ? ownPad.value() : '';
        const alairasok = [
          ...(rajz ? [{ alairas_id: L.newId('A', 10), nev: personName(kinel), szerep: 'szemely', rajz }] : []),
          ...(ownRajz ? [{ alairas_id: L.newId('A', 10), nev: store.userName(store.state.user.email), szerep: 'raktar', rajz: ownRajz }] : []),
        ];
        try { await store.enqueue({ type: 'mozgasok', bizonylat, rows, ...(alairasok.length ? { alairasok } : {}) }); }
        catch (x) { toast(x.message, 'error', 6000); return false; }
        toast(kiadas ? `${ids.length} eszköz kiadva` : `${ids.length} eszköz visszavéve`, 'ok');
        return { tipus, bizonylat, datum: now.toISOString(), kinel, megjegyzes, atado: store.state.user.email,
          rows: rows.map(r => ({ e: store.get('Eszkozok', r.eszkoz_id), allapot: r.allapot })), sigs: alairasok };
      },
    }],
  }).done;
  if (res && res.bizonylat && await confirmDialog('Elismervény', 'Kinyomtatod (vagy PDF-be mented) az elismervényt?', 'Nyomtatás')) printDoc(receiptHtml(res));
  return res;
}

/** Egyszerű esemény egy eszközön: szervizbe / szervizből, állapot, felülvizsgálat, selejtezés. */
async function toolEvent(e, tipus) {
  const states0 = Object.keys(L.TOOL_STATE).filter(k => k !== 'szervizben' && k !== 'selejtezve');
  const fields = {
    SZERVIZ: html`<label class="field span-2"><span>Szerviz</span>${suggestInput('kinel', '', [...new Set(events().filter(x => x.tipus === 'SZERVIZ').map(x => x.atvevo).filter(Boolean))], 'pl. Makita szerviz')}</label>`,
    SZERVIZBOL: html`<label class="field"><span>Állapot</span><select name="allapot">${states0.map(k => html`<option value="${k}">${L.TOOL_STATE[k]}</option>`)}</select></label>`,
    ALLAPOT: html`<label class="field"><span>Új állapot</span><select name="allapot">${states0.map(k => html`<option value="${k}" ${k === e.allapot ? 'selected' : ''}>${L.TOOL_STATE[k]}</option>`)}</select></label>`,
    FELULVIZSGALAT: html`<label class="field"><span>Dátum</span><input type="date" name="datum" value="${todayInput()}" max="${todayInput()}"></label>
      <label class="field"><span>Eredmény</span><select name="allapot"><option value="">Megfelelt</option><option value="javitando">Nem felelt meg (javítandó)</option></select></label>`,
    SELEJTEZES: '',
  }[tipus];
  const need = tipus === 'SELEJTEZES';
  const ok = await modal({
    title: `${L.TOOL_EVENTS[tipus]} – ${toolName(e)}`,
    body: html`${sec('Adatok', html`${fields}
      <label class="field span-2"><span>${need ? 'Indoklás *' : 'Megjegyzés'}</span><input name="megjegyzes" maxlength="500" placeholder="${need ? 'pl. javíthatatlan, elavult' : 'opcionális'}"></label>`)}`,
    actions: [{ label: 'Mégse', value: null }, {
      label: 'Rögzítés', kind: need ? 'danger' : 'primary', onClick: async el => {
        const f = formValues(el);
        if (need && !f.megjegyzes.trim()) { toast('A selejtezéshez indoklás kell.', 'warn'); return false; }
        const row = { mozgas_id: L.newId('M', 12), eszkoz_id: e.eszkoz_id, tipus, datum: f.datum ? dateInputToIso(f.datum) : new Date().toISOString(),
          atvevo: f.kinel || '', allapot: f.allapot || '', megjegyzes: f.megjegyzes || '', bizonylat: '' };
        try { await store.enqueue({ type: 'mozgasok', rows: [row] }); }
        catch (x) { toast(x.message, 'error', 6000); return false; }
        toast(`${L.TOOL_EVENTS[tipus]} rögzítve`, 'ok');
      },
    }],
  }).done;
  return ok;
}

/* ---------- Adatlap ---------- */
function showTool(id) {
  const e = store.get('Eszkozok', id);
  if (!e) return;
  const s = states()[id];
  const boss = store.can('raktaros');
  const gone = e.allapot === 'selejtezve';
  const hist = events().filter(ev => ev.eszkoz_id === id).sort((a, b) => (a.datum !== b.datum ? (a.datum < b.datum ? 1 : -1) : (a.rogzitve < b.rogzitve ? 1 : -1)));
  const cyc = CYCLES.find(c => c[0] === Number(e.felulvizsgalat_nap));
  const acts = boss && !gone ? [
    ...(s.hely === 'raktar' ? [['KIADAS', 'Kiadás…', 'primary'], ['SZERVIZ', 'Szervizbe…'], ['SELEJTEZES', 'Selejtezés…', 'link-danger']] : []),
    ...(s.hely === 'kiadva' ? [['VISSZAVETEL', 'Visszavétel…', 'primary']] : []),
    ...(s.hely === 'szerviz' ? [['SZERVIZBOL', 'Szervizből vissza…', 'primary']] : []),
    ['FELULVIZSGALAT', 'Felülvizsgálat…'], ['ALLAPOT', 'Állapot…'], ['EDIT', 'Módosítás'],
  ] : [];
  const m = modal({
    title: toolName(e),
    wide: true,
    body: html`
      <div class="facts facts-row">
        <div><dt>Állapot</dt><dd>${stateBadge(e.allapot)}</dd></div>
        <div><dt>Hol van</dt><dd>${where(s, e)}${s.miota ? html` <span class="small muted">(${fmtDate(s.miota)} óta)</span>` : ''}</dd></div>
        ${s.hely !== 'raktar' && placeOf(e) ? html`<div><dt>Tárolási hely</dt><dd>${placeOf(e)}</dd></div>` : ''}
        ${store.get('Tetelek', e.tetel_id) ? html`<div><dt>Típus</dt><dd><a href="#" data-x="TYPE">${store.get('Tetelek', e.tetel_id).megnevezes}</a></dd></div>` : ''}
        ${e.kategoria ? html`<div><dt>Kategória</dt><dd>${e.kategoria}</dd></div>` : ''}
        ${e.gyarto || e.tipus ? html`<div><dt>Gyártó, modell</dt><dd>${[e.gyarto, e.tipus].filter(Boolean).join(' ')}</dd></div>` : ''}
        ${e.gyari_szam ? html`<div><dt>Gyári szám</dt><dd>${e.gyari_szam}</dd></div>` : ''}
        ${e.beszerzes_datum ? html`<div><dt>Beszerzés</dt><dd>${fmtDate(e.beszerzes_datum)}</dd></div>` : ''}
        ${Number(e.felulvizsgalat_nap) ? html`<div><dt>Felülvizsgálat</dt><dd>${cyc ? cyc[1].toLowerCase() : `${e.felulvizsgalat_nap} naponta`} · következő: ${fvText(s)}</dd></div>` : ''}
      </div>
      ${e.megjegyzes ? html`<p class="small" style="white-space:pre-line">${e.megjegyzes}</p>` : ''}
      ${acts.length ? html`<div class="toolbar" style="margin:1rem 0 0">${acts.map(([k, l, kind]) => html`<button class="btn btn-sm ${kind ? 'btn-' + kind : ''}" data-x="${k}">${l}</button>`)}</div>` : ''}
      <h3 style="margin:1.25rem 0 .5rem">Előzmények</h3>
      ${hist.length ? html`<div class="table-wrap"><table class="tbl small cards nochk flow">
        <thead><tr><th>Dátum</th><th>Esemény</th><th>Kinél / kitől</th><th>Megjegyzés</th><th>Rögzítette</th></tr></thead>
        <tbody>${hist.map(ev => html`<tr>
          <td class="c-meta nowrap">${fmtDate(ev.datum, true)}</td>
          <td class="c-main">${L.TOOL_EVENTS[ev.tipus] || ev.tipus}${ev.allapot && ev.tipus !== 'SZERVIZ' && ev.tipus !== 'SELEJTEZES' ? html` · ${stateBadge(ev.allapot)}` : ''}
            ${ev.bizonylat ? html`<div class="small"><a href="#" data-biz="${ev.bizonylat}" title="Elismervény nyomtatása">${ev.bizonylat}</a></div>` : ''}</td>
          <td data-l="Kinél">${ev.atvevo ? personName(ev.atvevo) : '–'}</td>
          <td data-l="Megjegyzés">${ev.megjegyzes || '–'}</td>
          <td data-l="Rögzítette">${store.userName(ev.felhasznalo)}</td></tr>`)}</tbody></table></div>`
        : html`<div class="empty small">Még nincs esemény.</div>`}`,
    actions: [{ label: 'Bezárás', value: null }],
    onMount: el => el.addEventListener('click', async ev => {
      const biz = ev.target.closest('[data-biz]');
      if (biz) { ev.preventDefault(); return printReceipt(biz.dataset.biz); }
      const b = ev.target.closest('[data-x]');
      if (!b) return;
      const x = b.dataset.x;
      ev.preventDefault();
      m.close();
      if (x === 'TYPE') return showItemDetail(e.tetel_id);
      const r = x === 'EDIT' ? await editTool(e) : x === 'KIADAS' || x === 'VISSZAVETEL' ? await handover(x, { ids: [id], kinel: s.kinel }) : await toolEvent(e, x);
      if (r !== undefined) showTool(id); // a művelet után (vagy Mégse) vissza az adatlapra
    }),
  });
}

/**
 * Beérkezés után: ha eszköztípus is érkezett, felajánlja az egyedi darabok felvételét (azonosító, gyári szám).
 * rows: a rögzített BEERKEZES mozgások. A darabok a típus nevét, kategóriáját és helyét kapják; később módosíthatók.
 */
export async function addUnitsAfterReceipt(rows) {
  const groups = [];
  rows.forEach(r => {
    const t = store.get('Tetelek', r.tetel_id);
    const n = Math.floor(Number(r.mennyiseg) || 0);
    if (L.isToolItem(t) && n > 0) groups.push({ t, n: Math.min(n, 50) });
  });
  if (!groups.length || !store.can('raktaros')) return;
  const total = groups.reduce((a, g) => a + g.n, 0);
  if (!(await confirmDialog('Eszközök felvétele', `${total} db eszköz érkezett (${groups.map(g => g.t.megnevezes).join(', ')}). Felveszed most az egyedi darabokat (azonosító, gyári szám)? Később az Eszközök oldalon is megteheted.`, 'Felvétel'))) return;
  const first = Number((/^SZ-(\d+)$/.exec(L.nextToolCode(store.state.db)) || [])[1]) || 1;
  let k = 0;
  const lines = groups.flatMap(g => Array.from({ length: g.n }, () => ({ t: g.t, code: 'SZ-' + String(first + k++).padStart(4, '0') })));
  await modal({
    title: 'Beérkezett eszközök felvétele',
    wide: true,
    body: html`<p class="small muted" style="margin-top:0">Az azonosító a címkére kerül (átírható). A gyári szám nem kötelező.</p>
      <div class="table-wrap"><table class="tbl small nochk"><thead><tr><th>Típus</th><th>Azonosító</th><th>Gyári szám</th></tr></thead>
      <tbody>${lines.map((l, i) => html`<tr><td>${l.t.megnevezes}</td>
        <td><input data-c="${i}" value="${l.code}" maxlength="30" style="max-width:9rem"></td>
        <td><input data-g="${i}" placeholder="opcionális"></td></tr>`)}</tbody></table></div>
      ${sec('Időszakos felülvizsgálat', html`<label class="field"><span>Gyakoriság (mindegyiknél)</span><select name="cyc">${CYCLES.map(([n, l]) => html`<option value="${n}">${l}</option>`)}</select></label>`)}`,
    actions: [{ label: 'Később', value: null }, {
      label: `${lines.length} eszköz felvétele`, kind: 'primary', onClick: async el => {
        const cyc = Number(el.querySelector('[name=cyc]').value) || 0;
        const now = new Date().toISOString();
        try {
          for (let i = 0; i < lines.length; i++) {
            const l = lines[i], code = el.querySelector(`[data-c="${i}"]`).value.trim().toUpperCase();
            await store.enqueue({ type: 'eszkoz_mentes', autoKod: code === l.code, eszkoz: { eszkoz_id: L.newId('E', 10), azonosito: code,
              megnevezes: l.t.megnevezes, kategoria: l.t.kategoria, gyarto: '', tipus: '', gyari_szam: el.querySelector(`[data-g="${i}"]`).value.trim(),
              beszerzes_datum: now, felulvizsgalat_nap: cyc, tetel_id: l.t.tetel_id, megjegyzes: '', raktar: l.t.raktar || '', polc: l.t.polc || '' } });
          }
        } catch (x) { toast(x.message, 'error', 6000); return false; }
        toast(`${lines.length} eszköz felvéve`, 'ok');
      },
    }],
  }).done;
}

/** Eszköz adatlapja címkekód alapján (QR-beolvasás). Hamis, ha nincs ilyen eszköz. */
export function openTool(azonosito) {
  const e = tools().find(x => x.azonosito === azonosito);
  if (e) showTool(e.eszkoz_id);
  return !!e;
}

export default {
  render(root) {
    if (root.dataset.view === 'eszkozok' && root.querySelector('[data-body]')) {
      root.querySelector('[data-stats]').innerHTML = String(statsHtml(states()));
      root.querySelector('[data-body]').innerHTML = String(ui.tab === 'lista' ? listHtml() : peopleHtml());
      return;
    }
    root.dataset.view = 'eszkozok';
    const st = states();
    const boss = store.can('raktaros');
    const active = tools().filter(e => e.allapot !== 'selejtezve');
    const mine = active.filter(e => st[e.eszkoz_id].hely === 'kiadva' && String(st[e.eszkoz_id].kinel).toLowerCase() === me()).length;
    const scrapped = tools().length - active.length;
    root.innerHTML = String(html`
      <div class="page-head"><h1>Eszközök</h1>${help(html`Szerszámok, eszközök egyedi nyilvántartása: kinél van, milyen állapotban, mikor esedékes a felülvizsgálat. Egy eszközre kattintva megnyílik az adatlapja az előzményekkel.<br><br>
        <b>Jelölések</b><br><span class="legend-bar st-hiany"></span> piros csík: lejárt felülvizsgálat, javítandó vagy elveszett<br><span class="legend-bar st-figyelem"></span> sárga csík: 30 napon belül esedékes felülvizsgálat<br><br>
        Kiadni a <b>Kiadás</b>, visszavenni a <b>Visszavétel</b> menüpontban lehet (egy eszközt az adatlapjáról is).<br><br>
        A felső számlálókra kattintva szűrhetsz. A „Kinél mi van” fülön személyenként látszik, kinél milyen eszköz van (pl. kilépéskor), és nyomtatható lista készíthető róla.`)}
        ${boss ? html`<div class="actions">
          <button class="btn" data-a="labels" title="QR-címkék nyomtatása">${ICONS.scan} Címkék</button>
          <button class="btn btn-primary" data-a="new">+ Új eszköz</button></div>` : ''}</div>
      <div class="stats" data-stats>${statsHtml(st)}</div>
      <div class="tabs">
        <button class="${ui.tab === 'lista' ? 'active' : ''}" data-tab="lista">Eszközök (${active.length})</button>
        <button class="${ui.tab === 'kinel' ? 'active' : ''}" data-tab="kinel">Kinél mi van</button>
      </div>
      <div class="card">
        ${ui.tab === 'lista' ? html`<div class="toolbar card-toolbar">
          <div class="seg" role="group" aria-label="Megjelenítés">
            <button class="${ui.seg === 'aktiv' ? 'on' : ''}" data-seg="aktiv">Mind</button>
            <button class="${ui.seg === 'nalam' ? 'on' : ''}" data-seg="nalam">Nálam (${mine})</button>
            ${scrapped ? html`<button class="${ui.seg === 'selejt' ? 'on' : ''}" data-seg="selejt">Selejtezett (${scrapped})</button>` : ''}</div>
        </div>` : ''}
        <div class="toolbar card-toolbar">
          <input type="search" data-q placeholder="${ui.tab === 'lista' ? 'Keresés (azonosító, név, gyári szám, kinél)…' : 'Keresés (személy, eszköz)…'}" value="${ui.q}">
          ${ui.tab === 'lista' ? filterButton(ui.f) : ''}
          ${scanButton('scan', 'Eszköz beolvasása')}
        </div>
        <div data-body>${ui.tab === 'lista' ? listHtml() : peopleHtml()}</div>
      </div>`);
    const refresh = () => { root.querySelector('[data-body]').innerHTML = String(ui.tab === 'lista' ? listHtml() : peopleHtml()); };
    const full = () => { delete root.dataset.view; this.render(root); };
    root.querySelector('[data-q]').addEventListener('input', e => { ui.q = e.target.value; refresh(); });
    root.onclick = async e => {
      const fb = e.target.closest('[data-filter]');
      if (fb) return openFilter(fb, groups, ui.f, refresh);
      const tab = e.target.closest('[data-tab]');
      if (tab) { ui.tab = tab.dataset.tab; return full(); }
      const sg = e.target.closest('[data-seg]');
      if (sg) { ui.seg = sg.dataset.seg; return full(); }
      const stb = e.target.closest('[data-stat]');
      if (stb) { ui.stat = ui.stat === stb.dataset.stat ? '' : stb.dataset.stat; ui.tab = 'lista'; if (ui.seg === 'selejt') ui.seg = 'aktiv'; return full(); }
      const b = e.target.closest('[data-a]');
      if (b) {
        const a = b.dataset.a;
        if (a === 'new') return editTool();
        if (a === 'labels') return openLabels('eszkoz');
        if (a === 'scan') return scanCodes({ title: 'Eszköz beolvasása', hint: 'Eszközcímke: megnyílik az adatlapja.',
          onCode: c => (c && c.tipus === 'eszkoz' && openTool(c.azonosito) ? '' : false) });
        if (a === 'ret') return handover('VISSZAVETEL', b.dataset.k ? { kinel: b.dataset.k } : {});
        if (a === 'plist') return printPersonList(b.dataset.k);
      }
      const row = e.target.closest('[data-e]');
      if (row) showTool(row.dataset.e);
    };
  },
};
