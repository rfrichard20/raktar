// Törzsadatok (admin): tételek + beszerzési források, beszállítók, felhasználók.
import * as store from '../store.js';
import { html, fmtNum, fmtMoney, fmtDate, matcher, compare, sortArrow, modal, toast, formValues, parseNum, help, sec, confirmDialog, suggestInput } from '../ui.js';
import { itemSelector, tplIds, listSelect, bindListSelects, filterButton, openFilter, inSel, countOptions } from './common.js';
import { ICONS } from '../icons.js';

const L = window.RaktarLogic;
const ui = {
  tab: 'tetelek', q: '',
  // Szűrők (filterButton): üres = mind; „egyeb” → 'inaktiv': az inaktívak is látszanak
  f: { kat: new Set(), wh: new Set(), sup: new Set(), mod: new Set(), role: new Set(), egyeb: new Set(), kesz: new Set() },
  sort: { tetelek: ['megnevezes', 1], beszallitok: ['nev', 1], felhasznalok: ['nev', 1], sablonok: ['nev', 1], emailek: ['nev', 1] },
};

const CYCLES = [[0, 'nincs'], [30, '30 nap (havonta)'], [60, '60 nap'], [90, '90 nap (negyedévente)'], [180, '180 nap (félévente)'], [365, '365 nap (évente)']];
const ROLE_DESC = {
  admin: 'Minden funkció, törzsadatok és felhasználók kezelése.',
  raktaros: 'Leltár, beérkezés, kivét, rendelés, korrekció, új tétel gyors felvétele.',
  szerelo: 'Készlet megtekintése és kivét rögzítése – árak, rendelések, beszállítók és kimutatások nélkül.',
  olvaso: 'Minden megtekintése (árak, rendelések, kimutatások), módosítás nélkül.',
};

async function runOps(ops) {
  for (const op of ops) await store.enqueue(op);
}
// Szám mező: új rekordnál üres (a javasolt érték csak mintaszöveg), meglévőnél a tényleges érték
const numVal = (isNew, v) => (isNew ? '' : String(v ?? ''));

