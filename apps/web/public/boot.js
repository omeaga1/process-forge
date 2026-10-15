// Runs before the app: applies the saved theme so the first paint is right.
// A file rather than an inline <script> so the Content-Security-Policy can
// forbid inline script entirely (see public/_headers).
(function () {
  try {
    var stored = localStorage.getItem('pf-theme');
    var theme = stored === 'light' || stored === 'dark' ? stored : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f8f7f0' : '#0c1214');
  } catch (e) {}
})();

// Google's sign-in button script, on the web only. The desktop app signs in
// through the system browser (oauth_loopback.rs) and never uses it, and its
// CSP does not allow it; Tauri injects __TAURI_INTERNALS__ before any page
// script runs, so this check is reliable here.
(function () {
  if (window.__TAURI_INTERNALS__) return;
  var s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.async = true;
  s.defer = true;
  document.head.appendChild(s);
})();

// Cloudflare Web Analytics (cookieless visit counts), on the website only. The
// desktop app is not a website and its CSP does not allow the beacon; a local
// dev server or smoke test is not a visit (and the beacon's CORS fails there).
(function () {
  if (window.__TAURI_INTERNALS__) return;
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
  var s = document.createElement('script');
  s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  s.defer = true;
  s.setAttribute('data-cf-beacon', '{"token": "f2ed53e648c448d6b209861f03df450c"}');
  document.head.appendChild(s);
})();
