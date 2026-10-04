import {
  applyFlowsheetEdit,
  effectiveContract,
  evaluateUnitOp,
  terminalRole,
  validateProcessGraph,
  type GraphDiagnostic,
  type ProcessGraph,
  type ProcessNode
} from '@process-forge/protocol';
import { simulateProcess, type HeatReport, type MachineOeeReport, type TerminalReport } from '@process-forge/simulation-core';

/**
 * Reading a line: simulate it, find what limits it, and compare what-ifs. Pure
 * functions of a graph; the tools resolve which graph first (graphSource.ts).
 */

/** What to change when this unit is what limits the line, from what its contract does. */
export function bottleneckAdvice(node: ProcessNode | undefined, unitsPerMin: number, graph?: ProcessGraph): string {
  if (!node) return 'No unit limits the line in the static analysis.';
  const rate = Math.round(unitsPerMin * 10) / 10;
  const who = `"${node.name}" limits the line at about ${rate} units/min.`;
  if (terminalRole(node)) {
    return `${who} It is a feed: the supply rate set on it is what limits the line. Raise it (or set it to 0 to supply whatever the line takes) if the real supply allows.`;
  }
  const contract = effectiveContract(node, graph?.edges ?? []);
  const b = contract ? evaluateUnitOp(contract).behavior : undefined;
  switch (b?.mode) {
    case 'BATCH':
      return `${who} A batch unit delivers one batch per pass through its phases (fill, any heating and holding, drain), so add a second one in parallel, shorten its slowest phase (more heating duty if it heats), or run larger batches; a bigger tank after it only smooths the gaps, it does not raise the average.`;
    case 'STORAGE':
      return `${who} The tank's outflow limit caps what it can send on: raise it (larger outlet, pump) or add a second tank.`;
    case 'CONTINUOUS_RATE':
      return `${who} Its rated flow caps what passes through it: raise its capacity, or run a second one in parallel.`;
    case 'DISCRETE_CYCLE':
      return `${who} Shorten its cycle, make more per cycle (nozzles, lanes, layer size), cut its rejects or breakdowns, or run a second one in parallel.`;
    default:
      return `${who} Raise this unit's rate or run a second one in parallel.`;
  }
}

export interface SimulationResultPayload {
  success: boolean;
  facilityName: string;
  durationMinutes: number;
  simulatedSeconds: number;
  seed: number;
  totalUnitsPackaged: number;
  totalUnitsScrapped: number;
  overallThroughputPpm: number;
  /** Liquid that left the line, gallons and kg. */
  liquidOutGallons: number;
  liquidOutKg: number;
  identifiedBottleneckNodeId: string;
  identifiedBottleneckMachine: string;
  machineMetrics: Array<{
    nodeId: string;
    machineName: string;
    produced: number;
    scrapped: number;
    busySeconds: number;
    starvedSeconds: number;
    blockedSeconds: number;
    downSeconds: number;
    /** Liquid units: gallons and kg in, out and held at the end, and temperatures. */
    liquid?: NonNullable<MachineOeeReport['fluid']>;
    heat?: HeatReport;
    /** Liquid units: constraints of its contract broken at the conditions it actually saw. */
    designedUnit?: MachineOeeReport['designedUnit'];
  }>;
  /** Feeds, products, byproducts and waste: what came in and went out, and where. */
  streams: TerminalReport[];
  engineeringDiagnosis: string;
}

