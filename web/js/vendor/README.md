# Külső könyvtárak (helyben tárolva)

Az app nem tölt be kódot külső szerverről (CSP: `script-src 'self'`), ezért ezek a fájlok itt vannak.
Csak akkor töltődnek be, amikor kell (QR-címke nyomtatása, kamerás beolvasás), változtatás nélkül.

| Fájl | Mire | Verzió, forrás | Licenc |
|---|---|---|---|
| `qrcode.js` | QR-kód készítése (címkék) | qrcode-generator 1.4.4 – Kazuhiko Arase, https://github.com/kazuhikoarase/qrcode-generator | MIT |
| `jsQR.js` | QR-kód olvasása kameraképből, ahol a böngészőnek nincs beépített olvasója (pl. iPhone, Windows) | jsQR 1.4.0 – Cosmo Wolfe, https://github.com/cozmo/jsQR | Apache-2.0 |

A „QR Code” a DENSO WAVE INCORPORATED bejegyzett védjegye.

Frissítéskor a fájlt a fenti forrásból (npm csomag) kell lecserélni, és a `web/sw.js` `VERSION` értékét növelni.
