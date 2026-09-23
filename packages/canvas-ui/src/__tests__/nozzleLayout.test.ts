/**
 * Nozzles decide where pipes attach. These pin the rules: every port gets an
 * anchor (never lost), links by portId win, older files pair by role, the
 * factory's placed-by-eye defaults are replaced, and editing nozzles keeps
 * ports and pipes consistent.
 */
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import type { NozzleDressing, ProcessNode } from '@process-forge/protocol';
import {
  addNozzle,
  drawingSize,
  effectiveNozzles,
  layoutNozzles,
  moveNozzle,
  nearestSide,
  removeNozzle,
  snapPercent,
  standardNozzles
} from '../nozzles/nozzleLayout.js';
import { createDefaultProcessNode } from '../utils/nodeFactory.js';

const KINDS = [
  'PUMP',
  'SURGE_TANK',
  'BATCH_REACTOR',
  'HEAT_EXCHANGER',
  'SEPARATOR',
  'ROTARY_FILLER',
  'CONVEYOR',
  'LABELER',
  'PALLETIZER',
  'DISTILLATION_COLUMN',
  'SPRAY_CHAMBER',
  'MIXER'
] as const;

const nz = (id: string, role: NozzleDressing['role'], x: number, y: number, extra: Partial<NozzleDressing> = {}): NozzleDressing => ({
  id,
  name: id,
  role,
  x,
  y,
  position: nearestSide(x, y),
  sizeInches: 2,
  ratingPsi: 150,
  ...extra
});

describe('Every port is anchored on the drawing', () => {
  for (const kind of KINDS) {
    it(`${kind}: a new node's ports all sit on nozzles`, () => {
      const node = createDefaultProcessNode(kind);
      const { anchors } = layoutNozzles(node);
      assert.equal(anchors.length, node.inputs.length + node.outputs.length);
      for (const a of anchors) {
        assert.ok(a.nozzle, `${kind} port ${a.port.id} fell back to the edge`);
        assert.equal(a.nozzle.portId, a.port.id);
        assert.equal(a.direction === 'in' ? 'inlet' : 'outlet', a.nozzle.role);
      }
    });
  }

  it('a port with no nozzle is spaced along its edge, not dropped', () => {
    const node = { ...createDefaultProcessNode('PUMP'), dressing: { nozzles: [], internals: {} as never, customSvgShell: '<g/>' } };
    const { anchors } = layoutNozzles(node as ProcessNode);
    assert.deepEqual(
      anchors.map((a) => [a.port.id, a.x, a.side]),
      [
        ['in-fluid', 0, 'left'],
        ['out-fluid', 100, 'right']
      ]
    );
  });
});

describe('Pairing nozzles with ports', () => {
  it('a portId link wins over order', () => {
    const base = createDefaultProcessNode('SEPARATOR');
    const node: ProcessNode = {
      ...base,
      dressing: {
        ...base.dressing!,
        nozzles: [
          nz('A', 'outlet', 50, 90, { portId: 'out-vapor' }),
          nz('B', 'outlet', 50, 10, { portId: 'out-liquid' }),
          nz('C', 'inlet', 10, 40)
        ]
      }
    };
    const byPort = Object.fromEntries(layoutNozzles(node).anchors.map((a) => [a.port.id, a.nozzle?.id]));
    assert.deepEqual(byPort, { 'in-mixed': 'C', 'out-vapor': 'A', 'out-liquid': 'B' });
  });

  it('an older file with roles but no portIds pairs in order', () => {
    const base = createDefaultProcessNode('PUMP');
    const node: ProcessNode = {
      ...base,
      dressing: { ...base.dressing!, nozzles: [nz('X', 'outlet', 90, 20), nz('Y', 'inlet', 5, 60), nz('Z', 'vent', 50, 0)] }
    };
    const { anchors, decorative } = layoutNozzles(node);
    assert.equal(anchors.find((a) => a.port.id === 'in-fluid')?.nozzle?.id, 'Y');
    assert.equal(anchors.find((a) => a.port.id === 'out-fluid')?.nozzle?.id, 'X');
    assert.deepEqual(decorative.map((z) => z.id), ['Z']);
  });

  it("replaces the factory's old placed-by-eye nozzles, and keeps edited ones", () => {
    const legacy = [
      nz('N1', 'inlet', 30, 15),
      nz('N2', 'vent', 60, 10),
      nz('N3', 'outlet', 50, 95)
    ];
    const tank = { kind: 'SURGE_TANK', dressing: { nozzles: legacy, internals: {} as never } };
    assert.deepEqual(effectiveNozzles(tank as never), standardNozzles('SURGE_TANK'));
    const edited = [{ ...legacy[0]!, x: 31 }, legacy[1]!, legacy[2]!];
    assert.deepEqual(effectiveNozzles({ ...tank, dressing: { ...tank.dressing, nozzles: edited } } as never), edited);
  });
});

