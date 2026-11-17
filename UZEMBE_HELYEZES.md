# Üzembe helyezés – lépésről lépésre

Kb. 30–45 perc. Három rész:

1. **Google Sheet + Apps Script.** Itt lesznek az adatok, és ez a „szerver”.
2. **Google bejelentkezés (OAuth kliens).** Ezzel ismeri fel az app, ki lépett be.
3. **Webes felület (GitHub Pages).** Ezt nyitod meg gépen és telefonon.

> **Melyik Google-fiókkal?** A Sheet tulajdonosa legyen egy céges fiók, amihez a cég
> mindig hozzáfér (ne magánfiók, és ne olyan kollégáé, aki elmehet). Ennek a fióknak a nevében fut
> a szerver, és ő lesz az első admin.

---

## 1. Google Sheet + Apps Script

1. A céges fiókkal hozz létre egy új, üres táblázatot: https://sheets.new. Nevezd el, pl. „Raktár – adatbázis”.
2. Menü: **Bővítmények → Apps Script**. Megnyílik a szkriptszerkesztő.
3. A projekt neve legyen pl. „Raktár backend” (bal felül, a „Névtelen projekt”-re kattintva).
4. **Fájlok bemásolása:**
   - A meglévő `Kód.gs` (vagy `Code.gs`) teljes tartalmát cseréld le az `apps-script/Code.gs` tartalmára.
   - A bal oldali **+ → Szkript** gombbal hozz létre egy `Logic` nevű fájlt, és másold bele az `apps-script/Logic.gs` tartalmát.
   - Ugyanígy egy `Kozos` nevű fájlt az `apps-script/Kozos.gs` tartalmával (bejelentkezés, munkamenet – a Terep apppal közös kód).
   - **Projektbeállítások** (fogaskerék): kapcsold be „Az appsscript.json jegyzékfájl megjelenítése a szerkesztőben” opciót. Utána a szerkesztőben az `appsscript.json` tartalmát cseréld le a repó `apps-script/appsscript.json` tartalmára.
   - Mentés (Ctrl+S).
5. **Első futtatás:**
   - Fent a függvényválasztóban válaszd a `setup`-ot, majd **Futtatás**.
   - Engedélyt kér: „Engedélyek áttekintése” → válaszd a fiókodat. Ha megjelenik, hogy „A Google nem ellenőrizte ezt az alkalmazást”: **Speciális → Ugrás ide: Raktár backend (nem biztonságos)** → Engedélyezés. Ez a saját szkripted, ezért kéri ezt.
   - A táblázatban létrejönnek a munkalapok (`Keszlet`, `Tetelek`, `Mozgasok` …), és a `Felhasznalok` lapon te leszel az admin.
6. Opcionális próbaadatok: a táblázatban frissítsd az oldalt, majd **Raktár → Demo adatok betöltése**. Később, éles adatok előtt ezeket kitörölheted, vagy egyszerűen kezdj új táblázattal.

## 2. Google bejelentkezés (OAuth kliens)

1. Nyisd meg: https://console.cloud.google.com, ugyanazzal a céges fiókkal.
2. Fent a projektválasztóban: **Új projekt**, név pl. „raktar”, majd Létrehozás, és válaszd ki.
3. Bal menü: **API-k és szolgáltatások → OAuth-hozzájárulási képernyő** (vagy „Google Auth Platform → Branding”):
   - Alkalmazás neve: „Raktár”, támogatási e-mail: a tiéd.
   - **Célközönség / User type: Külső (External).** Így a saját Gmail-fiókos kollégák is be tudnak lépni.
   - Hatókört (scope) nem kell hozzáadni.
   - A végén **Közzététel (Publish app / In production)**. Ehhez az alap bejelentkezéshez nem kell Google-ellenőrzés. Ha „Testing” állapotban marad, csak a kézzel felvett tesztfelhasználók tudnak belépni.
4. **Hitelesítő adatok → Hitelesítő adatok létrehozása → OAuth-ügyfélazonosító:**
   - Alkalmazástípus: **Webes alkalmazás**, név: „Raktár web”.
   - **Engedélyezett JavaScript-források:**
     - `http://localhost:8080` (helyi teszthez);
     - a 3. lépésben kapott cím, pl. `https://FELHASZNALONEV.github.io`. Csak a domain kell, útvonal (`/raktar`) nélkül.
   - Létrehozás → másold ki az **Ügyfélazonosítót** (`….apps.googleusercontent.com`).
5. Vissza az Apps Scriptbe: a `Code.gs` elején írd be:
   ```js
   var GOOGLE_CLIENT_ID = '….apps.googleusercontent.com';
   ```
   Mentés.

## 3. A szerver közzététele (Apps Script Web App)

1. Apps Script, jobb felül: **Telepítés → Új telepítés**, a fogaskeréknél típus: **Webalkalmazás**.
   - Leírás: „1. verzió”
   - **Futtatás mint: Én** (a céges fiók)
   - **Hozzáférés: Bárki**
2. Telepítés → másold ki a **Webalkalmazás URL-jét** (`https://script.google.com/macros/s/…/exec`).
3. Ellenőrzés: nyisd meg az URL-t a böngészőben. Ezt kell látnod: `{"ok":true,"app":"raktar",…}`.

