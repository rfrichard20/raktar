# Raktár – segédanyag készletkezelő

Egyszerű készletkezelő a szereléshez használt segédanyagokhoz (csavarok, kötőelemek, fogyó szerszámok).
Az adatok egy **Google Sheetben** vannak, ami az alkalmazás nélkül, kézzel is vezethető.
A webes felület asztali gépen, tableten és telefonon is használható, és **internet nélkül is működik**.

## Felépítés

```
web/                 statikus webes alkalmazás (PWA), szerver nem kell hozzá
  index.html
  js/logic.js        közös üzleti logika (a böngésző és az Apps Script is ezt futtatja)
  js/store.js        offline tár + kimenő sor + szinkron
  js/backend.js      Apps Script kapcsolat / demo backend
  js/views/          képernyők (áttekintő, leltár, beérkezés, rendelés, törzsadatok, fiók)
  sw.js              service worker (offline indulás)
  kozos/             KÖZÖS fájlok a Terep apppal (ui-mag, téma, helyi tár, alapstílusok, betűk) – forrás: Kozos_Claude
apps-script/         a Google Sheethez kötött backend
  Code.gs            API, Sheet olvasás/írás, telepítés, demo adatok
  Logic.gs           = web/js/logic.js másolata (módosításkor mindkettőt frissítsd!)
  Kozos.gs           KÖZÖS: bejelentkezés, munkamenet, adatverzió – forrás: Kozos_Claude
  appsscript.json
serve.ps1            helyi webszerver teszteléshez
```

## Munkalapok (adatbázis)

