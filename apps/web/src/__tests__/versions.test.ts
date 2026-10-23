import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JUICE_CONCENTRATION_LINE, applyFlowsheetEdit, createSimulationProject, type ProcessGraph } from '@process-forge/protocol';
import { AUTO_VERSION_EVERY_MS, MAX_VERSIONS, deleteVersions, dueForAutoVersion, listVersions, loadVersion, recordVersion } from '../storage/versions.js';
import { deleteLocalProject, saveLocalProject } from '../storage/localStorageAdapter.js';

/** localStorage with an optional size limit, so "storage full" can be tested. */
class LimitedStorage {
  store = new Map<string, string>();
  limit = Infinity;
  getItem(k: string) {
    return this.store.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    const size = [...this.store].reduce((n, [key, val]) => n + (key === k ? 0 : val.length), 0) + v.length;
    if (size > this.limit) throw new Error('QuotaExceededError');
    this.store.set(k, String(v));
  }
  removeItem(k: string) {
    this.store.delete(k);
  }
  clear() {
    this.store.clear();
  }
  get length() {
    return this.store.size;
  }
  key(i: number) {
    return [...this.store.keys()][i] ?? null;
  }
}
const storage = new LimitedStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, writable: true, configurable: true });

const edited = (g: ProcessGraph, targetC: number) => {
  const r = applyFlowsheetEdit(g, { op: 'update-unit', unit: 'E-101', parameters: { targetC } });
  assert.ok(r.ok);
  return r.graph;
};

describe('project history: never overwrite', () => {
  beforeEach(() => {
    storage.clear();
    storage.limit = Infinity;
  });

  it('keeps versions newest first, and gives back the one that holds a flowsheet', () => {
    const a = recordVersion('p1', 'auto', 'Autosave', JUICE_CONCENTRATION_LINE, new Date('2026-10-23T10:00:00Z'));
    const b = recordVersion('p1', 'before-plan', 'Before a plan', edited(JUICE_CONCENTRATION_LINE, 70), new Date('2026-10-23T10:05:00Z'));
    assert.ok(a && b);
    assert.deepEqual(listVersions('p1').map((v) => v.id), [b.id, a.id]);
    assert.equal(loadVersion('p1', a.id)?.graph.nodes.length, JUICE_CONCENTRATION_LINE.nodes.length);
    assert.equal(listVersions('p1')[0]?.reason, 'before-plan');
  });

  it('does not keep the same flowsheet twice in a row: the newest version is the checkpoint', () => {
    const a = recordVersion('p1', 'auto', 'Autosave', JUICE_CONCENTRATION_LINE);
    const again = recordVersion('p1', 'before-plan', 'Before a plan', structuredClone(JUICE_CONCENTRATION_LINE));
    assert.equal(again?.id, a?.id);
    assert.equal(listVersions('p1').length, 1);
  });

  it(`keeps at most ${MAX_VERSIONS}, letting the oldest go`, () => {
    for (let i = 0; i < MAX_VERSIONS + 5; i++) recordVersion('p1', 'auto', `v${i}`, edited(JUICE_CONCENTRATION_LINE, 40 + i));
    const list = listVersions('p1');
    assert.equal(list.length, MAX_VERSIONS);
    assert.equal(list[0]?.label, `v${MAX_VERSIONS + 4}`);
    assert.equal(list.at(-1)?.label, 'v5');
  });

  it('makes room when storage is full by letting the oldest versions go, never the new one', () => {
    for (let i = 0; i < 6; i++) recordVersion('p1', 'auto', `v${i}`, edited(JUICE_CONCENTRATION_LINE, 40 + i));
    const one = JSON.stringify(listVersions('p1')[0]).length;
    storage.limit = one * 3.5;
    const kept = recordVersion('p1', 'before-plan', 'newest', edited(JUICE_CONCENTRATION_LINE, 99));
    assert.ok(kept);
    const list = listVersions('p1');
    assert.equal(list[0]?.label, 'newest');
    assert.ok(list.length <= 3 && list.length >= 1);
    storage.limit = 10;
    assert.equal(recordVersion('p1', 'auto', 'too big', edited(JUICE_CONCENTRATION_LINE, 12)), undefined, 'nothing fits: says so');
  });

  it('is due for an autosave version when there is none, or the newest is ten minutes old', () => {
    assert.equal(dueForAutoVersion('p1'), true);
    recordVersion('p1', 'auto', 'Autosave', JUICE_CONCENTRATION_LINE, new Date(1_000_000));
    assert.equal(dueForAutoVersion('p1', 1_000_000 + AUTO_VERSION_EVERY_MS - 1), false);
    assert.equal(dueForAutoVersion('p1', 1_000_000 + AUTO_VERSION_EVERY_MS), true);
  });

  it('goes when the project is deleted from this device', () => {
    const project = createSimulationProject('Juice', JUICE_CONCENTRATION_LINE, {});
    saveLocalProject(project);
    recordVersion(project.id, 'auto', 'Autosave', project.graph);
    deleteLocalProject(project.id);
    assert.deepEqual(listVersions(project.id), []);
    deleteVersions('nothing-here');
  });

  it('reads an unreadable history as empty rather than failing', () => {
    storage.setItem('pf_versions_p1', '{not json');
    assert.deepEqual(listVersions('p1'), []);
  });
});
