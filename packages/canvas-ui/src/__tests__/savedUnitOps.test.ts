import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { WAX_COOLING_BELT_CONTRACT } from '@process-forge/protocol';
import { listSavedUnitOps, saveUnitOp, removeSavedUnitOp, isUnitOpSaved } from '../library/savedUnitOps.js';

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
