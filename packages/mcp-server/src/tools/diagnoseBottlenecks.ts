import { findExampleLine, type ProcessGraph } from '@process-forge/protocol';
import { diagnoseBottlenecks, DEMO_LINE, type DiagnosticReportPayload } from '@process-forge/tools';

export type { DiagnosticReportPayload };

export interface DiagnoseBottlenecksParams {
  graph?: ProcessGraph;
  templateName?: string;
}

/** diagnose_bottlenecks on a given graph or example line (the demo line when neither); see @process-forge/tools. */
export function executeDiagnoseBottlenecks(params: DiagnoseBottlenecksParams): DiagnosticReportPayload {
  return diagnoseBottlenecks(params.graph ?? (params.templateName ? findExampleLine(params.templateName) : undefined) ?? findExampleLine(DEMO_LINE)!);
}
