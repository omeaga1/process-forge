import { findExampleLine, type ProcessGraph } from '@process-forge/protocol';
import { simulateLine, DEMO_LINE, type SimulationResultPayload } from '@process-forge/tools';

export type { SimulationResultPayload };

export interface SimulateLineParams {
  graph?: ProcessGraph;
  templateName?: string;
  durationMinutes?: number;
}

/** simulate_process_line on a given graph or example line (the demo line when neither); see @process-forge/tools. */
export function executeSimulateLine(params: SimulateLineParams): SimulationResultPayload {
  const graph = params.graph ?? (params.templateName ? findExampleLine(params.templateName) : undefined) ?? findExampleLine(DEMO_LINE)!;
  return simulateLine(graph, params.durationMinutes);
}