/* ---------- Tétel szerkesztő (a tétel adatlapjáról is nyílik) ---------- */
/** Tétel szerkesztése / új tétel. Visszaad: Promise, amely az ablak bezárásakor teljesül. */
export function editItem(t, pre = {}) {
  const isNew = !t;
  t = t || { tetel_id: L.newId('T', 6), megnevezes: '', kategoria: '', mertekegyseg: '', raktar: '', polc: '', min_keszlet: 0, cel_keszlet: 0, leltar_ciklus_nap: 90, aktiv: true, megjegyzes: '', keszletezes: '', ...pre };
  const tool = L.isToolItem(t);
  const db = store.state.db;
  const orig = L.sourcesFor(db, t.tetel_id);
  const sups = db.Beszallitok.filter(b => b.aktiv || orig.some(f => f.beszallito_id === b.beszallito_id)).sort((a, b) => a.nev.localeCompare(b.nev, 'hu'));
  const srcRow = f => html`<tr data-fid="${f.forras_id}">
    <td><select data-s="beszallito_id"><option value="">— válassz —</option>${sups.map(b => html`<option value="${b.beszallito_id}" ${b.beszallito_id === f.beszallito_id ? 'selected' : ''}>${b.nev}</option>`)}</select></td>
    <td><input data-s="cikkszam" value="${f.cikkszam}"></td>
    <td><input data-s="kiszereles" inputmode="decimal" value="${f.kiszereles || ''}" placeholder="1" style="width:80px"></td>
    <td><input data-s="egysegar" inputmode="decimal" value="${f.egysegar || ''}" placeholder="Ft" style="width:100px"></td>
    <td><input data-s="link" value="${f.link}" placeholder="opcionális"></td>
    <td style="text-align:center"><label class="star-pick" title="Elsődleges forrás"><input type="radio" name="prim" value="${f.forras_id}" ${f.elsodleges ? 'checked' : ''} aria-label="Elsődleges forrás">${ICONS.star}</label></td>
    <td><button type="button" class="icon-btn" data-del aria-label="Forrás törlése">✕</button></td></tr>`;
  const m = modal({
    title: isNew ? 'Új tétel' : t.megnevezes,
    wide: true,
    body: html`<div data-main>
      ${sec('Alapadatok', html`
        <label class="field span-2"><span>Megnevezés *</span><input name="megnevezes" value="${t.megnevezes}"></label>
        <label class="field span-2"><span>Készletezés ${help(html`<b>Anyag:</b> mennyiségben követett, fogyó tétel (csavar, szilikon, kábel) – Anyagkészlet, leltár, kivét.<br><br><b>Eszköz:</b> eszköztípus (pl. „Akkus fúró-csavarozó 18 V”), amelynek egyedi darabjait az Eszközök oldalon tartjuk nyilván (azonosító, gyári szám, kinél van). A készlete a darabok száma; a minimum / cél a rendelési javaslathoz kell.`)}</span>
          <select name="keszletezes"><option value="" ${tool ? '' : 'selected'}>Anyag (mennyiségben)</option><option value="eszkoz" ${tool ? 'selected' : ''}>Eszköz (egyedi darabok)</option></select></label>
        <label class="field"><span>Kategória</span>${listSelect('kategoria', 'kategoria', t.kategoria)}</label>
        <label class="field"><span>Mértékegység</span>${listSelect('mertekegyseg', 'mertekegyseg', t.mertekegyseg, { defaultFirst: isNew })}</label>`)}
      ${sec('Tárolás', html`
        <label class="field"><span>Raktár</span>${listSelect('raktar', 'raktar', t.raktar)}</label>
        <label class="field"><span>Polc / hely</span>${suggestInput('polc', t.polc, store.shelves(), 'pl. A1')}</label>`)}
      ${sec('Készletszint és leltár', html`
        <label class="field"><span>Minimum készlet</span><input name="min_keszlet" inputmode="decimal" value="${numVal(isNew, t.min_keszlet)}" placeholder="0"></label>
        <label class="field"><span>Célkészlet (eddig pótolunk)</span><input name="cel_keszlet" inputmode="decimal" value="${numVal(isNew, t.cel_keszlet)}" placeholder="0"></label>
        <label class="field" data-leltar ${tool ? 'hidden' : ''}><span>Leltár gyakoriság</span><select name="leltar_ciklus_nap">${CYCLES.map(([v, l]) => html`<option value="${v}" ${Number(t.leltar_ciklus_nap) === v ? 'selected' : ''}>${l}</option>`)}
          ${CYCLES.some(c => c[0] === Number(t.leltar_ciklus_nap)) ? '' : html`<option value="${t.leltar_ciklus_nap}" selected>${t.leltar_ciklus_nap} nap</option>`}</select></label>`)}
      ${sec('Egyéb', html`
        <label class="field span-2"><span>Megjegyzés</span><input name="megjegyzes" value="${t.megjegyzes}"></label>
        <label class="check"><input type="checkbox" name="aktiv" ${t.aktiv ? 'checked' : ''}> Aktív</label>`)}
      </div>
      <section class="fsec"><div class="fsec-title">Beszerzési források ${help('A kiszerelés beszállítónként eltérhet, a rendelési javaslat erre kerekít. Az elsődleges forrás az alapértelmezett. A link opcionális: ha üres, a beszállító webshop-keresője nyílik meg a cikkszámmal.')}</div>
        <div class="table-wrap"><table class="tbl small" id="src">
          <thead><tr><th>Beszállító</th><th>Cikkszám</th><th>Kiszerelés</th><th>Egységár</th><th>Link</th><th title="Elsődleges forrás">${ICONS.star}</th><th></th></tr></thead>
          <tbody>${orig.map(srcRow)}</tbody></table></div>
        <button type="button" class="btn btn-sm" data-addsrc style="margin-top:.5rem">+ Forrás</button></section>`,
    actions: [{ label: 'Mégse', value: null }, {
      label: 'Mentés', kind: 'primary', onClick: async el => {
        const v = formValues(el.querySelector('[data-main]'));
        const toTool = v.keszletezes === 'eszkoz';
        const row = { ...t, ...v, mertekegyseg: v.mertekegyseg || 'db', raktar: v.raktar || (isNew ? store.warehouses()[0] || '' : ''),
          min_keszlet: parseNum(v.min_keszlet) || 0, cel_keszlet: parseNum(v.cel_keszlet) || 0, leltar_ciklus_nap: toTool ? 0 : Number(v.leltar_ciklus_nap) || 0 };
        // Anyagból eszköztípus: a mozgásokból számolt készlet helyett a darabok száma számít
        if (!isNew && toTool && !tool && db.Mozgasok.some(x => x.tetel_id === t.tetel_id) &&
          !(await confirmDialog('Eszköztípussá alakítás', 'Ennek a tételnek vannak készletmozgásai. Eszköztípusként a készlete a hozzá rögzített egyedi eszközök száma lesz (a mozgások megmaradnak, de nem számítanak). Folytatod?', 'Átalakítás'))) return false;
        const prim = el.querySelector('input[name=prim]:checked')?.value;
        const rows = [...el.querySelectorAll('#src tbody tr')];
        const ops = [{ type: 'mentes', table: 'Tetelek', row }];
        const seen = new Set();
        for (const tr of rows) {
          const get = k => tr.querySelector(`[data-s="${k}"]`).value.trim();
          const f = { forras_id: tr.dataset.fid, tetel_id: row.tetel_id, beszallito_id: get('beszallito_id'), cikkszam: get('cikkszam'),
            kiszereles: parseNum(get('kiszereles')) || 1, egysegar: parseNum(get('egysegar')) || 0, link: get('link'),
            elsodleges: prim ? prim === tr.dataset.fid : rows.length === 1, megjegyzes: '' };
          if (!f.beszallito_id) { toast('Minden forrásnál válassz beszállítót (vagy töröld a sort).', 'error'); return false; }
          if (f.link && !/^https?:\/\//i.test(f.link)) { toast('A link http:// vagy https:// kezdetű legyen (különben nem menthető).', 'error'); return false; }
          seen.add(f.forras_id);
          const o = orig.find(x => x.forras_id === f.forras_id);
          const changed = !o || ['beszallito_id', 'cikkszam', 'kiszereles', 'egysegar', 'link', 'elsodleges'].some(k => String(o[k]) !== String(f[k]));
          if (changed) ops.push({ type: 'mentes', table: 'Forrasok', row: { ...(o || {}), ...f } });
        }
        orig.filter(o => !seen.has(o.forras_id)).forEach(o => ops.push({ type: 'torles', table: 'Forrasok', id: o.forras_id }));
        try { await runOps(ops); toast('Mentve', 'ok'); }
        catch (x) { toast(x.message, 'error', 6000); return false; }
      },
    }],
  });
  bindListSelects(m.el.querySelector('[data-main]'));
  // Eszköztípusnál nincs leltári ciklus (a darabokat az Eszközök oldal követi)
  m.el.querySelector('[name=keszletezes]').addEventListener('change', e => { m.el.querySelector('[data-leltar]').hidden = e.target.value === 'eszkoz'; });
  const tbody = m.el.querySelector('#src tbody');
  m.el.querySelector('[data-addsrc]').onclick = () => {
    const tmp = document.createElement('tbody');
    tmp.innerHTML = String(srcRow({ forras_id: L.newId('F', 8), beszallito_id: '', cikkszam: '', kiszereles: '', egysegar: '', link: '', elsodleges: !tbody.children.length }));
    tbody.appendChild(tmp.firstElementChild);
  };
  tbody.onclick = e => { if (e.target.closest('[data-del]')) e.target.closest('tr').remove(); };
  return m.done;
}

/* ---------- Beszállító szerkesztő ---------- */
function editSupplier(b) {
  const isNew = !b;
  b = b || { beszallito_id: L.newId('B', 6), nev: '', kapcsolattarto: '', email: '', telefon: '', weboldal: '', aktiv: true, megjegyzes: '', rendeles_mod: 'webshop', kereso_url: '' };
  const mode = L.orderMode(b);
  modal({
    title: isNew ? 'Új beszállító' : b.nev,
    body: html`
      ${sec('Alapadatok', html`
        <label class="field span-2"><span>Név *</span><input name="nev" value="${b.nev}"></label>
        <label class="field span-2"><span>Weboldal / webshop</span><input name="weboldal" value="${b.weboldal}" placeholder="https://…"></label>`)}
      ${sec('Kapcsolat', html`
        <label class="field span-2"><span>Kapcsolattartó</span><input name="kapcsolattarto" value="${b.kapcsolattarto}"></label>
        <label class="field"><span>E-mail (rendeléshez)</span><input name="email" type="email" value="${b.email}"></label>
        <label class="field"><span>Telefon</span><input name="telefon" type="tel" value="${b.telefon}"></label>`)}
      ${sec(html`Rendelés ${help('Az alapértelmezett rendelési mód. A rendelési listán beszállítónként, rendelésenként átváltható (pl. egyedi ajánlatkérésnél e-mailre).')}`, html`
        <label class="field span-2"><span>Alapértelmezett mód</span><select name="rendeles_mod">
          <option value="webshop" ${mode === 'webshop' ? 'selected' : ''}>Webshopban</option>
          <option value="email" ${mode === 'email' ? 'selected' : ''}>E-mailben</option></select></label>
        <label class="field span-2"><span>Webshop keresés címe ${help(html`Nyisd meg a webshopot, keress rá egy tetszőleges cikkszámra, és másold ide a böngésző címsorából a címet úgy, hogy a cikkszám helyére <b>{cikkszam}</b> kerüljön. Pl. <code>https://shop.hu/kereses?q={cikkszam}</code>. Így a megnyitás rögtön a termékre keres. Ha üres, a weboldal nyílik meg, a cikkszám pedig a vágólapra kerül.`)}</span>
          <input name="kereso_url" value="${b.kereso_url}" placeholder="https://…/kereses?q={cikkszam}"></label>
        <label class="field span-2"><span>Alapértelmezett e-mail sablon</span><select name="email_sablon">
          <option value="">— az első megfelelő sablon —</option>
          ${L.emailTemplates(store.state.db).map(s => html`<option value="${s.sablon_id}" ${s.sablon_id === b.email_sablon ? 'selected' : ''}>${s.nev} (${L.EMAIL_TYPES[s.tipus]})</option>`)}</select></label>`)}
      ${sec('Egyéb', html`
        <label class="field span-2"><span>Megjegyzés</span><input name="megjegyzes" value="${b.megjegyzes}"></label>
        <label class="check"><input type="checkbox" name="aktiv" ${b.aktiv ? 'checked' : ''}> Aktív</label>`)}`,
    actions: [{ label: 'Mégse', value: null }, {
      label: 'Mentés', kind: 'primary', onClick: async el => {
        const v = formValues(el);
        // Csak http(s) cím menthető (a szerver a többit törölné) – jelezzük, ne vesszen el csendben
        const bad = ['weboldal', 'kereso_url'].find(k => v[k].trim() && !/^https?:\/\//i.test(v[k].trim()));
        if (bad) { toast(`A ${bad === 'weboldal' ? 'weboldal' : 'webshop keresés'} címe http:// vagy https:// kezdetű legyen.`, 'error', 6000); return false; }
        try { await store.enqueue({ type: 'mentes', table: 'Beszallitok', row: { ...b, ...v } }); toast('Mentve', 'ok'); }
        catch (x) { toast(x.message, 'error', 6000); return false; }
      },
    }],
  });
}

/* ---------- E-mail sablon szerkesztő ---------- */
function editEmailTpl(s) {
  const isNew = !s;
  s = s || { sablon_id: L.newId('E', 6), nev: '', tipus: 'rendeles', targy: 'Megrendelés – {rendelesszam}', szoveg: '' };
  let lastField = null; // a mező, ahová a helyőrző beszúródik
  const m = modal({
    title: isNew ? 'Új e-mail sablon' : s.nev,
    wide: true,
    body: html`
      ${sec('Sablon', html`
        <label class="field"><span>Név *</span><input name="nev" value="${s.nev}" placeholder="pl. Megrendelés – tegező"></label>
        <label class="field"><span>Típus</span><select name="tipus">${Object.entries(L.EMAIL_TYPES).map(([k, l]) => html`<option value="${k}" ${k === s.tipus ? 'selected' : ''}>${l}</option>`)}</select></label>
        <label class="field span-2"><span>Tárgy</span><input name="targy" value="${s.targy}" data-ins></label>`)}
      <section class="fsec"><div class="fsec-title">Szöveg ${help('A kapcsos zárójeles mezők küldéskor kitöltődnek. Kattints egy mezőre, és a kurzor helyére kerül (a tárgyba vagy a szövegbe, attól függően, hol álltál utoljára).')}</div>
        <div class="chip-list" style="margin:0 0 .5rem">${Object.entries(L.EMAIL_FIELDS).map(([k, d]) => html`<button type="button" class="chip" data-field="${k}" title="${d}">{${k}}</button>`)}</div>
        <textarea name="szoveg" class="mail-body" data-ins placeholder="Tisztelt {kapcsolattarto}!&#10;&#10;…&#10;&#10;{tetelek}">${s.szoveg}</textarea>
      </section>`,
    actions: [
      { label: 'Mégse', value: null },
      ...(isNew ? [] : [{ label: 'Törlés', kind: 'danger', onClick: async () => {
        const used = store.state.db.Beszallitok.filter(b => b.email_sablon === s.sablon_id).length;
        if (!(await confirmDialog('Sablon törlése', `Biztosan törlöd: „${s.nev}”?` + (used ? ` ${used} beszállító alapértelmezett sablonja – náluk az első megfelelő sablon lesz használva.` : ''), 'Törlés', 'danger'))) return false;
        try { await store.enqueue({ type: 'torles', table: 'Email_sablonok', id: s.sablon_id }); toast('Törölve', 'ok'); }
        catch (x) { toast(x.message, 'error'); return false; }
      } }]),
      { label: 'Mentés', kind: 'primary', onClick: async el => {
        const v = formValues(el);
        try { await store.enqueue({ type: 'mentes', table: 'Email_sablonok', row: { ...s, ...v } }); toast('Mentve', 'ok'); }
        catch (x) { toast(x.message, 'error', 6000); return false; }
      } },
    ],
  });
  m.el.addEventListener('focusin', e => { if (e.target.matches('[data-ins]')) lastField = e.target; });
  m.el.addEventListener('click', e => {
    const b = e.target.closest('[data-field]');
    if (!b) return;
    const f = lastField || m.el.querySelector('[name=szoveg]');
    const ins = `{${b.dataset.field}}`;
    const a = f.selectionStart ?? f.value.length, z = f.selectionEnd ?? f.value.length;
    f.value = f.value.slice(0, a) + ins + f.value.slice(z);
    f.focus();
    f.selectionStart = f.selectionEnd = a + ins.length;
  });
}

/* ---------- Felhasználó szerkesztő (függőleges, szekciókra bontva) ---------- */
function editUser(u) {
  const isNew = !u;
  u = u || { email: '', nev: '', szerepkor: 'raktaros', aktiv: true, megjegyzes: '' };
  modal({
    title: isNew ? 'Új felhasználó' : u.nev || u.email,
    body: html`
      ${sec('Fiók', html`
        <label class="field"><span>Google-fiók e-mail címe *</span><input name="email" type="email" value="${u.email}" ${isNew ? '' : 'readonly'} placeholder="nev@ceg.hu vagy nev@gmail.com"></label>
        <label class="field"><span>Név</span><input name="nev" value="${u.nev}"></label>`, 'col')}
      ${sec('Jogosultság', html`
        <div class="opt-list">${Object.keys(L.ROLES).reverse().map(r => html`<label class="opt">
          <input type="radio" name="szerepkor" value="${r}" ${r === u.szerepkor ? 'checked' : ''}>
          <span><b>${L.ROLE_LABELS[r]}</b><span class="small muted">${ROLE_DESC[r]}</span></span></label>`)}</div>
        <label class="check"><input type="checkbox" name="aktiv" ${u.aktiv ? 'checked' : ''}> Aktív (beléphet)</label>`, 'col')}
      ${sec('Megjegyzés', html`<input name="megjegyzes" value="${u.megjegyzes}" aria-label="Megjegyzés">`, 'col')}`,
    actions: [{ label: 'Mégse', value: null }, {
      label: 'Mentés', kind: 'primary', onClick: async el => {
        const v = formValues(el);
        if (isNew && store.get('Felhasznalok', v.email.trim().toLowerCase())) { toast('Ez az e-mail már szerepel.', 'error'); return false; }
        try { await store.enqueue({ type: 'mentes', table: 'Felhasznalok', row: { ...u, ...v } }); toast('Mentve', 'ok'); }
        catch (x) { toast(x.message, 'error', 6000); return false; }
      },
    }],
  });
}

/* ---------- Listák: oszlopok, rendezés, szűrők ---------- */

function columns(db) {
  const srcCount = id => L.sourcesFor(db, id).length;
  return {
    tetelek: [
      ['megnevezes', 'Megnevezés', t => t.megnevezes, t => html`${t.megnevezes}${L.isToolItem(t) ? html` <span class="badge badge-info" title="Eszköztípus – a darabjai az Eszközök oldalon">eszköz</span>` : ''}<div class="sub">${t.tetel_id}</div>`, 'main'],
      ['kategoria', 'Kategória', t => t.kategoria, t => t.kategoria],
      ['hely', 'Hely', t => `${t.raktar || ''} ${t.polc || ''}`, t => store.placeLabel(t)],
      ['me', 'Me.', t => t.mertekegyseg, t => t.mertekegyseg, 'm-hide'],
      ['min', 'Min / cél', t => t.min_keszlet, t => `${fmtNum(t.min_keszlet)} / ${fmtNum(t.cel_keszlet)}`, 'num'],
      ['ciklus', 'Leltár', t => t.leltar_ciklus_nap, t => (t.leltar_ciklus_nap ? t.leltar_ciklus_nap + ' nap' : '–'), 'num'],
      ['ertek', 'Készletérték', t => store.state.stock[t.tetel_id]?.ertek || 0, t => { const e = store.state.stock[t.tetel_id]?.ertek; return e ? fmtMoney(e) : '–'; }, 'num'],
      ['forras', 'Források', t => srcCount(t.tetel_id), t => { const n = srcCount(t.tetel_id); return html`<span class="badge badge-${n ? 'ok' : 'warn'}" title="${n ? 'Beszerzési források száma' : 'Nincs beszerzési forrás'}">${n}</span>`; }, 'num'],
    ],
    beszallitok: [
      ['nev', 'Név', b => b.nev, b => b.nev, 'main'],
      ['mod', 'Rendelés', b => L.orderMode(b), b => html`<span class="badge ${L.orderMode(b) === 'webshop' ? 'badge-info' : 'badge-muted'}">${L.orderMode(b) === 'webshop' ? 'Webshop' : 'E-mail'}</span>`],
      ['kapcs', 'Kapcsolattartó', b => b.kapcsolattarto, b => b.kapcsolattarto],
      ['email', 'E-mail', b => b.email, b => b.email, 'c-wide'],
      ['tel', 'Telefon', b => b.telefon, b => b.telefon],
      ['tetelek', 'Tételek', b => db.Forrasok.filter(f => f.beszallito_id === b.beszallito_id).length, b => {
        const n = db.Forrasok.filter(f => f.beszallito_id === b.beszallito_id).length;
        return n ? html`<button class="link-btn" data-supf="${b.beszallito_id}" title="A beszállító tételeinek megjelenítése">${n} ›</button>` : html`<span class="muted">0</span>`;
      }, 'num'],
    ],
    emailek: [
      ['nev', 'Név', s => s.nev, s => s.nev, 'main'],
      ['tipus', 'Típus', s => s.tipus, s => html`<span class="badge ${s.tipus === 'ajanlat' ? 'badge-muted' : 'badge-info'}">${L.EMAIL_TYPES[s.tipus] || s.tipus}</span>`],
      ['targy', 'Tárgy', s => s.targy, s => s.targy, 'c-wide'],
      ['hasznalja', 'Beszállítók', s => db.Beszallitok.filter(b => b.email_sablon === s.sablon_id).length, s => db.Beszallitok.filter(b => b.email_sablon === s.sablon_id).length || '–', 'num'],
    ],
    sablonok: [
      ['nev', 'Név', s => s.nev, s => s.nev, 'main'],
      ['db', 'Tételek', s => tplIds(s).length, s => tplIds(s).length, 'num'],
      ['ki', 'Létrehozta', s => store.userName(s.letrehozta), s => store.userName(s.letrehozta)],
      ['mod', 'Módosítva', s => s.modositva, s => fmtDate(s.modositva)],
    ],
    felhasznalok: [
      ['nev', 'Név', u => u.nev, u => u.nev, 'main'],
      ['email', 'E-mail', u => u.email, u => u.email, 'c-wide'],
      ['szerep', 'Szerepkör', u => L.ROLES[u.szerepkor] || 0, u => html`<span class="badge badge-info">${L.ROLE_LABELS[u.szerepkor] || u.szerepkor}</span>`],
      ['aktiv', 'Állapot', u => (u.aktiv ? 1 : 0), u => (u.aktiv ? html`<span class="badge badge-ok">aktív</span>` : html`<span class="badge badge-muted">inaktív</span>`)],
    ],
  };
}

function filtered(db) {
  const f = ui.f;
  const match = matcher(ui.q);
  const inactive = f.egyeb.has('inaktiv');
  if (ui.tab === 'tetelek') {
    return db.Tetelek.filter(t => (inactive || t.aktiv) && match(`${t.megnevezes} ${t.kategoria} ${t.raktar || ''} ${t.polc} ${t.tetel_id}`))
      .filter(t => inSel(f.kat, t.kategoria) && inSel(f.wh, t.raktar) && inSel(f.kesz, L.isToolItem(t) ? 'eszkoz' : 'anyag'))
      .filter(t => {
        if (!f.sup.size) return true;
        const src = L.sourcesFor(db, t.tetel_id);
        return src.length ? src.some(s => f.sup.has(s.beszallito_id)) : f.sup.has('-');
      });
  }
  if (ui.tab === 'beszallitok') {
    return db.Beszallitok.filter(b => (inactive || b.aktiv) && match(`${b.nev} ${b.kapcsolattarto} ${b.email}`))
      .filter(b => inSel(f.mod, L.orderMode(b)));
  }
  if (ui.tab === 'sablonok') return (db.Leltar_sablonok || []).filter(s => match(s.nev));
  if (ui.tab === 'emailek') return (db.Email_sablonok || []).filter(s => match(`${s.nev} ${s.targy}`));
  return db.Felhasznalok.filter(u => (inactive || u.aktiv) && match(`${u.nev} ${u.email}`)).filter(u => inSel(f.role, u.szerepkor));
}


function tableHtml() {
  const db = store.state.db;
  const cols = columns(db)[ui.tab];
  const [sk, sd] = ui.sort[ui.tab];
  const col = cols.find(c => c[0] === sk) || cols[0];
  const list = filtered(db).sort((a, b) => compare(col[2](a), col[2](b)) * sd);
  const key = { tetelek: 'tetel_id', beszallitok: 'beszallito_id', felhasznalok: 'email', sablonok: 'sablon_id', emailek: 'sablon_id' }[ui.tab];
  // Mobilon kártyák: a „main” oszlop a kártya címe, a többi címkézett mező 3 oszlopba tördelve
  return html`<table class="tbl cards nochk flow"><thead><tr>${cols.map(c => html`<th class="sortable ${c[4] === 'num' ? 'num' : ''} ${c[4] === 'm-hide' ? 'm-hide' : ''}" data-sort="${c[0]}">${c[1]}<span class="arrow">${sortArrow(c[0] === sk, sd)}</span></th>`)}</tr></thead>
    <tbody>${list.length ? list.map(r => html`<tr class="click ${r.aktiv === false ? 'off' : ''}" data-id="${r[key]}" tabindex="0">${cols.map(c =>
      html`<td class="${c[4] === 'main' ? 'c-main' : c[4] || ''}" ${c[4] === 'main' ? '' : html`data-l="${c[1]}"`}>${c[3](r)}</td>`)}</tr>`)
      : html`<tr><td colspan="${cols.length}" class="empty">Nincs a szűrésnek megfelelő elem.</td></tr>`}</tbody></table>
    <div class="tbl-foot">${list.length} elem</div>`;
}

/** A fülhöz tartozó szűrő csoportok (filterButton / openFilter). */
function filterGroups() {
  const db = store.state.db;
  const other = { key: 'egyeb', title: 'Egyéb', options: [['inaktiv', 'Inaktívak is']] };
  if (ui.tab === 'tetelek') {
    const whs = store.warehouses();
    const tools = db.Tetelek.filter(t => L.isToolItem(t)).length;
    return [
      { key: 'kesz', title: 'Készletezés', options: [['anyag', 'Anyag', db.Tetelek.length - tools], ['eszkoz', 'Eszköztípus', tools]] },
      { key: 'kat', title: 'Kategória', options: countOptions(store.categories(), db.Tetelek, 'kategoria') },
      { key: 'wh', title: 'Raktár', options: whs.length > 1 ? countOptions(whs, db.Tetelek, 'raktar') : [] },
      { key: 'sup', title: 'Beszállító', options: [['-', '— forrás nélkül —'], ...db.Beszallitok.slice().sort((a, b) => a.nev.localeCompare(b.nev, 'hu')).map(b => [b.beszallito_id, b.nev])] },
      other,
    ];
  }
  if (ui.tab === 'beszallitok') return [{ key: 'mod', title: 'Rendelési mód', options: [['webshop', 'Webshop'], ['email', 'E-mail']] }, other];
  return [{ key: 'role', title: 'Szerepkör', options: Object.keys(L.ROLES).reverse().map(r => [r, L.ROLE_LABELS[r]]) }, other];
}

/* ---------- Listák: kategóriák, mértékegységek, raktárak ---------- */
function listsHtml() {
  const db = store.state.db;
  return html`<div class="report-grid lists-grid">${Object.entries(L.LIST_TYPES).map(([tipus, title]) => {
    const field = L.LIST_FIELD[tipus];
    const own = new Map((db.Listak || []).filter(l => l.tipus === tipus).map(l => [l.ertek, l]));
    const vals = L.listValues(db, tipus);
    const usage = v => db.Tetelek.filter(t => t[field] === v).length;
    const unlisted = vals.filter(v => !own.has(v));
    return html`<div class="card">
      <div class="card-head"><h2 class="grow">${title}</h2>
        ${unlisted.length ? html`<button class="btn btn-sm" data-l-addall="${tipus}" title="A tételeknél használt, de a listában még nem szereplő értékek felvétele">Mind felvétele (${unlisted.length})</button>` : ''}
        <span class="badge badge-muted">${vals.length}</span></div>
      <div class="list-rows">${vals.map(v => {
        const l = own.get(v), n = usage(v);
        return html`<div class="list-row">
          <span class="grow">${v}${l ? '' : html` <span class="badge badge-warn" title="Tételeknél használt érték, de nincs felvéve a listába">nincs a listában</span>`}</span>
          <span class="small muted nowrap">${n ? `${n} tétel` : 'nem használt'}</span>
          <span class="row-icons">
            ${l ? html`<button class="icon-btn" data-l-edit="${l.lista_id}" title="Átnevezés" aria-label="Átnevezés">${ICONS.edit}</button>`
              : html`<button class="icon-btn" data-l-add="${tipus}" data-v="${v}" title="Felvétel a listába" aria-label="Felvétel a listába">+</button>`}
            ${l ? html`<button class="icon-btn" data-l-del="${l.lista_id}" ${n ? 'disabled' : ''} title="${n ? `Nem törölhető: ${n} tétel használja` : 'Törlés'}" aria-label="Törlés">${ICONS.x}</button>` : ''}
          </span></div>`;
      })}${vals.length ? '' : html`<div class="empty small">Még nincs érték.</div>`}</div>
      <form class="list-add" data-l-form="${tipus}"><input name="ertek" placeholder="Új érték…" autocomplete="off"><button class="btn btn-sm" type="submit">Hozzáadás</button></form>
    </div>`;
  })}</div>`;
}

async function listAction(e, ctx) {
  const db = store.state.db;
  const rerender = () => ctx.rerender();
  // friss állapotból számol, így egymás utáni felvételnél is növekvő a sorrend
  const add = (tipus, ertek) => store.enqueue({ type: 'mentes', table: 'Listak', row: { lista_id: L.newId('L', 6), tipus, ertek, sorrend: store.nextListOrder(tipus) } });
  try {
    const allB = e.target.closest('[data-l-addall]');
    if (allB) {
      const tipus = allB.dataset.lAddall;
      const own = new Set((db.Listak || []).filter(l => l.tipus === tipus).map(l => l.ertek));
      const missing = L.listValues(db, tipus).filter(v => !own.has(v));
      for (const v of missing) await add(tipus, v);
      toast(`${missing.length} érték felvéve a listába`, 'ok');
      return rerender();
    }
    const addB = e.target.closest('[data-l-add]');
    if (addB) { await add(addB.dataset.lAdd, addB.dataset.v); toast('Felvéve a listába', 'ok'); return rerender(); }
    const del = e.target.closest('[data-l-del]');
    if (del && !del.disabled) {
      const l = store.get('Listak', del.dataset.lDel);
      if (!(await confirmDialog('Törlés', `Biztosan törlöd: „${l.ertek}”?`, 'Törlés', 'danger'))) return;
      await store.enqueue({ type: 'torles', table: 'Listak', id: l.lista_id });
      return rerender();
    }
    const ed = e.target.closest('[data-l-edit]');
    if (ed) {
      const l = store.get('Listak', ed.dataset.lEdit);
      const field = L.LIST_FIELD[l.tipus];
      const used = db.Tetelek.filter(t => t[field] === l.ertek);
      const v = await modal({
        title: 'Átnevezés',
        body: html`<label class="field"><span>Új név</span><input name="ertek" value="${l.ertek}" autocomplete="off"></label>
          ${used.length ? html`<p class="small muted" style="margin-top:.5rem">${used.length} tételnél is átíródik.</p>` : ''}`,
        actions: [{ label: 'Mégse', value: null }, { label: 'Mentés', kind: 'primary', onClick: el => el.querySelector('[name=ertek]').value.trim() || false }],
      }).done;
      if (!v || v === l.ertek) return;
      await store.enqueue({ type: 'mentes', table: 'Listak', row: { ...l, ertek: v } });
      for (const t of used) await store.enqueue({ type: 'mentes', table: 'Tetelek', row: { ...t, [field]: v } });
      toast('Átnevezve', 'ok');
      return rerender();
    }
  } catch (x) { toast(x.message, 'error', 6000); }
}

export default {
  render(root, params, ctx) {
    // Admin: minden fül; raktáros: csak a leltársablonok
    const isAdmin = store.can('admin');
    const allLabels = { tetelek: 'Tételek', beszallitok: 'Beszállítók', listak: 'Listák', sablonok: 'Leltársablonok', emailek: 'E-mail sablonok', felhasznalok: 'Felhasználók' };
    const labels = isAdmin ? allLabels : { sablonok: allLabels.sablonok };
    if (params.tab && labels[params.tab]) { ui.tab = params.tab; delete params.tab; history.replaceState(null, '', '#/torzsadatok'); }
    if (!labels[ui.tab]) ui.tab = Object.keys(labels)[0];
    const newLabel = { tetelek: '+ Új tétel', beszallitok: '+ Új beszállító', felhasznalok: '+ Új felhasználó', sablonok: '+ Új sablon', emailek: '+ Új e-mail sablon' };
    const refresh = () => { root.querySelector('#tbl').innerHTML = String(tableHtml()); };
    const openTpl = tpl => itemSelector({ mode: 'template', tpl });
    // Megj.: a gyökéren nem lehet data-tab attribútum, mert a kattintáskezelő a [data-tab]-ot keresi
    // A szerepkör is része a kulcsnak: felhasználóváltáskor teljes újrarajzolás (más fülek látszanak)
    const viewKey = `torzs:${store.state.user.szerepkor}:${ui.tab}`;
    const tabsHtml = Object.keys(labels).length > 1 ? html`<div class="tabs">${Object.entries(labels).map(([k, l]) => html`<button class="${ui.tab === k ? 'active' : ''}" data-tab="${k}">${l}</button>`)}</div>` : html`<h2 style="margin:0 0 .75rem">${labels[ui.tab]}</h2>`;
    if (ui.tab === 'listak') {
      root.dataset.view = viewKey;
      root.innerHTML = String(html`
        <div class="page-head"><h1>Törzsadatok</h1>${help('A tétel űrlapon ezekből lehet választani. Átnevezéskor az érintett tételek is átíródnak; törölni csak a nem használt értéket lehet.')}</div>
        ${tabsHtml}${listsHtml()}`);
      root.onsubmit = async e => {
        e.preventDefault();
        const f = e.target.closest('[data-l-form]');
        const inp = f.querySelector('[name=ertek]');
        const v = inp.value.trim();
        if (!v) return;
        try {
          await store.enqueue({ type: 'mentes', table: 'Listak', row: { lista_id: L.newId('L', 6), tipus: f.dataset.lForm, ertek: v, sorrend: store.nextListOrder(f.dataset.lForm) } });
          ctx.rerender();
          root.querySelector(`[data-l-form="${f.dataset.lForm}"] [name=ertek]`)?.focus();
        } catch (x) { toast(x.message, 'error'); }
      };
      root.onclick = e => {
        const tab = e.target.closest('[data-tab]');
        if (tab) { ui.tab = tab.dataset.tab; ui.q = ''; return ctx.rerender(); }
        listAction(e, ctx);
      };
      return;
    }
    root.onsubmit = null;
    if (root.dataset.view === viewKey && root.querySelector('#tbl')) return refresh();
    root.dataset.view = viewKey;
    root.innerHTML = String(html`
      <div class="page-head"><h1>Törzsadatok</h1><div class="actions"><button class="btn btn-primary" data-a="new">${newLabel[ui.tab]}</button></div></div>
      ${tabsHtml}
      <div class="toolbar"><input type="search" id="q" placeholder="Keresés…" value="${ui.q}">
        ${ui.tab === 'sablonok' ? help('A leltársablon egy elmentett tételösszeállítás. A Leltár oldalon az „Egyedi / sablon” kártyáról egy kattintással indítható. Mindenki számára elérhető.')
          : ui.tab === 'emailek' ? help('A megrendelő és ajánlatkérő e-mailek sablonjai. A beszállítónál beállítható, melyik legyen az alapértelmezett (pl. tegező viszony). Küldéskor a sablon kitöltve, szerkeszthetően jelenik meg.')
          : filterButton(ui.f)}</div>
      ${ui.tab === 'felhasznalok' && store.isDemo ? html`<div class="notice notice-info small">Éles használatban a felhasználó a megadott Google-fiókkal tud belépni.</div>` : ''}
      ${ui.tab === 'emailek' && !(store.state.db.Email_sablonok || []).length ? html`<div class="notice notice-info small">Még nincs saját sablon – küldéskor a beépített alapsablonok (hivatalos, tegező, ajánlatkérés) használhatók.
        <button class="btn btn-sm" data-a="seedmail" style="margin-left:.5rem">Alapsablonok felvétele szerkesztéshez</button></div>` : ''}
      <div class="card"><div class="table-wrap" id="tbl">${tableHtml()}</div></div>`);
    root.querySelector('#q').addEventListener('input', e => { ui.q = e.target.value; refresh(); });
    root.onclick = e => {
      const fb = e.target.closest('[data-filter]');
      if (fb) return openFilter(fb, filterGroups, ui.f, refresh);
      const tab = e.target.closest('[data-tab]');
      if (tab) { ui.tab = tab.dataset.tab; ui.q = ''; return ctx.rerender(); }
      const supf = e.target.closest('[data-supf]');
      if (supf) {
        // Beszállító → a hozzá tartozó tételek (szűrt Tételek fül)
        ui.tab = 'tetelek'; ui.q = '';
        ui.f.kat.clear(); ui.f.wh.clear();
        ui.f.sup = new Set([supf.dataset.supf]);
        return ctx.rerender();
      }
      const th = e.target.closest('th[data-sort]');
      if (th) {
        const s = ui.sort[ui.tab];
        ui.sort[ui.tab] = s[0] === th.dataset.sort ? [s[0], -s[1]] : [th.dataset.sort, 1];
        return refresh();
      }
      if (e.target.closest('[data-a="seedmail"]')) {
        (async () => {
          for (const s of L.DEFAULT_EMAIL_TEMPLATES) await store.enqueue({ type: 'mentes', table: 'Email_sablonok', row: { ...s } });
          toast('Alapsablonok felvéve', 'ok'); ctx.rerender();
        })().catch(x => toast(x.message, 'error'));
        return;
      }
      if (e.target.closest('[data-a="new"]')) {
        if (ui.tab === 'tetelek') editItem(null);
        else if (ui.tab === 'beszallitok') editSupplier(null);
        else if (ui.tab === 'sablonok') openTpl(null);
        else if (ui.tab === 'emailek') editEmailTpl(null);
        else editUser(null);
        return;
      }
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      if (ui.tab === 'tetelek') editItem(store.get('Tetelek', tr.dataset.id));
      else if (ui.tab === 'beszallitok') editSupplier(store.get('Beszallitok', tr.dataset.id));
      else if (ui.tab === 'sablonok') openTpl(store.get('Leltar_sablonok', tr.dataset.id));
      else if (ui.tab === 'emailek') editEmailTpl(store.get('Email_sablonok', tr.dataset.id));
      else editUser(store.get('Felhasznalok', tr.dataset.id));
    };
  },
};