| Lap | Tartalom |
|---|---|
| `Tetelek` | **Cikktörzs** – minden, amit beszerzünk: megnevezés, kategória, mértékegység, polc, sorszám a polcon (`polc_sorrend`: a bejárási sorrend a polcon belül, a leltár „Sorrend” gombjával állítható), min. és célkészlet, leltár gyakoriság (nap), aktív, raktár, **készletezés** (`keszletezes`: üres / `anyag` = mennyiségben követett fogyóanyag; `eszkoz` = eszköztípus, amelynek egyedi darabjai az `Eszkozok` lapon vannak) |
| `Beszallitok` | Beszállítók elérhetőségekkel, rendelési mód (`webshop` / `email`), webshop kereső cím (`{cikkszam}` helyőrzővel) |
| `Forrasok` | Tétel ↔ beszállító: cikkszám, **kiszerelés** (beszállítónként eltérhet), egységár, link, elsődleges |
| `Mozgasok` | **Közös mozgásnapló**, csak hozzáírás. Anyag: `LELTAR` (megszámolt érték), `BEERKEZES`, `KIVET`, `KORREKCIO` (± indoklással). Eszköz (`eszkoz_id` kitöltve): `KIADAS`, `VISSZAVETEL`, `SZERVIZ`, `SZERVIZBOL`, `ALLAPOT`, `FELULVIZSGALAT`, `SELEJTEZES`, `ELLENORZES` (eszközleltár), az `atvevo` oszlopban kinek / kitől / melyik szerviz, az `allapot`-ban az eszköz új állapota. Egy bizonylaton lehet anyag és eszköz is (közös kiadás). Hogy egy eszköz most kinél van, ebből számolódik. |
| `Rendelesek` | Rendelés fejléc (beszállító, dátum, ki adta le) |
| `Rendeles_tetelek` | Rendelés sorai: rendelt és beérkezett mennyiség, lezárva |
| `Listak` | Választólisták a tétel űrlaphoz: kategóriák, mértékegységek, raktárak (`tipus` + `ertek`) |
| `Leltar_sablonok` | Mentett egyedi leltár-összeállítások (név + tétel azonosítók vesszővel) |
| `Felhasznalok` | Ki léphet be, milyen szerepkörrel |
| `Eszkozok` | Szerszámok, eszközök egyedi darabonként: típus (`tetel_id` → eszköztípusú tétel, nem kötelező), címkekód (`SZ-0001` – a belső `eszkoz_id` mellett az embernek szóló, címkére / szerszámra írható szám, mint egy leltári szám; ha két készülékről offline ugyanazt kapná, a szerver a következő szabadot adja, ezért címke csak a feltöltés után nyomtatható), megnevezés, kategória, gyártó, típus, gyári szám, beszerzés, felülvizsgálati ciklus (nap), állapot (`rendben`, `javitando`, `szervizben`, `selejtezve`, `elveszett`), tárolási hely (`raktar`, `polc` – ide kerül vissza) |
| `Alairasok` | Átadás-átvételi aláírások (vonalrajz szövegként; szerep: `szemely` / `raktar`). Nem töltődik le az appba, csak az elismervény nyomtatásakor kéri le (a raktáros mindet, a szerelő csak a neki szóló átadásokét). A `pecset` oszlop a szerver lenyomata (HMAC-SHA256, a szkript `SEAL_SECRET` kulcsával) az aláírásról és az átadás adatairól: ha bármelyiket a Sheetben átírják, az elismervény „módosult” figyelmeztetést mutat. A `SEAL_SECRET`-et ne töröld és ne cseréld (a régi aláírások ellenőrizhetetlenné válnának). Az új aláírások lenyomata (`v2.` kezdetű) a bizonylat minden sorát lefedi, az anyagot is. |
| `Cimkeivek` | QR-címkék nyomtatási ívei: név, lap szélesség / magasság, oszlop, sor, címke szélesség / magasság, felső / bal margó, vízszintes / függőleges hézag (mm), aktív, alapértelmezett. Az első mentéskor magától létrejön. |
| `Igenyek` | Beszerzési igények (szerszám, anyag, bármi): igénylő, leírás, mennyiség, link, sürgős, határidő, állapot (`uj`, `folyamatban`, `rendelve`, `teljesitve`, `elutasitva`), kapcsolt tétel és rendelési sor, válasz. A lap az első igény rögzítésekor magától létrejön; a formázáshoz (állapot-legördülő) futtasd a **Raktár → Táblák létrehozása** menüt. |
| `Keszlet` | **Számított lap** (értékek, nem képletek): aktuális készlet, úton lévő, állapot, rendelendő, beszállító, cikkszám, készletérték, esedékes leltár – ugyanazzal a számítással, mint az app. Óránként és a **Raktár → Készlet lap frissítése** menüvel frissül. |

**Aktuális készlet** = utolsó leltár értéke + azóta beérkezett − kivét ± korrekció.

**Rendelési javaslat:** ha a készlet + úton lévő mennyiség ≤ minimum, akkor a célkészletig pótol,
a választott forrás kiszerelésére felfelé kerekítve. Az appban kézzel felülírható.

**Cikktörzs és készlet (két szint, mint az ERP rendszerekben).** A *Tételek* (Törzsadatok) a közös cikktörzs: minden, amit
beszerzünk – beszállítóval, cikkszámmal, rendelési javaslattal, igénnyel. A tétel **készletezése** dönti el, hogyan követjük:
- **Anyag** (mennyiségben): *Anyagkészlet*, leltár, kivét, korrekció.
- **Eszköz** (eszköztípus, pl. „Akkus fúró-csavarozó 18 V”): az egyedi darabjai (`SZ-0001`, gyári szám, kinél van) az *Eszközök*
  oldalon vannak. A típus „készlete” a darabjai száma (selejtezett és elveszett nélkül), így a min. / cél darabszám a rendelési
  javaslatban is működik. Kivét, leltár, korrekció nincs rá (a szerver is tiltja), beérkezés igen: utána az app felajánlja a
  beérkezett darabok felvételét (azonosító, gyári szám, a típus helyével).
