# Fejlesztői kézikönyv – komponensek és segédfüggvények jegyzéke

Ez a jegyzék az app **építőkockáit** sorolja fel. Szabály: új funkciónál előbb itt kell keresni, és ha van
megfelelő elem, azt kell használni. Újat csak akkor kell írni, ha nincs, és akkor **ide is fel kell venni**
(a megfelelő szakaszba, egy sorban: mire való, hogyan kell használni).

Ha egy meglévő elem majdnem jó, inkább azt kell bővíteni (pl. egy új változatosztállyal), mint egy
hasonlót írni mellé.

---

## 1. Alapszabályok

| Téma | Szabály |
|---|---|
| HTML előállítás | Mindig a `` html`…` `` sablonnal (automatikusan escape-el). `raw()` csak saját, állandó tartalomra (ikon SVG). Felhasználói / Sheetből jövő szöveg soha ne kerüljön `raw()`-ba vagy kézi `innerHTML` összefűzésbe. |
| Színek | Csak a `:root` változói (`--ok`, `--err`, `--warn`, `--info`, `--caution`, `--star`, `--purple`, `--chart` …). Új szín: változóként a `:root` **és mindkét** sötét blokkba. Beégetett `#hex` a komponensekben nem lehet. |
| Állapotszín | Az elem az `st-hiany` / `st-figyelem` / `st-ok` (vagy sornál `st-row-…`) osztályt kapja, ez beállítja a `--st` változót; a komponens `var(--st)`-t használ. |
| Inline `style` | Csak egyedi méretre (pl. `<col style="width:12%">`). Ismétlődő stílusból osztály kell. |
| Táblázat mobilon | Minden lista `.tbl.cards` (lásd 4. pont). Másik mobilos táblázatrendszert nem szabad bevezetni. |
| Hosszú szöveg | A `body` szinten `overflow-wrap: break-word` van: a szóköz nélküli szöveg (e-mail, link) magától törik. Egysoros megjelenítéshez `.nowrap` / `.ellipsis`. Kártyán a hosszú mező `c-wide`. |
| Mobil | Töréspontok: **699 px** (kártyák, kis elemek), **899 px** (alsó navigáció), **600 px** (teljes képernyős ablak). Beviteli mező mobilon 16 px (iOS nagyítás ellen) – ez globális, nem kell külön. |
| Közös logika | Üzleti szabály (ellenőrzés, számítás, jogosultság) a `web/js/logic.js`-be kerül, és **változatlanul** átmásolandó az `apps-script/Logic.gs`-be. |
| Kiadás | Bármely `web/` fájl változásakor a `web/sw.js` `VERSION` értékét növelni kell. |
| Súgó | `help()`-nek jelölést (pl. `<br>`, `<b>`) tartalmazó szöveget mindig `` html`…` ``-ként kell adni; sima `'…'` szövegben a jelölés betű szerint jelenne meg. |
| Eltérés színe | Előjel szerint: többlet (+) zöld `.t-ok`, hiány (−) narancs `.t-warn`, nagy hiány piros `.t-err` (leltár: `diffClass`). |
| Táblázatfejléc | Asztalon (≥ 900 px) görgetéskor a felső sáv alatt marad – magától, ha a táblázat `.table-wrap`-ban van. Felugró ablakban nem ragad. |

---

## 2. A böngésző beépített elemei – ezeket használjuk saját megoldás helyett

Kisebb kód, ismerős működés minden eszközön (mobilon a rendszer saját választója nyílik). Saját vezérlőt csak akkor írunk,
ha a beépített nem tudja, amit kell (pl. a tételkereső, mert több mezőben keres és új tételt is felvehet).

| Igény | Megoldás |
|---|---|
| Szabad szöveg korábbi értékek felajánlásával (átvevő, munka / projekt, belső azonosító, polc) | `suggestInput(name, érték, értékek, placeholder)` → `<input list>` + `<datalist>`. Értékforrás: `store.recentValues(sorok, mező, dátummező)`, `store.shelves()`. |
| Választás ellenőrzött listából (kategória, mértékegység, raktár) | `<select>` – a `listSelect()` „+ Új …” lehetőséggel. |
| Egyéb rögzített választás (szerepkör, rendelési mód, sablon) | `<select>` vagy `.seg` / `.chip` gombok, ha 2–4 lehetőség van és mindet látni kell. |
| Dátum | `<input type="date">` (`todayInput()` / `max` a jövő tiltására; értékből `dateInputToIso`). |
| Szám | `<input inputmode="decimal">` + `parseNum()` (vesszőt is elfogad; a `type="number"` tizedesvessző-kezelése böngészőnként eltér). |
| Kereső | `<input type="search">` – az app automatikusan ikont és törlőgombot tesz bele. |
| Igen / nem | `<input type="checkbox">` (`.check` címkével); egy a többből: `radio` (`.opt` kártyák, `.star-pick`). |
| E-mail megnyitása | `mailto:` link (`emailDialog`). Vágólap: `copyText()`. |