export function simulateLine(graph: ProcessGraph, durationMinutes?: number, seed?: number): SimulationResultPayload {
  const duration = durationMinutes && durationMinutes > 0 ? Math.min(durationMinutes, 24 * 60) : 30;
  const result = simulateProcess(graph, duration, seed !== undefined ? { seed } : {});

  const validation = validateProcessGraph(graph);
  const bottleneckId = validation.bottlenecks.bottleneckNodeId ?? 'unknown-bottleneck';
  const bottleneckNode = graph.nodes.find((n) => n.id === bottleneckId);

  const machineMetrics = graph.nodes
    .filter((node) => node.kind !== 'TERMINAL')
    .map((node) => {
      const report = result.nodeReports[node.id];
      return {
        nodeId: node.id,
        machineName: node.name,
        produced: report?.unitsProduced ?? 0,
        scrapped: report?.unitsScrapped ?? 0,
        busySeconds: report?.busyTimeSeconds ?? 0,
        starvedSeconds: report?.starvedTimeSeconds ?? 0,
        blockedSeconds: report?.blockedTimeSeconds ?? 0,
        downSeconds: report?.downTimeSeconds ?? 0,
        ...(report?.fluid ? { liquid: report.fluid } : {}),
        ...(report?.heat ? { heat: report.heat } : {}),
        ...(report?.designedUnit ? { designedUnit: report.designedUnit } : {})
      };
    });

  // Units whose contract broke an ERROR constraint at the conditions they saw,
  // or a WARNING one for a real share of the run (an exchanger short of duty).
  const contractNotes = graph.nodes.flatMap((node) => {
    const d = result.nodeReports[node.id]?.designedUnit;
    const bad = d?.brokenConstraints.filter((c) => c.severity === 'ERROR' || c.seconds > duration * 60 * 0.05) ?? [];
    const failed = [
      ...(d?.evaluationError ? [`its contract failed to evaluate for ${d.evaluationErrorSeconds} s (${d.evaluationError})`] : []),
      ...(d?.shortReactions?.length ? [`reaction ${d.shortReactions.join(', ')} ran short of a co-reactant and stopped there`] : [])
    ];
    const reasons = [...bad.map((c) => `"${c.message}" for ${Math.round((c.seconds / (duration * 60)) * 100)}% of the run`), ...failed];
    if (!reasons.length) return [];
    const out = result.nodeReports[node.id]?.fluid?.averageOutletTemperatureC;
    return [
      `"${node.name}" at the conditions it actually got: ${reasons.join('; ')}${out !== undefined ? ` (it sent liquid at ${out} °C on average)` : ''}. Change its parameters, or revise its contract with validate_unit_op at those conditions (designInlet).`
    ];
  });

  // Batches held back by heating, and units held back by breakdowns.
  const timeNotes = graph.nodes.flatMap((node) => {
    const rep = result.nodeReports[node.id];
    const notes: string[] = [];
    const heating = rep?.heat?.heatingTimeSeconds ?? 0;
    if (heating / (duration * 60) >= 0.1) notes.push(`"${node.name}" spent ${Math.round((heating / (duration * 60)) * 100)}% of the run heating batches; more heating duty shortens every batch.`);
    const down = rep?.downTimeSeconds ?? 0;
    if (down / (duration * 60) >= 0.05) notes.push(`"${node.name}" was broken down ${Math.round((down / (duration * 60)) * 100)}% of the run.`);
    return notes;
  });
  const notes = [...timeNotes, ...contractNotes];

  const liquid = result.totalFluidDeliveredGallons > 0 ? ` ${result.totalFluidDeliveredGallons} gal (${result.totalFluidDeliveredKg} kg) of liquid product left the line.` : '';
  const amount = (t: TerminalReport) => (t.carries === 'items' ? `${t.units} items` : `${t.gallons} gal`);
  const sides = result.terminals.filter((t) => t.role === 'byproduct' || t.role === 'waste');
  const side = sides.length ? ` Also out: ${sides.map((t) => `${amount(t)} of ${t.material} as ${t.role}`).join('; ')}.` : '';
  const feeds = result.terminals.filter((t) => t.role === 'feed');
  const fed = feeds.length ? ` Fed: ${feeds.map((t) => `${amount(t)} of ${t.material}`).join('; ')}.` : '';
  const diagnosis = `Simulated ${duration} minutes: ${result.totalUnitsPackaged} units finished, ${result.averageLineThroughputUnitsPerMin}/min on average.${liquid}${fed}${side}${notes.length ? ` ${notes.join(' ')}` : ''} ${bottleneckAdvice(
    bottleneckNode,
    validation.bottlenecks.maximumSystemThroughputUnitsPerMin,
    graph
  )}`;

  return {
    success: true,
    facilityName: (graph.metadata?.facility as string) || graph.name,
    durationMinutes: duration,
    simulatedSeconds: result.simulatedTimeSeconds,
    seed: result.seed,
    totalUnitsPackaged: result.totalUnitsPackaged,
    totalUnitsScrapped: result.totalUnitsScrapped,
    overallThroughputPpm: result.averageLineThroughputUnitsPerMin,
    liquidOutGallons: result.totalFluidDeliveredGallons,
    liquidOutKg: result.totalFluidDeliveredKg,
    identifiedBottleneckNodeId: bottleneckId,
    identifiedBottleneckMachine: bottleneckNode ? bottleneckNode.name : bottleneckId,
    machineMetrics,
    streams: result.terminals,
    engineeringDiagnosis: diagnosis
  };
}

