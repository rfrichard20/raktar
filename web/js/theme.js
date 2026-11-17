// Téma: 'auto' (rendszerbeállítás), 'light' vagy 'dark'. Szinkron töltődik, hogy ne villanjon fel a rossz téma.
(function () {
  // Keretbe ágyazás elleni védelem (clickjacking): idegen oldal keretében az app nem jelenik meg.
  // (A GitHub Pages nem tud ilyen fejlécet küldeni, a <meta> CSP pedig ezt nem tudja tiltani.)
  if (window.top !== window.self) {
    document.documentElement.style.display = 'none';
    try { window.top.location = window.self.location.href; } catch (e) { /* a keretező tiltja: az oldal rejtve marad */ }
    throw new Error('Az alkalmazás keretben nem futtatható.');
  }
  var KEY = 'raktar_theme';
  function get() { try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; } }
  function apply(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    // Rendszersáv színe: kézi választásnál mindkét meta a választott felületszín, automatikusnál a média szerinti alapérték
    var metas = document.querySelectorAll('meta[name=theme-color]');
    var forced = t === 'dark' ? '#1f2226' : t === 'light' ? '#ffffff' : null;
    for (var i = 0; i < metas.length; i++) {
      var m = metas[i];
      if (!m.hasAttribute('data-def')) m.setAttribute('data-def', m.getAttribute('content'));
      m.setAttribute('content', forced || m.getAttribute('data-def'));
    }
  }
  window.RaktarTheme = {
    get: get,
    set: function (t) { try { if (t === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch (e) {} apply(t); },
  };
  apply(get());
})();
