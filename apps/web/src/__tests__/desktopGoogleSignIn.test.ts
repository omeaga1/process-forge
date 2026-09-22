import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuthUrl, pkceChallenge } from '../auth/desktopGoogleSignIn.js';

describe('Desktop Google sign-in', () => {
  it('computes the S256 challenge from RFC 7636 appendix B', async () => {
    assert.equal(
      await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
    );
  });

  it('builds a Google URL that leaves the redirect for the native side', () => {
    const url = buildAuthUrl({ clientId: 'desk.apps.googleusercontent.com', challenge: 'c', state: 's' });
    // oauth_loopback.rs refuses anything else.
    assert.ok(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth?'));
    assert.ok(url.endsWith('&redirect_uri={redirect_uri}'), 'placeholder must stay unencoded');
    const q = new URL(url.replace('{redirect_uri}', 'x')).searchParams;
    assert.equal(q.get('code_challenge_method'), 'S256');
    assert.equal(q.get('response_type'), 'code');
    assert.equal(q.get('scope'), 'openid email profile');
    assert.equal(q.get('state'), 's');
  });
});