Az *Anyagkészlet* és az *Eszközök* a saját számkártyáival a Készlet menücsoportban van. Darab típus nélkül is felvehető (utólag hozzárendelhető). Az eszköznek is van tárolási helye
(raktár, polc); a polccímke beolvasásakor az ott tárolt eszközök is megjelennek.

**Menü – munkafolyamat szerint.** *Készlet*: Anyagkészlet, Eszközök (mi van), Kimutatás, Mozgások (minden mozgás egy idővonalon,
anyag és eszköz). *Raktári műveletek* (mit csinálok): Leltár, Beérkezés (anyag és eszköz), **Kiadás** (ami kimegy: anyag = kivét,
eszköz = kölcsön, egy bizonylaton, eszköznél aláírással és elismervénnyel; a szerelő csak anyagot), **Visszavétel** (a kiadott
eszközök, személyenként). Az eszköz egyedi kezelése (szerviz, felülvizsgálat, állapot, selejtezés) az eszköz adatlapján van.

**Eszközleltár** (Leltár → „Eszközök ellenőrzése”): a kiválasztott helyeken a raktárban lévő eszközök kipipálása vagy
címke-beolvasása; lezáráskor a meglévők `ELLENORZES` mozgást kapnak (az adatlapon: „Leltárban látva”), a hiányzók igény
szerint elveszettnek jelölhetők. **Kimutatás → Eszköz fül:** állomány, értéke, lejáró felülvizsgálatok; az időszakban kiadások
személyenként, szervizek, eszközleltárak, és eszközönként a kihasználtság (az időszak hány százalékában volt kint).

**Igény más nevében:** a raktáros az igény felvételekor kiválaszthatja az igénylőt (pl. telefonon szólt egy kolléga) – az igény
a kolléga saját listájában is megjelenik; a rögzítő a `rogzitette` oszlopba kerül.

**Eszközök:** a raktáros veszi fel, adja ki és veszi vissza (több eszköz egy bizonylaton, az átvevő aláírásával),
adja szervizbe, rögzíti a felülvizsgálatot és selejtez. Kiadás / visszavétel után átadás-átvételi elismervény nyomtatható
(PDF-be is menthető); a „Kinél mi van” fül személyenként mutatja a kiadott eszközöket, és listát nyomtat róluk (pl. kilépéskor).
Mindenki látja az eszközöket; a „Nálam” szűrő a saját kiadott eszközöket mutatja. A lejárt felülvizsgálatot piros csík és a menü jelvénye jelzi.

**QR-címkék:** az Anyagkészlet (raktáros) és az Eszközök oldal „Címkék” gombjával tételekre, polcokra és eszközökre nyomtatható
a választott címkeívre (A4-es ív, pl. Avery LCV11368 70×35 mm, vagy szalagos címkenyomtató, pl. 62 mm-es Brother);
kezdőpozíció választható. Az ívtípusokat az admin a **Törzsadatok → Címkeívek** fülön kezeli (méretek, előnézet,
alapértelmezett) – kódmódosítás nélkül; a kódban nincs beépített ív, az első használat előtt fel kell venni egyet. Szalagos nyomtatónál a lap maga a
címke (1 × 1, margó nélkül), és a nyomtató illesztőprogramjában ugyanezt a papírméretet kell választani. A csak telefonos
alkalmazással (Bluetooth) nyomtató címkézők (pl. Niimbot) a böngészőből nem érhetők el. A kód egy link: bármelyik telefon kamerájával megnyitja az appot
(belépés után) a tétel / eszköz adatlapján, ill. a polc tételeivel. Az appban a felső sáv és a keresők melletti kamera ikon
(csak telefonon / tableten) olvas be: leltárnál a polccímke a polcra szűr, a tételcímke a sorára ugrik; kivétnél a tétel a listára kerül;
eszközkiadásnál több címke egymás után kijelölhető. **Figyelem:** a link a jelenlegi webcímre mutat; ha az app címe megváltozik,
a régi címen átirányító oldalt kell hagyni, különben a kinyomtatott címkék nem nyílnak meg kamerával (az appon belüli beolvasás ekkor is működik).