export interface DiagnosticReportPayload {
  success: boolean;
  graphName: string;
  totalNodes: number;
  totalEdges: number;
  isValidTopology: boolean;
  bottleneckNodeId: string;
  bottleneckMachineName: string;
  maxLineThroughputPpm: number;
  unbalancedFlows: Array<{ sourceNode: string; targetNode: string; issue: string }>;
  diagnostics: GraphDiagnostic[];
  actionableRecommendations: string[];
}

export function diagnoseBottlenecks(graph: ProcessGraph): DiagnosticReportPayload {
  const validation = validateProcessGraph(graph);
  const bottleneckId = validation.bottlenecks.bottleneckNodeId ?? 'unknown-bottleneck';
  const bottleneckNode = graph.nodes.find((n) => n.id === bottleneckId);

  const recommendations: string[] = [];
  if (validation.bottlenecks.bottleneckNodeId) {
    recommendations.push(bottleneckAdvice(bottleneckNode, validation.bottlenecks.maximumSystemThroughputUnitsPerMin, graph));
  }
  const conveyors = graph.nodes.filter((n) => n.kind === 'CONVEYOR');
  recommendations.push(
    conveyors.length === 0
      ? 'No accumulation buffers between filling and downstream packaging. Add an accumulation conveyor to isolate filler micro-stoppages from packaging jams.'
      : `Conveyor accumulation covers about ${conveyors.reduce((sum, n) => sum + (typeof (n.config as Record<string, unknown>).maxItemCapacity === 'number' ? ((n.config as Record<string, unknown>).maxItemCapacity as number) : 48), 0)} items of surge buffer.`
  );

  return {
    success: true,
    graphName: graph.name,
    totalNodes: graph.nodes.length,
    totalEdges: graph.edges.length,
    isValidTopology: validation.valid,
    bottleneckNodeId: bottleneckId,
    bottleneckMachineName: bottleneckNode ? bottleneckNode.name : bottleneckId,
    maxLineThroughputPpm: validation.bottlenecks.maximumSystemThroughputUnitsPerMin,
    unbalancedFlows: validation.diagnostics
      .filter((d) => d.severity === 'ERROR')
      .map((d) => ({ sourceNode: d.nodeId || 'Unknown', targetNode: 'Downstream', issue: d.message })),
    diagnostics: validation.diagnostics,
    actionableRecommendations: recommendations
  };
}

// ------------------------------------------------------------- what-ifs

export interface ScenarioChange {
  /** The unit to change: id, name or tag. */
  unit: string;
  /** Settings to set, by name. Dotted names reach into nested settings, e.g. "fluid.temperatureCelsius". */
  parameters: Record<string, unknown>;
}

export interface Scenario {
  name?: string;
  changes: ScenarioChange[];
}

export interface CompareScenariosParams {
  scenarios: Scenario[];
  durationMinutes?: number;
  seed?: number;
}

interface AppliedChange {
  unit: string;
  unitId: string;
  parameter: string;
  from: unknown;
  to: unknown;
  designParameter?: boolean;
}

/** A copy of the graph with the scenario's changes, and what each change did. */
export function applyScenario(graph: ProcessGraph, scenario: Scenario): { graph: ProcessGraph; applied: AppliedChange[]; warnings: string[] } {
  let copy = graph;
  const applied: AppliedChange[] = [];
  const warnings: string[] = [];
  for (const change of scenario.changes ?? []) {
    const r = applyFlowsheetEdit(copy, { op: 'update-unit', unit: String(change?.unit ?? ''), parameters: change?.parameters ?? {} });
    if (!r.ok) {
      warnings.push(r.error);
      continue;
    }
    copy = r.graph;
    warnings.push(...(r.warnings ?? []));
    for (const c of r.changes ?? []) applied.push({ unit: r.unit!.name, unitId: r.unit!.id, ...c });
  }
  return { graph: copy, applied, warnings };
}

const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const pct = (after: number, before: number) => (before > 0 ? round(((after - before) / before) * 100) : after > 0 ? null : 0);

