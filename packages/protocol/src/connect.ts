import type { ProcessGraph } from './graph.js';
import type { ProcessNode } from './nodes.js';
import type { ProcessEdge } from './streams.js';
import { effectivePortKind, portsFit, type Carries } from './terminals.js';

/**
 * Pipes one unit into another: the same rules the canvas applies when an
 * engineer drags a pipe, for callers that are not dragging (an MCP client's
 * add_stream).
 *
 * A stream leaves an outlet and enters an inlet of a different unit, and
 * carries one kind of thing: liquid (a continuous port) or whole items (a
 * discrete one). Units can be named by id, by name, or by tag (P-101).
 *
 * Add the planned edge with addStreamToGraph (terminals.ts): a feed or outlet
 * arrow not yet piped takes on the kind of the unit it is piped to.
 */

export interface StreamRequest {
  /** The unit the stream leaves: its id, name, or tag. */
  from: string;
  /** The unit the stream enters. */
  to: string;
  /** Optional outlet on `from`: port id or name. By default the first free one that fits. */
  fromPort?: string;
  /** Optional inlet on `to`. */
  toPort?: string;
}

export type StreamPlan =
  | {
      ok: true;
      edge: ProcessEdge;
      from: { id: string; name: string; port: string };
      to: { id: string; name: string; port: string };
      carries: 'liquid' | 'items';
    }
  | { ok: false; error: string; hint?: string };

type Port = ProcessNode['outputs'][number];

const discrete = (p: Port) => String(p.flowDimension) === 'DISCRETE_CONTAINER';
const tagOf = (name: string) => name.match(/\b[A-Z]{1,3}-\d{2,4}\b/)?.[0];

/** A unit by id, exact name, tag (P-101) or unique partial name; otherwise a message saying why not. */
export function resolveUnit(graph: ProcessGraph, ref: string): ProcessNode | string {
  const byId = graph.nodes.find((n) => n.id === ref);
  if (byId) return byId;
  const want = ref.trim().toLowerCase();
  const byName = graph.nodes.filter((n) => n.name.toLowerCase() === want);
  if (byName.length === 1) return byName[0]!;
  const byTag = graph.nodes.filter((n) => tagOf(n.name)?.toLowerCase() === want);
  if (byTag.length === 1) return byTag[0]!;
  const partial = graph.nodes.filter((n) => n.name.toLowerCase().includes(want));
  if (byName.length + byTag.length === 0 && partial.length === 1) return partial[0]!;
  const matches = [...byName, ...byTag, ...partial];
  if (matches.length > 1) {
    return `"${ref}" matches more than one unit: ${[...new Set(matches.map((n) => `${n.name} (id ${n.id})`))].join('; ')}. Use its id.`;
  }
  return `No unit "${ref}" on the flowsheet. Units: ${graph.nodes.map((n) => `${n.name} (id ${n.id})`).join('; ') || 'none'}.`;
}

function pickPort(ports: Port[], ref: string | undefined): Port[] | string {
  if (!ref) return ports;
  const want = ref.trim().toLowerCase();
  const hit = ports.filter((p) => p.id === ref || p.name.toLowerCase() === want);
  if (hit.length) return hit;
  return `No port "${ref}". It has: ${ports.map((p) => `${p.name} (id ${p.id})`).join('; ') || 'none'}.`;
}

const describe = (ports: Port[]) =>
  ports.map((p) => `${p.name} (${discrete(p) ? 'items' : 'liquid'})`).join(', ') || 'none';

/** A default stream for a new pipe, of the kind its outlet carries. The engine reads only the ends. */
export function defaultStreamFor(port: Port | Carries): ProcessEdge['stream'] {
  const items = typeof port === 'string' ? port === 'items' : discrete(port);
  return items
    ? { type: 'DISCRETE_CONTAINER_STREAM', targetPiecesPerMinute: 40, containerVolumeGallons: 1, containerType: 'CAN_1_GAL' }
    : {
        type: 'CONTINUOUS_FLUID',
        designFlowRateGpm: 45,
        operatingPressurePsi: 30,
        pipeDiameterInches: 2,
        fluid: { name: 'Process Fluid', densityGPerCm3: 1, viscosityCentipoise: 1, temperatureCelsius: 20 }
      };
}

export function planStream(graph: ProcessGraph, req: StreamRequest, now: number = Date.now()): StreamPlan {
  const from = resolveUnit(graph, req.from);
  if (typeof from === 'string') return { ok: false, error: from };
  const to = resolveUnit(graph, req.to);
  if (typeof to === 'string') return { ok: false, error: to };
  if (from.id === to.id) return { ok: false, error: `A stream cannot leave and enter the same unit (${from.name}).` };

  const outs = pickPort(from.outputs, req.fromPort);
  if (typeof outs === 'string') return { ok: false, error: `${from.name}: ${outs}` };
  const ins = pickPort(to.inputs, req.toPort);
  if (typeof ins === 'string') return { ok: false, error: `${to.name}: ${ins}` };
  if (from.outputs.length === 0) return { ok: false, error: `${from.name} has no outlets.` };
  if (to.inputs.length === 0) return { ok: false, error: `${to.name} has no inlets.` };

  const used = new Set(graph.edges.flatMap((e) => [`out:${e.sourceNodeId}:${e.sourcePortId}`, `in:${e.targetNodeId}:${e.targetPortId}`]));
  const pairs: { out: Port; in: Port; free: number }[] = [];
  for (const o of outs) {
    for (const i of ins) {
      // Liquid to liquid, items to items; a terminal not yet piped takes either.
      if (!portsFit(graph, from, o, to, i)) continue;
      const free = (used.has(`out:${from.id}:${o.id}`) ? 0 : 1) + (used.has(`in:${to.id}:${i.id}`) ? 0 : 1);
      pairs.push({ out: o, in: i, free });
    }
  }
  if (pairs.length === 0) {
    return {
      ok: false,
      error: `Nothing fits: ${from.name}'s outlets are ${describe(outs)}, and ${to.name}'s inlets are ${describe(ins)}. A stream carries liquid or items, not both.`,
      hint: 'Put a unit between them that turns one into the other (a filler turns liquid into containers).'
    };
  }
  pairs.sort((a, b) => b.free - a.free);
  const best = pairs[0]!;
  const duplicate = graph.edges.some(
    (e) => e.sourceNodeId === from.id && e.sourcePortId === best.out.id && e.targetNodeId === to.id && e.targetPortId === best.in.id
  );
  if (duplicate) return { ok: false, error: `${from.name} ${best.out.name} is already piped to ${to.name} ${best.in.name}.` };

  const carries = effectivePortKind(graph, from, best.out, to, best.in);
  const edge: ProcessEdge = {
    id: `e-${from.id}-${to.id}-${now.toString(36)}`,
    sourceNodeId: from.id,
    sourcePortId: best.out.id,
    targetNodeId: to.id,
    targetPortId: best.in.id,
    stream: defaultStreamFor(carries)
  };
  return {
    ok: true,
    edge,
    from: { id: from.id, name: from.name, port: best.out.name },
    to: { id: to.id, name: to.name, port: best.in.name },
    carries
  };
}
