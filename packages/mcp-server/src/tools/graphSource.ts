import { resolveGraph as resolve, type GraphSourceParams, type ResolvedGraph } from '@process-forge/tools';
import { bridgeHost } from './desktopBridge.js';

export type { GraphSourceParams, ResolvedGraph };

/** The flowsheet a tool works on (see @process-forge/tools graphSource), with the desktop app's open flowsheet. */
export function resolveGraph(params: GraphSourceParams = {}, readOpen: () => Promise<Record<string, unknown>> = executeOpen): Promise<ResolvedGraph> {
  return resolve(params, async () => {
    const open = await readOpen();
    const sheet = (open as { flowsheet?: { graph?: GraphSourceParams['graph']; projectName?: string } }).flowsheet;
    if (open.success && sheet?.graph && Array.isArray(sheet.graph.nodes)) return { graph: sheet.graph, ...(sheet.projectName ? { projectName: sheet.projectName } : {}) };
    return { error: String(open.error ?? 'ProcessForge Desktop is not running') };
  });
}

const executeOpen = async () => {
  const r = await bridgeHost.readOpen();
  return 'graph' in r ? { success: true, flowsheet: r } : { success: false, error: r.error };
};