function measure(graph: ProcessGraph, minutes: number, seed?: number) {
  const run = simulateProcess(graph, minutes, seed !== undefined ? { seed } : {});
  const stat = validateProcessGraph(graph).bottlenecks;
  const bottleneck = graph.nodes.find((n) => n.id === stat.bottleneckNodeId);
  return {
    seed: run.seed,
    unitsPerMinute: run.averageLineThroughputUnitsPerMin,
    unitsFinished: run.totalUnitsPackaged,
    unitsScrapped: run.totalUnitsScrapped,
    liquidOutGallons: run.totalFluidDeliveredGallons,
    staticCapacityPerMinute: round(stat.maximumSystemThroughputUnitsPerMin, 2),
    bottleneck: bottleneck ? { id: bottleneck.id, name: bottleneck.name } : null,
    run
  };
}

/**
 * What-if runs: the same line, the same seed, with some settings changed, so
 * the difference in the results is the change and nothing else. Nothing on
 * the engineer's flowsheet is touched.
 */
export function compareScenarios(graph: ProcessGraph, params: CompareScenariosParams) {
  if (!Array.isArray(params?.scenarios) || params.scenarios.length === 0) {
    throw new Error('Give "scenarios": at least one { name, changes: [{ unit, parameters }] }.');
  }
  const minutes = params.durationMinutes && params.durationMinutes > 0 ? Math.min(params.durationMinutes, 24 * 60) : 60;
  const base = measure(graph, minutes, params.seed);
  // Every scenario replays the baseline's seed, so random draws match.
  const seed = base.seed;

  const scenarios = params.scenarios.slice(0, 8).map((s, i) => {
    const { graph: changed, applied, warnings } = applyScenario(graph, s);
    const m = measure(changed, minutes, seed);
    const touched = [...new Set(applied.map((a) => a.unitId))].map((id) => {
      const before = base.run.nodeReports[id];
      const after = m.run.nodeReports[id];
      return {
        unit: changed.nodes.find((n) => n.id === id)?.name ?? id,
        oeeBefore: before?.overallOeePercentage,
        oeeAfter: after?.overallOeePercentage,
        blockedSecondsBefore: before?.blockedTimeSeconds,
        blockedSecondsAfter: after?.blockedTimeSeconds,
        starvedSecondsBefore: before?.starvedTimeSeconds,
        starvedSecondsAfter: after?.starvedTimeSeconds
      };
    });
    return {
      name: s.name || `Scenario ${i + 1}`,
      applied,
      ...(warnings.length ? { warnings } : {}),
      unitsPerMinute: m.unitsPerMinute,
      unitsPerMinuteChangePercent: pct(m.unitsPerMinute, base.unitsPerMinute),
      unitsFinished: m.unitsFinished,
      liquidOutGallons: m.liquidOutGallons,
      liquidOutChangePercent: pct(m.liquidOutGallons, base.liquidOutGallons),
      staticCapacityPerMinute: m.staticCapacityPerMinute,
      bottleneck: m.bottleneck,
      bottleneckMoved: m.bottleneck?.id !== base.bottleneck?.id,
      changedUnits: touched
    };
  });

  const best = [...scenarios].sort((a, b) => b.unitsPerMinute - a.unitsPerMinute || b.liquidOutGallons - a.liquidOutGallons)[0]!;
  const lines = scenarios.map((s) => {
    const d = s.unitsPerMinuteChangePercent;
    const moved = s.bottleneckMoved && s.bottleneck ? `; the bottleneck moves to ${s.bottleneck.name}` : '';
    return `${s.name}: ${s.unitsPerMinute}/min (${d === null ? 'new output' : `${d >= 0 ? '+' : ''}${d}%`})${moved}.`;
  });
  return {
    success: true,
    durationMinutes: minutes,
    seed,
    baseline: {
      unitsPerMinute: base.unitsPerMinute,
      unitsFinished: base.unitsFinished,
      unitsScrapped: base.unitsScrapped,
      liquidOutGallons: base.liquidOutGallons,
      staticCapacityPerMinute: base.staticCapacityPerMinute,
      bottleneck: base.bottleneck
    },
    scenarios,
    summary: `Baseline: ${base.unitsPerMinute}/min, limited by ${base.bottleneck?.name ?? 'nothing in the static analysis'}. ${lines.join(' ')} Best: ${best.name}. Each run used seed ${seed} over ${minutes} min; nothing on the flowsheet was changed.`
  };
}
