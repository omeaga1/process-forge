import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addStreamToGraph,
  contractToProcessNode,
  createStandardUnitOp,
  createTerminalNode,
  findStandardUnitOp,
  planStream,
  type ProcessGraph,
  type ProcessNode,
  type UnitOpContract
} from '@process-forge/protocol';
import { simulateLine } from '../line.js';

/**
 * A batch line built the way an MCP client builds one (standard units, a
 * designed reactor, add_stream's pipes), read back from simulate_process_line.
 */

const reactor: UnitOpContract = {
  contractVersion: 1,
  id: 'resin-reactor',
  name: 'Resin Reactor R-101',
  description: 'Charge, heat on the jacket, react, drain.',
  ports: [
    { id: 'charge', name: 'Charge', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true },
    { id: 'discharge', name: 'Discharge', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true }
  ],
  parameters: [
    { name: 'workingGallons', label: 'Working volume', unit: 'gal', value: 550, min: 1 },
    { name: 'jacketKw', label: 'Jacket', unit: 'kW', value: 150, min: 1 },
    { name: 'reactC', label: 'Reaction temperature', unit: 'degC', value: 80 },
    { name: 'reactMin', label: 'Hold', unit: 'min', value: 45, min: 1 }
  ],
  derived: [
    { name: 'heatSeconds', label: 'Heat-up', unit: 's', expr: 'batch.massKg * batch.cpKjPerKgK * max(0, reactC - batch.temperatureC) / jacketKw' },
    { name: 'reactSeconds', label: 'Hold', unit: 's', expr: 'reactMin * 60' }
  ],
  constraints: [],
  behavior: {
    mode: 'BATCH',
    batchGallons: 'workingGallons',
    phases: [
      { name: 'Charge', kind: 'FILL', rateGpm: '55' },
      { name: 'Heat up', kind: 'HOLD', seconds: 'heatSeconds', temperatureC: 'reactC', dutyKw: 'jacketKw' },
      { name: 'React', kind: 'HOLD', seconds: 'reactSeconds', temperatureC: 'reactC' },
      { name: 'Drain', kind: 'DRAIN', rateGpm: '50', port: 'discharge' }
    ]
  },
  designInlet: { temperatureC: 25, densityGPerCm3: 0.95, specificHeatKjPerKgK: 1.9 },
  provenance: { authoredBy: 'ENGINEER', engineerConfirmed: [] },
  drawing: {
    viewBox: { width: 100, height: 140 },
    shapes: [{ type: 'rect', x: 20, y: 20, width: 60, height: 100, layer: 'body' }],
    nozzles: [
      { portId: 'charge', x: 30, y: 14.3, side: 'top' },
      { portId: 'discharge', x: 50, y: 85.7, side: 'bottom' }
    ]
  }
} as unknown as UnitOpContract;

function resinLine(): ProcessGraph {
  const standard = (id: string, name: string, parameters: Record<string, number>): ProcessNode =>
    ({ ...createStandardUnitOp(findStandardUnitOp(id)!, { name, parameters }), id: name.split(' ').pop()! }) as ProcessNode;
  const nodes: ProcessNode[] = [
    createTerminalNode('feed', { id: 'F-100', name: 'Monomer Feed F-100', material: 'Monomer' }),
    { ...contractToProcessNode(reactor), id: 'R-101' } as ProcessNode,
    standard('surge-tank', 'Holding Tank T-102', { capacityGallons: 1500, initialLevelGallons: 0, maxDischargeRateGpm: 8 }),
    standard('pump', 'Transfer Pump P-103', { designFlowRateGpm: 8 }),
    createTerminalNode('product', { id: 'OUT', name: 'Resin', material: 'Resin' })
  ];
  let g = { id: 'resin', name: 'Custom Process Flow', version: '1.0.0', metadata: { facility: 'Custom Facility' }, nodes, edges: [] } as unknown as ProcessGraph;
  for (const [from, to] of [
    ['F-100', 'R-101'],
    ['R-101', 'T-102'],
    ['T-102', 'P-103'],
    ['P-103', 'OUT']
  ] as const) {
    const plan = planStream(g, { from, to });
    assert.ok(plan.ok, plan.ok ? '' : plan.error);
    g = addStreamToGraph(g, plan.edge);
  }
  return g;
}

describe('simulate_process_line on a batch line', () => {
  const r = simulateLine(resinLine(), 720, 1, 'Resin Batch Line');

  it('names the batch reactor as what limits the line, from the run', () => {
    assert.equal(r.identifiedBottleneckNodeId, 'R-101');
    assert.match(r.engineeringDiagnosis, /"Resin Reactor R-101" limits the line at about [\d.]+ gal\/min/);
  });

  it('feeds the reactor the liquid it was designed for, not water', () => {
    const feed = r.streams.find((s) => s.role === 'feed')!;
    assert.equal(feed.temperatureC, 25);
    assert.ok(Math.abs(feed.kg / feed.gallons - 3.785411784 * 0.95) < 1e-3, `${feed.kg} kg / ${feed.gallons} gal`);
  });

  it('heats each batch with exactly m·cp·ΔT', () => {
    const m = r.machineMetrics.find((x) => x.nodeId === 'R-101')!;
    const perBatch = (550 * 3.785411784 * 0.95 * 1.9 * 55) / 3600;
    assert.equal(m.designedUnit?.heatBalance, undefined);
    assert.ok(Math.abs(m.heat!.energyKwh - 8 * perBatch) < 0.5, `${m.heat!.energyKwh} vs 8 × ${perBatch}`);
  });

  it('is called by the flowsheet’s name, and does not count items on a liquid line', () => {
    assert.equal(r.facilityName, 'Resin Batch Line');
    assert.doesNotMatch(r.engineeringDiagnosis, /units finished/);
  });
});
