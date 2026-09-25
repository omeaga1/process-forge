/**
 * Where a unit op's connections sit on its drawing.
 *
 * A nozzle is a point on the equipment drawing, in percent of the drawing's
 * own box (its SVG viewBox), plus the side it faces. Pipes attach at nozzles:
 * each inlet/outlet nozzle is one of the node's ports (NodePort), linked by
 * `portId`. The canvas and the nozzle editor both lay the drawing out in a box
 * of exactly the viewBox's proportions, so a nozzle at (x%, y%) lands on the
 * same spot of the drawing in both.
 *
 * Everything here is pure, so it is tested directly.
 */
import type { NodeKind, NodePort, NozzleDressing, ProcessNode, UnitOpDressing } from '../nodes.js';

export type Side = NozzleDressing['position'];
export type NozzleRole = NozzleDressing['role'];

/** The viewBox of each built-in drawing in EquipmentAnimations.tsx. */
const KIND_VIEWBOX: Record<string, [number, number]> = {
  BATCH_REACTOR: [160, 160],
  MIXER: [160, 160],
  SURGE_TANK: [160, 140],
  SEPARATOR: [160, 140],
  DISTILLATION_COLUMN: [160, 150],
  SPRAY_CHAMBER: [160, 180],
  HEAT_EXCHANGER: [160, 120],
  PUMP: [120, 120],
  ROTARY_FILLER: [160, 140],
  CONVEYOR: [160, 120],
  LABELER: [160, 130],
  PALLETIZER: [160, 140]
};
/** Kinds without a drawing of their own render the tank. */
const FALLBACK_VIEWBOX: [number, number] = [160, 140];

/** Width of the drawing on the canvas, in px. Pumps are small, columns tall. */
const KIND_WIDTH: Record<string, number> = {
  PUMP: 104,
  DISTILLATION_COLUMN: 150,
  CONVEYOR: 170
};
const DEFAULT_WIDTH = 150;

export function drawingViewBox(kind: NodeKind | string, dressing?: UnitOpDressing): [number, number] {
  if (dressing?.customSvgShell) {
    const parts = (dressing.viewBox ?? '0 0 100 100').trim().split(/[\s,]+/).map(Number);
    const w = parts[2];
    const h = parts[3];
    if (w && h && w > 0 && h > 0) return [w, h];
    return [100, 100];
  }
  return KIND_VIEWBOX[kind] ?? FALLBACK_VIEWBOX;
}

/** Pixel size of the drawing box on the canvas, keeping the viewBox's proportions. */
export function drawingSize(kind: NodeKind | string, dressing?: UnitOpDressing): { width: number; height: number } {
  const [vw, vh] = drawingViewBox(kind, dressing);
  const width = dressing?.defaultSize?.width && dressing.customSvgShell ? Math.min(220, Math.max(90, dressing.defaultSize.width)) : KIND_WIDTH[kind] ?? DEFAULT_WIDTH;
  const height = Math.round((width * vh) / vw);
  // A very tall drawing (a column, a custom tower) is kept to a sensible height.
  if (height > MAX_HEIGHT) return { width: Math.round((MAX_HEIGHT * vw) / vh), height: MAX_HEIGHT };
  return { width, height };
}
const MAX_HEIGHT = 200;

const n = (
  id: string,
  name: string,
  role: NozzleRole,
  x: number,
  y: number,
  position: Side,
  portId?: string
): NozzleDressing => ({ id, name, role, x, y, position, sizeInches: 3, ratingPsi: 150, ...(portId ? { portId } : {}) });

/**
 * Nozzles that sit on the built-in drawings, linked to the ports the node
 * factory gives each kind. Coordinates are measured from the SVG shapes, e.g.
 * the pump casing is a circle at (55, 65) r 36 in a 120 x 120 viewBox, so its
 * suction is at x = 19/120 = 15.8 %.
 */
