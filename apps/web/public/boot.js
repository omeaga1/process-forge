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