---

## 3. Segédfüggvények (JS)

### Közös elemek – `web/kozos/` (KÖZÖS fájlok, forrásuk a `..\Kozos_Claude` repó)
Itt **nem szerkeszthetők**: módosítás a Kozos_Claude-ban, majd `Kozos_Claude\szinkron.ps1` (a másolatok első sora jelzi;
kézzel átírt másolatnál a szkript megáll). A jegyzékük: `..\Kozos_Claude\FEJLESZTES.md`. Röviden:
- `kozos/ui.js` (a `js/ui.js` újraexportálja, a nézetek onnan importálnak): `html`, `raw`, `esc`, `fmtNum`, `fmtDate`, `fmtTime`, `ymd`,
  `norm`, `matcher`, `sortArrow`, `toast`, `modal`, `confirmDialog`, `suggestInput`, `formValues`, `sec`, `popover`, `closePopover`, `copyText`.
- `kozos/idb.js` (`createStore`; a `js/idb.js` a `'raktar'` / `'raktar:'` példány), `kozos/theme.js` (`window.AppTheme`),
  `kozos/kozos.css` (Poppins, színtokenek, alapelemek, segédosztályok), `apps-script/Kozos.gs` (bejelentkezés, munkamenet, adatverzió).

### `web/js/ui.js` – a Raktár saját felületi segédei
| Név | Mire |
|---|---|
| `fmtMoney(n)` | Pénz („12 345 Ft”), ezres tagolással. |
| `dateStamp(d?)`, `todayInput()`, `dateInputToIso(v)` | Bizonylatszám-dátum `ÉÉÉÉHHNN`; dátummező értéke `ÉÉÉÉ-HH-NN`; dátummező → ISO (ma: pontos idő, máskor dél). |
| `parseNum(v)` | Szövegből szám (vessző / szóköz is jó); hibára `NaN`. |
| `compare(a, b)` | Rendezés (szám számként, szöveg magyar ábécé szerint). |
| `help(szöveg)` | „?” súgó ikon (rámutatásra / koppintásra). Jelmagyarázat, magyarázat ide kerüljön, ne a felületre. |
| `keepFocusInPlace(fn)` (`app.js`) | Háttérfrissítés (szinkron, menü, szinkronjelző) közben a fókuszban lévő beviteli mező a képernyőn a helyén marad (pl. leltározáskor ne ugorjon a ragadós fejléc alá). |
| `STATUS_TEXT`, `ORDER_STATUS` | Készletállapot szövegei; rendelésállapot `[felirat, badge-szín]`. |
| `igenyStatus(statusz)` | Igény állapota `[felirat, badge-szín]` (feliratok: `L.IGENY_STATUS`). |
| `isoToInput(iso)` | ISO dátum → `<input type=date>` értéke (helyi idő szerint); üresre üres. |
| `signaturePad(konténer)` → `{ value(), clear() }` | **Aláírópad** (ujj / egér). A rajz SVG vonalakként (`M x y L x y …`, 600×200 rács) tárolódik; a szerver csak ilyen szöveget fogad el. |
| `signatureSvg(rajz)` | Tárolt aláírás megjelenítése (csak érvényes vonalrajzot rajzol ki). |
| `printDoc(tartalom)` | **Nyomtatható dokumentum** (elismervény, lista): a `#print-root`-ba kerül, nyomtatáskor csak az látszik (PDF-be is menthető). Tartalma `.doc` osztályú blokk (`.doc-meta`, táblázat, `.doc-signs` / `.doc-sign` aláírási helyek). |

