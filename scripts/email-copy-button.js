/* Floating "Copy email HTML" button for the three email-template pages.
 *
 * Click → writes two MIME variants to the clipboard in a single call:
 *   • text/html  — the rendered <body> innerHTML (inline styles intact).
 *                  Paste into Gmail / Outlook compose, get a formatted
 *                  email ready to send.
 *   • text/plain — the full <!DOCTYPE><html>…</html> source. Paste into
 *                  Email Octopus / Mailchimp / Sender HTML-source editors.
 *
 * Hidden in headless Chrome so it never lands in screenshots or PDFs.
 */
(function () {
  if (/HeadlessChrome/.test(navigator.userAgent)) return;

  const BTN_ID = 'cr-email-copy-btn';
  const TOAST_ID = 'cr-email-copy-toast';
  const NAVY = '#1E3A8A';
  const ORANGE = '#E8622A';
  const GREEN = '#166534';
  const RED = '#991B1B';

  function el(tag, css, html) {
    const n = document.createElement(tag);
    if (css) Object.assign(n.style, css);
    if (html != null) n.innerHTML = html;
    return n;
  }

  function buildHtml() {
    // Clone the body and strip our own chrome — those bits aren't part
    // of the email and would confuse the recipient if pasted.
    const body = document.body.cloneNode(true);
    body.querySelectorAll(`#${BTN_ID}, #${TOAST_ID}`).forEach(n => n.remove());

    // Clone head and strip our script so a downstream "view source" of
    // a copied email doesn't reference a file the recipient can't reach.
    const head = document.head.cloneNode(true);
    head.querySelectorAll('script[src*="email-copy-button"]').forEach(n => n.remove());

    const lang = document.documentElement.lang || 'en';
    const doc =
      `<!DOCTYPE html>\n<html lang="${lang}">\n${head.outerHTML}\n${body.outerHTML}\n</html>\n`;
    const rich = body.innerHTML.trim();
    return { doc, rich };
  }

  function toast(msg, ok) {
    let t = document.getElementById(TOAST_ID);
    if (!t) {
      t = el('div', {
        position: 'fixed', top: '64px', right: '16px', zIndex: '99999',
        color: '#fff', padding: '10px 16px', borderRadius: '8px',
        fontFamily: "'Open Sans', system-ui, sans-serif", fontSize: '13px',
        boxShadow: '0 4px 14px rgba(0,0,0,.22)', opacity: '0',
        transition: 'opacity .18s', pointerEvents: 'none', maxWidth: '320px',
      });
      t.id = TOAST_ID;
      document.body.appendChild(t);
    }
    t.style.background = ok ? GREEN : RED;
    t.textContent = msg;
    requestAnimationFrame(() => { t.style.opacity = '1'; });
    clearTimeout(t._timeout);
    t._timeout = setTimeout(() => { t.style.opacity = '0'; }, 3000);
  }

  async function copy() {
    const { doc, rich } = buildHtml();
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html':  new Blob([rich], { type: 'text/html' }),
          'text/plain': new Blob([doc],  { type: 'text/plain' }),
        }),
      ]);
      toast('Copied. Paste into Gmail / Outlook to send, or into Email Octopus HTML editor.', true);
    } catch (e) {
      // Older browsers / blocked clipboard API → fall back to text-only.
      try {
        await navigator.clipboard.writeText(doc);
        toast('Copied as HTML source. Paste into your ESP\'s HTML editor.', true);
      } catch (e2) {
        console.error('Clipboard copy failed', e, e2);
        toast('Copy failed — try a recent Chrome / Edge / Firefox.', false);
      }
    }
  }

  function mount() {
    if (document.getElementById(BTN_ID)) return;
    const btn = el('button', {
      position: 'fixed', top: '16px', right: '16px', zIndex: '99999',
      background: NAVY, color: '#fff', border: '0',
      borderRadius: '100px', padding: '10px 18px',
      fontFamily: "'Montserrat', system-ui, sans-serif",
      fontWeight: '700', fontSize: '13px', letterSpacing: '.04em',
      cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,.22)',
      transition: 'background .15s, transform .15s',
      display: 'inline-flex', alignItems: 'center', gap: '6px',
    },
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copy email HTML</span>`
    );
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Copy email HTML to paste into your email client');
    btn.addEventListener('mouseenter', () => { btn.style.background = ORANGE; });
    btn.addEventListener('mouseleave', () => { btn.style.background = NAVY; });
    btn.addEventListener('click', copy);
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
