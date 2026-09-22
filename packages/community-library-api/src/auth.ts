/**
 * Identity for the cloud API.
 *
 * Before this module the worker trusted whatever the client said: a project
 * list was `?userId=` from the query string, a save took `userId` from the
 * body, and the "session" endpoint upserted any profile it was sent. The
 * client sent a bearer token, and nothing read it.
 *
 * Now there is one way to become a user: present a Google ID token that this
 * worker verifies itself -- RS256 signature against Google's published keys,
 * issuer, audience (one of OUR client IDs), and expiry. The worker then issues
 * its own session token, HMAC-signed with a secret only it holds, and every
 * owner-scoped route derives the user from that token and nothing else.
 *
 * Why a session of our own rather than passing the Google token on every call:
 * Google ID tokens expire after an hour, and a desktop app that re-prompts for
 * Google sign-in hourly is unusable.
 */

export interface GoogleClaims {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  aud: string;
  iss: string;
  exp: number;
}

export interface Session {
  /** Stable user id: `google:<sub>`. Never an email, which can be reassigned. */
  uid: string;
  email: string;
  name: string;
  /** Seconds since epoch. */
  exp: number;
}

export class AuthError extends Error {
  constructor(message: string, readonly status = 401) {
    super(message);
  }
}

// ── base64url ───────────────────────────────────────────────────────────────

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    throw new AuthError('Malformed token.');
  }
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

function parseJsonPart<T>(part: string): T {
  try {
    return JSON.parse(fromUtf8.decode(b64urlToBytes(part))) as T;
  } catch {
    throw new AuthError('Malformed token.');
  }
}

// ── Google ID token verification ────────────────────────────────────────────

export interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

export type JwksFetcher = () => Promise<Jwk[]>;

const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

let cachedJwks: { keys: Jwk[]; until: number } | null = null;

/** Google's signing keys, cached for as long as Google's Cache-Control allows. */
export const fetchGoogleJwks: JwksFetcher = async () => {
  const now = Date.now();
  if (cachedJwks && cachedJwks.until > now) return cachedJwks.keys;
  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) throw new AuthError('Could not fetch Google signing keys.', 503);
  const body = (await res.json()) as { keys: Jwk[] };
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '')?.[1] || 3600);
  cachedJwks = { keys: body.keys, until: now + maxAge * 1000 };
  return body.keys;
};

export async function verifyGoogleIdToken(
  token: string,
  opts: { clientIds: string[]; jwks?: JwksFetcher; nowSeconds?: number }
): Promise<GoogleClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new AuthError('Malformed token.');
  const [h, p, s] = parts as [string, string, string];

  const header = parseJsonPart<{ alg?: string; kid?: string }>(h);
  if (header.alg !== 'RS256' || !header.kid) throw new AuthError('Unsupported token algorithm.');

  const keys = await (opts.jwks ?? fetchGoogleJwks)();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new AuthError('Token signed by an unknown key.');

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(s),
    utf8.encode(`${h}.${p}`)
  );
  if (!valid) throw new AuthError('Token signature is invalid.');

  const claims = parseJsonPart<GoogleClaims>(p);
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!GOOGLE_ISSUERS.has(claims.iss)) throw new AuthError('Token was not issued by Google.');
  if (!opts.clientIds.includes(claims.aud)) throw new AuthError('Token was issued for a different application.');
  // A minute of leeway for clock skew between Google, the client and the edge.
  if (typeof claims.exp !== 'number' || claims.exp + 60 < now) throw new AuthError('Token has expired.');
  if (!claims.sub || !claims.email) throw new AuthError('Token is missing its subject or email.');
  if (claims.email_verified === false) throw new AuthError('Google account email is not verified.');
  return claims;
}

// ── Session tokens ──────────────────────────────────────────────────────────

/** 30 days. Long enough that the desktop app is not a sign-in treadmill. */
export const SESSION_TTL_SECONDS = 30 * 24 * 3600;

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (!secret || secret.length < 32) {
    // Refuse to run with a weak or missing secret rather than mint forgeable
    // sessions. Set it with `wrangler secret put SESSION_SECRET`.
    throw new AuthError('Server session secret is not configured.', 500);
  }
  return crypto.subtle.importKey('raw', utf8.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify'
  ]);
}

export async function signSession(session: Session, secret: string): Promise<string> {
  const body = bytesToB64url(utf8.encode(JSON.stringify(session)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), utf8.encode(body));
  return `pfs1.${body}.${bytesToB64url(new Uint8Array(sig))}`;
}

export async function verifySession(token: string, secret: string, nowSeconds?: number): Promise<Session> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'pfs1') throw new AuthError('Not signed in.');
  const [, body, sig] = parts as [string, string, string];
  // crypto.subtle.verify compares in constant time.
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), b64urlToBytes(sig), utf8.encode(body));
  if (!ok) throw new AuthError('Session is invalid.');
  const session = parseJsonPart<Session>(body);
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  if (typeof session.exp !== 'number' || session.exp < now) throw new AuthError('Session has expired. Sign in again.');
  if (!session.uid) throw new AuthError('Session is invalid.');
  return session;
}

export function bearerToken(request: Request): string | null {
  const h = request.headers.get('Authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1]!.trim() : null;
}

export function sessionFromClaims(claims: GoogleClaims, nowSeconds?: number): Session {
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  return {
    uid: `google:${claims.sub}`,
    email: claims.email,
    name: claims.name || claims.email.split('@')[0]!,
    exp: now + SESSION_TTL_SECONDS
  };
}

// ── Desktop sign-in: authorization-code exchange ────────────────────────────

/**
 * Exchanges an authorization code from the desktop app's loopback flow.
 *
 * The exchange happens HERE rather than in the app so the desktop OAuth
 * client secret stays a worker secret instead of shipping in every installer.
 * PKCE (the code verifier) is what actually binds the code to the app instance
 * that started the flow.
 */
export async function exchangeGoogleCode(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  // A loopback redirect is the only kind the desktop flow uses; refusing
  // anything else keeps this endpoint from being a general code-exchange proxy.
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d{1,5}\/?$/.test(params.redirectUri)) {
    throw new AuthError('Redirect URI must be a loopback address.', 400);
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: params.code,
      code_verifier: params.codeVerifier,
      redirect_uri: params.redirectUri,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      grant_type: 'authorization_code'
    }).toString()
  });
  const body = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string };
  if (!res.ok || !body.id_token) {
    throw new AuthError(`Google rejected the sign-in code${body.error ? ` (${body.error})` : ''}.`, 401);
  }
  return body.id_token;
}
