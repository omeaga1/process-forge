import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { WAX_COOLING_BELT_CONTRACT } from '@process-forge/protocol';
import {
  listSavedUnitOps,
  listRemovedUnitOps,
  localUnitOpRecords,
  mergeUnitOpLibraries,
  saveUnitOp,
  removeSavedUnitOp,
  isUnitOpSaved,
  type SavedUnitOp,
  type UnitOpRecord
} from '../library/savedUnitOps.js';

const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear()
  },
  configurable: true
});

describe('My unit ops', () => {
  beforeEach(() => store.clear());

  it('keeps a saved design whole, newest first, and replaces a design with the same id', () => {
    saveUnitOp(WAX_COOLING_BELT_CONTRACT, 'designed');
    saveUnitOp({ ...WAX_COOLING_BELT_CONTRACT, id: 'other-belt', name: 'Other belt' }, 'mcp');
    saveUnitOp({ ...WAX_COOLING_BELT_CONTRACT, name: 'Renamed belt' }, 'studio');

    const items = listSavedUnitOps();
    assert.deepStrictEqual(items.map((i) => i.contract.name), ['Renamed belt', 'Other belt']);
    assert.strictEqual(items[0]!.source, 'studio');
    assert.deepStrictEqual(items[0]!.contract.parameters, WAX_COOLING_BELT_CONTRACT.parameters);
  });

  it('removes one design and reports what is saved', () => {
    saveUnitOp(WAX_COOLING_BELT_CONTRACT, 'designed');
    assert.ok(isUnitOpSaved(WAX_COOLING_BELT_CONTRACT.id));
    removeSavedUnitOp(WAX_COOLING_BELT_CONTRACT.id);
    assert.strictEqual(isUnitOpSaved(WAX_COOLING_BELT_CONTRACT.id), false);
  });

  it('drops saved entries the current schema cannot read, instead of failing', () => {
    store.set('pf_my_unit_ops', JSON.stringify([{ id: 'broken', contract: { id: 'broken' }, savedAt: '', source: 'mcp' }]));
    assert.deepStrictEqual(listSavedUnitOps(), []);
  });
});

describe('My unit ops: syncing with the account', () => {
  beforeEach(() => store.clear());
  const item = (id: string, at: string, name = id): SavedUnitOp => ({ id, savedAt: at, source: 'designed', contract: { ...WAX_COOLING_BELT_CONTRACT, id, name } });
  const saved = (id: string, at: string, name?: string): UnitOpRecord => ({ id, at, saved: item(id, at, name) });
  const removed = (id: string, at: string): UnitOpRecord => ({ id, at, removed: true });

  it('remembers a removal, and forgets it when the design is saved again', () => {
    saveUnitOp(WAX_COOLING_BELT_CONTRACT, 'designed');
    removeSavedUnitOp(WAX_COOLING_BELT_CONTRACT.id);
    assert.deepStrictEqual(listRemovedUnitOps().map((r) => r.id), [WAX_COOLING_BELT_CONTRACT.id]);
    assert.ok('removed' in localUnitOpRecords()[0]!);
    saveUnitOp(WAX_COOLING_BELT_CONTRACT, 'designed');
    assert.deepStrictEqual(listRemovedUnitOps(), []);
  });

  it('merges unit by unit: the newer save or removal wins, and what this device has newer is uploaded', () => {
    const local = [saved('a', '2026-01-02T00:00:00.000Z', 'A here'), saved('b', '2026-01-01T00:00:00.000Z'), removed('c', '2026-01-05T00:00:00.000Z'), saved('only-here', '2026-01-01T00:00:00.000Z')];
    const remote = [saved('a', '2026-01-01T00:00:00.000Z', 'A there'), removed('b', '2026-01-03T00:00:00.000Z'), saved('c', '2026-01-04T00:00:00.000Z'), saved('only-there', '2026-01-01T00:00:00.000Z')];
    const m = mergeUnitOpLibraries(local, remote);
    assert.deepStrictEqual(m.saved.map((s) => s.contract.name).sort(), ['A here', 'only-here', 'only-there']);
    assert.deepStrictEqual(m.removed.map((r) => r.id).sort(), ['b', 'c']);
    assert.deepStrictEqual(m.toUpload.map((r) => r.id).sort(), ['a', 'c', 'only-here']);
  });

  it('uploads nothing when both sides agree', () => {
    const both = [saved('a', '2026-01-01T00:00:00.000Z')];
    assert.deepStrictEqual(mergeUnitOpLibraries(both, both).toUpload, []);
  });
});
