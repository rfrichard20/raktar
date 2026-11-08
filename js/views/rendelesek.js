// Rendelés: feltöltési javaslat → rendelési lista (amit most rendelünk) → rendelések követése.
import * as store from '../store.js';
import { html, fmtNum, fmtDate, fmtMoney, parseNum, confirmDialog, toast, modal, copyText, help, popover, matcher, dateStamp, sec, ORDER_STATUS } from '../ui.js';
import { attachPicker, showItemDetail, emailDialog } from './common.js';
import { ICONS } from '../icons.js';

const L = window.RaktarLogic;
const ui = { tab: 'javaslat', all: false, open: new Set() };
// draft: { list: { tetel_id: { origin: 'javaslat'|'kezi', forras_id?, q?, ar?, cart? } }, skip: { tetel_id: true } }
let draft;
let loading = null;
const save = () => store.drafts.set('javaslat', draft);

const supKey = f => (f ? f.beszallito_id : '');
function supSort(a, b) {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return store.supplierName(a).localeCompare(store.supplierName(b), 'hu');
}
function sourceOf(id, sel) {
  const srcs = L.sourcesFor(store.state.db, id);
  return { srcs, f: srcs.find(x => x.forras_id === sel.forras_id) || srcs[0] || null };
}


/* =================== 1. Feltöltési javaslat =================== */
function suggestions() {
  return Object.values(store.state.stock)
    .filter(s => s.javaslat > 0 && store.get('Tetelek', s.tetel_id)?.aktiv)
    .map(s => {
      const t = store.get('Tetelek', s.tetel_id);
      const { f } = sourceOf(t.tetel_id, {});
      return { t, s, f, q: L.roundPack(s.javaslat, f ? f.kiszereles : 1), onList: !!draft.list[t.tetel_id] };
    })
    .sort((a, b) => supSort(supKey(a.f), supKey(b.f)) || a.t.megnevezes.localeCompare(b.t.megnevezes, 'hu'));
}

function renderJavaslat(body, ctx) {
  const rows = suggestions();
  const avail = rows.filter(r => !r.onList);
  const chosen = avail.filter(r => !draft.skip[r.t.tetel_id]);
  const canEdit = store.can('raktaros');
  body.innerHTML = String(html`
    <div class="toolbar">
      ${help(html`Azok a tételek, amelyeknél a készlet + úton lévő mennyiség eléri a minimumot. A javasolt mennyiség a célkészletig pótol, az elsődleges forrás kiszerelésére kerekítve.<br><br>
        Jelöld ki, amit rendelni szeretnél, és tedd át a <b>Rendelési listára</b>. Ott módosíthatod a mennyiséget, árat, forrást, és hozzáadhatsz más tételeket is.`)}
      <span class="grow"></span>
      ${canEdit ? html`<button class="btn btn-primary" data-a="tolist" ${chosen.length ? '' : 'disabled'}>Kijelöltek a rendelési listára (${chosen.length}) ›</button>` : ''}
    </div>
    <div class="card">${rows.length ? html`<div class="table-wrap"><table class="tbl cards fixed">
      <colgroup><col style="width:44px"><col><col style="width:30%"><col style="width:11%"><col style="width:15%"></colgroup>
      <thead><tr><th>${canEdit && avail.length ? html`<input type="checkbox" data-k="all" ${chosen.length === avail.length ? 'checked' : ''} title="Mind kijelölése" aria-label="Mind kijelölése">` : ''}</th>
        <th>Tétel</th><th>Beszállító / cikkszám</th><th class="num">Úton</th><th class="num">Javasolt</th></tr></thead>
      <tbody>${rows.map(r => html`<tr data-id="${r.t.tetel_id}" class="${r.onList ? 'row-done' : draft.skip[r.t.tetel_id] ? 'off' : ''}">
        <td class="c-chk">${r.onList ? html`<span class="badge badge-ok" title="Már a rendelési listán">✓</span>`
          : html`<input type="checkbox" data-k="pick" ${draft.skip[r.t.tetel_id] ? '' : 'checked'} ${canEdit ? '' : 'disabled'} aria-label="Kijelölés">`}</td>
        <td class="c-main"><a href="#" data-a="detail">${r.t.megnevezes}</a>${r.onList ? html` <span class="badge badge-ok">listán</span>` : ''}
          <div class="sub">Készlet ${fmtNum(r.s.keszlet)} · min ${fmtNum(r.t.min_keszlet)} · cél ${fmtNum(r.t.cel_keszlet)} ${r.t.mertekegyseg}</div></td>
        <td class="c-meta">${r.f ? html`${store.supplierName(r.f.beszallito_id)} <span class="small muted">· ${r.f.cikkszam}</span>` : html`<span class="t-warn">nincs forrás</span>`}</td>
        <td class="num c-f1" data-l="Úton">${r.s.uton ? fmtNum(r.s.uton) : '–'}</td>
        <td class="num c-f2" data-l="Javasolt"><b>${fmtNum(r.q)}</b> ${r.t.mertekegyseg}</td>
      </tr>`)}</tbody></table></div>` : html`<div class="empty">Jelenleg nincs pótolandó tétel. 🎉</div>`}</div>`);

  body.oninput = null;
  body.onchange = e => {
    if (e.target.dataset.k === 'all') {
      avail.forEach(r => { if (e.target.checked) delete draft.skip[r.t.tetel_id]; else draft.skip[r.t.tetel_id] = true; });
      save(); return ctx.rerender();
    }
    const tr = e.target.closest('tr[data-id]');
    if (!tr || e.target.dataset.k !== 'pick') return;
    if (e.target.checked) delete draft.skip[tr.dataset.id]; else draft.skip[tr.dataset.id] = true;
    save(); ctx.rerender();
  };
  body.onclick = e => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    e.preventDefault();
    const a = b.dataset.a;
    if (a === 'detail') return showItemDetail(b.closest('tr').dataset.id);
    if (a === 'all') { avail.forEach(r => delete draft.skip[r.t.tetel_id]); save(); return ctx.rerender(); }
    if (a === 'none') { avail.forEach(r => { draft.skip[r.t.tetel_id] = true; }); save(); return ctx.rerender(); }
    if (a === 'tolist') {
      chosen.forEach(r => { draft.list[r.t.tetel_id] = { origin: 'javaslat' }; });
      save();
      toast(`${chosen.length} tétel a rendelési listára került`, 'ok');
      ui.tab = 'lista';
      ctx.rerender();
    }
  };
}