### `web/js/store.js` – adatok és szinkron
| Név | Mire |
|---|---|
| `state` | `user`, `db` (szerver + még fel nem töltött műveletek), `stock` (számított készlet tételenként) … |
| `can('raktaros' | 'arak' | 'rendeles' | 'kimutatas' | 'mozgasok' …)` | Jogosultság (szerepkör vagy láthatósági jog – `RaktarLogic.PERMS`). A `mozgasok` csak menüt rejt (az adat mindenkinél megvan). Az `igenyek` jog nélkül a szerver csak a saját igényeket küldi el. |
| Teljesítmény | `enqueue` a meglévő állapotra alkalmazza az új műveletet (nem számol mindent újra); változatlan szinkron (`'status'` esemény) nem rajzolja újra a nézeteket; a `state.db` objektum minden adatváltozáskor új → erre lehet gyorsítótárat kötni (minta: `common.js` `itemSearchText`). |
| `enqueue(op)` | Művelet rögzítése (azonnal látszik, offline is). Hibát dob, ha a logika elutasítja → `try/catch` + `toast`. |
| `get(tábla, id)`, `itemOrStub(id)` | Rekord lekérése; tétel helyettesítővel (ha már törölt). |
| `activeItems()`, `categories()`, `warehouses()` | Aktív tételek; kategória- és raktárlista. |
| `supplierName(id)`, `userName(email)`, `placeLabel(t)` | Megjelenítendő név / hely („Raktár · Polc”). |
| `byPlace` | Rendezés bejárási sorrendben: `lista.sort(store.byPlace)`. |
| `recentValues(sorok, mező, dátummező)`, `shelves()` | Egy mező eddigi értékei (legutóbbi elöl); a használt polcok – javaslatlistához. |
| `nextListOrder(tipus)` | Új választólista-elem sorszáma (legnagyobb + 1). |
| Szinkron | `enqueue` után 0,8 mp kötegelés; kérés-időkorlát 60 mp (`backend.js`); hiba után magától újrapróbál (15 mp → 3 perc). Feltöltendő nélkül csak verzióegyeztetés (`state.version`, szerveren `DATA_VERSION`): változatlan adatot nem tölt le újra. A szerveren minden adatírás (`writeChanges`, import, kézi szerkesztés: `onEdit`) új verziót ad. **Mérés:** a szerver válaszában `timing` (ms: `auth`, `lock`, `read`, `apply`, `write`, `total` – `Code.gs` `stopwatch()`), az app `state.syncLog`-ban gyűjti az utolsó 20 kérést (teljes idő, méret, helyi feldolgozás) – Fiók oldal → Szinkron mérés. Szinkront érintő gyorsítás előtt és után ezt kell megnézni. |
| `orderSearchText(o)`, `openOrders()` | Rendelés kereshető szövege (`matcher`-rel); nyitott / részben teljesült rendelések `{ o, info }` alakban, a legújabb elöl (menüszám, Beérkezés, Rendelés – egy helyen számolva). |
| `draftSlot(kulcs, init?)` | **Folyamat vázlata** (leltár, beérkezés, kivét, rendelési lista): `slot.draft` (undefined = töltődik, null = nincs folyamatban), `slot.save()`, `await slot.clear()`, `if (!slot.ready(root, ctx)) return;` a `render` elején, `slot.once(async () => …)` a rögzítéshez (dupla koppintás ellen), `await slot.load()` ha egy másik oldal tesz a vázlatba (pl. `addToOrderList`). Új folyamat vázlatát is így kell kezelni. Az alacsony szintű `drafts.get/set/del` csak ezen belül kell. |
| `myOutbox()` | A bejelentkezett felhasználó feltöltésre váró műveletei. |
| `getPref(kulcs, alap)`, `setPref(kulcs, érték)` | Eszközszintű beállítás (localStorage, `raktar:` előtaggal; privát módban az alapérték). Változáskor `emit('pref')` → `app.js` `applyPrefs()`. Pl. `help`: súgó ikonok be/ki (`body.no-help`). |
| `NAV_MAX`, `getNavOrder()`, `setNavOrder(kulcsok)` | Mobil alsó menü: az első `NAV_MAX` menüpont van kint, a többi ebben a sorrendben a „Több” menüben; a sorrend a felhasználóé (`getPref('navOrder')`, Fiók oldal). Az `app.js` `navRoutes()` (saját sorrendben) / `navPinned()` adja az elérhető, illetve kint lévő menüpontokat. |

