/* ─────────────────────────────────────────────────────────────────
   Internal-page password gate (client-side, friction-only)

   Drop into the <head> of any internal/review page:
     <script src="scripts/password-gate.js"></script>

   Must NOT use `defer` or `async` — runs synchronously during head
   parsing so the page content stays hidden until the overlay is up
   (no flash of internal content). Unlock persists for the browser
   tab via sessionStorage('cr-unlocked').
   ───────────────────────────────────────────────────────────────── */
(function () {
  const PASS = 'HopeHeals26';
  const KEY  = 'cr-unlocked';

  if (sessionStorage.getItem(KEY) === '1') return;

  // 1. Hide page content immediately. This rule keeps body children
  //    invisible but lets the overlay (also a body child) show through
  //    once it's injected on DOMContentLoaded.
  const hideStyle = document.createElement('style');
  hideStyle.id = 'cr-gate-hide';
  hideStyle.textContent = 'body>:not(#pw-overlay){visibility:hidden!important;}';
  document.head.appendChild(hideStyle);

  // 2. Overlay styling — matches the site's navy/orange palette.
  const overlayCss = document.createElement('style');
  overlayCss.id = 'cr-gate-style';
  overlayCss.textContent = `
    #pw-overlay {
      position: fixed; inset: 0; background: #0F1F5C; z-index: 99999;
      display: flex; align-items: center; justify-content: center;
      flex-direction: column;
      font-family: 'Open Sans', system-ui, -apple-system, sans-serif;
    }
    #pw-overlay .pw-logo {
      width: 180px; height: 180px; margin-bottom: 28px;
    }
    #pw-overlay .pw-box {
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 14px;
      padding: 36px 40px;
      text-align: center;
      max-width: 380px;
      width: 90%;
      box-sizing: border-box;
    }
    #pw-overlay h2 {
      font-family: 'Montserrat', system-ui, sans-serif;
      font-weight: 800; font-size: 20px;
      color: #fff; margin: 0 0 6px;
      letter-spacing: -.02em;
    }
    #pw-overlay p {
      font-size: 13px;
      color: rgba(255,255,255,.55);
      margin: 0 0 22px;
      line-height: 1.5;
    }
    #pw-overlay input[type=password] {
      width: 100%; box-sizing: border-box;
      background: rgba(255,255,255,.08);
      border: 1.5px solid rgba(255,255,255,.18);
      border-radius: 8px;
      padding: 13px 16px;
      font: inherit; font-size: 15px;
      color: #fff;
      outline: none;
      letter-spacing: .12em;
      text-align: center;
      margin-bottom: 12px;
      transition: border-color .2s;
    }
    #pw-overlay input[type=password]:focus { border-color: #E8622A; }
    #pw-overlay .pw-btn {
      width: 100%;
      background: #E8622A; color: #fff;
      font-family: 'Montserrat', system-ui, sans-serif;
      font-weight: 700; font-size: 15px;
      letter-spacing: .04em;
      border: 0; border-radius: 8px;
      padding: 13px;
      cursor: pointer;
      transition: background .18s;
    }
    #pw-overlay .pw-btn:hover { background: #C84F1A; }
    #pw-overlay .pw-error {
      color: #fca5a5; font-size: 13px;
      margin-top: 10px; min-height: 18px;
    }
  `;
  document.head.appendChild(overlayCss);

  function build() {
    const overlay = document.createElement('div');
    overlay.id = 'pw-overlay';
    overlay.innerHTML = `
      <img src="images/anniversary-seal.svg?v=2" alt="Celebrate Recovery 20 Years — Zion Lutheran, Fairbanks Alaska" class="pw-logo">
      <div class="pw-box">
        <h2>Preview Access</h2>
        <p>This page is for review only.<br>Contact Celebrate Recovery Zion for the password.</p>
        <input type="password" placeholder="Enter password" autocomplete="off" aria-label="Password">
        <button type="button" class="pw-btn">Unlock Page</button>
        <div class="pw-error" role="alert" aria-live="polite"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('input');
    const btn   = overlay.querySelector('.pw-btn');
    const err   = overlay.querySelector('.pw-error');

    function tryUnlock() {
      if (input.value === PASS) {
        sessionStorage.setItem(KEY, '1');
        overlay.remove();
        hideStyle.remove();
        overlayCss.remove();
      } else {
        err.textContent = 'Incorrect password. Please try again.';
        input.value = '';
        input.focus();
      }
    }
    btn.addEventListener('click', tryUnlock);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });
    setTimeout(() => input.focus(), 50);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
