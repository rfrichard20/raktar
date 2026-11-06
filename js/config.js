// Alkalmazás beállítások.
// Ha az API_URL üres, az app DEMO módban fut: az adatok csak ebben a böngészőben tárolódnak,
// véletlenszerű próbaadatokkal, Google-fiók nélkül kipróbálható.
export const CONFIG = {
  // Az Apps Script Web App URL-je (…/exec végződésű)
  API_URL: 'https://script.google.com/macros/s/AKfycbxXvZJWG-MlVrzO5LCojX9DLApWTEgsVvlBABAGB5hNzLKVprh3RS55lhwwUygXtpGE5Q/exec',
  // Google OAuth kliens azonosító (ugyanaz, mint a Code.gs-ben)
  GOOGLE_CLIENT_ID: '352517479354-3r8c2oll23ko4afrj18onbjhc9tvevkv.apps.googleusercontent.com',
  // Automatikus szinkron gyakorisága (ms), ha az app nyitva van
  SYNC_INTERVAL: 3 * 60 * 1000,
};
