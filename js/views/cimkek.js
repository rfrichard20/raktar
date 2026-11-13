// QR-címkék nyomtatása Avery LCV11368 ívre (A4, 3×8 = 24 címke, 70×35 mm): tételek, polcok / helyek, eszközök.
// A címke QR-kódja egy link (qr.js → codeLink): bármelyik telefon kamerájával, ill. az app beolvasójával megnyitható.
import * as store from '../store.js';
import { html, help, matcher, modal, toast, sec, printDoc } from '../ui.js';
import { codeLink, loadQr, qrSvg } from '../qr.js';

const PER_PAGE = 24;
const KINDS = [['tetel', 'Tételek'], ['hely', 'Polcok, helyek'], ['eszkoz', 'Eszközök']];

/** A választható címkék fajtánként: { key, kereső szöveg, sor (lista), címke (nyomtatás) }. */
function sources(kind) {
  const db = store.state.db;
  if (kind === 'tetel') {
    const cikk = {};
    (db.Forrasok || []).filter(f => f.elsodleges).forEach(f => { cikk[f.tetel_id] = f.cikkszam; });
    return store.materials().slice().sort(store.byPlace).map(t => ({
      key: t.tetel_id, text: `${t.megnevezes} ${store.placeLabel(t)} ${t.kategoria} ${cikk[t.tetel_id] || ''}`,
      row: html`<b>${t.megnevezes}</b> <span class="small muted">${store.placeLabel(t)}</span>`,
      label: () => html`${qrSvg(codeLink.tetel(t.tetel_id))}<div class="lt"><div class="l1">${t.megnevezes}</div>
        <div class="l2">${store.placeLabel(t)}</div>${cikk[t.tetel_id] ? html`<div class="l2">Cikkszám: ${cikk[t.tetel_id]}</div>` : ''}</div>`,
    }));
  }
  if (kind === 'hely') {
    // A tételek és az eszközök tárolási helyei együtt (egy polcon lehet anyag és eszköz is)
    const seen = new Map();
    const add = (o, kind) => {
      const k = `${o.raktar || ''}|${o.polc}`;
      if (!seen.has(k)) seen.set(k, { r: o.raktar || '', p: o.polc, n: 0, e: 0 });
      seen.get(k)[kind]++;
    };
    store.materials().filter(t => t.polc).forEach(t => add(t, 'n'));
    (db.Eszkozok || []).filter(e => e.polc && e.allapot !== 'selejtezve').forEach(e => add(e, 'e'));
    return [...seen.entries()].sort((a, b) => (a[1].r || '~').localeCompare(b[1].r || '~', 'hu') || a[1].p.localeCompare(b[1].p, 'hu', { numeric: true })).map(([k, x]) => ({
      key: k, text: `${x.r} ${x.p}`,
      row: html`<b>${x.p}</b> <span class="small muted">${[x.r, x.n && `${x.n} tétel`, x.e && `${x.e} eszköz`].filter(Boolean).join(' · ')}</span>`,
      label: () => html`${qrSvg(codeLink.hely(x.r, x.p))}<div class="lt"><div class="big">${x.p}</div><div class="l2">${x.r}</div></div>`,
    }));
  }
  const pending = new Set(store.state.outbox.filter(o => o.type === 'eszkoz_mentes' && o.eszkoz).map(o => o.eszkoz.eszkoz_id));
  return (db.Eszkozok || []).filter(e => e.allapot !== 'selejtezve')
    .sort((a, b) => a.azonosito.localeCompare(b.azonosito, 'hu', { numeric: true })).map(e => ({
      key: e.eszkoz_id, text: `${e.azonosito} ${e.megnevezes} ${e.kategoria}`,
      // Még fel nem töltött eszköz: a címkekódja a szerveren még módosulhat (pl. két készülékről offline ugyanazt a
      // sorszámot kapta) – a címkéje csak a feltöltés után nyomtatható, hogy a kinyomtatott szám biztosan végleges legyen
      blocked: pending.has(e.eszkoz_id),
      row: html`<b>${e.azonosito}</b> ${e.megnevezes}${pending.has(e.eszkoz_id) ? html` <span class="small t-warn">· feltöltésre vár – utána nyomtatható</span>` : ''}`,
      label: () => html`${qrSvg(codeLink.eszkoz(e.azonosito))}<div class="lt"><div class="big">${e.azonosito}</div>
        <div class="l1">${e.megnevezes}</div>${e.gyari_szam ? html`<div class="l2">${e.gyari_szam}</div>` : ''}</div>`,
    }));
}

/** Címkeívek: az első `skip` hely üresen marad (félig felhasznált ív), lapváltás 24 címkénként. */
function sheetsHtml(labels, skip) {
  const cells = [...Array(skip).fill(null), ...labels];
  const pages = [];
  for (let i = 0; i < cells.length; i += PER_PAGE) pages.push(cells.slice(i, i + PER_PAGE));
  return html`${pages.map(p => html`<div class="labels-page">${p.map(l => html`<div class="label">${l || ''}</div>`)}</div>`)}`;
}

/**
 * Címkenyomtatás ablak. kind: kezdő fül ('tetel' | 'hely' | 'eszkoz'); pre: előre kijelölt kulcsok.
 */