### `web/js/views/common.js` – több oldalon használt elemek
| Név | Mire |
|---|---|
| `attachPicker(input, { items, onPick, exclude?, showAll?, allowCreate?, defaultSupplier? })` | Tételkereső legördülő (név, kategória, polc, cikkszám); „+ Új tétel” lehetőséggel. |
| `qr.js`: `codeLink.tetel/eszkoz/hely`, `parseCode(szöveg)`, `codeItem(kód)` | **QR-kódok.** A címke linket tartalmaz (`…/#/q?t=` tétel, `?e=` eszköz-címkekód, `?r=&p=` raktár + polc); a `#/q` útvonal és a felső sáv beolvasója ezt nyitja meg (`app.js` → `openCode`). A `parseCode` a puszta eszköz- / tételazonosítót is felismeri. |
| `loadQr()` + `qrSvg(szöveg)` | QR-kód SVG-ként (a `js/vendor/qrcode.js` csak ekkor töltődik be). Kép (data: URI) nem használható – a CSP tiltja. |
| `scanCodes({ title, hint, onCode, keepOpen })`, `scanButton(akció, felirat)` | **Kamerás beolvasó.** `onCode(kód, nyers)` → üzenet (elfogadva) vagy `false` (itt nem használható). `keepOpen`: több kód egymás után. A beépített `BarcodeDetector`, ahol nincs: `js/vendor/jsQR.js`. A `scanButton` a keresők mellé való; csak érintőképernyőn látszik (`.scan-inline`). |
| `openLabels(fajta, előjelölés?)` (`views/cimkek.js`) | **QR-címkék nyomtatása** A4-es címkeívre: tételek, polcok, eszközök; ívtípus-választó, kezdőpozíció (félig használt ív), példányszám. **Ívtípusok az adatbázisban: `Cimkeivek`** (lapméret, oszlop, sor, címkeméret, felső / bal margó, hézagok mm-ben; `alap`: az alapértelmezett) – a Törzsadatok → Címkeívek fülön (`editLabelSheet`, élő előnézettel: `sheetPreview`); a kódban nincs beépített ív – üres táblánál a nyomtató ablak a Címkeívek fülre küld. Ellenőrzés: `L.sheetError` (kliens és szerver). A választott ív: `labelSheet` pref. A lapméret egy `@page labels { size: … }` szabállyal megy a nyomtatásba (szalagos nyomtatónál a lap = a címke, 1 × 1); a geometria a lap stílusában (`--cols`, `--lw`, `--lh`, `--qr`, padding, gap), kis / nagy címkénél `lbl-s` / `lbl-l` betűméret. A még fel nem töltött (kimenő sorban lévő `eszkoz_mentes`) eszköz címkéje nem nyomtatható (`blocked`), mert a sorszámos címkekódját a szerver ütközéskor módosíthatja. |
| `setPlaceFilter(raktár, polc)` (`attekinto.js`) | Az Anyagkészlet egy hely tételeire szűr (polccímke); az ott tárolt eszközök is megjelennek (`.place-tools`). |
| `openTool(címkekód)` (`eszkozok.js`) | Egy eszköz adatlapja bárhonnan (QR, polc). Az Eszközök oldal tetején ugyanolyan szűrő számkártyák (`.stats`), mint az Anyagkészletben – minden nézet a saját összesítőjét mutatja. |
| ROUTES `short` | Rövid menüfelirat a mobil alsó sávba (pl. Anyagkészlet → „Anyagok”); asztalon a teljes. |
| `store.personKey(szöveg)`, `store.userNames()` | Szabad szöveges személymező (átvevő, kinek adtuk ki): felhasználó neve / e-mailje → e-mail-cím, egyébként a szöveg (külsős). A javaslatlistához a nevek. Megjelenítés: `store.userName(e-mail)`. |
| `store.signatures(bizonylat)` | Egy átadás aláírásai a szerverről (csak online; az `Alairasok` lap nem része a letöltött adatnak – `L.SIDE_TABLES`). Soronként `hiteles` (true / false = módosult / null = lenyomat nélküli) és `kod` (ellenőrző kód). A lenyomat alapja `L.sealPayload(aláírás, események)`; a HMAC-ot csak a szerver számolja (`Code.gs` → `sealSignatures`, `sealOf`; demóban `DemoBackend.sealOf`). Ha a lenyomatba új mezőt veszel, a `v1` jelölést is emeld (és a régieket a régi szabállyal ellenőrizd). |
| `L.isToolItem(tétel)`, `store.materials()`, `store.toolTypes()` | **Készletezés.** A `Tetelek` a közös cikktörzs; `keszletezes = 'eszkoz'` az eszköztípus. Anyagot kezelő nézet (Anyagkészlet, leltár, kivét, kimutatás, tételcímke) **`store.materials()`**-t használjon, ne `activeItems()`-et; a beszerzés (rendelés, beérkezés, igény) mindkettőt. Eszköztípus készlete (`computeStock`) a darabjai száma, `stock.eszkoz = true`. |
| `editTool(eszköz, típus?)`, `addUnitsAfterReceipt(mozgások)` (`eszkozok.js`) | Eszköz űrlap (típussal előtöltve, a tétel adatlapjáról is); beérkezés után a beérkezett eszköztípusok darabjainak felvétele. |
| `L.toolStates(db)` | Eszközönként a naplóból: `hely` (raktar / kiadva / szerviz), `kinel`, `miota`, `felulvizsgalat` (ok / kozel / lejart), `kovetkezo`. |
| `.tbl.marked` | Sorjelölő csíkos (`st-row-hiany` / `st-row-figyelem`) táblázat: az első oszlop beljebb kezdődik, hogy a csík ne érjen a szöveghez (az Áttekintő `.overview` is így). |
| `.check-list` + `.check-row` | Jelölőnégyzetes választólista ablakban (pl. eszközök kiadása): görgethető, soronként jelölő + szöveg (+ legördülő). |
| `.person-block`, `.person-head` | Személyenkénti csoport (Eszközök → Kinél mi van). |
| `quickAddItem(név, beszállító, előtöltés?)` | Gyors tételfelvétel ablak → `Promise<tétel|null>`. Előtöltés: `{ mertekegyseg }` (pl. igényből). |
| `addToOrderList(tetel_id, igeny_id, mennyiség)` (`rendelesek.js`) | Tétel a rendelési listára egy igényből (`origin: 'igeny'`, `igenyek: [...]`). Rendeléskor a sor `igenyek` mezője megy a szervernek, az köti össze (`Igenyek.rendeles_sor_id`), és a beérkezés / lezárás / törlés frissíti az igény állapotát (`syncIgenyek`). |
| `listSelect(name, tipus, érték)`, `bindListSelects(root)` | Kategória / mértékegység / raktár legördülő a Listák törzsadatból („+ Új …” adminnak). |
| `itemSelector({ mode: 'start'|'template', tpl, onStart })` | Tételválasztó ablak (egyedi leltár, leltársablon). `templates()`, `tplIds(s)`. |
| `emailDialog({ supId, lines, rid, tipus })` | Megrendelő / ajánlatkérő e-mail sablonból. |
| `moveIcon(tipus)`, `moveQty(m)`, `movesLegend()` | Mozgástípus ikon; előjeles mennyiség (+ be, − ki, leltárnál előjel nélkül); jelmagyarázat a súgóba. |
| `movesTable(mozgások, { withItem })` | **Mozgások táblázata** (tétel adatlap, Mozgások oldal): ikon elöl, előjeles mennyiség a végén jobbra igazítva. `withItem`: tételnév oszlop, a sor a tétel adatlapját nyitja. Mozgáslistát mindig ezzel kell megjeleníteni. |
| `addOffers(host, q, { exclude, onPick, title?, items?, allowCreate?, max? })`, `itemSearchText(t)` | **„Nincs a listán” ajánlat – egy mező szűrésre és hozzáadásra**: a listát szűrő kereső szövegére illő, de a listában nem szereplő tételeket a lista alatt (`host` üres elem) felajánlja hozzáadásra, szükség esetén új tétel felvételével. Minden szűréskor hívandó; üres keresésnél nem mutat semmit. Olyan listánál, amely szűrhető és bővíthető is, ezt kell használni külön „+ Tétel” mező helyett (minta: `leltar.js` → `applyFilter`). `itemSearchText`: a tétel kereshető szövege, a tételkeresővel közös. |
| `filterButton(sel)`, `openFilter(gomb, groups, sel, frissítés, { summary?, onClose? })`, `inSel(set, érték)`, `countOptions(értékek, lista, mező)` | **Listaszűrő**: ikon gomb a kereső mellett (egy sorban, mobilon is), mögötte csoportonként checkboxos legördülő, többes választással; a gombon az aktív szűrők száma. `sel = { kulcs: new Set() }` (üres = mind). Legördülő `<select>` szűrőt listák fölé nem teszünk. Más többes választóhoz is ez való (bármely elemről nyitható, `summary` a láblécben – pl. leltár raktár / kategória választó); saját checkboxos `popover`-t ne írjunk. |
| `enterBackHtml()`, `bindEnterBack(keresőmező)` | Tételfelvevő űrlapon: mennyiség után Enterre vissza a tételkeresőbe (kapcsoló, `getPref('enterBack')`). |
| `kivetFields(v)`, `saveKivet(items, meta, { tools, alairasok })` | Kiadás fejadatai (átvevő, munka, dátum, megjegyzés) űrlapmezőként; **kiadás rögzítése egy bizonylaton**: anyag (`KIVET`) és eszköz (`KIADAS`) sorok, aláírásokkal, túlkivét-megerősítéssel. Visszaad: a bizonylatszám vagy false (Kiadás oldal és a tétel adatlap „Kiadás…” gombja közös). |
| **Közös mozgásnapló** (`Mozgasok`) | Anyag- és eszközmozgás ugyanabban a táblában; eszközsor: `eszkoz_id` + `atvevo` (kinek / kitől / szerviz) + `allapot`, `mennyiseg` 0. Egy `mozgasok` művelet vegyesen is tartalmazhat sorokat és `alairasok`-at (a szerver `checkMaterialMove` / `checkToolMove` szerint ellenőriz). Anyagszámítás (`computeStock`, `usageStats`) az eszközsorokat kihagyja. Felirat: `L.moveLabel(tipus)`, ikon: `moveIcon` (anyag- és eszköztípusra is), jelmagyarázat: `movesLegend(true)`. |
| `toolSlot`, `toolCheckCard()`, `startToolCheck(ctx)`, `renderToolCheck(root, ctx)` (`eszkozleltar.js`) | Eszközleltár a Leltár oldalon (saját vázlat, `.count-row.tool-check` sorok jelölőnégyzettel); lezáráskor `ELLENORZES` (+ opcionálisan `ALLAPOT: elveszett`) sorok egy bizonylaton. `toolStates` → `ellenorizve`. |
| Kimutatás fülek (`kimutatasok.js` `ui.tab`) | Anyag / Eszköz; a közös események (`bind`): fül, időszak, sor → tétel (`data-id`) vagy eszköz (`data-tool`) adatlap, diagram-tooltip. |
| `attachToolPicker(input, { items, onPick })`, `toolAvailable(eszköz)`, `askSignatures({…})`, `receiptHtml(d)`, `printReceipt(bizonylat)`, `handover(tipus, preset)` (`eszkozok.js`) | Eszközkereső; kiadható-e; aláírás-bekérő ablak (személy + opcionálisan a raktáros); elismervény (eszköz- és anyagsorokkal); korábbi bizonylat elismervénye; egyedi kiadás / visszavétel ablak (adatlap, Visszavétel oldal). |
| `showItemDetail(id)` | Tétel adatlap: Kivét / Bevét (nyitott rendeléshez köthető) / Korrekció / Szerkesztés. A művelet ablaka az adatlap fölött nyílik (a szerkesztő is: `torzsadatok.js` → `editItem`), bezárása után az adatlap frissülve nyitva marad. Új adatlap-művelet ablaka adja vissza a `modal(…)` eredményét. |

