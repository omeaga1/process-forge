import type { ProcessGraph } from '@process-forge/protocol';
import { AVAILABLE_TEMPLATES } from '../templates.js';
import { executeGetOpenFlowsheet } from './desktopBridge.js';

export interface GraphSourceParams {
  graph?: ProcessGraph;
  templateName?: string;
}

export interface ResolvedGraph {
  graph: ProcessGraph;
  /** Where the flowsheet came from, so the result can say which line it describes. */
  source: 'graph' | 'template' | 'open-flowsheet' | 'demo';
  note?: string;
}

const DEMO = 'sherwin-williams-paint-line';

/**
 * The flowsheet a tool works on: the graph it was given, else a named
 * template, else the one open in ProcessForge Desktop, else the demo paint
 * line (and the result says so, so a model never mistakes the demo for the
 * engineer's line).
 */
export async function resolveGraph(params: GraphSourceParams = {}, readOpen = executeGetOpenFlowsheet): Promise<ResolvedGraph> {
  if (params.graph && typeof params.graph === 'object') return { graph: params.graph, source: 'graph' };
  if (params.templateName) {
    const t = AVAILABLE_TEMPLATES[params.templateName];
    if (!t) throw new Error(`No template "${params.templateName}". Templates: ${Object.keys(AVAILABLE_TEMPLATES).join(', ')}.`);
    return { graph: t, source: 'template' };
  }
  const open = await readOpen();
  const sheet = (open as { flowsheet?: { graph?: ProcessGraph; projectName?: string } }).flowsheet;
  if (open.success && sheet?.graph && Array.isArray(sheet.graph.nodes)) {
    return {
      graph: sheet.graph,
      source: 'open-flowsheet',
      note: `The flowsheet open in ProcessForge Desktop${sheet.projectName ? ` ("${sheet.projectName}")` : ''}.`
    };
  }
  return {
    graph: AVAILABLE_TEMPLATES[DEMO]!,
    source: 'demo',
    note: `No graph, template or open flowsheet (${String(open.error ?? 'ProcessForge Desktop is not running')}), so this is the "${DEMO}" demo line, not the engineer's. Open ProcessForge Desktop, or pass a graph or templateName.`
  };
}
