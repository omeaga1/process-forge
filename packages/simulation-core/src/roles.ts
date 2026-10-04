import type { ProcessEdge, ProcessGraph, ProcessNode, UnitOpEvaluation } from '@process-forge/protocol';

/** A pipe carries liquid when the port it leaves from is continuous. */
export function isFluidEdge(edge: ProcessEdge, graph: ProcessGraph): boolean {
  const source = graph.nodes.find((n) => n.id === edge.sourceNodeId);
  const port = source?.outputs.find((p) => p.id === edge.sourcePortId);
  if (port) return String(port.flowDimension).startsWith('CONTINUOUS');
  return (edge.stream as { type?: string } | undefined)?.type === 'CONTINUOUS_FLUID';
}

/**
 * How the engine treats a unit, from its contract and its pipes. One place,
 * so the run (engine.ts, material.ts) and the description of the run
 * (describe.ts) cannot disagree.
 *
 *   storage  a STORAGE contract
 *   batch    a BATCH contract (piped or not: it runs its phases either way)
 *   pass     a CONTINUOUS_RATE contract with a liquid pipe
 *   cycle    a DISCRETE_CYCLE contract
 *   inert    a CONTINUOUS_RATE contract with no liquid pipe: nothing reaches it
 */
export type EngineRole = 'storage' | 'batch' | 'pass' | 'cycle' | 'inert';

export function engineRole(node: ProcessNode, ev: UnitOpEvaluation | undefined, graph: ProcessGraph): EngineRole {
  const b = ev?.behavior;
  if (b?.mode === 'STORAGE') return 'storage';
  if (b?.mode === 'BATCH') return 'batch';
  if (b?.mode === 'DISCRETE_CYCLE') return 'cycle';
  const piped = graph.edges.some((e) => (e.sourceNodeId === node.id || e.targetNodeId === node.id) && isFluidEdge(e, graph));
  return piped ? 'pass' : 'inert';
}

/** Item pipes into a node. */
export function itemPipesIn(nodeId: string, graph: ProcessGraph): number {
  return graph.edges.filter((e) => e.targetNodeId === nodeId && !isFluidEdge(e, graph)).length;
}

/** Liquid pipes into a node. */
export function liquidPipesIn(nodeId: string, graph: ProcessGraph): number {
  return graph.edges.filter((e) => e.targetNodeId === nodeId && isFluidEdge(e, graph)).length;
}

/**
 * A cycle unit with no item pipe coming in is a source and starts each cycle
 * on its own (a printer, a press), unless its contract says it only works on
 * items it is sent (a conveyor, a labeler), in which case it waits.
 */
export function isCycleSource(cycle: { itemsRequired?: boolean }, itemPipes: number): boolean {
  return !cycle.itemsRequired && itemPipes === 0;
}

/** A cycle unit that draws liquid each cycle and is piped for it: it waits for its liquid. */
export function drawsLiquid(cycle: { liquidPerCycleGallons?: number }, liquidPipes: number): boolean {
  return cycle.liquidPerCycleGallons !== undefined && liquidPipes > 0;
}