describe('Editing nozzles', () => {
  it('an inlet takes a free port, or creates one so it can be piped', () => {
    const pump = createDefaultProcessNode('PUMP');
    const res = addNozzle(pump, 'inlet', 2, 80);
    assert.equal(res.inputs.length, 2);
    const added = res.inputs[1]!;
    assert.equal(res.nozzle.portId, added.id);
    assert.equal(added.type, 'FLUID_INPUT');
    assert.equal(res.nozzle.x, 0, 'snapped onto the left edge');
    assert.equal(res.nozzle.position, 'left');
    // Laid out, the new port sits on the new nozzle.
    const after = { ...pump, ...res };
    assert.equal(layoutNozzles(after).anchors.find((a) => a.port.id === added.id)?.nozzle?.id, res.nozzle.id);
  });

  it('a new outlet on a conveyor carries containers', () => {
    const res = addNozzle(createDefaultProcessNode('CONVEYOR'), 'outlet', 100, 30);
    assert.equal(res.outputs.at(-1)!.flowDimension, 'DISCRETE_CONTAINER');
    assert.equal(res.outputs.at(-1)!.type, 'DISCRETE_OUTPUT');
  });

  it('a vent adds no port', () => {
    const pump = createDefaultProcessNode('PUMP');
    const res = addNozzle(pump, 'vent', 50, 0);
    assert.equal(res.inputs.length + res.outputs.length, 2);
    assert.equal(res.nozzle.portId, undefined);
  });

  it('moving follows the nearest edge and snaps', () => {
    const pump = createDefaultProcessNode('PUMP');
    const moved = moveNozzle(pump, 'N2', 51.6, 98.2);
    const z = moved.dressing.nozzles.find((n) => n.id === 'N2')!;
    assert.deepEqual([z.x, z.y, z.position, z.portId], [52, 100, 'bottom', 'out-fluid']);
  });

  it('will not delete a nozzle whose port has a pipe, and takes the port with it otherwise', () => {
    const pump = createDefaultProcessNode('PUMP');
    const blocked = removeNozzle(pump, 'N1', new Set(['in-fluid']));
    assert.ok('blocked' in blocked);
    const res = removeNozzle(pump, 'N1', new Set());
    assert.ok(!('blocked' in res));
    assert.deepEqual(res.inputs, []);
    assert.deepEqual(res.dressing.nozzles.map((z) => z.id), ['N2']);
  });
});

describe('Geometry', () => {
  it('nearest side and snapping', () => {
    assert.equal(nearestSide(5, 50), 'left');
    assert.equal(nearestSide(50, 97), 'bottom');
    assert.deepEqual([snapPercent(2.4), snapPercent(98), snapPercent(50.4), snapPercent(-4)], [0, 100, 50, 0]);
  });

  it('the canvas box keeps the drawing proportions', () => {
    assert.deepEqual(drawingSize('PUMP'), { width: 104, height: 104 });
    assert.deepEqual(drawingSize('SURGE_TANK'), { width: 150, height: 131 });
    // Tall drawings are capped at 200 px high, keeping their proportions.
    assert.deepEqual(drawingSize('CUSTOM_UNIT_OP', { customSvgShell: '<g/>', viewBox: '0 0 100 200' } as never), {
      width: 100,
      height: 200
    });
  });
});
