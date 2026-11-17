# Raktár app – munkaszabályok

- A felhasználó magyarul kommunikál; a felület, a kódbeli megjegyzések és a dokumentáció is magyar.
- **Mielőtt új függvényt, CSS osztályt vagy felületi elemet írsz, nézd meg a `FEJLESZTES.md` jegyzéket**, és ami ott van,
  azt használd. Ha mégis újat kell írni, vedd fel a jegyzékbe ugyanabban a változtatásban.
- Fejlesztés a helyi demóban (`.claude/launch.json` → „raktar”, http://localhost:8080, demo mód); az élesítést a
  felhasználó végzi. Minden változtatást asztali és mobil (375 px) nézetben is ellenőrizni kell.
- `web/js/logic.js` változásakor az `apps-script/Logic.gs` legyen vele azonos; `web/` változásakor `web/sw.js` `VERSION` +1.
- Az `apps-script/Code.gs`-ben a `GOOGLE_CLIENT_ID` a repóban üres marad (a felhasználó tölti ki).
- PowerShell 5.1: fájlírásnál BOM nélküli UTF-8 (`[IO.File]::WriteAllText(..., (New-Object Text.UTF8Encoding $false))`),
  különben az ékezetek elromlanak.
- PowerShell: a magyar „ ” idézőjeleket a PowerShell saját idézőjelnek veszi (a parancs elromlik vagy csonkán ír fájlba),
  ezért ilyen szöveget tartalmazó cserét az Edit eszközzel kell végezni, ne PowerShell-lel.
- **Git / GitHub:** a mappa Git-repó (`rfrichard20/raktar`, **nyilvános**), a `main` ágra feltöltött `web/` mappát a GitHub Actions
  teszi ki a Pages-re → **a push élesítés, csak a felhasználó kifejezett kérésére**. Commitolni lehet (rövid, magyar üzenet).
  A `.gitignore` **alapból mindent tilt**, csak a név szerint engedélyezett gyökérfájlok / mappák kerülnek fel; új nyilvános fájlt
  szándékosan kell felvenni a listára. Belső anyag (jegyzet, audit, export, teszt-PDF) helye a **`privat/`** mappa (nem kerül fel).
  A `web/` maga a nyilvános oldal: oda belső fájl soha ne kerüljön.
  Git: a GitHub Desktop beépített példánya (`$env:LOCALAPPDATA\GitHubDesktop\app-*\resources\app\git\cmd\git.exe`), nincs a PATH-on.
- Helyi szerver (serve.ps1) lassú: teszt előtt a service workert és a gyorsítótárat érdemes törölni a böngészőben,
  különben a 4 mp-es időkorlát miatt régi vagy „Offline” tartalom jöhet.
