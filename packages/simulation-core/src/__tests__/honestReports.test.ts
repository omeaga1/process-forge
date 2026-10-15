import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { JUICE_CONCENTRATION_LINE, SPRAY_DRYING_LINE, applyFlowsheetEdit } from '@process-forge/protocol';
import { simulateProcess } from '../engine.js';

/**
 * What a run reports has to mean what it says. Two things a model would
 * otherwise quote with confidence and get wrong:
 *  - gallons of a gas (the vapour off an evaporator, a dryer's air), which
 *    are millions of "gallons" of nothing anyone measures in gallons;
 *  - mass fractions of a mix that includes liquid of no stated kind (cooling
 *    water with no composition), which used to add up to 3 %.
 */
describe('reports that mean what they say', () => {
  it('never counts a gas in gallons: a gas outlet is reported in kg, and a condenser in its liquid', () => {
    const r = simulateProcess(SPRAY_DRYING_LINE, 60);
    const stack = r.terminals.find((t) => t.nodeId === 'stack')!;
    assert.equal(stack.gallons, 0, 'the exhaust is all gas');
    assert.ok(stack.gasKg! > 1000 && Math.abs(stack.gasKg! - stack.kg) < 0.5, `gas kg ${stack.gasKg} of ${stack.kg}`);
    const air = r.terminals.find((t) => t.nodeId === 'feed-air')!;
    assert.equal(air.gallons, 0);
    // The powder is a solid: it has a volume, and it is far from a gas's.
    const powder = r.terminals.find((t) => t.nodeId === 'product-powder')!;
    assert.ok(powder.gallons > 0 && powder.gallons < 100, `powder ${powder.gallons} gal`);
    const dryer = r.nodeReports['spray-dryer-1']!.fluid!;
    assert.ok(dryer.receivedGallons < 100, `the dryer took in ${dryer.receivedGallons} gal of liquid, not the air's volume`);
    assert.ok(dryer.receivedGasKg! > 1000);

    const juice = simulateProcess(JUICE_CONCENTRATION_LINE, 60);
    const c = juice.nodeReports['juice-c-301']!.fluid!;
    const cw = juice.terminals.find((t) => t.nodeId === 'juice-f-300')!;
    // The condenser took in its cooling water and the vapour: gallons are the water's, plus nothing for the vapour.
    assert.ok(Math.abs(c.receivedGallons - cw.gallons) < 0.01 * cw.gallons, `${c.receivedGallons} vs cooling water ${cw.gallons}`);
    assert.ok(c.receivedGasKg! > 3000, 'and it says how much vapour it condensed');
    assert.equal(c.deliveredGasKg, undefined, 'it sends out only liquid');
  });

  it('reports mass fractions that add up to 1, naming liquid of no stated kind as unspecified', () => {
    const r = simulateProcess(JUICE_CONCENTRATION_LINE, 60);
    const out = r.nodeReports['juice-c-301']!.fluid!.averageOutletComposition!;
    const total = Object.values(out).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1) < 1e-3, JSON.stringify(out));
    assert.ok(out.unspecified! > 0.9, 'the cooling water has no stated composition');
    // A stream whose components are all stated is unchanged.
    const product = r.nodeReports['juice-p-401']!.fluid!.averageOutletComposition!;
    assert.equal(product.unspecified, undefined);
  });

  it('settles at the flow a full pump downstream allows, instead of flipping between two every other second', () => {
    // 24 gal/min of juice makes more concentrate than P-401's 7.6 gal/min:
    // the evaporator's accepted flow must be the one whose own split fits.
    // Choosing it from last second's split made the flow alternate 24 / 13.2
    // and the evaporator fail "too thick" and "too thin" in the same run.
    const g = applyFlowsheetEdit(JUICE_CONCENTRATION_LINE, { op: 'update-unit', unit: 'F-100', parameters: { supplyRate: 24 } });
    assert.ok(g.ok);
    const r = simulateProcess(g.graph, 30);
    const flows = r.telemetryLog.filter((s) => s.nodeId === 'juice-p-101' && s.timeSeconds > 60).map((s) => s.flowGpm!);
    const spread = Math.max(...flows) - Math.min(...flows);
    assert.ok(spread < 0.2, `feed pump flow should hold steady, spread ${spread} over ${flows.length} minutes`);
    assert.ok(flows[0]! > 21 && flows[0]! < 22.5, `held to what P-401 takes: ${flows[0]}`);
    const ev = r.nodeReports['juice-ev-201']!.designedUnit!;
    const broken = ev.brokenConstraints.map((c) => c.id);
    assert.ok(!(broken.includes('pumpable') && broken.includes('concentrates')), `contradictory checks: ${broken.join(', ')}`);
  });

  it('keeps the liquid output and the telemetry flow in liquid gallons', () => {
    const r = simulateProcess(JUICE_CONCENTRATION_LINE, 60);
    const product = r.terminals.find((t) => t.role === 'product')!;
    assert.ok(Math.abs(r.totalFluidDeliveredGallons - product.gallons) < 0.2);
    const evapNow = r.telemetryLog.filter((s) => s.nodeId === 'juice-ev-201').at(-1)!;
    // It sends concentrate (5.8 gal/min) and vapour; only the concentrate is gallons.
    assert.ok(evapNow.flowGpm! > 4 && evapNow.flowGpm! < 8, `evaporator out ${evapNow.flowGpm} gal/min`);
  });
});
