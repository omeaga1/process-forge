/**
 * "Sign in with OpenRouter": OpenRouter's OAuth PKCE flow, which ends with an
 * API key issued to this app for this user. The user never copies a key, and
 * can see and revoke it (and set a spending limit on it) in their OpenRouter
 * settings. See https://openrouter.ai/docs/use-cases/oauth-pkce.
 *
 *   desktop: the system browser, returning to a loopback port (Rust side:
 *            oauth_loopback.rs, command `openrouter_loopback_sign_in`);
 *   web:     a popup returning to /openrouter-callback.html on this origin,
 *            which hands the code back through localStorage and closes.
 *
 * Either way the code is exchanged here, directly with OpenRouter, using the
 * PKCE verifier that never left this page.
 */

const AUTH_URL = 'https://openrouter.ai/auth';
const EXCHANGE_URL = 'https://openrouter.ai/api/v1/auth/keys';
/** Written by public/openrouter-callback.js. */
export const OPENROUTER_CODE_KEY = 'pf_openrouter_oauth_code';
const WEB_TIMEOUT_MS = 5 * 60 * 1000;

type TauriInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

function tauriInvoke(): TauriInvoke | undefined {
  if (typeof window === 'undefined') return undefined;
  const fn = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: TauriInvoke } }).__TAURI_INTERNALS__?.invoke;
  return typeof fn === 'function' ? fn : undefined;
}

function base64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function createCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export async function codeChallengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export function buildOpenRouterAuthUrl(callbackUrl: string, challenge: string): string {
  // callbackUrl may be the literal `{redirect_uri}` placeholder the desktop
  // shell fills in (already percent-encoded there), so it is not encoded twice.
  const cb = callbackUrl === '{redirect_uri}' ? callbackUrl : encodeURIComponent(callbackUrl);
  return `${AUTH_URL}?callback_url=${cb}&code_challenge=${challenge}&code_challenge_method=S256`;
}

export async function exchangeOpenRouterCode(code: string, verifier: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(EXCHANGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' })
  });
  const data = (await res.json().catch(() => ({}))) as { key?: string; error?: { message?: string } };
  if (!res.ok || !data.key) {
    throw new Error(data.error?.message || `OpenRouter did not issue a key (HTTP ${res.status}).`);
  }
  return data.key;
}

function waitForWebCode(popup: Window): Promise<string> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const finish = (fn: () => void) => {
      window.removeEventListener('storage', onStorage);
      window.clearInterval(poll);
      fn();
    };
    const take = (): boolean => {
      const raw = window.localStorage.getItem(OPENROUTER_CODE_KEY);
      if (!raw) return false;
      window.localStorage.removeItem(OPENROUTER_CODE_KEY);
      try {
        const msg = JSON.parse(raw) as { code?: string; error?: string };
        if (msg.code) finish(() => resolve(msg.code as string));
        else finish(() => reject(new Error(msg.error === 'access_denied' ? 'OpenRouter sign-in was cancelled.' : 'OpenRouter did not return a sign-in code.')));
      } catch {
        finish(() => reject(new Error('OpenRouter did not return a sign-in code.')));
      }
      return true;
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === OPENROUTER_CODE_KEY && e.newValue) take();
    };
    // The storage event covers the normal case; the poll covers the popup
    // being closed by hand, and browsers that do not fire the event.
    const poll = window.setInterval(() => {
      if (take()) return;
      if (popup.closed) finish(() => reject(new Error('The OpenRouter window was closed before sign-in finished.')));
      else if (Date.now() - started > WEB_TIMEOUT_MS) finish(() => reject(new Error('Timed out waiting for OpenRouter sign-in.')));
    }, 500);
    window.addEventListener('storage', onStorage);
  });
}

/**
 * Runs the whole flow and resolves with the issued API key. Must be called
 * from a click handler (the web popup is otherwise blocked).
 */
export async function signInWithOpenRouter(): Promise<string> {
  const verifier = createCodeVerifier();
  const challenge = await codeChallengeS256(verifier);
  const invoke = tauriInvoke();

  if (invoke) {
    const result = (await invoke('openrouter_loopback_sign_in', {
      authUrl: buildOpenRouterAuthUrl('{redirect_uri}', challenge)
    })) as { code: string };
    return exchangeOpenRouterCode(result.code, verifier);
  }

  // Open the popup synchronously relative to the click where possible: the
  // digest above is fast, and browsers keep the user-activation for ~1s.
  window.localStorage.removeItem(OPENROUTER_CODE_KEY);
  const callback = `${window.location.origin}/openrouter-callback.html`;
  const popup = window.open(buildOpenRouterAuthUrl(callback, challenge), 'pf-openrouter', 'width=520,height=720');
  if (!popup) throw new Error('Your browser blocked the OpenRouter window. Allow pop-ups for this site and try again.');
  const code = await waitForWebCode(popup);
  return exchangeOpenRouterCode(code, verifier);
}