### `web/js/icons.js`
`ICONS.<név>` – vonalas SVG ikonok: grid, clipboard, inbox, cart, chart, database, user, cloudOk, cloudUp, cloudOff,
sync, syncErr, ext, swap, star, bulb, hand, edit, x, out (kivét), in (bevét), adjust (± korrekció), filter (szűrő), search (kereső), more (⋯ menü), note (megjegyzés buborék), request (igény), tool (eszköz / csavarkulcs), scan (QR-beolvasás). Új ikon ugyanebben a stílusban (24×24, vonalas).

---

## 4. Felületi elemek (CSS – `web/css/app.css`)

### Oldal és elrendezés
| Osztály | Mire |
|---|---|
| Felső sáv (`index.html` + `app.js`) | Logó; középen a **gyors tételkereső** (`#gsearch`, `globalSearch`: bármelyik oldalról a tétel adatlapjára; mobilon a nagyító ikon nyitja); jobbra szinkron és fiók. Mobilon: az oldal címe és súgója a sávban (`afterRender` → `#ptitle`), lefelé görgetéskor a sáv elrejtőzik (`autoHideBar`). |
| Menücsoportok | `app.js` `GROUPS` (Készlet: Anyagkészlet, Eszközök, Kimutatás, Mozgások; Raktári műveletek; Beszerzés; Beállítások): minden menüpontnak `group` kell. Asztalon az oldalsáv csoportcímekkel (`.nav-group`, sorrend `--og`), a csoporton belül a felhasználó sorrendjében; mobilon a „Több” lista csoportosítva (`navGroups()`). Az alsó sáv a csoportoktól független (saját sorrend). Ha egy csoport túl nagy lesz: gyűjtőoldal fülekkel (`.tabs`), mint a Rendelés / Törzsadatok. |
| Menü | `app.js` `ROUTES`: új menüpont csak ide kell (`group`-pal). A sorrend a Fiók oldalon fel/le gombokkal állítható, asztalon és mobilon is érvényes (CSS `order`, `--o`). Mobilon az első `NAV_MAX` (4) menüpont kint, a többi a „Több” menüben (`popover`, `.nav-pop`: 48 px magas sorok). |
| Menü értesítés | A menüpont `badge: () => ({ n, text })` függvénye (pl. Rendelés: pótolandó tételek). 0-nál nem látszik; a „Több” gomb a benne lévők összegét mutatja, a listában menüpontonként látszik a szám és a szöveg. |
| `.sticky-search` | Ragadós tételkereső / szűrősor az űrlapokon (`.card-head.sticky-search` vagy `.toolbar.sticky-search`): görgetéskor a felső sáv alatt marad, mobilon is. Új tételfelvevő űrlapon is ezt kell használni (lebegő gombot nem használunk, régi `.sticky-bar` nincs). A kártyafejléc mért magassága `--head-h` (`app.js` → `measureStickyHeads`): az alatta ragadó elemek (táblázatfejléc, leltár polccím) ehhez igazodnak, akkor is, ha mobilon több sorba törik. |
| `.list-row`, `.list-sep` | Egyszerű lista sorai (ikon + szöveg + `.row-icons`); elválasztó felirat a listán belül. |
| `--sticky-top` | Ragadós elem `top` értéke mobilon (`var(--sticky-top, var(--top-h))`): elrejtett sávnál 0, így nem marad rés. |
| `.page-head` (+ `.actions`) | Oldalcím sor; jobbra a fő gombok. A `<h1>` (és közvetlenül utána a `help()`) legyen az első eleme: mobilon ezek a felső sávba kerülnek, és ha más nincs a sorban, a sor eltűnik. |
| `.card-head > .head-main` | Kártyafejléc címblokkja gombok mellett: min. ~14rem széles marad, különben a gombok új sorba törnek (a cím sosem törik betűnként). |
| `.card`, `.card-head`, `.card-pad`, `.card-toolbar`, `.card-note` | Kártya; fejléc; belső margó; szűrősáv a táblázat felett; magyarázó sor. |
| `.toolbar` | Kereső + szűrők egy sorban; mobilon a kereső teljes szélességű, a legördülők kitöltik a sort. Minden `input[type=search]` automatikusan nagyító ikont és törlőgombot kap (`app.js` → `enhanceSearch`). |
| `.tabs` (gombok `data-tab`, `.active`) | Fülek (mobilon legyintéssel is váltható). |
| `.stats` + `.stat` (`.v` érték, `.l` felirat; `.err/.warn/.info`, `.sel`) | Számláló kártyák. |
| `.choice-row` + `.card.choice` (`.big`) | Választókártyák (azonos méret a `.stat`-tal). |
| `.bottom-bar` (`.bb-prog`, `.complete`) | Alsó művelet sáv hosszú űrlapokon. |
| `.count-list` + `.count-row`, `.group-title` | Leltár számlálólista: tétel \| eltérés \| megszámolt, közös ráccsal (`--count-cols`). A ragadós polccím egyben az oszlopfejléc. A számított érték (eltérés) fix oszlopban áll, hogy beíráskor a lista ne mozduljon – visszajelzést ne külön sorba tegyünk. |
| `store.byPlace` + `Tetelek.polc_sorrend` | **Bejárási sorrend:** raktár, polc (természetes számsorrend: A0, A1 … A10; betű = szekrény, szám = polc, 0 = alsó), a polcon belül a beállított sorszám, végül név; a hely nélküliek a végén. Minden helyrendezés ezt használja (leltár, Anyagkészlet „Hely”, tételválasztó, címkék). |
| Leltár „Sorrend” mód (`ui.order`, `saveOrder`) | A számlálólapon fel / le nyilakkal a polcon belüli sorrend; mentéskor csak a változott polcok tételei kapnak 1-től folyamatos sorszámot (`polc_sorrend` művelet, raktáros is). A tétel űrlapon kézzel is megadható. |
| Leltár: `pinned` (`leltar.js`) | A számlálólapra keresésből / beolvasással felvett vagy kikeresett tétel a bekapcsolt szűrő mellett is látszik – a szűrőt **nem kapcsoljuk ki** helyette. |
| `.inv-info` (`data-menu`) + `.inv-note` | Leltársor bal oldala: koppintásra a tétel menüje (`popover`: megjegyzés gyorsválasztó `.chip`-ekkel, eltávolítás a leltárból). Ikon nem jelzi (félrevezető volt), a számlálólap súgója írja le; asztalon rámutatáskor a név aláhúzódik. A megjegyzés (`noteHtml`) az adatsor végére kerül, így a sor nem nő. Mentéskor a mozgás `megjegyzes` mezőjébe kerül: `L.inventoryNote(utolag, szöveg)` (az utólagos jelölés + ' – ' + megjegyzés); visszafejtve az `inventoryDetails` sorában `utolag` és `megjegyzes`. |
| `.report-grid`, `.report-section` | Több kártya rácsban; szakasz címmel. |