export function openLabels(kind = 'tetel', pre = []) {
  const sel = { tetel: new Set(), hely: new Set(), eszkoz: new Set() };
  pre.forEach(k => sel[kind].add(k));
  let q = '';
  const listHtml = () => {
    const match = matcher(q);
    const list = sources(kind).filter(s => match(s.text));
    const ok = list.filter(s => !s.blocked);
    const all = ok.length && ok.every(s => sel[kind].has(s.key));
    return html`${ok.length ? html`<label class="check-row"><input type="checkbox" data-all ${all ? 'checked' : ''}><span class="grow"><b>Mind (${ok.length})</b></span></label>` : ''}
      ${list.map(s => html`<label class="check-row ${s.blocked ? 'off' : ''}"><input type="checkbox" data-k="${s.key}" ${sel[kind].has(s.key) && !s.blocked ? 'checked' : ''} ${s.blocked ? 'disabled' : ''}><span class="grow">${s.row}</span></label>`)}
      ${list.length ? '' : html`<div class="empty small">Nincs találat.</div>`}`;
  };
  const count = () => Object.values(sel).reduce((a, s) => a + s.size, 0);
  modal({
    title: 'QR-címkék nyomtatása',
    wide: true,
    body: html`
      <div class="toolbar" style="margin-bottom:.5rem">
        <div class="seg" role="group" aria-label="Címke fajtája">${KINDS.map(([k, l]) => html`<button type="button" class="${k === kind ? 'on' : ''}" data-kind="${k}">${l}</button>`)}</div>
        ${help(html`Avery LCV11368 (vagy azonos méretű) ívre: A4, 3×8 = 24 címke, 70×35 mm.<br><br>Nyomtatáskor a méretezés legyen <b>100% / Tényleges méret</b> (ne „Igazítás az oldalhoz”), a margó <b>Alapértelmezett</b>. Előbb érdemes sima papírra nyomtatni, és az ívre illesztve ellenőrizni.<br><br>A QR-kód linket tartalmaz: bármelyik telefon kamerájával megnyitja az appot (belépés után) a tétel / eszköz adatlapján, ill. a polc tételeivel.`)}
      </div>
      <input type="search" data-q placeholder="Keresés…" style="margin-bottom:.5rem">
      <div class="check-list" data-list>${listHtml()}</div>
      ${sec('Nyomtatás', html`
        <label class="field"><span>Kezdés az ív hányadik címkéjén</span><select name="skip">${Array.from({ length: PER_PAGE }, (_, i) => html`<option value="${i}">${i + 1}.${i ? '' : ' (új ív)'}</option>`)}</select></label>
        <label class="field"><span>Példány címkénként</span><input name="copies" type="number" min="1" max="24" value="1" inputmode="numeric"></label>`)}
      <p class="small muted" data-count style="margin:.5rem 0 0"></p>`,
    onMount: el => {
      const list = el.querySelector('[data-list]');
      const upd = () => { el.querySelector('[data-count]').textContent = `Kijelölve: ${count()} címke`; };
      const redraw = () => { list.innerHTML = String(listHtml()); upd(); };
      upd();
      el.querySelector('[data-q]').addEventListener('input', e => { q = e.target.value; redraw(); });
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-kind]');
        if (!b) return;
        kind = b.dataset.kind;
        el.querySelectorAll('[data-kind]').forEach(x => x.classList.toggle('on', x === b));
        redraw();
      });
      list.addEventListener('change', e => {
        if (e.target.matches('[data-all]')) {
          const match = matcher(q);
          sources(kind).filter(s => match(s.text) && !s.blocked).forEach(s => (e.target.checked ? sel[kind].add(s.key) : sel[kind].delete(s.key)));
          return redraw();
        }
        const k = e.target.dataset.k;
        if (k) { if (e.target.checked) sel[kind].add(k); else sel[kind].delete(k); upd(); }
      });
    },
    actions: [{ label: 'Bezárás', value: null }, {
      label: 'Nyomtatás…', kind: 'primary', onClick: async el => {
        if (!count()) { toast('Jelölj ki legalább egy címkét.', 'warn'); return false; }
        try { await loadQr(); } catch (x) { toast(x.message, 'error'); return false; }
        const copies = Math.min(24, Math.max(1, Number(el.querySelector('[name=copies]').value) || 1));
        const skip = Number(el.querySelector('[name=skip]').value) || 0;
        // Fajtánként a lista sorrendjében (tételek bejárási sorrendben); a közben feltöltésre váró eszközök kimaradnak
        const chosen = KINDS.flatMap(([k]) => sources(k).filter(s => sel[k].has(s.key)));
        const held = chosen.filter(s => s.blocked).length;
        if (held) toast(`${held} eszköz még nincs feltöltve, a címkéje kimarad (feltöltés után nyomtatható).`, 'warn', 6000);
        if (held === chosen.length) return false;
        const labels = chosen.filter(s => !s.blocked).flatMap(s => Array(copies).fill(null).map(() => s.label()));
        printDoc(sheetsHtml(labels, skip));
        return false; // az ablak nyitva marad (pl. újranyomtatás, másik ív)
      },
    }],
  });
}
