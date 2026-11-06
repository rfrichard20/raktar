// Téma: 'auto' (rendszerbeállítás), 'light' vagy 'dark'. Szinkron töltődik, hogy ne villanjon fel a rossz téma.
(function () {
  var KEY = 'raktar_theme';
  function get() { try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; } }
  function apply(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  window.RaktarTheme = {
    get: get,
    set: function (t) { try { if (t === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch (e) {} apply(t); },
  };
  apply(get());
})();