**Igények:** bárki (szerelőtől felfelé) rögzíthet igényt; amíg „Új”, az igénylő módosíthatja vagy visszavonhatja.
A raktáros tételhez kapcsolja (meglévő vagy az igényből új tétel), a rendelési listára teszi, válaszol, teljesítettnek
jelöli vagy indoklással elutasítja. A rendelés rögzítésekor az igény „Rendelve” lesz; a beérkezés után magától
„Teljesítve”. Ha a rendelést törlik, vagy úgy zárják le, hogy semmi nem érkezett, az igény visszakerül „Folyamatban” állapotba.

### Tömeges feltöltés (tételek, beszállítók, források)
1. A megfelelő lapra másold be a sorokat **azonosító nélkül** (az első oszlop maradjon üres):
   - `Beszallitok`: legalább a `nev`;
   - `Tetelek`: legalább a `megnevezes` (ajánlott: `kategoria`, `mertekegyseg`, `polc`, `min_keszlet`, `cel_keszlet`);
   - `Forrasok`: a `tetel_id` és a `beszallito_id` oszlopba elég a **pontos nevet** írni, plusz `cikkszam`, `kiszereles`, `egysegar`.
2. **Raktár → Tömeges import előkészítése.** A menüpont:
   - egyedi azonosítót ad (`B-…`, `T-…`, `F-…`), és az új tételeket aktívra állítja;
   - alapértéket ad: mértékegység „db”, leltár 90 nap, kiszerelés 1;
   - a neveket azonosítóra cseréli, és tételenként kijelöli az első forrást elsődlegesnek;
   - az új kategóriákat, mértékegységeket és raktárakat felveszi a választólistákra.
3. A végén összefoglalót ad. Jelzi az ismétlődő tételneveket és a nem azonosítható forrássorokat: ezek nem kapnak azonosítót, és javítás után a menüpont újrafuttatható. A már azonosítóval rendelkező sorokhoz nem nyúl, így többször is futtatható.

Az azonosítók szándékosan véletlenszerűek (pl. `T-7K3P9Q`), nem sorszámok, így offline, több eszközről felvett tételeknél sem ütközhetnek.

### Kézi vezetés a Sheetben (ha az app nem elérhető)
- Leltár: új sor a `Mozgasok` lapon, `tipus` = `LELTAR`, `mennyiseg` = megszámolt darab, `datum` = most.
  A `mozgas_id` legyen egyedi (pl. `KEZI-20261106-01`).
- Beérkezés: `tipus` = `BEERKEZES`. Ha rendeléshez tartozik, írd be a `rendeles_sor_id`-t, és a
  `Rendeles_tetelek` lapon frissítsd a `beerkezett` értéket. Ha teljes, pipáld ki a `lezarva` jelölőt.
- A `Keszlet` lapba ne írj (a következő frissítés felülírja); kézi rögzítés után a **Raktár → Készlet lap frissítése** menüvel azonnal frissíthető.
- Az app a fejlécnevek alapján olvas és ír, az oszlopok sorrendje szabadon változtatható; a fejlécneveket viszont ne írd át. Új (saját) oszlop is felvehető, az app nem nyúl hozzá.

## Szerepkörök

| Szerepkör | Jogok |
|---|---|
| Admin | minden, beleértve a törzsadatokat és a felhasználókat |
| Raktáros | leltár, beérkezés, kiadás (anyag és eszköz), visszavétel, rendelés létrehozása / lezárása, korrekció, új tétel gyors felvétele, igények kezelése, eszközök felvétele, kiadása, visszavétele |
| Szerelő | a készlet megtekintése, anyag kiadása (kivét) és igény rögzítése – árak, rendelések, beszállítók, kimutatások és a Mozgások oldal nélkül; az igények közül csak a sajátjait látja |
| Olvasó | minden megtekintése (árak, rendelések, kimutatások, mozgások), módosítás nélkül |

