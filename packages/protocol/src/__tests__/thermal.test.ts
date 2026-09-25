import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { createDefaultProcessNode, reactorHeatUpSeconds, validateProcessGraph, type ProcessEdge, type ProcessGraph } from '../index.js';

const reactor = (config: Record<string, unknown>) =>
  createDefaultProcessNode('BATCH_REACTOR', {
    configOverrides: {
      batchVolumeGallons: 100,
      fillDurationMinutes: 1,
      reactionDurationMinutes: 2,
      dischargeRateGpm: 50,
      fluid: { name: 'Water', densityGPerCm3: 1, viscosityCentipoise: 1, temperatureCelsius: 70, specificHeatKjPerKgK: 4.186 },
      ...config
    }
  });

describe('Thermal: reactor heat-up', () => {
  it('is mass x cp x dT over the jacket duty', () => {
    const seconds = reactorHeatUpSeconds(reactor({ jacketDutyKw: 50 }));
    assert.ok(Math.abs(seconds - (100 * 3.785411784 * 4.186 * 50) / 50) < 1e-6);
  });

  it('takes no time without a jacket duty', () => {
    assert.equal(reactorHeatUpSeconds(reactor({})), 0);
  });

  it('counts in the static bottleneck analysis', () => {
    const rate = (jacketDutyKw?: number) => {
      const r = reactor(jacketDutyKw ? { jacketDutyKw } : {});
      r.id = 'r';
      const f = createDefaultProcessNode('ROTARY_FILLER');
      f.id = 'f';
      const pipe = {
        id: 'p',
        sourceNodeId: 'r',
        sourcePortId: r.outputs[0]!.id,
        targetNodeId: 'f',
        targetPortId: f.inputs[0]!.id,
        stream: { type: 'CONTINUOUS_FLUID', designFlowRateGpm: 50, operatingPressurePsi: 30, pipeDiameterInches: 2, fluid: { name: 'Water', densityGPerCm3: 1, viscosityCentipoise: 1, temperatureCelsius: 20 } }
      } as ProcessEdge;
      const g: ProcessGraph = { id: 'g', name: 'g', version: '1.0.0', metadata: {}, nodes: [r, f], edges: [pipe] };
      return validateProcessGraph(g).bottlenecks.maximumSystemThroughputUnitsPerMin;
    };
    // 1 + 2 + 2 = 5 min a batch; with the jacket, plus 26.4 min of heat-up.
    const heatMin = (100 * 3.785411784 * 4.186 * 50) / 50 / 60;
    const ratio = rate(50) / rate();
    assert.ok(Math.abs(ratio - 5 / (5 + heatMin)) < 1e-6, `ratio ${ratio}`);
  });
});
