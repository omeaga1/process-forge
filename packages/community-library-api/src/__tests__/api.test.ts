import { describe, it, before } from 'node:test';
import * as assert from 'node:assert/strict';
import { createHandler, type Env } from '../index.js';
import { signSession, verifySession, verifyGoogleIdToken, type Jwk } from '../auth.js';
import { createFakeD1 } from './fakeD1.js';

const WEB_CLIENT = 'web-client.apps.googleusercontent.com';
const SECRET = 'x'.repeat(48);

// ── A stand-in for Google: an RSA key we control, published as a JWKS ───────

let privateKey: CryptoKey;
let jwks: Jwk[];

const b64url = (bytes: Uint8Array) =>
  Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const part = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

async function googleToken(claims: Record<string, unknown>, opts: { kid?: string; key?: CryptoKey } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const h = part({ alg: 'RS256', kid: opts.kid ?? 'k1', typ: 'JWT' });
  const p = part({
    iss: 'https://accounts.google.com',
    aud: WEB_CLIENT,
    sub: '1001',
    email: 'alice@example.com',
    email_verified: true,
    name: 'Alice',
    exp: now + 3600,
    ...claims
  });
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', opts.key ?? privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64url(new Uint8Array(sig))}`;
}

async function rsaPair() {
  return (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair;
}

before(async () => {
  const pair = await rsaPair();
  privateKey = pair.privateKey;
  const pub = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as { n: string; e: string };
  jwks = [{ kid: 'k1', kty: 'RSA', n: pub.n, e: pub.e, alg: 'RS256' }];
});

// ── Harness ────────────────────────────────────────────────────────────────

function setup() {
  const DB = createFakeD1();
  const env: Env = {
    DB,
    ENVIRONMENT: 'test',
    ALLOWED_ORIGIN: '*',
    GOOGLE_CLIENT_IDS: WEB_CLIENT,
    SESSION_SECRET: SECRET
  };
  const handle = createHandler({ jwks: async () => jwks });
  const call = async (method: string, path: string, opts: { token?: string; body?: unknown } = {}) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    const res = await handle(
      new Request(`https://api.test${path}`, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
      }),
      env
    );
    return { status: res.status, body: (await res.json()) as any };
  };
  const signIn = async (claims: Record<string, unknown> = {}) => {
    const r = await call('POST', '/api/auth/google', { body: { credential: await googleToken(claims) } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body.session.token as string;
  };
  return { DB, env, call, signIn };
}

const bundle = { graph: { nodes: [], edges: [] } };

// ── Google token verification ──────────────────────────────────────────────

describe('Google ID token verification', () => {
  const verify = (t: string) => verifyGoogleIdToken(t, { clientIds: [WEB_CLIENT], jwks: async () => jwks });

  it('accepts a correctly signed token for our client', async () => {
    const claims = await verify(await googleToken({}));
    assert.equal(claims.sub, '1001');
  });

  it('REJECTS an unsigned token with a plausible payload', async () => {
    // What the old client-side decoder accepted: any three dot-separated parts.
    const [h, p] = (await googleToken({})).split('.');
    await assert.rejects(verify(`${h}.${p}.`), /signature|Malformed/);
  });

  it('REJECTS a token signed by a key that is not Google\'s', async () => {
    const other = await rsaPair();
    await assert.rejects(verify(await googleToken({}, { key: other.privateKey })), /signature/);
  });

  it('REJECTS a token issued for someone else\'s app', async () => {
    await assert.rejects(verify(await googleToken({ aud: 'other-app.apps.googleusercontent.com' })), /different application/);
  });

  it('REJECTS an expired token, and a non-Google issuer', async () => {
    await assert.rejects(verify(await googleToken({ exp: Math.floor(Date.now() / 1000) - 3600 })), /expired/);
    await assert.rejects(verify(await googleToken({ iss: 'https://evil.example' })), /not issued by Google/);
  });

  it('REJECTS an unverified email', async () => {
    await assert.rejects(verify(await googleToken({ email_verified: false })), /not verified/);
  });
});

describe('Session tokens', () => {
  const s = { uid: 'google:1', email: 'a@b.c', name: 'A', exp: Math.floor(Date.now() / 1000) + 60 };

  it('round-trips', async () => {
    assert.deepEqual(await verifySession(await signSession(s, SECRET), SECRET), s);
  });

  it('REJECTS a session whose payload was edited to another user', async () => {
    const [v, , sig] = (await signSession(s, SECRET)).split('.');
    const forged = Buffer.from(JSON.stringify({ ...s, uid: 'google:2' })).toString('base64url');
    await assert.rejects(verifySession(`${v}.${forged}.${sig}`, SECRET), /invalid/);
  });

  it('REJECTS an expired session', async () => {
    await assert.rejects(verifySession(await signSession({ ...s, exp: 1 }, SECRET), SECRET), /expired/);
  });

  it('refuses to run with a missing or short secret', async () => {
    await assert.rejects(signSession(s, ''), /not configured/);
    await assert.rejects(signSession(s, 'short'), /not configured/);
  });
});

// ── The vulnerabilities this change closes, as API behaviour ───────────────

describe('Cloud projects are scoped to the signed-in owner', () => {
  it('requires a session for every project route', async () => {
    const { call } = setup();
    for (const [m, p] of [
      ['GET', '/api/projects'],
      ['GET', '/api/projects/p1'],
      ['POST', '/api/projects'],
      ['DELETE', '/api/projects/p1']
    ] as const) {
      const r = await call(m, p, { body: m === 'POST' ? { id: 'p1', name: 'x', bundle } : undefined });
      assert.equal(r.status, 401, `${m} ${p} -> ${r.status}`);
    }
  });

  it('WAS: ?userId= listed anyone\'s projects. Now the query string is ignored', async () => {
    const { call, signIn } = setup();
    const alice = await signIn();
    const bob = await signIn({ sub: '2002', email: 'bob@example.com', name: 'Bob' });
    await call('POST', '/api/projects', { token: alice, body: { id: 'a1', name: 'Alice line', bundle } });

    const r = await call('GET', '/api/projects?userId=google:1001', { token: bob });
    assert.equal(r.status, 200);
    assert.equal(r.body.count, 0, 'Bob must not see Alice\'s projects');

    const mine = await call('GET', '/api/projects', { token: alice });
    assert.deepEqual(mine.body.projects.map((p: any) => p.id), ['a1']);
  });

  it('WAS: GET /api/projects/:id returned any flowsheet. Now another owner gets 404', async () => {
    const { call, signIn } = setup();
    const alice = await signIn();
    const bob = await signIn({ sub: '2002', email: 'bob@example.com' });
    await call('POST', '/api/projects', { token: alice, body: { id: 'a1', name: 'Alice line', bundle } });

    assert.equal((await call('GET', '/api/projects/a1', { token: bob })).status, 404);
    assert.equal((await call('GET', '/api/projects/a1', { token: alice })).status, 200);
  });

  it('WAS: POST overwrote any project by id. Now it cannot touch another owner\'s row', async () => {
    const { DB, call, signIn } = setup();
    const alice = await signIn();
    const bob = await signIn({ sub: '2002', email: 'bob@example.com' });
    await call('POST', '/api/projects', { token: alice, body: { id: 'a1', name: 'Alice line', bundle } });

    const r = await call('POST', '/api/projects', { token: bob, body: { id: 'a1', name: 'pwned', bundle } });
    assert.equal(r.status, 409);
    const row = DB.raw.prepare('SELECT name, user_id FROM simulation_projects WHERE id = ?').get('a1') as any;
    assert.deepEqual({ ...row }, { name: 'Alice line', user_id: 'google:1001' });
  });

  it('WAS: userId came from the body. Now a body userId is ignored', async () => {
    const { DB, call, signIn } = setup();
    const bob = await signIn({ sub: '2002', email: 'bob@example.com' });
    await call('POST', '/api/projects', {
      token: bob,
      body: { id: 'b1', name: 'Bob line', userId: 'google:1001', bundle }
    });
    const row = DB.raw.prepare('SELECT user_id FROM simulation_projects WHERE id = ?').get('b1') as any;
    assert.equal(row.user_id, 'google:2002');
  });

  it('WAS: DELETE removed any project. Now it only removes your own', async () => {
    const { DB, call, signIn } = setup();
    const alice = await signIn();
    const bob = await signIn({ sub: '2002', email: 'bob@example.com' });
    await call('POST', '/api/projects', { token: alice, body: { id: 'a1', name: 'Alice line', bundle } });

    assert.equal((await call('DELETE', '/api/projects/a1', { token: bob })).status, 404);
    assert.ok(DB.raw.prepare('SELECT 1 FROM simulation_projects WHERE id = ?').get('a1'), 'still there');
    assert.equal((await call('DELETE', '/api/projects/a1', { token: alice })).status, 200);
  });

  it('lets an owner update their own project', async () => {
    const { call, signIn } = setup();
    const alice = await signIn();
    await call('POST', '/api/projects', { token: alice, body: { id: 'a1', name: 'v1', bundle } });
    const r = await call('POST', '/api/projects', { token: alice, body: { id: 'a1', name: 'v2', bundle } });
    assert.equal(r.status, 200);
    assert.equal((await call('GET', '/api/projects/a1', { token: alice })).body.project.name, 'v2');
  });
});

describe('Sign-in and profiles', () => {
  it('WAS: /api/auth/session upserted any profile unverified. It is gone', async () => {
    const { call } = setup();
    const r = await call('POST', '/api/auth/session', { body: { email: 'victim@example.com', name: 'x' } });
    assert.equal(r.status, 410);
  });

  it('refuses a forged Google credential', async () => {
    const { call } = setup();
    const [h, p] = (await googleToken({})).split('.');
    const r = await call('POST', '/api/auth/google', { body: { credential: `${h}.${p}.AAAA` } });
    assert.equal(r.status, 401);
  });

  it('signing in twice keeps one user, and a shared local part does not collide', async () => {
    const { DB, signIn } = setup();
    await signIn();
    await signIn();
    // Old code used the email local part as a UNIQUE username.
    await signIn({ sub: '3003', email: 'alice@other.example' });
    const n = (DB.raw.prepare('SELECT count(*) AS n FROM users WHERE id LIKE ?').get('google:%') as any).n;
    assert.equal(n, 2);
  });

  it('reports desktop sign-in as unconfigured rather than failing obscurely', async () => {
    const { call } = setup();
    const r = await call('POST', '/api/auth/google/code', {
      body: { code: 'c', codeVerifier: 'v', redirectUri: 'http://127.0.0.1:5000' }
    });
    assert.equal(r.status, 501);
  });
});

describe('Community library', () => {
  it('search stays public', async () => {
    const { call } = setup();
    const r = await call('GET', '/api/unitops');
    assert.equal(r.status, 200);
  });

  it('WAS: anyone could publish as any author. Now publish needs a session and the author is the session', async () => {
    const { DB, call, signIn } = setup();
    const body = {
      name: 'Belt cooler',
      category: 'MATERIAL_HANDLING',
      description: 'd',
      author_id: 'user-serac',
      author_name: 'Serac Systems OEM',
      bundle
    };
    assert.equal((await call('POST', '/api/unitops/publish', { body })).status, 401);

    const alice = await signIn();
    const r = await call('POST', '/api/unitops/publish', { token: alice, body });
    assert.equal(r.status, 201);
    const row = DB.raw.prepare('SELECT author_id, author_name FROM unitops WHERE id = ?').get(r.body.pluginId) as any;
    assert.deepEqual({ ...row }, { author_id: 'google:1001', author_name: 'Alice' });
  });

  it('does not echo internal error text', async () => {
    const { env, call, signIn } = setup();
    const alice = await signIn();
    env.DB = { prepare: () => { throw new Error('SQLITE_ERROR: no such table: secret_things'); } } as any;
    const r = await call('GET', '/api/projects', { token: alice });
    assert.equal(r.status, 500);
    assert.ok(!JSON.stringify(r.body).includes('secret_things'));
  });
});
