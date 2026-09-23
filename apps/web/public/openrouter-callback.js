// Landing page for "Sign in with OpenRouter" on the web. OpenRouter redirects
// here with ?code=... ; the studio window that opened this popup is waiting
// for it in localStorage (same origin), exchanges it with its PKCE verifier,
// and this window closes. The code alone is useless without that verifier.
(function () {
  var params = new URLSearchParams(window.location.search);
  var code = params.get('code');
  var error = params.get('error');
  try {
    localStorage.setItem(
      'pf_openrouter_oauth_code',
      JSON.stringify(code ? { code: code } : { error: error || 'no_code' })
    );
  } catch (e) {
    // Storage blocked: the studio will time out and say so.
  }
  // Keep the code out of history.
  history.replaceState(null, '', window.location.pathname);
  document.getElementById('title').textContent = code ? 'Signed in' : 'Sign-in did not complete';
  document.getElementById('body').textContent = code
    ? 'You can close this window and return to ProcessForge.'
    : 'OpenRouter did not return a sign-in code. Return to ProcessForge and try again.';
  setTimeout(function () { window.close(); }, 600);
})();