A láthatósági jogok (árak, rendelés, kimutatás, mozgások) a `web/js/logic.js` elején, a `PERMS` táblában állíthatók (utána a `Logic.gs`-t is frissíteni kell). Az árak, rendelések, beszállítók szűrését a szerver végzi: amihez a felhasználónak nincs joga, az a válaszba sem kerül bele, így a készülékén sem tárolódik. Kivétel a `mozgasok` jog: ez csak a Mozgások menüpontot rejti el – a mozgások adata (benne az átvevő és a megjegyzés) mindenkihez letöltődik, mert abból számolódik a készlet, és a tétel adatlapján látszik is.

A jogosultságot a szerver (Apps Script) ellenőrzi minden kérésnél. A Sheetet **ne oszd meg** szerkesztésre a
kollégákkal, mert akkor a szerepköröket megkerülve bármit átírhatnak. Elég, ha csak te (vagy az adminok) látjátok.

## Offline működés
- Minden űrlap (leltár, beérkezés, rendelési javaslat) minden módosításkor a készüléken mentődik,
  így bezárás vagy lemerülés után is folytatható.
- Mentéskor a művelet a **kimenő sorba** kerül, és azonnal látszik a felületen. Ha van internet,
  rögtön feltöltődik. Ha nincs, automatikusan feltöltődik, amint lesz kapcsolat.
- A fejlécben látszik az állapot (szinkronban / offline / X feltöltésre vár). A részletek a Fiók oldalon vannak.
- Az újraküldés nem okoz duplikációt (minden művelet egyedi azonosítót kap).
- Ha a szerver elutasít egy műveletet (pl. közben törölték a tételt), az a Fiók oldalon hibaüzenettel jelenik meg.

---

## 1. Kipróbálás helyben (demo mód)

Amíg a `web/js/config.js`-ben üres az `API_URL`, az app **demo módban** fut: véletlenszerű próbaadatokkal,
csak a böngészőben tárolva, Google-fiók nélkül.

```bash
powershell -ExecutionPolicy Bypass -File serve.ps1
```

Ezután nyisd meg: http://localhost:8080. A belépésnél választhatsz demo felhasználót (admin / raktáros / szerelő / olvasó).
A **Fiók** oldalon bekapcsolható a „Szimulált offline mód”, és újragenerálhatók a demo adatok.

## 2. Éles telepítés

### a) Google Sheet + Apps Script
1. Hozz létre egy új Google Sheetet (pl. „Raktár adatbázis”).
2. **Bővítmények → Apps Script.** Hozd létre a `Code.gs`, `Logic.gs` fájlokat a repó `apps-script/` mappájából
   (másold be a tartalmukat). A projekt beállításainál kapcsold be az „appsscript.json megjelenítése”
   opciót, és cseréld le a tartalmát a repóban lévőre.
3. Futtasd a `setup` függvényt (első futáskor engedélyt kér). Ez létrehozza a munkalapokat és a `Keszlet` lapot,
   és **téged felvesz adminnak**.
4. Opcionális: a Sheetben a **Raktár → Demo adatok betöltése** menüvel próbaadatokat tölthetsz be.

### b) Google bejelentkezés (OAuth kliens)
1. https://console.cloud.google.com → új projekt (pl. „raktar”).
2. **APIs & Services → OAuth consent screen**: External (vagy Internal, ha mindenki céges fiókot használ),
   alkalmazásnév, e-mail. Scope nem kell.
3. **Credentials → Create credentials → OAuth client ID → Web application.**
   *Authorized JavaScript origins*: `http://localhost:8080` (teszthez) és később az éles cím
   (pl. `https://<felhasznalo>.github.io`).
4. Másold ki a **Client ID**-t, és írd be a `Code.gs` tetején a `GOOGLE_CLIENT_ID` értékéhez.

