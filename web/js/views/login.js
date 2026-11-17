// Bejelentkezés: Google-fiókkal, demo módban felhasználó választással.
import * as store from '../store.js';
import { html, toast } from '../ui.js';
import { CONFIG } from '../config.js';

const L = window.RaktarLogic;
let gisLoaded = false;

function loadGis() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.accounts) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('A Google bejelentkezés nem tölthető be (nincs internet?).'));
    document.head.appendChild(s);
  });
}

export default {
  async render(root) {
    const err = store.state.authError;
    if (store.isDemo) {
      root.innerHTML = String(html`
        <div class="card login">
          <img src="icon.svg" alt="">
          <h1 style="margin-top:.75rem">Raktár – demo mód</h1>
          <p class="muted small">Nincs beállítva szerver (config.js → API_URL), ezért az app helyi próbaadatokkal fut.
          Válassz felhasználót a szerepkörök kipróbálásához:</p>
          <div class="users" id="users"><p class="muted">Betöltés…</p></div>
        </div>`);
      const users = await store.backend.users();
      const box = root.querySelector('#users');
      if (!box) return;
      box.innerHTML = String(html`${users.map(u => html`
        <button class="btn btn-block" data-email="${u.email}" style="justify-content:space-between">
          <span>${u.nev}</span><span class="badge badge-info">${L.ROLE_LABELS[u.szerepkor]}</span></button>`)}`);
      box.onclick = async e => {
        const b = e.target.closest('[data-email]');
        if (!b) return;
        b.disabled = true;
        try {
          const r = await store.backend.login(b.dataset.email);
          await store.setSession(r.token, r.user);
        } catch (x) { toast(x.message, 'error'); b.disabled = false; }
      };
      return;
    }
    root.innerHTML = String(html`
      <div class="card login">
        <img src="icon.svg" alt="">
        <h1 style="margin-top:.75rem">Raktár</h1>
        <p class="muted">Jelentkezz be a Google-fiókoddal.</p>
        ${err ? html`<div class="notice notice-err small">${err}</div>` : ''}
        <div id="gbtn" style="display:flex;justify-content:center;margin-top:1rem"></div>
        <p id="gmsg" class="small muted" style="margin-top:1rem"></p>
      </div>`);
    try {
      await loadGis();
      if (!gisLoaded) {
        window.google.accounts.id.initialize({
          client_id: CONFIG.GOOGLE_CLIENT_ID,
          auto_select: true,
          callback: async resp => {
            const msg = document.getElementById('gmsg');
            if (msg) msg.textContent = 'Ellenőrzés…';
            try {
              const r = await store.backend.login(resp.credential);
              await store.setSession(r.token, r.user);
            } catch (x) {
              if (msg) msg.textContent = '';
              toast(x.message, 'error', 8000);
            }
          },
        });
        gisLoaded = true;
      }
      const btn = document.getElementById('gbtn');
      if (btn) window.google.accounts.id.renderButton(btn, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'hu' });
    } catch (x) {
      const msg = document.getElementById('gmsg');
      if (msg) msg.textContent = x.message;
    }
  },
};