export function standardNozzles(kind: NodeKind | string): NozzleDressing[] {
  switch (kind) {
    case 'PUMP':
      return [n('N1', 'Suction', 'inlet', 15.8, 54.2, 'left', 'in-fluid'), n('N2', 'Discharge', 'outlet', 79.2, 30.8, 'right', 'out-fluid')];
    case 'SURGE_TANK':
      return [
        n('N1', 'Inlet', 'inlet', 21.9, 28.6, 'left', 'in-fluid'),
        n('N2', 'Outlet', 'outlet', 78.1, 75, 'right', 'out-fluid'),
        n('N3', 'Vent', 'vent', 50, 14.3, 'top'),
        n('N4', 'Drain', 'drain', 50, 82.1, 'bottom')
      ];
    case 'BATCH_REACTOR':
    case 'MIXER':
      return [
        n('N1', 'Feed', 'inlet', 18.8, 31.3, 'left', 'in-fluid'),
        n('N2', 'Bottom outlet', 'outlet', 50, 81.3, 'bottom', 'out-fluid'),
        n('N3', 'Vent', 'vent', 75, 15.6, 'top')
      ];
    case 'HEAT_EXCHANGER':
      return [
        n('N1', 'Process in', 'inlet', 15.6, 50, 'left', 'in-process'),
        n('N2', 'Process out', 'outlet', 84.4, 50, 'right', 'out-process'),
        n('N3', 'Utility in', 'utility', 35, 20.8, 'top'),
        n('N4', 'Utility out', 'utility', 65, 79.2, 'bottom')
      ];
    case 'SEPARATOR':
      return [
        n('N1', 'Feed', 'inlet', 21.9, 35.7, 'left', 'in-mixed'),
        n('N2', 'Vapour', 'outlet', 50, 12.9, 'top', 'out-vapor'),
        n('N3', 'Liquid', 'outlet', 50, 82.9, 'bottom', 'out-liquid')
      ];
    case 'DISTILLATION_COLUMN':
      return [
        n('N1', 'Feed', 'inlet', 34.4, 46.7, 'left', 'in-fluid'),
        n('N2', 'Bottoms', 'outlet', 50, 88, 'bottom', 'out-fluid'),
        n('N3', 'Overhead', 'vent', 50, 5.3, 'top')
      ];
    case 'SPRAY_CHAMBER':
      return [n('N1', 'Gas in', 'inlet', 15.6, 38.9, 'left', 'in-fluid'), n('N2', 'Outlet', 'outlet', 50, 87.8, 'bottom', 'out-fluid')];
    case 'ROTARY_FILLER':
      return [n('N1', 'Product feed', 'inlet', 15.6, 25, 'left', 'in-fluid'), n('N2', 'Filled cans', 'outlet', 84.4, 71.4, 'right', 'out-cans')];
    case 'CONVEYOR':
      return [n('N1', 'Infeed', 'inlet', 9.4, 55, 'left', 'in-containers'), n('N2', 'Discharge', 'outlet', 90.6, 55, 'right', 'out-containers')];
    case 'LABELER':
      return [n('N1', 'Infeed', 'inlet', 15.6, 63, 'left', 'in-containers'), n('N2', 'Discharge', 'outlet', 84.4, 63, 'right', 'out-containers')];
    case 'PALLETIZER':
      return [n('N1', 'Infeed', 'inlet', 12.5, 74.3, 'left', 'in-containers'), n('N2', 'Loaded skids', 'outlet', 87.5, 82.9, 'right', 'out-pallets')];
    case 'TERMINAL':
      // Drawn as an arrow with its connection at the tip or tail, not nozzles.
      return [];
    default:
      // The tank drawing: inlet upper left, outlet lower right.
      return [n('N1', 'Inlet', 'inlet', 21.9, 28.6, 'left', 'in-fluid'), n('N2', 'Outlet', 'outlet', 78.1, 75, 'right', 'out-fluid')];
  }
}

/**
 * Nozzle sets the node factory used to write before nozzles meant anything.
 * They were placed by eye, not on the drawings (the tank's drain sat below
 * the tank), so a node still carrying exactly one of them is shown with the
 * measured set instead. Anything the user has edited is left alone.
 */
const LEGACY_FACTORY_SIGNATURES = new Set([
  'N1:15:55|N2:85:30',
  'N1:30:15|N2:60:10|N3:50:95',
  'N1:25:15|N2:75:15|N3:50:95',
  'N1:20:25|N2:80:85',
  'N1:20:50|N2:50:15|N3:50:95',
  // The nozzle editor's own placeholder for a node with none.
  'N1:15:20|N2:50:95'
]);
function signature(nozzles: NozzleDressing[]): string {
  return nozzles.map((z) => `${z.id}:${z.x}:${z.y}`).join('|');
}

/** The nozzles a node is drawn with: the user's, or the measured standard set. */
export function effectiveNozzles(node: Pick<ProcessNode, 'kind' | 'dressing'>): NozzleDressing[] {
  const own = node.dressing?.nozzles;
  if (!own || own.length === 0) return node.dressing?.customSvgShell ? own ?? [] : standardNozzles(node.kind);
  if (!node.dressing?.customSvgShell && LEGACY_FACTORY_SIGNATURES.has(signature(own))) return standardNozzles(node.kind);
  return own;
}

