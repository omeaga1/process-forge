import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PAGES, pageOf } from '../landing/router.js';

describe('Landing page: the site is split into pages, each at its own address', () => {
  it('opens each page from its path, with or without a trailing slash', () => {
    assert.equal(pageOf('/'), 'home');
    assert.equal(pageOf('/example'), 'example');
    assert.equal(pageOf('/library/'), 'library');
    assert.equal(pageOf('/claude'), 'claude');
    assert.equal(pageOf('/download'), 'download');
  });

  it('sends an address it does not know to the front page rather than a blank one', () => {
    assert.equal(pageOf('/no-such-page'), 'home');
    assert.equal(pageOf('/index.html'), 'home');
  });

  it('gives every page a title of its own', () => {
    const titles = Object.values(PAGES).map((p) => p.title);
    assert.equal(new Set(titles).size, titles.length);
  });
});