### Táblázat – `.tbl` (asztalon táblázat) + `.cards` (mobilon kártya)
Cellák helye mobilon: `c-main` (cím), `c-meta` (alcím sor), `c-act` (jobb felső művelet), `c-chk` (jelölőnégyzet),
`c-f1`…`c-f4` (címkézett mezők – a címke a `data-l` attribútum). Ha a sorban nincs `c-act`, a cím a teljes szélességet kapja.
`c-f2 c-span2`: a második mező a sor végéig ér (pl. beviteli mező figyelmeztetéssel).

| Változat | Mikor |
|---|---|
| `.tbl.cards` | Van jelölőnégyzet-oszlop (`c-chk`). |
| `.tbl.cards.nochk` | Nincs jelölőnégyzet (a legtöbb lista). |
| `… .eq3` | Három egyforma számoszlop. |
| `… .flow` | Sok vagy változó számú mező: a `c-main` után minden `data-l` cella 3 oszlopba tördelve. Hosszú érték: `c-wide` (teljes sor). |
| `.fixed` | Rögzített oszlopszélesség asztalon (`<colgroup>`), gépeléskor nem ugrál. |
| `.m-hide` (cellán / `<col>`-on) | Mobilon elrejtve. `.m-only`: csak mobilon. |
| Sorjelölés | `tr.click` (kattintható – mindig `tabindex="0"`-val: az `app.js` közös kezelője miatt Enterrel / szóközzel is nyílik, nézetenként `onkeydown` nem kell; ugyanez a nem-gomb elemekre `role="button" tabindex="0"`), `tr.off` (inaktív), `tr.row-done`, `tr.st-row-hiany/figyelem` (állapotcsík). |
| Kiegészítők | `.num` (jobbra igazított szám), `.tbl-foot` (darabszám alul), `.empty` (üres lista), `.list-more` (több megjelenítése), `th.sortable` + `.arrow`. |