/* =================== 2. Rendelési lista =================== */
function listRows() {
  const st = store.state.stock;
  return Object.entries(draft.list).filter(([id]) => store.get('Tetelek', id)).map(([id, sel]) => {
    const t = store.get('Tetelek', id);
    const s = st[id];
    const { srcs, f } = sourceOf(id, sel);
    const javasolt = s.javaslat > 0 ? L.roundPack(s.javaslat, f ? f.kiszereles : 1) : 0;
    const qRaw = sel.q !== undefined ? sel.q : (javasolt ? String(javasolt) : '');
    const arMaster = f ? f.egysegar : 0;
    const arRaw = sel.ar !== undefined ? sel.ar : (arMaster ? String(arMaster) : '');
    const ar = parseNum(arRaw);
    return { id, t, s, sel, srcs, f, javasolt, qRaw, q: parseNum(qRaw), arRaw, ar: isNaN(ar) ? 0 : ar, arMaster,
      arChanged: !!f && !isNaN(ar) && arRaw !== '' && ar !== arMaster, cart: !!sel.cart, origin: sel.origin || 'kezi' };
  }).sort((a, b) => a.t.megnevezes.localeCompare(b.t.megnevezes, 'hu'));
}

function groupMode(k) {
  const sup = store.get('Beszallitok', k);
  if (!sup) return 'email';
  draft.mode = draft.mode || {};
  return draft.mode[k] || L.orderMode(sup);
}