> **A „Bárki” beállítás nem azt jelenti, hogy bárki hozzáfér az adatokhoz.** Csak azt, hogy a böngésző
> elérheti a végpontot. Minden kérésnél a szerver ellenőrzi a Google-bejelentkezést és a `Felhasznalok` lapot.
> Aki nincs a listán (vagy inaktív), annak semmit nem ad ki.
>
> Ha a „Bárki” opció nem választható, a céges Google Workspace admin tiltja. Ilyenkor az adminnak kell
> engedélyeznie, vagy a táblázatot egy másik (pl. erre a célra létrehozott) fiókban kell létrehozni.

**A `Code.gs` / `Logic.gs` / `Kozos.gs` minden későbbi módosítása után** (a fájl tartalmának cseréje után): Telepítés → Telepítések kezelése → ceruza → Verzió: **Új verzió** → Telepítés. Az URL nem változik.

## 4. Webes felület (GitHub Pages)

1. Állítsd be a `web/js/config.js` fájlt:
   ```js
   API_URL: 'https://script.google.com/macros/s/…/exec',
   GOOGLE_CLIENT_ID: '….apps.googleusercontent.com',
   ```
2. Ha még nincs, hozz létre egy GitHub-fiókot: https://github.com/signup, és telepítsd a **GitHub Desktopot**.
3. **New repository** → név: `raktar` → **Public** → Create.
   A kód publikus lesz, de **nincs benne jelszó vagy adat**. A két beírt azonosító nyilvános adat, a védelmet a bejelentkezés adja.
   A `.gitignore` alapból mindent kizár, csak a név szerint engedélyezett fájlok kerülnek fel; a belső anyagok a `privat/` mappában vannak.
4. **Settings → Pages** → Source: **GitHub Actions**. A közzétételt a `.github/workflows/pages.yml` végzi: a `web/` mappát teszi ki.
5. GitHub Desktop: **Add existing repository** → a projekt mappája → **Publish / Push origin**.
   1–2 perc múlva megjelenik a cím: `https://FELHASZNALONEV.github.io/raktar/` (az Actions fülön látszik a közzététel állapota).
6. Ezt a domaint (`https://FELHASZNALONEV.github.io`) add hozzá az OAuth kliens engedélyezett JavaScript-forrásaihoz, ha még nem tetted meg (2.4. lépés).

**Frissítés később:** a `web/sw.js` elején a `VERSION` számát növeld (hogy a telefonok is frissítsenek), majd GitHub Desktopban
**Commit** → **Push origin**. Csak a `web/` mappa változása élesít; ha a `Code.gs` / `Logic.gs` is változott, azt az Apps Scriptben is
élesíteni kell (3. lépés vége).

## 5. Első belépés és telefon

1. Nyisd meg a `https://FELHASZNALONEV.github.io/raktar/` címet, és jelentkezz be a céges (admin) fiókkal.
2. **Törzsadatok → Felhasználók**: vedd fel a kollégák Google-fiókjának e-mail-címét a megfelelő szerepkörrel. Céges és Gmail-fiók egyaránt jó.
3. **Telefonon:** nyisd meg ugyanezt a címet Chrome-ban (Androidon) vagy Safariban (iPhone-on), jelentkezz be, majd:
   - Android / Chrome: ⋮ menü → **Hozzáadás a kezdőképernyőhöz** (vagy „Alkalmazás telepítése”);
   - iPhone / Safari: Megosztás → **Főképernyőhöz adás**.

   Ezután saját ikonról indul, és internet nélkül is megnyílik.

> **iPhone tipp:** ha a főképernyőről indított appban a Google-bejelentkezés nem nyílik meg rendesen,
> jelentkezz be egyszer Safariban, majd töröld és add hozzá újra az ikont. A bejelentkezés 30 napig érvényes.

---

## Adatbiztonság – összefoglaló

| Terület | Megoldás |
|---|---|
| Ki léphet be | Csak a `Felhasznalok` lapon szereplő, **aktív** Google-fiók. A Google igazolja, a szerver ellenőrzi. |
| Munkamenet | 30 napos, aláírt (HMAC) token. Kitiltás: a felhasználó **aktív** jelölőjének kivétele, ami a következő kérésnél azonnal érvényes. **Mindenki kijelentkeztetése**: Raktár menü a Sheetben (pl. elveszett telefonnál). |
| Mit lát valaki | A szerver szerepkör szerint szűr: a szerelő nem kap árat, rendelést, beszállítót. Ami nem jár neki, az a telefonjára sem kerül. |
| Mit módosíthat | Minden módosítást a szerver jogosultsághoz köt (pl. törzsadat csak admin, leltár/beérkezés raktáros). A naplóba a szerver írja be, ki rögzítette, ezt nem lehet meghamisítani. |
| A Sheet | **Ne oszd meg szerkesztésre** a kollégákkal (különben a jogosultságokat megkerülhetik). Elég, ha a tulajdonos és esetleg egy helyettes admin látja. |
| Képlet-befecskendezés | A `=`, `+`, `-`, `@` kezdetű szöveget a szerver szövegként írja a cellába, így nem futhat le képletként. |
| Webes felület | Szigorú tartalombiztonsági szabály (CSP): csak a saját fájlok, a Google-bejelentkezés és az Apps Script érhető el. Minden megjelenített adat escape-elve. |
| Telefonon tárolt adat | Az utolsó letöltött adat és a még fel nem töltött rögzítések a készüléken maradnak (offline működéshez). Kijelentkezéskor a letöltött adat törlődik. A telefon képernyőzárja legyen bekapcsolva. |
| Mentés | A Google Sheet automatikusan verzióz (Fájl → Verzióelőzmények). Érdemes havonta egy másolatot készíteni (Fájl → Másolat készítése). |
