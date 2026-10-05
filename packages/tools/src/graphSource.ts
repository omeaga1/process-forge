import { EXAMPLE_LINES, findExampleLine, type ProcessGraph } from '@process-forge/protocol';
import type { ToolHost } from './host.js';

export interface GraphSourceParams {
  graph?: ProcessGraph;
  templateName?: string;
}

export interface ResolvedGraph {
  graph: ProcessGraph;
  /** Where the flowsheet came from, so the result can say which line it describes. */
  source: 'graph' | 'template' | 'open-flowsheet' | 'demo';
  note?: string;
  /** The open flowsheet's name in the app. */
  name?: string;
}

export const DEMO_LINE = 'paint-canning-line';

/**
 * The flowsheet a tool works on: the graph it was given, else a named example
 * line, else the one the engineer has open, else the demo paint line (and the
 * result says so, so a model never mistakes the demo for the engineer's line).
 */
export async function resolveGraph(params: GraphSourceParams, readOpen: ToolHost['readOpen']): Promise<ResolvedGraph> {
  if (params.graph && typeof params.graph === 'object') return { graph: params.graph, source: 'graph' };
  if (params.templateName) {
    const t = findExampleLine(params.templateName);
    if (!t) throw new Error(`No template "${params.templateName}". Templates: ${Object.keys(EXAMPLE_LINES).join(', ')}.`);
    return { graph: t, source: 'template' };
  }
  const open = await readOpen();
  if ('graph' in open && Array.isArray(open.graph?.nodes)) {
    return {
      graph: open.graph,
      source: 'open-flowsheet',
      ...(open.projectName ? { name: open.projectName } : {}),
      note: `The flowsheet open in ProcessForge${open.projectName ? ` ("${open.projectName}")` : ''}.`
    };
  }
  return {
    graph: EXAMPLE_LINES[DEMO_LINE]!,
    source: 'demo',
    note: `No graph, template or open flowsheet (${'error' in open ? open.error : 'nothing is open'}), so this is the "${DEMO_LINE}" demo line, not the engineer's. Open ProcessForge Desktop, or pass a graph or templateName.`
  };
}
