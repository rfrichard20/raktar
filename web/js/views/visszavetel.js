// Visszavétel – a kiadott eszközök visszavétele: személyenként (és szervizenként) a kint lévő eszközök, innen indul a
// visszavétel (állapottal, aláírással, elismervénnyel), ill. egy eszközcímke beolvasásával. A kiadás párja (Kiadás oldal).
import * as store from '../store.js';
import { html, help } from '../ui.js';
import { peopleHtml, printPersonList, handover, openTool } from './eszkozok.js';
import { scanCodes, scanButton, codeItem } from '../qr.js';

const L = window.RaktarLogic;
const ui = { q: '' };

export default {
  render(root) {
    // Már kirajzolva (pl. szinkron után): csak a lista frissül, a kereső fókusza megmarad
    if (root.dataset.view === 'visszavetel' && root.querySelector('[data-body]')) { root.querySelector('[data-body]').innerHTML = String(peopleHtml(ui.q)); return; }
    root.dataset.view = 'visszavetel';
    root.innerHTML = String(html`
      <div class="page-head"><h1>Visszavétel</h1>${help(html`A kiadott eszközök visszavétele. Személyenként látszik, kinél mi van; a „Visszavétel…” gombbal a nála lévők (alapból mind kijelölve) visszavehetők, eszközönként állapottal (rendben, javítandó, elveszett), a visszaadó aláírásával. Telefonon egy eszközcímke beolvasásával is indítható.<br><br>A „Lista nyomtatása” a nála lévő eszközök listája aláírási helyekkel (pl. kilépéskor).`)}</div>
      <div class="card">
        <div class="toolbar card-toolbar">
          <input type="search" data-q placeholder="Keresés (személy, eszköz)…" value="${ui.q}">
          ${scanButton('scan', 'Eszközcímke beolvasása')}
        </div>
        <div data-body>${peopleHtml(ui.q)}</div>
      </div>`);
    root.querySelector('[data-q]').addEventListener('input', e => { ui.q = e.target.value; root.querySelector('[data-body]').innerHTML = String(peopleHtml(ui.q)); });
    root.onclick = e => {
      const b = e.target.closest('[data-a]');
      if (b) {
        if (b.dataset.a === 'ret') return handover('VISSZAVETEL', { kinel: b.dataset.k });
        if (b.dataset.a === 'plist') return printPersonList(b.dataset.k);
        // Beolvasott eszköz: a visszavétel annál a személynél, akinél van, ezzel az eszközzel kijelölve (a többi a visszavételi ablakban olvasható be)
        if (b.dataset.a === 'scan') return scanCodes({ title: 'Visszavett eszköz beolvasása', hint: 'Eszközcímke: megnyílik a visszavétel annál, akinél az eszköz van.', onCode: c => {
          const x = c && c.tipus === 'eszkoz' ? codeItem(c) : null;
          const s = x ? L.toolStates(store.state.db)[x.eszkoz_id] : null;
          if (!s || s.hely !== 'kiadva') return false;
          setTimeout(() => handover('VISSZAVETEL', { ids: [x.eszkoz_id], kinel: s.kinel }), 0);
          return '';
        } });
      }
      const row = e.target.closest('[data-e]');
      if (row) { const t = store.get('Eszkozok', row.dataset.e); if (t) openTool(t.azonosito); }
    };
  },
};