Saját (gmail) és céges fiókkal is lehet belépni. Az számít, hogy az e-mail-cím szerepeljen a `Felhasznalok` lapon.

### c) Web App telepítése
1. Apps Script: **Telepítés → Új telepítés → Webalkalmazás**.
   *Futtatás mint:* **Én**; *Hozzáférés:* **Bárki**.
   (Az app a saját bejelentkezésével védi az adatokat. A „Bárki” beállítás azért kell, hogy a böngésző elérje az API-t.)
2. Másold ki a Web App URL-t (`…/exec`).
3. `web/js/config.js`: `API_URL` = a Web App URL, `GOOGLE_CLIENT_ID` = az OAuth kliens azonosító.
4. A `Code.gs` módosítása után mindig **új verziót** kell telepíteni (Telepítések kezelése → Szerkesztés → Új verzió).

> Ha a Sheet céges Google Workspace fiókban van, és a „Bárki” hozzáférés nem választható,
> akkor ezt a Workspace admin tiltja. Ilyenkor vagy engedélyezni kell, vagy a Sheetet egy másik fiókban kell létrehozni.

### d) Közzététel (GitHub Pages, opcionális)
A `web/` mappa tartalma bármilyen HTTPS-es statikus tárhelyre feltölthető. Ingyenes, megbízható lehetőség
a GitHub Pages: a kód publikus lehet, mert jelszót vagy adatot nem tartalmaz (az adatok a Sheetben vannak).
A címet add hozzá az OAuth kliens *Authorized JavaScript origins* listájához.

Telepítés telefonra / tabletre: a böngészőben „Hozzáadás a kezdőképernyőhöz”.

### Frissítés kiadása
Ha a `web/` fájljai változnak, növeld a `web/sw.js` elején a `VERSION` értékét, hogy a készülékek frissítsenek.
A projekt Git-repó: GitHub Desktopban Commit → Push origin, és a GitHub Actions a `web/` mappát kiteszi a Pages-re
(részletek: [UZEMBE_HELYEZES.md](UZEMBE_HELYEZES.md) 4. pont).

## Fejlesztés
A felületi elemek és segédfüggvények jegyzéke: [FEJLESZTES.md](FEJLESZTES.md) – új funkció előtt ebből kell dolgozni.

## Külső összetevők és licencek
- **Poppins betűtípus** (`web/kozos/fonts/`): SIL Open Font License 1.1 – kereskedelmi célra is ingyenes,
  a licencszöveget (`web/kozos/fonts/OFL.txt`) a fájlok mellett kell tartani. A betűk helyben vannak,
  külső betűszolgáltatót (pl. Google Fonts) az app nem hív.
- **Ikonok, logó** (`web/js/icons.js`, `web/icon*.{svg,png}`): saját rajzolású, egyszerű SVG alakzatok.
- **Google Identity Services** (`accounts.google.com/gsi/client`): a bejelentkezéshez, a Google feltételei szerint
  ingyenesen használható. Ez az egyetlen külső helyről betöltött szkript; az adatok csak az Apps Script webappba mennek.
- **QR-könyvtárak** (`web/js/vendor/`, helyben tárolva, csak használatkor töltődnek be): qrcode-generator (MIT) a címkékhez,
  jsQR (Apache-2.0) a kamerás beolvasáshoz ott, ahol a böngészőnek nincs beépített olvasója. Részletek: `web/js/vendor/README.md`.
- Egyéb külső könyvtár / keretrendszer nincs.

## Később bővíthető
- **Kimutatás munkánként / átvevőnként** a kivételekből (az adatok – átvevő, munka – már rögzítésre kerülnek).
- **Áttekintő (dashboard)**: az anyag- és eszközkészlet lényege egy nézetben.
- **Gyári vonalkód (EAN)** a tételekhez: címkenyomtatás nélküli beolvasás a gyári csomagolásról.
