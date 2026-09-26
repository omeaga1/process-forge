import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  EQUIPMENT_CATEGORIES,
  STANDARD_EQUIPMENT_CATALOG,
  createStandardUnitOp,
  executeValidateUnitOp,
  findStandardUnitOp,
  type UnitOpContract
} from '../index.js';

describe('Standard equipment catalog', () => {
  it('every entry has a unique id, a known category, and says how it is simulated', () => {
    assert.equal(new Set(STANDARD_EQUIPMENT_CATALOG.map((i) => i.id)).size, STANDARD_EQUIPMENT_CATALOG.length);
    const ids = new Set(EQUIPMENT_CATEGORIES.map((c) => c.id));
    for (const item of STANDARD_EQUIPMENT_CATALOG) {
      assert.ok(ids.has(item.category), `${item.id}: category ${item.category}`);
      assert.ok(item.model.length > 20, `${item.id}: model`);
      assert.ok(item.short.length <= 16, `${item.id}: short name "${item.short}"`);
    }
  });

  it('every category has equipment, and entries are grouped in category order', () => {
    for (const c of EQUIPMENT_CATEGORIES) assert.ok(STANDARD_EQUIPMENT_CATALOG.some((i) => i.category === c.id), c.id);
    const order = STANDARD_EQUIPMENT_CATALOG.map((i) => EQUIPMENT_CATEGORIES.findIndex((c) => c.id === i.category));
    assert.deepEqual(order, [...order].sort((a, b) => a - b), 'the palette shows a heading where each category starts');
  });

  it('every designed standard unit passes all of the engine checks, without warnings', () => {
    const designed = STANDARD_EQUIPMENT_CATALOG.filter((i) => i.contract);
    assert.ok(designed.length >= 10);
    for (const item of designed) {
      const v = executeValidateUnitOp({ contract: item.contract });
      const problems = [...Object.values(v.gates).flatMap((g) => g.errors), ...v.gates.physical.warnings, ...v.gates.drawing.warnings];
      assert.equal(v.verdict, 'ACCEPTED', `${item.id}: ${problems.join('; ')}`);
      assert.deepEqual(problems, [], item.id);
      assert.equal(item.kind, 'CUSTOM_UNIT_OP');
    }
  });

  it('a designed standard unit is placed with its contract, and takes parameters only inside their range', () => {
    const cstr = findStandardUnitOp('cstr')!;
    const node = createStandardUnitOp(cstr, { name: 'R-201', parameters: { volumeGallons: 2500, rateConstantPerMin: -1, notAParameter: 3 } });
    const contract = (node.config as { contract: UnitOpContract }).contract;
    assert.equal(node.name, 'R-201');
    assert.equal(node.kind, 'CUSTOM_UNIT_OP');
    assert.equal(contract.parameters.find((p) => p.name === 'volumeGallons')!.value, 2500);
    assert.equal((node.config as Record<string, unknown>).volumeGallons, 2500, 'mirrored for the inspector');
    assert.equal(contract.parameters.find((p) => p.name === 'rateConstantPerMin')!.value, 0.5, 'out of range: left at the default');
    assert.equal((node.config as Record<string, unknown>).notAParameter, undefined);
    assert.deepEqual(
      node.inputs.map((p) => p.id),
      ['in']
    );
    // The catalog's own contract is not changed by placing a tuned copy.
    assert.equal(cstr.contract!.parameters.find((p) => p.name === 'volumeGallons')!.value, 1000);
  });

  it('finds units by id, short name, title or words', () => {
    assert.equal(findStandardUnitOp('distillation-column')?.id, 'distillation-column');
    assert.equal(findStandardUnitOp('Column')?.id, 'distillation-column');
    assert.equal(findStandardUnitOp('plug-flow reactor')?.id, 'pfr');
    assert.equal(findStandardUnitOp('BATCH_REACTOR')?.id, 'batch-reactor');
    assert.equal(findStandardUnitOp('decanter')?.id, 'centrifuge');
    assert.equal(findStandardUnitOp('CUSTOM_UNIT_OP'), null, 'the designed kind is not a unit name');
  });
});