### Űrlap
`label.field > span + input` (mezőcímke), `.form-grid` (több oszlop, `.span-2`), `.form-col`, `.fsec` (`sec()`),
`.check` (jelölőnégyzet felirattal), `.chip-list` + `.chip(.on)` (választó címkék), `.seg` (kétállású váltó),
`.opt-list` + `.opt` (radio kártyák), `.picker` (kereső legördülő), `.star-pick` (elsődleges csillag),
`.sel-list` (görgethető választólista).

### Gombok, jelölők, szövegek
| Osztály | Mire |
|---|---|
| `.btn` (+ `.btn-primary`, `.btn-danger`, `.btn-link-danger`, `.btn-sm`, `.btn-block`) | Gombok. Elsődleges: grafit; piros csak törlés / hiba. Ikon a gombban: `${ICONS.x} Szöveg` (16 px, magától). |
| `.icon-btn` (`.icon-sm`), `.link-btn`, `.row-icons` | Ikon gomb; linkszerű gomb; ikoncsoport a sor végén. |
| `.badge` (`-ok/-warn/-err/-info/-muted`) | Állapot címke; darabszámnál is (pl. források: zöld, ha van, sárga, ha 0). |
| `.notice` (`-info/-warn/-err`) | Figyelmeztető doboz. |
| `.legend-bar.st-…`, `.due-dot`, `.mv-ico.mv-…`, `.move-q.mv-…`, `.origin-ico`, `.star-on` | Jelölők (jelmagyarázatuk a `help()`-be). |
| `.muted`, `.small`, `.sub`, `.t-ok/.t-warn/.t-err`, `.nowrap`, `.ellipsis`, `.grow`, `.d-block` | Szöveg segédek. `.sub`: második sor egy cellán belül (sosem félkövér). |

