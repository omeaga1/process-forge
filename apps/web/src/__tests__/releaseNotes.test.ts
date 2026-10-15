import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { claudeToolsVerdict, notesToShow, parseNote, type ReleaseNote } from '../releaseNotes/model.js';

const note = (version: string): ReleaseNote => ({ version, title: `v${version}`, body: '- something' });
const NOTES = ['0.1.88', '0.1.89', '0.1.90', '0.1.91'].map(note);

describe("what's new after an update", () => {
  it('shows every version since the one last seen, newest first, up to the one running', () => {
    assert.deepEqual(notesToShow(NOTES, '0.1.90', '0.1.88').map((n) => n.version), ['0.1.90', '0.1.89']);
  });

  it('shows nothing when nothing is new', () => {
    assert.deepEqual(notesToShow(NOTES, '0.1.90', '0.1.90'), []);
  });

  it('shows the last few on a first run, not the whole history', () => {
    assert.deepEqual(notesToShow(NOTES, '0.1.91', null).map((n) => n.version), ['0.1.91', '0.1.90', '0.1.89']);
  });

  it("reads a note's title from its heading", () => {
    const n = parseNote('0.1.90', '# What changed\n\n- **this** and `that`\n');
    assert.equal(n.title, 'What changed');
    assert.equal(n.body, '- **this** and `that`');
  });

  it('has notes for the desktop version being built, with a title and a change', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    // dist/__tests__ -> apps/web
    const web = path.resolve(here, '..', '..');
    const conf = JSON.parse(fs.readFileSync(path.resolve(web, '..', 'desktop', 'src-tauri', 'tauri.conf.json'), 'utf8')) as { version: string };
    const text = fs.readFileSync(path.join(web, 'src', 'releaseNotes', `${conf.version}.md`), 'utf8');
    assert.match(text, /^# \S/);
    assert.match(text, /^- \S/m);
  });
});

describe("Claude's tools", () => {
  it('asks for a restart when Claude runs an older server than the one it has ready', () => {
    const v = claudeToolsVerdict({ running: { version: '0.18.0' }, downloaded: { version: '0.21.0' }, extension: '0.17.0', log: [] });
    assert.deepEqual(v, { kind: 'restart', running: '0.18.0', ready: '0.21.0' });
  });

  it('is current when the running server is the newest it has', () => {
    assert.deepEqual(claudeToolsVerdict({ running: { version: '0.22.0' }, downloaded: { version: '0.22.0' }, extension: '0.17.0', log: [] }), { kind: 'current', version: '0.22.0' });
  });

  it('counts a reinstalled extension newer than the download', () => {
    assert.deepEqual(claudeToolsVerdict({ running: { version: '0.21.0' }, downloaded: { version: '0.21.0' }, extension: '0.22.0', log: [] }), {
      kind: 'restart',
      running: '0.21.0',
      ready: '0.22.0'
    });
  });

  it('says nothing without the extension', () => {
    assert.deepEqual(claudeToolsVerdict({ running: null, downloaded: null, extension: null, log: [] }), { kind: 'none' });
  });
});