function renderLista(body, ctx) {
  const rows = listRows();
  const groups = new Map();
  rows.forEach(r => { const k = supKey(r.f); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
  const keys = [...groups.keys()].sort(supSort);
  const canEdit = store.can('raktaros');
  // A pipa jelentése: webshopnál „kosárba tettem”, e-mailnél „rendelésbe kerül”
  const included = r => r.cart && r.q > 0;
  const groupTotal = list => list.filter(included).reduce((a, r) => a + r.q * r.ar, 0);

  body.innerHTML = String(html`
    <div class="toolbar">
      ${canEdit ? html`<div class="picker" style="flex:1;max-width:420px"><input id="add" placeholder="+ Tétel hozzáadása a listához…" autocomplete="off"></div>` : ''}
      ${help(html`A rendelés módja beszállítónként átváltható (<b>Webshop</b> / <b>E-mail</b>), pl. egyedi ajánlatkéréshez.<br><br>
        <b>Webshop:</b> a ${ICONS.ext} ikon a vágólapra másolja a cikkszámot és megnyitja a terméket / keresést. Kosárba tétel után pipáld ki a sort, a végén „Rendelés rögzítése”.<br><br>
        <b>E-mail:</b> jelöld ki a rendelendő sorokat (a fejléc jelölőjével mindet), majd „Rendelés létrehozása” → kész e-mail szöveg.<br><br>
        <b>Jelölések</b><br>
        <span class="legend-row"><span class="origin-ico is-sug">${ICONS.bulb}</span> a feltöltési javaslatból került a listára</span>
        <span class="legend-row"><span class="origin-ico is-man">${ICONS.hand}</span> kézzel hozzáadva</span>
        <span class="legend-row">${ICONS.ext} megnyitás a webshopban (a cikkszám a vágólapra kerül)</span>
        <span class="legend-row">${ICONS.swap} másik beszerzési forrás választása</span>
        <span class="legend-row">${ICONS.x} levétel a listáról</span>
        <br>Az egységár felülírható; rögzítéskor a törzsadatba is menthető.`)}
    </div>
    ${keys.length ? keys.map(k => {
      const list = groups.get(k);
      const sup = store.get('Beszallitok', k);
      const mode = groupMode(k);
      const web = mode === 'webshop';
      const on = list.filter(included);
      const allOn = list.every(r => r.cart);
      return html`<div class="card" data-group="${k}">
        <div class="card-head">
          <div class="grow" style="min-width:0"><h2>${sup ? sup.nev : 'Nincs beszerzési forrás'}</h2>
            ${sup ? html`<div class="small muted">${sup.weboldal ? html`<a href="${sup.weboldal}" target="_blank" rel="noopener">${sup.weboldal.replace(/^https?:\/\//, '')} ↗</a> · ` : ''}${[sup.kapcsolattarto, sup.email, sup.telefon].filter(Boolean).join(' · ')}</div>`
              : html`<div class="small t-warn">Ezekhez a tételekhez nincs megadva beszerzési forrás (Törzsadatok).</div>`}</div>
          ${sup ? html`<div class="group-actions">
            <div class="seg" role="group" aria-label="Rendelés módja">
              <button class="${web ? 'on' : ''}" data-a="mode" data-g="${k}" data-mode="webshop">Webshop</button>
              <button class="${web ? '' : 'on'}" data-a="mode" data-g="${k}" data-mode="email">E-mail</button></div>
            ${canEdit ? html`<button class="btn btn-sm btn-primary" data-a="create" data-g="${k}" ${on.length ? '' : 'disabled'}>Rendelés rögzítése</button>` : ''}
          </div>` : ''}
        </div>
        <div class="table-wrap"><table class="tbl cards fixed">
          <colgroup><col style="width:44px"><col><col style="width:18%"><col style="width:9%"><col style="width:12%"><col style="width:12%"><col style="width:11%"><col style="width:72px"></colgroup>
          <thead><tr>
            <th>${canEdit && sup ? html`<input type="checkbox" data-k="all" data-g="${k}" ${allOn ? 'checked' : ''} title="${web ? 'Mind kosárban' : 'Mind kijelölése'}" aria-label="Mind kijelölése">` : ''}</th>
            <th>Tétel</th><th>Cikkszám</th><th class="num">Csomag</th><th>Mennyiség</th><th>Egységár</th><th class="num">Érték</th><th></th></tr></thead>
          <tbody>${list.map(r => {
            const url = sup ? L.productUrl(sup, r.f) : '';
            return html`<tr data-id="${r.id}" class="${r.cart ? 'row-done' : ''}">
            <td class="c-chk">${sup ? html`<input type="checkbox" data-k="cart" ${r.cart ? 'checked' : ''} ${canEdit ? '' : 'disabled'} aria-label="${web ? 'Kosárba téve' : 'Rendelésbe'}">` : ''}</td>
            <td class="c-main"><a href="#" data-a="detail">${r.t.megnevezes}</a>
              <span class="origin-ico ${r.origin === 'javaslat' ? 'is-sug' : 'is-man'}" title="${r.origin === 'javaslat' ? 'A feltöltési javaslatból' : 'Kézzel hozzáadva'}" aria-label="${r.origin === 'javaslat' ? 'A feltöltési javaslatból' : 'Kézzel hozzáadva'}">${r.origin === 'javaslat' ? ICONS.bulb : ICONS.hand}</span>
              <div class="sub">Készlet ${fmtNum(r.s.keszlet)} · min ${fmtNum(r.t.min_keszlet)} · cél ${fmtNum(r.t.cel_keszlet)} ${r.t.mertekegyseg}${r.s.uton ? ` · úton ${fmtNum(r.s.uton)}` : ''}</div></td>
            <td class="c-meta"><span class="cikk-cell">
              ${url ? html`<button class="icon-btn icon-sm" data-a="openshop" data-url="${url}" data-cikk="${r.f.cikkszam}" title="Megnyitás a webshopban (cikkszám a vágólapra)" aria-label="Megnyitás a webshopban">${ICONS.ext}</button>`
                : html`<span class="icon-slot" aria-hidden="true"></span>`}
              ${r.f ? html`<button class="cikk" data-a="copycikk" data-cikk="${r.f.cikkszam}" title="Cikkszám másolása">${r.f.cikkszam || '—'}</button>` : html`<span class="muted">—</span>`}
              <span class="m-only small muted">· ${r.f ? fmtNum(r.f.kiszereles) : '–'} ${r.t.mertekegyseg}/cs.</span></span></td>
            <td class="num m-hide">${r.f ? html`${fmtNum(r.f.kiszereles)} <span class="small muted">${r.t.mertekegyseg}</span>` : '–'}</td>
            <td class="c-f1" data-l="Mennyiség"><input type="text" inputmode="decimal" data-k="q" value="${r.qRaw}" placeholder="${r.t.mertekegyseg}" ${canEdit ? '' : 'disabled'}>
              ${r.javasolt && r.q !== r.javasolt ? html`<div class="small muted">javasolt: ${fmtNum(r.javasolt)}</div>` : ''}</td>
            <td class="c-f2" data-l="Egységár"><input type="text" inputmode="decimal" data-k="ar" value="${r.arRaw}" placeholder="Ft" ${canEdit ? '' : 'disabled'}>
              <div class="small" data-arnote class="t-warn">${r.arChanged ? `törzsadat: ${fmtMoney(r.arMaster)}` : ''}</div></td>
            <td class="num c-f3" data-l="Érték" data-value>${r.q > 0 && r.ar ? fmtMoney(r.q * r.ar) : '–'}</td>
            <td class="c-act"><div class="row-icons">
              ${r.srcs.length > 1 && canEdit ? html`<button class="icon-btn" data-a="src" title="Másik beszerzési forrás (${r.srcs.length})" aria-label="Forrás váltása">${ICONS.swap}</button>` : ''}
              ${canEdit ? html`<button class="icon-btn" data-a="rm" title="Levétel a listáról" aria-label="Levétel">${ICONS.x}</button>` : ''}
            </div></td>
          </tr>`;
          })}</tbody></table></div>
        ${sup ? html`<div class="group-sum">
          ${web ? '' : html`<button class="btn btn-sm" data-a="quote" data-g="${k}" ${on.length ? '' : 'disabled'} title="Ajánlatkérő e-mail a kijelölt tételekre – rendelés rögzítése nélkül">Ajánlatkérés…</button>`}
          <span class="grow"></span>
          <span>${web ? 'Kosárban' : 'Kijelölve'}: <b data-cnt>${on.length} / ${list.length}</b> tétel</span>
          <span>Összesen: <b data-total>${fmtMoney(groupTotal(list))}</b></span>
        </div>` : ''}
      </div>`;
    }) : html`<div class="card"><div class="empty">A rendelési lista üres. Tegyél át tételeket a <a href="#" data-a="gojav">Feltöltési javaslatból</a>, vagy keress rá fent bármelyik tételre.</div></div>`}`);

  const addEl = body.querySelector('#add');
  if (addEl) attachPicker(addEl, {
    items: store.activeItems,
    exclude: () => new Set(Object.keys(draft.list)),
    onPick: t => {
      draft.list[t.tetel_id] = { origin: 'kezi' };
      save(); ctx.rerender();
      const inp = body.querySelector(`tr[data-id="${t.tetel_id}"] [data-k="q"]`);
      if (inp) { inp.focus(); inp.scrollIntoView({ block: 'nearest' }); }
    },
  });

  // Gépelés közben csak az érintett cellák frissülnek (nincs újrarajzolás, nem ugrik a fókusz)
  body.oninput = e => {
    const tr = e.target.closest('tr[data-id]');
    const k = e.target.dataset.k;
    if (!tr || (k !== 'q' && k !== 'ar')) return;
    draft.list[tr.dataset.id][k] = e.target.value;
    save();
    const all = listRows();
    const r = all.find(x => x.id === tr.dataset.id);
    tr.querySelector('[data-value]').textContent = r.q > 0 && r.ar ? fmtMoney(r.q * r.ar) : '–';
    tr.querySelector('[data-arnote]').textContent = r.arChanged ? `törzsadat: ${fmtMoney(r.arMaster)}` : '';
    const card = tr.closest('[data-group]');
    const totEl = card.querySelector('[data-total]');
    if (totEl) totEl.textContent = fmtMoney(groupTotal(all.filter(x => supKey(x.f) === card.dataset.group)));
  };
  body.onchange = e => {
    const k = e.target.dataset.k;
    if (k === 'all') {
      const g = e.target.dataset.g;
      rows.filter(r => supKey(r.f) === g).forEach(r => { draft.list[r.id].cart = e.target.checked; });
    } else if (k === 'cart') {
      draft.list[e.target.closest('tr[data-id]').dataset.id].cart = e.target.checked;
    } else return;
    save(); ctx.rerender();
  };
  body.onclick = async e => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    e.preventDefault();
    const a = b.dataset.a;
    const tr = b.closest('tr[data-id]');
    if (a === 'gojav') { ui.tab = 'javaslat'; return ctx.rerender(); }
    if (a === 'detail') return showItemDetail(tr.dataset.id);
    if (a === 'copycikk') return copyText(b.dataset.cikk);
    if (a === 'mode') { draft.mode = draft.mode || {}; draft.mode[b.dataset.g] = b.dataset.mode; save(); return ctx.rerender(); }
    if (a === 'openshop') {
      copyText(b.dataset.cikk); // előbb a másolás (felhasználói művelethez kötött), utána az új lap
      window.open(b.dataset.url, '_blank', 'noopener');
      tr.classList.add('row-opened');
      return;
    }
    if (a === 'rm') { delete draft.list[tr.dataset.id]; save(); return ctx.rerender(); }
    if (a === 'src') return pickSource(b, tr.dataset.id, ctx);
    const k = b.dataset.g;
    const sup = store.get('Beszallitok', k);
    const web = groupMode(k) === 'webshop';
    const list = listRows().filter(r => supKey(r.f) === k && included(r));
    const lines = list.map(r => ({ cikkszam: r.f ? r.f.cikkszam : '', megnevezes: r.t.megnevezes, q: r.q, me: r.t.mertekegyseg }));
    if (a === 'quote') return emailDialog({ supId: k, lines, tipus: 'ajanlat' });
    if (a === 'create') createOrder(k, sup, web, list, lines, ctx);
  };
}

function pickSource(anchor, id, ctx) {
  const sel = draft.list[id];
  const t = store.get('Tetelek', id);
  const { srcs, f } = sourceOf(id, sel);
  popover(anchor, html`<div class="pop-title">Beszerzési forrás</div>
    ${srcs.map(x => html`<button class="pop-item ${f && x.forras_id === f.forras_id ? 'sel' : ''}" data-f="${x.forras_id}">
      <span class="grow"><b>${store.supplierName(x.beszallito_id)}</b>${x.elsodleges ? html` <span class="star-on" title="Elsődleges forrás">${ICONS.star}</span>` : ''}
        <span class="small muted d-block">${x.cikkszam} · ${fmtNum(x.kiszereles)} ${t.mertekegyseg}/cs.</span></span>
      <span class="small nowrap">${x.egysegar ? fmtMoney(x.egysegar) : ''}</span></button>`)}`, {
    minWidth: 300,
    onMount: (el, close) => el.addEventListener('click', e => {
      const b = e.target.closest('[data-f]');
      if (!b) return;
      sel.forras_id = b.dataset.f;
      delete sel.q; delete sel.ar; delete sel.cart; // az új forrás kiszerelése / ára számít
      save(); close(); ctx.rerender();
    }),
  });
}

let creating = false; // rendelés létrehozása folyamatban (dupla rögzítés ellen)
async function createOrder(...args) {
  if (creating) return;
  creating = true;
  try { await createOrderInner(...args); } finally { creating = false; }
}
async function createOrderInner(k, sup, web, list, lines, ctx) {
  if (list.some(r => isNaN(r.q))) return toast('Hibás mennyiség a listában.', 'error');
  const sum = fmtMoney(list.reduce((a, r) => a + r.q * r.ar, 0));
  const changed = list.filter(r => r.arChanged);
  const v = await modal({
    title: web ? 'Rendelés rögzítése' : 'Rendelés létrehozása',
    body: html`<p>${store.supplierName(k)}: <b>${list.length} tétel</b>, ${sum}.
      ${web ? 'Rögzíted, hogy a webshopban leadtad a rendelést?' : ''} A tételek ezután „úton” lévőként jelennek meg.</p>
      ${changed.length ? html`<div class="notice notice-warn small">${changed.length} tételnél az egységár eltér a törzsadattól.</div>
        <label class="check"><input type="checkbox" name="arment" checked> Az új árakat mentsd el a törzsadatba is</label>` : ''}
      ${sec('Azonosítás (opcionális)', html`
        <label class="field"><span>Belső azonosító</span><input name="belso_azon" placeholder="pl. MiniCRM azonosító"></label>
        <label class="field"><span>Megjegyzés</span><input name="megjegyzes" placeholder="pl. webshop rendelésszám"></label>`)}`,
    actions: [{ label: 'Mégse', value: null }, {
      label: web ? 'Rögzítés' : 'Létrehozás', kind: 'primary',
      onClick: el => ({ arment: !!el.querySelector('[name=arment]')?.checked,
        belso_azon: el.querySelector('[name=belso_azon]').value.trim(), megjegyzes: el.querySelector('[name=megjegyzes]').value.trim() }),
    }],
  }).done;
  if (!v) return;
  const d = new Date();
  const rid = `R-${dateStamp(d)}-${L.newId('', 4)}`;
  try {
    await store.enqueue({
      type: 'rendeles',
      rendeles: { rendeles_id: rid, datum: d.toISOString(), beszallito_id: k, belso_azon: v.belso_azon,
        megjegyzes: v.megjegyzes || (web ? 'Webshop' : '') },
      sorok: list.map((r, i) => ({ sor_id: `${rid}-${i + 1}`, tetel_id: r.id, forras_id: r.f.forras_id,
        cikkszam: r.f.cikkszam, mennyiseg: r.q, egysegar: r.ar, megjegyzes: '' })),
    });
    if (v.arment) for (const r of changed) await store.enqueue({ type: 'forras_ar', forras_id: r.f.forras_id, egysegar: r.ar });
    list.forEach(r => { delete draft.list[r.id]; });
    save();
    ctx.rerender();
    if (web) toast(`Rendelés rögzítve (${rid})`, 'ok');
    else emailDialog({ supId: k, lines, rid, tipus: 'rendeles', title: `Rendelés létrehozva – ${rid}` });
  } catch (x) { toast(x.message, 'error', 6000); }
}

/* ---------- Rendelések ---------- */
function renderOrders(body, ctx) {
  const db = store.state.db;
  const all = db.Rendelesek.map(o => ({ o, info: L.orderInfo(db, o) })).sort((a, b) => (a.o.datum < b.o.datum ? 1 : -1));
  const match = matcher(ui.oq || '');
  const list = (ui.all ? all : all.filter(x => x.info.statusz === 'nyitott' || x.info.statusz === 'reszben'))
    .filter(x => match(store.orderSearchText(x.o)));
  const canEdit = store.can('raktaros');
  body.innerHTML = String(html`
    <div class="toolbar">
      <input type="search" data-oq placeholder="Keresés (beszállító, rendelésszám, belső azonosító)…" value="${ui.oq || ''}">
      <button class="chip ${ui.all ? '' : 'on'}" data-a="open">Nyitott</button>
      <button class="chip ${ui.all ? 'on' : ''}" data-a="all">Összes (${all.length})</button>
    </div>
    <div class="card">${list.length ? list.map(({ o, info }) => {
      const [lbl, cls] = ORDER_STATUS[info.statusz];
      const isOpen = ui.open.has(o.rendeles_id);
      return html`<div class="list-item" data-a="toggle" data-r="${o.rendeles_id}">
          <div class="grow"><b>${store.supplierName(o.beszallito_id)}</b>${o.belso_azon ? html` <span class="badge badge-muted" title="Belső azonosító">${o.belso_azon}</span>` : ''}
            <div class="small muted">${o.rendeles_id} · ${fmtDate(o.datum)} · ${info.sorok.length} tétel · ${store.userName(o.letrehozta)}${o.megjegyzes && o.megjegyzes !== 'Webshop' ? ` · ${o.megjegyzes}` : ''}</div></div>
          <span class="nowrap small">${fmtMoney(info.ertek)}</span>
          <span class="badge badge-${cls}">${lbl}</span><span aria-hidden="true">${isOpen ? '▾' : '▸'}</span>
        </div>
        ${isOpen ? html`<div style="padding:0 1rem 1rem;border-bottom:1px solid var(--border)">
          <div class="table-wrap"><table class="tbl small cards nochk flow">
            <thead><tr><th>Tétel</th><th>Cikkszám</th><th class="num">Rendelt</th><th class="num">Megérkezett</th><th>Állapot</th></tr></thead>
            <tbody>${info.sorok.map(s => {
              const t = store.itemOrStub(s.tetel_id);
              const full = s.beerkezett >= s.mennyiseg;
              return html`<tr><td class="c-main">${t.megnevezes}</td><td data-l="Cikkszám">${s.cikkszam}</td>
                <td class="num" data-l="Rendelt">${fmtNum(s.mennyiseg)} ${t.mertekegyseg}</td>
                <td class="num" data-l="Megjött">${fmtNum(s.beerkezett)}</td>
                <td data-l="Állapot">${full ? html`<span class="badge badge-ok">Megérkezett</span>` : s.lezarva ? html`<span class="badge badge-muted">Lezárva (hiányos)</span>`
                  : s.beerkezett > 0 ? html`<span class="badge badge-warn">Részben</span>` : html`<span class="badge badge-info">Várakozik</span>`}</td></tr>`;
            })}</tbody></table></div>
          <div class="toolbar" style="margin:.75rem 0 0">
            ${canEdit && info.nyitottSorok ? html`<a class="btn btn-primary btn-sm" href="#/beerkezes?r=${encodeURIComponent(o.rendeles_id)}">Beérkezés rögzítése</a>` : ''}
            <button class="btn btn-sm" data-a="mail" data-r="${o.rendeles_id}">E-mail…</button>
            ${canEdit ? html`<button class="btn btn-sm" data-a="meta" data-r="${o.rendeles_id}" title="Belső azonosító és megjegyzés">Azonosító, megjegyzés…</button>` : ''}
            ${canEdit && info.nyitottSorok && info.sorok.some(s => s.beerkezett > 0) ? html`<button class="btn btn-sm btn-danger" data-a="close" data-r="${o.rendeles_id}" title="A hiányzó mennyiségekre nem vársz tovább">Rendelés lezárása</button>` : ''}
            ${canEdit && !info.sorok.some(s => s.beerkezett > 0) ? html`<button class="btn btn-sm btn-danger" data-a="delete" data-r="${o.rendeles_id}" title="Téves vagy meghiúsult rendelés törlése (még semmi nem érkezett belőle)">Rendelés törlése</button>` : ''}
          </div>
        </div>` : ''}`;
    }) : html`<div class="empty">Nincs ${ui.all ? '' : 'nyitott '}rendelés.</div>`}</div>`);

  const linesOf = rid => L.orderInfo(db, store.get('Rendelesek', rid)).sorok.map(s => {
    const t = store.itemOrStub(s.tetel_id);
    return { cikkszam: s.cikkszam, megnevezes: t.megnevezes, q: s.mennyiseg, me: t.mertekegyseg };
  });
  body.onchange = null;
  body.oninput = e => {
    if (!e.target.matches('[data-oq]')) return;
    ui.oq = e.target.value;
    const pos = e.target.selectionStart;
    renderOrders(body, ctx);
    const inp = body.querySelector('[data-oq]');
    inp.focus();
    inp.setSelectionRange(pos, pos);
  };
  body.onclick = async e => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a, rid = b.dataset.r;
    if (a === 'open' || a === 'all') { ui.all = a === 'all'; return ctx.rerender(); }
    if (a === 'toggle') { ui.open.has(rid) ? ui.open.delete(rid) : ui.open.add(rid); return ctx.rerender(); }
    if (a === 'mail') return emailDialog({ supId: store.get('Rendelesek', rid).beszallito_id, lines: linesOf(rid), rid, tipus: 'rendeles' });
    if (a === 'meta') {
      const o = store.get('Rendelesek', rid);
      const v = await modal({
        title: `Rendelés – ${rid}`,
        body: html`<div class="form-col">
          <label class="field"><span>Belső azonosító</span><input name="belso_azon" value="${o.belso_azon || ''}" placeholder="pl. MiniCRM azonosító"></label>
          <label class="field"><span>Megjegyzés</span><input name="megjegyzes" value="${o.megjegyzes || ''}"></label></div>`,
        actions: [{ label: 'Mégse', value: null }, { label: 'Mentés', kind: 'primary',
          onClick: el => ({ belso_azon: el.querySelector('[name=belso_azon]').value, megjegyzes: el.querySelector('[name=megjegyzes]').value }) }],
      }).done;
      if (!v) return;
      try { await store.enqueue({ type: 'rendeles_adat', rendeles_id: rid, ...v }); toast('Mentve', 'ok'); }
      catch (x) { toast(x.message, 'error'); }
      return;
    }
    if (a === 'close') {
      if (!(await confirmDialog('Rendelés lezárása', 'A még meg nem érkezett mennyiségekre nem vársz tovább. A rendelési javaslat újra számol ezekkel a tételekkel.', 'Lezárás', 'danger'))) return;
      try { await store.enqueue({ type: 'rendeles_lezaras', rendeles_id: rid }); toast('Rendelés lezárva', 'ok'); }
      catch (x) { toast(x.message, 'error'); }
    }
    if (a === 'delete') {
      if (!(await confirmDialog('Rendelés törlése', 'A rendelés és minden sora végleg törlődik. A tételek ismét megjelennek a feltöltési javaslatban. Folytatod?', 'Törlés', 'danger'))) return;
      try { await store.enqueue({ type: 'rendeles_torles', rendeles_id: rid }); ui.open.delete(rid); toast('Rendelés törölve', 'ok'); }
      catch (x) { toast(x.message, 'error'); }
    }
  };
}

export default {
  // A rendelési listán gépelés folyik → ott nem rajzolunk újra szinkronkor
  get liveUpdate() { return ui.tab !== 'lista'; },
  render(root, params, ctx) {
    if (draft === undefined) {
      root.innerHTML = '<p class="muted">Betöltés…</p>';
      loading = loading || store.drafts.get('javaslat').then(d => {
        draft = d && d.list ? d : { list: {}, skip: {} }; // régi formátumú vázlat eldobása
      });
      loading.then(() => ctx.rerender());
      return;
    }
    const db = store.state.db;
    const openCount = db.Rendelesek.filter(o => ['nyitott', 'reszben'].includes(L.orderInfo(db, o).statusz)).length;
    const sugCount = Object.values(store.state.stock).filter(s => s.javaslat > 0 && !draft.list[s.tetel_id] && store.get('Tetelek', s.tetel_id)?.aktiv).length;
    const listCount = Object.keys(draft.list).filter(id => store.get('Tetelek', id)).length;
    root.innerHTML = String(html`
      <div class="page-head"><h1>Rendelés</h1>
        <div class="actions"><button class="btn" data-print>Nyomtatás</button></div></div>
      <div class="tabs">
        <button class="${ui.tab === 'javaslat' ? 'active' : ''}" data-tab="javaslat">Feltöltési javaslat (${sugCount})</button>
        <button class="${ui.tab === 'lista' ? 'active' : ''}" data-tab="lista">Rendelési lista (${listCount})</button>
        <button class="${ui.tab === 'rendelesek' ? 'active' : ''}" data-tab="rendelesek">Rendelések (${openCount} nyitott)</button>
      </div>
      <div id="tabbody"></div>`);
    root.querySelector('.tabs').onclick = e => {
      const b = e.target.closest('[data-tab]');
      if (b) { ui.tab = b.dataset.tab; ctx.rerender(); }
    };
    root.querySelector('[data-print]').onclick = () => window.print();
    const body = root.querySelector('#tabbody');
    if (ui.tab === 'javaslat') renderJavaslat(body, ctx);
    else if (ui.tab === 'lista') renderLista(body, ctx);
    else renderOrders(body, ctx);
  },
};