export interface PortAnchor {
  port: NodePort;
  direction: 'in' | 'out';
  /** Percent of the drawing box. */
  x: number;
  y: number;
  side: Side;
  /** The nozzle it sits on; absent when it fell back to the drawing's edge. */
  nozzle?: NozzleDressing;
}

export interface NozzleLayout {
  anchors: PortAnchor[];
  /** Vents, drains, utilities: drawn, but not pipe connections in the model. */
  decorative: NozzleDressing[];
}

/**
 * Pairs every port with a nozzle:
 *   1. a nozzle whose portId names the port;
 *   2. otherwise, in order, an unlinked nozzle of the matching role (inlet for
 *      inputs, outlet for outputs) -- this is how older files and drawings
 *      from the CAD templates, which carry roles but no portId, line up;
 *   3. otherwise the port is spaced along the drawing's left (inputs) or
 *      right (outputs) edge, as before, so no connection is ever lost.
 */
export function layoutNozzles(node: Pick<ProcessNode, 'kind' | 'dressing' | 'inputs' | 'outputs'>): NozzleLayout {
  const nozzles = effectiveNozzles(node);
  const portIds = new Set([...node.inputs, ...node.outputs].map((p) => p.id));
  const used = new Set<string>();
  const anchors: PortAnchor[] = [];

  const place = (ports: NodePort[], direction: 'in' | 'out') => {
    const role: NozzleRole = direction === 'in' ? 'inlet' : 'outlet';
    const unplaced: NodePort[] = [];
    for (const port of ports) {
      const linked = nozzles.find((z) => z.portId === port.id && !used.has(z.id));
      if (linked) {
        used.add(linked.id);
        anchors.push({ port, direction, x: linked.x, y: linked.y, side: linked.position, nozzle: linked });
      } else unplaced.push(port);
    }
    const fallback: NodePort[] = [];
    for (const port of unplaced) {
      const free = nozzles.find(
        (z) => z.role === role && !used.has(z.id) && (!z.portId || !portIds.has(z.portId))
      );
      if (free) {
        used.add(free.id);
        anchors.push({ port, direction, x: free.x, y: free.y, side: free.position, nozzle: free });
      } else fallback.push(port);
    }
    fallback.forEach((port, i) => {
      anchors.push({
        port,
        direction,
        x: direction === 'in' ? 0 : 100,
        y: ((i + 1) / (fallback.length + 1)) * 100,
        side: direction === 'in' ? 'left' : 'right'
      });
    });
  };
  place(node.inputs, 'in');
  place(node.outputs, 'out');

  const decorative = nozzles.filter((z) => !used.has(z.id) && z.role !== 'inlet' && z.role !== 'outlet');
  return { anchors, decorative };
}

/** The side a point faces: its nearest edge of the box. */
export function nearestSide(x: number, y: number): Side {
  const d: [Side, number][] = [
    ['left', x],
    ['right', 100 - x],
    ['top', y],
    ['bottom', 100 - y]
  ];
  d.sort((a, b) => a[1] - b[1]);
  return d[0]![0];
}

/** Whole percent, clamped to the box, and snapped onto an edge within 3 %. */
export function snapPercent(v: number): number {
  const r = Math.round(Math.min(100, Math.max(0, v)));
  if (r <= 3) return 0;
  if (r >= 97) return 100;
  return r;
}

/** Lowest free N-number. */
export function nextNozzleId(nozzles: NozzleDressing[]): string {
  const taken = new Set(nozzles.map((z) => z.id));
  let i = 1;
  while (taken.has(`N${i}`)) i++;
  return `N${i}`;
}

export interface NodeShape {
  dressing: UnitOpDressing;
  inputs: NodePort[];
  outputs: NodePort[];
}

/** The node's current nozzles written out explicitly, each connection nozzle carrying its portId. */
export function materializeNozzles(node: ProcessNode): NozzleDressing[] {
  const { anchors, decorative } = layoutNozzles(node);
  const linked = anchors
    .filter((a): a is PortAnchor & { nozzle: NozzleDressing } => Boolean(a.nozzle))
    .map((a) => ({ ...a.nozzle, portId: a.port.id }));
  // Keep the user's order.
  const all = [...linked, ...decorative];
  return effectiveNozzles(node)
    .map((z) => all.find((a) => a.id === z.id))
    .filter((z): z is NozzleDressing => Boolean(z))
    .concat(all.filter((a) => !effectiveNozzles(node).some((z) => z.id === a.id)));
}

function baseDressing(node: ProcessNode): UnitOpDressing {
  return {
    nozzles: [],
    internals: {
      agitatorType: 'none',
      hasJacket: false,
      jacketType: 'none',
      baffleCount: 0,
      packingType: 'none',
      hasDemister: false,
      hasSprayHeader: false
    },
    ...node.dressing
  } as UnitOpDressing;
}

