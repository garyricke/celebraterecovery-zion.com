/* ─────────────────────────────────────────────────────────────────
   Admin Internal-Pages Floating Badge
   ─────────────────────────────────────────────────────────────────
   Drops a small "A" circle into the bottom-right of every site
   page it's included on. Clicking it reveals a popup menu with
   links to internal-only pages (Status, Brand Guide, Payments).

   Self-contained — injects its own <style> and DOM, no markup
   required in the host page. Pages just include:

     <script src="scripts/admin-fab.js" defer></script>

   Highlights the current page in the menu via aria-current.
─────────────────────────────────────────────────────────────── */

(function () {
  if (window.__adminFabLoaded) return;
  window.__adminFabLoaded = true;

  // ── style ─────────────────────────────────────────────────────
  const css = `
  .admin-fab {
    /* Lives inside the footer (or at end of body when there isn't one).
       Absolute so it doesn't push footer content, anchored bottom-right. */
    position: absolute;
    bottom: 16px;
    right: 16px;
    z-index: 50;
    font-family: 'Montserrat', system-ui, sans-serif;
  }
  .admin-fab-toggle {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    border: 0;
    background: #0F1F5C;
    color: #fff;
    font-weight: 800;
    font-size: 17px;
    letter-spacing: .02em;
    cursor: pointer;
    opacity: .28;
    box-shadow: 0 2px 6px rgba(15,31,92,.12);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity .2s ease, transform .15s ease, box-shadow .15s ease, background .15s ease;
  }
  .admin-fab-toggle:hover,
  .admin-fab-toggle:focus-visible {
    opacity: 1;
    background: #1E3A8A;
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(15,31,92,.40), 0 1px 3px rgba(0,0,0,.12);
  }
  .admin-fab-toggle:focus-visible {
    outline: 2px solid #E8622A;
    outline-offset: 2px;
  }
  .admin-fab.open .admin-fab-toggle {
    opacity: 1;
    background: #1E3A8A;
    transform: rotate(45deg);
    box-shadow: 0 6px 18px rgba(15,31,92,.40), 0 1px 3px rgba(0,0,0,.12);
  }
  .admin-fab-menu {
    position: absolute;
    bottom: 52px;
    right: 0;
    min-width: 220px;
    background: #fff;
    border: 1px solid rgba(20,24,38,.08);
    border-radius: 12px;
    box-shadow: 0 14px 36px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.08);
    padding: 8px;
    display: none;
    opacity: 0;
    transform: translateY(6px);
    transition: opacity .12s ease, transform .12s ease;
  }
  .admin-fab.open .admin-fab-menu {
    display: block;
    opacity: 1;
    transform: translateY(0);
  }
  .admin-fab-menu-header {
    font-family: 'Montserrat', system-ui, sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .14em;
    text-transform: uppercase;
    color: #6B7280;
    padding: 8px 12px 6px;
  }
  .admin-fab-menu a {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    font-family: 'Open Sans', system-ui, sans-serif;
    font-size: 13.5px;
    font-weight: 600;
    color: #141826;
    text-decoration: none;
    border-radius: 8px;
    transition: background .12s ease, color .12s ease;
  }
  .admin-fab-menu a:hover {
    background: #F4ECDF;
    color: #0F1F5C;
  }
  .admin-fab-menu a[aria-current="page"] {
    background: #FFF7ED;
    color: #C84F1A;
  }
  .admin-fab-menu a[aria-current="page"]::after {
    content: '•';
    margin-left: auto;
    color: #E8622A;
    font-weight: 900;
  }
  .admin-fab-menu .ico {
    width: 16px; height: 16px; flex-shrink: 0;
    display: inline-flex; align-items: center; justify-content: center;
    color: #6B7280;
  }
  .admin-fab-menu a:hover .ico,
  .admin-fab-menu a[aria-current="page"] .ico { color: inherit; }
  @media (max-width: 480px) {
    .admin-fab { bottom: 12px; right: 12px; }
  }
  `;

  const styleEl = document.createElement('style');
  styleEl.setAttribute('data-source', 'admin-fab');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ── menu items (extend here when you add internal pages) ──────
  const items = [
    { href: 'status.html',      label: 'Status',
      ico: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6"  y1="20" x2="6"  y2="14"/></svg>' },
    { href: 'brand-guide.html', label: 'Brand Guide',
      ico: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5"  r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5"  cy="7.5"  r="1.5"/><circle cx="6.5"  cy="12.5" r="1.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c1.4 0 2.5-1.1 2.5-2.5 0-.6-.2-1.2-.6-1.7-.4-.4-.6-1-.6-1.7 0-1.4 1.1-2.5 2.5-2.5H17c2.8 0 5-2.2 5-5C22 5.7 17.5 2 12 2z"/></svg>' },
    { href: 'payments.html',    label: 'Payments',
      ico: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>' },
  ];

  // ── markup ────────────────────────────────────────────────────
  const currentPage = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  const fab = document.createElement('div');
  fab.className = 'admin-fab';
  fab.id = 'admin-fab';
  fab.innerHTML = `
    <button class="admin-fab-toggle"
            type="button"
            aria-label="Internal pages menu"
            aria-haspopup="true"
            aria-expanded="false"
            aria-controls="admin-fab-menu">A</button>
    <div class="admin-fab-menu" id="admin-fab-menu" role="menu">
      <div class="admin-fab-menu-header">Internal pages</div>
      ${items.map(it => {
        const isCurrent = it.href.toLowerCase() === currentPage;
        return `<a href="${it.href}" role="menuitem"${isCurrent ? ' aria-current="page"' : ''}>
                  <span class="ico">${it.ico}</span>${it.label}
                </a>`;
      }).join('')}
    </div>
  `;

  function mount() {
    // Place the FAB inside the footer so it's only revealed when the
    // user scrolls to the bottom. Falls back to body for pages that
    // don't have a <footer> element. Whichever host we choose, make
    // sure it's a positioning context so `position: absolute` on the
    // FAB anchors to it.
    const footer = document.querySelector('footer');
    const host = footer || document.body;
    if (getComputedStyle(host).position === 'static') {
      host.style.position = 'relative';
    }
    host.appendChild(fab);

    const toggle = fab.querySelector('.admin-fab-toggle');

    toggle.addEventListener('click', e => {
      e.stopPropagation();
      const open = fab.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open);
    });

    document.addEventListener('click', e => {
      if (!fab.contains(e.target)) {
        fab.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && fab.classList.contains('open')) {
        fab.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
