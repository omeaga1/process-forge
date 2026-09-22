import { loginWithGoogleCode, type UserSession } from './accountManager.js';

/**
 * Google sign-in for the desktop app: system browser plus loopback redirect.
 *
 * The web button (Google Identity Services) cannot work in the desktop app --
 * its pages are served from http://tauri.localhost, which Google does not
 * accept as a registered origin. See oauth_loopback.rs for the native half.
 *
 * Split of responsibilities:
 *   - here: PKCE verifier and challenge, `state`, and the authorization URL;
 *   - Rust: a one-shot listener on 127.0.0.1 and opening the browser;
 *   - cloud API: exchanging the code (it holds the desktop client secret, so
 *     the installer does not) and verifying the resulting ID token.
 *
 * The desktop OAuth client is a separate "Desktop app" client in Google Cloud.
 * Its ID is public and baked in at build time.
 */
export const DESKTOP_GOOGLE_CLIENT_ID: string = (import.meta as any).env?.VITE_GOOGLE_DESKTOP_CLIENT_ID || '';

export function isDesktopGoogleSignInConfigured(): boolean {
  return DESKTOP_GOOGLE_CLIENT_ID.length > 0;
}

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** RFC 7636: S256 challenge for a verifier. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/**
 * The authorization URL, with `{redirect_uri}` left for the native side to
 * fill in once it has bound a port.
 */
export function buildAuthUrl(params: { clientId: string; challenge: string; state: string }): string {
  const q = new URLSearchParams({
    client_id: params.clientId,
    response_type: 'code',
    scope: 'openid email profile',
    code_challenge: params.challenge,
    code_challenge_method: 'S256',
    state: params.state,
    prompt: 'select_account'
  });
  // Appended raw so URLSearchParams does not percent-encode the placeholder.
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}&redirect_uri={redirect_uri}`;
}

export async function signInWithGoogleOnDesktop(): Promise<UserSession> {
  if (!isDesktopGoogleSignInConfigured()) {
    throw new Error('Google sign-in is not set up for this desktop build yet.');
  }
  // 64 random bytes -> 86 characters, inside RFC 7636's 43-128 range.
  const verifier = randomToken(64);
  const state = randomToken(16);
  const authUrl = buildAuthUrl({
    clientId: DESKTOP_GOOGLE_CLIENT_ID,
    challenge: await pkceChallenge(verifier),
    state
  });

  // Imported here so this module (and its tests) do not pull in React.
  const { invokeTauriCommand } = await import('../components/UpdateNotificationBanner.js');
  const result = await invokeTauriCommand<{ code: string; state: string; redirectUri: string }>(
    'google_loopback_sign_in',
    { authUrl }
  );
  // A redirect carrying someone else's state did not come from this attempt.
  if (result.state !== state) throw new Error('Sign-in response did not match this request. Try again.');

  return loginWithGoogleCode({ code: result.code, codeVerifier: verifier, redirectUri: result.redirectUri });
}