/** The flow dimension new ports of this node should have. */
function portDimension(node: ProcessNode, direction: 'in' | 'out'): NodePort['flowDimension'] {
  const same = direction === 'in' ? node.inputs : node.outputs;
  const any = same[0] ?? node.inputs[0] ?? node.outputs[0];
  return any?.flowDimension ?? 'CONTINUOUS_VOLUME';
}

/**
 * Adds a nozzle at (x, y). An inlet/outlet takes a free port of its direction
 * if there is one, or gets a new port, so it can always be connected.
 */
export function addNozzle(node: ProcessNode, role: NozzleRole, x: number, y: number): NodeShape & { nozzle: NozzleDressing } {
  const nozzles = materializeNozzles(node);
  const id = nextNozzleId(nozzles);
  const nozzle: NozzleDressing = {
    id,
    name: role === 'inlet' ? `Inlet ${id}` : role === 'outlet' ? `Outlet ${id}` : `${role[0]!.toUpperCase()}${role.slice(1)} ${id}`,
    role,
    x: snapPercent(x),
    y: snapPercent(y),
    position: nearestSide(x, y),
    sizeInches: 2,
    ratingPsi: 150
  };
  const inputs = [...node.inputs];
  const outputs = [...node.outputs];
  if (role === 'inlet' || role === 'outlet') {
    const direction = role === 'inlet' ? 'in' : 'out';
    const ports = direction === 'in' ? inputs : outputs;
    const linkedIds = new Set(nozzles.map((z) => z.portId).filter(Boolean));
    const free = ports.find((p) => !linkedIds.has(p.id));
    if (free) nozzle.portId = free.id;
    else {
      const dim = portDimension(node, direction);
      const discrete = dim === 'DISCRETE_CONTAINER';
      const taken = new Set([...inputs, ...outputs].map((p) => p.id));
      let k = ports.length + 1;
      let portId = `${direction}-${id.toLowerCase()}`;
      while (taken.has(portId)) portId = `${direction}-${id.toLowerCase()}-${k++}`;
      ports.push({
        id: portId,
        name: nozzle.name,
        type: direction === 'in' ? (discrete ? 'DISCRETE_INPUT' : 'FLUID_INPUT') : discrete ? 'DISCRETE_OUTPUT' : 'FLUID_OUTPUT',
        flowDimension: dim
      });
      nozzle.portId = portId;
    }
  }
  return { dressing: { ...baseDressing(node), nozzles: [...nozzles, nozzle] }, inputs, outputs, nozzle };
}

/** Moves a nozzle; the side follows the nearest edge unless `side` is given. */
export function moveNozzle(node: ProcessNode, nozzleId: string, x: number, y: number, side?: Side): NodeShape {
  const nozzles = materializeNozzles(node).map((z) =>
    z.id === nozzleId ? { ...z, x: snapPercent(x), y: snapPercent(y), position: side ?? nearestSide(x, y) } : z
  );
  return { dressing: { ...baseDressing(node), nozzles }, inputs: node.inputs, outputs: node.outputs };
}

export function updateNozzle(node: ProcessNode, nozzleId: string, updates: Partial<NozzleDressing>): NodeShape {
  const nozzles = materializeNozzles(node).map((z) => (z.id === nozzleId ? { ...z, ...updates } : z));
  return { dressing: { ...baseDressing(node), nozzles }, inputs: node.inputs, outputs: node.outputs };
}

/**
 * Removes a nozzle. A connection nozzle takes its port with it, unless a pipe
 * uses that port: then nothing changes and the reason is returned, because
 * deleting a connected port would leave the pipe pointing at nothing.
 */
export function removeNozzle(
  node: ProcessNode,
  nozzleId: string,
  connectedPortIds: ReadonlySet<string>
): NodeShape | { blocked: string } {
  const nozzles = materializeNozzles(node);
  const target = nozzles.find((z) => z.id === nozzleId);
  if (!target) return { dressing: { ...baseDressing(node), nozzles }, inputs: node.inputs, outputs: node.outputs };
  if (target.portId && connectedPortIds.has(target.portId)) {
    return { blocked: `${target.name} has a pipe connected. Delete the pipe first.` };
  }
  const drop = (ports: NodePort[]) => (target.portId ? ports.filter((p) => p.id !== target.portId) : ports);
  return {
    dressing: { ...baseDressing(node), nozzles: nozzles.filter((z) => z.id !== nozzleId) },
    inputs: drop(node.inputs),
    outputs: drop(node.outputs)
  };
}