### Adatlap (felugró)
`.detail-head` (`.detail-hero` kiemelt érték + `.facts` adatlista), `.hero-levels`, `.detail-actions` (gombsor a fejléc alatt),
`.facts` / `.facts-row` (címke–érték párok; `.facts-plain`: kártyán belül, vonal nélkül, mobilon 2 oszlop; `.facts-act`: művelet a sor végén, pl. „Módosítás”), `.sec-h` (alszakasz cím).

---

## 5. Folyamat-minta: kezdőlap → indítás → űrlap → lezárás

A Leltár és a Kiadás így épül fel; új, több lépéses rögzítés is erre épüljön:
1. **Kezdőlap:** `.choice-row` választókártyák (fajták) + a korábbi rögzítések kereshető listája (kattintásra részletek ablakban).
2. **Indítás:** kártyára kattintva (szükség esetén) rövid ablak a fejadatokkal (`modal`, pl. `kivetFields`), majd vázlat: `slot.draft = {…}; slot.save()` (`store.draftSlot`).
3. **Űrlap:** felül a fejadatok összefoglalója (`.facts-plain` + „Módosítás”), tételkereső (`attachPicker` a `.card-head.sticky-search`-ben), tételek `.tbl.cards`, alul `.bottom-bar` (Elvetés / Lezárás). A nézet `liveUpdate` értéke ilyenkor `!slot.draft` (nem rajzolódik újra gépelés közben).
4. **Lezárás:** `slot.once(async () => { await store.enqueue(…); await slot.clear(); })`, vissza a kezdőlapra. A szerver is ellenőriz (pl. jövőbeli dátum, jogosultság).

A Kiadás (`kivet.js`, az útvonal kulcsa történeti okból `kivet`) egy űrlapon kezeli az anyagot és – raktárosnak – az eszközt; a vázlat: `{ items, tools }`.
A menü munkafolyamat szerint épül (Készlet: mi van; Raktári műveletek: mit csinálok) – új művelet is ide, és lehetőleg anyagra és eszközre is.

## 6. Új oldal / funkció ellenőrzőlista
1. Van-e már ilyen elem ebben a jegyzékben? → azt használni.
2. Szöveg csak `html`-lel; adat csak `store`-on keresztül; módosítás csak `store.enqueue`-val.
3. Jogosultság: menü / gomb `store.can(…)` szerint, **és** a szerver oldali ellenőrzés a `logic.js`-ben.
   Új műveletnél (`applyOp`) a bemenet nem megbízható: sorok `rowsOf(…)`-fal (tömb, darabszám), új azonosító
   `checkId(…)`-vel, névből keresés `own(obj, kulcs)`-csal, mennyiség `MAX_QTY`-ig; a hibát `fail(…)` adja
   (csak ennek a szövege jut el a felhasználóhoz – a nem várt hiba részlete a szerver naplójában marad).
   Az audit eredménye és a vállalt kockázatok: `privat/BIZTONSAGI_AUDIT.md` (csak helyben).
4. Mobilon (375 px) és asztalon is megnézni; táblázat `.tbl.cards …`.
5. Ha új közös elem született: felvenni ide.
6. `logic.js` → `Logic.gs` másolat; `sw.js` `VERSION` +1.
