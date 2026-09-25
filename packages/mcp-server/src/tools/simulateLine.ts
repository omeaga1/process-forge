import { bottleneckAdvice } from './bottleneckAdvice.js';
import { validateProcessGraph, type ProcessGraph } from '@process-forge/protocol';
import { SimulationEngine, type HeatReport, type MachineOeeReport, type TerminalReport } from '@process-forge/simulation-core';
import { AVAILABLE_TEMPLATES } from '../templates.js';

export interface SimulateLineParams {
  graph?: ProcessGraph;
  templateName?: string;
  durationMinutes?: number;
}

export interface SimulationResultPayload {
  success: boolean;
  facilityName: string;
  durationMinutes: number;
  simulatedSeconds: number;
  totalUnitsPackaged: number;
  totalUnitsScrapped: number;
  overallThroughputPpm: number;
  identifiedBottleneckNodeId: string;
  identifiedBottleneckMachine: string;
  machineMetrics: Array<{
    nodeId: string;
    machineName: string;
    produced: number;
    scrapped: number;
    starvedSeconds: number;
    blockedSeconds: number;
    /** Reactors, tanks, pumps: gallons in, out and held at the end, and temperatures. */
    liquid?: NonNullable<MachineOeeReport['fluid']>;
    /** Heat exchangers with a target, and reactors with a reaction temperature: the heat they moved. */
    heat?: HeatReport;
    /** Designed continuous units: constraints broken at the conditions they actually saw. */
    designedUnit?: MachineOeeReport['designedUnit'];
  }>;
  /** Feeds, products, byproducts and waste: what came in and went out, and where. */
  streams: TerminalReport[];
  engineeringDiagnosis: string;
}

export function executeSimulateLine(params: SimulateLineParams): SimulationResultPayload {
  let graphToRun: ProcessGraph;

  if (params.graph) {
    graphToRun = params.graph;
  } else if (params.templateName && AVAILABLE_TEMPLATES[params.templateName]) {
    graphToRun = AVAILABLE_TEMPLATES[params.templateName]!;
  } else {
    graphToRun = AVAILABLE_TEMPLATES['sherwin-williams-paint-line']!;
  }

  const duration = params.durationMinutes && params.durationMinutes > 0 ? params.durationMinutes : 30;

  // Run the deterministic engine
  const engine = new SimulationEngine(graphToRun);
  const result = engine.run(duration);

  // Validate topology and calculate bottlenecks
  const validation = validateProcessGraph(graphToRun);
  const bottleneckId = validation.bottlenecks.bottleneckNodeId ?? 'unknown-bottleneck';
  const bottleneckNode = graphToRun.nodes.find((n) => n.id === bottleneckId);
  const bottleneckName = bottleneckNode ? bottleneckNode.name : bottleneckId;

  // Compile machine metrics
  const machineMetrics = graphToRun.nodes.filter((node) => node.kind !== 'TERMINAL').map((node) => {
    const report = result.nodeReports[node.id];
    return {
      nodeId: node.id,
      machineName: node.name,
      produced: report?.unitsProduced ?? 0,
      scrapped: report?.unitsScrapped ?? 0,
      starvedSeconds: Math.round((report?.starvedTimeSeconds ?? 0) * 10) / 10,
      blockedSeconds: Math.round((report?.blockedTimeSeconds ?? 0) * 10) / 10,
      ...(report?.fluid ? { liquid: report.fluid } : {}),
      ...(report?.heat ? { heat: report.heat } : {}),
      ...(report?.designedUnit ? { designedUnit: report.designedUnit } : {})
    };
  });

  // Designed units that broke an ERROR constraint at the conditions they saw.
  const designNotes = graphToRun.nodes.flatMap((node) => {
    const d = result.nodeReports[node.id]?.designedUnit;
    const bad = d?.brokenConstraints.filter((c) => c.severity === 'ERROR') ?? [];
    const failed = [
      ...(d?.evaluationError ? [`its design failed to evaluate for ${d.evaluationErrorSeconds} s (${d.evaluationError})`] : []),
      ...(d?.shortReactions?.length ? [`reaction ${d.shortReactions.join(', ')} ran short of a co-reactant and stopped there`] : [])
    ];
    const reasons = [...bad.map((c) => `"${c.message}" for ${c.seconds} s`), ...failed];
    return reasons.length ? [`Designed unit "${node.name}" at the conditions it actually got: ${reasons.join('; ')}. Revise it with validate_unit_op at those conditions (designInlet).`] : [];
  });

  // Heat that holds the line back, or misses its target.
  const heatNotes = graphToRun.nodes.flatMap((node) => {
    const h = result.nodeReports[node.id]?.heat;
    if (!h) return [];
    if (h.dutyLimitedPercentage !== undefined && h.dutyLimitedPercentage > 5 && h.targetTemperatureC !== undefined) {
      const out = result.nodeReports[node.id]?.fluid?.averageOutletTemperatureC;
      return [
        `"${node.name}" is short of duty ${Math.round(h.dutyLimitedPercentage)}% of the time: it runs at its ${h.ratedDutyKw} kW and the liquid leaves at ${out ?? '?'} °C on average against a ${h.targetTemperatureC} °C target. Raise its duty, or slow the flow through it.`
      ];
    }
    if (h.heatingTimeSeconds !== undefined && h.heatingTimeSeconds > 0) {
      const share = Math.round((h.heatingTimeSeconds / (duration * 60)) * 100);
      return share >= 10 ? [`"${node.name}" spent ${share}% of the run heating batches on its ${h.jacketDutyKw} kW jacket; a larger jacket shortens every batch.`] : [];
    }
    return [];
  });
  const heat = [...heatNotes, ...designNotes].length ? ` ${[...heatNotes, ...designNotes].join(' ')}` : '';

  const liquid = result.totalFluidDeliveredGallons > 0 ? ` ${result.totalFluidDeliveredGallons} gal of liquid product left the line.` : '';
  const amount = (t: TerminalReport) => (t.carries === 'items' ? `${t.units} items` : `${t.gallons} gal`);
  const sides = result.terminals.filter((t) => t.role === 'byproduct' || t.role === 'waste');
  const side = sides.length ? ` Also out: ${sides.map((t) => `${amount(t)} of ${t.material} as ${t.role}`).join('; ')}.` : '';
  const feeds = result.terminals.filter((t) => t.role === 'feed');
  const fed = feeds.length ? ` Fed: ${feeds.map((t) => `${amount(t)} of ${t.material}`).join('; ')}.` : '';
  const diagnosis = `Simulated ${duration} minutes: ${result.totalUnitsPackaged} units finished, ${result.averageLineThroughputUnitsPerMin}/min on average.${liquid}${fed}${side}${heat} ${bottleneckAdvice(bottleneckNode, validation.bottlenecks.maximumSystemThroughputUnitsPerMin)}`;

  return {
    success: true,
    facilityName: (graphToRun.metadata?.facility as string) || graphToRun.name,
    durationMinutes: duration,
    simulatedSeconds: result.simulatedTimeSeconds,
    totalUnitsPackaged: result.totalUnitsPackaged,
    totalUnitsScrapped: result.totalUnitsScrapped,
    overallThroughputPpm: result.averageLineThroughputUnitsPerMin,
    identifiedBottleneckNodeId: bottleneckId,
    identifiedBottleneckMachine: bottleneckName,
    machineMetrics,
    streams: result.terminals,
    engineeringDiagnosis: diagnosis
  };
}
