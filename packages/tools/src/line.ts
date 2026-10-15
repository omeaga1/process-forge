import {
  applyFlowsheetEdit,
  effectiveContract,
  evaluateUnitOp,
  feedMassSupplyKgPerS,
  terminalRole,
  terminalSupplyRate,
  validateProcessGraph,
  type GraphDiagnostic,
  type ProcessGraph,
  type ProcessNode
} from '@process-forge/protocol';
import { auditHeadline, auditRun, type RunAudit, type RunIssue } from './audit.js';
import { averageStreamStates, simulateProcess, type HeatReport, type MachineOeeReport, type StreamState, type TerminalReport } from '@process-forge/simulation-core';

/**
 * Reading a line: simulate it, find what limits it, and compare what-ifs. Pure
 * functions of a graph; the tools resolve which graph first (graphSource.ts).
 */

/** What to change when this unit is what limits the line, from what its contract does. */
export function bottleneckAdvice(node: ProcessNode | undefined, unitsPerMin: number, graph?: ProcessGraph, per = 'units/min'): string {
  if (!node) return 'No unit limits the line in the static analysis.';
  const rate = Math.round(unitsPerMin * 10) / 10;
  const who = `"${node.name}" limits the line at about ${rate} ${per}.`;
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
  /**
   * The run's verdict on itself: failed (a unit broke an ERROR check, a
   * contract failed to evaluate, or mass did not balance), warnings, or ok.
   * Lead with it; never present a failed run's figures as a result.
   */
  status: RunAudit['status'];
  /** What the status rests on, each with a code, worst first. */
  issues: RunIssue[];
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
  /** Liquid that reached a product outlet while an ERROR check upstream was broken: diverted, not in liquidOut. */
  offSpecGallons?: number;
  offSpecKg?: number;
  identifiedBottleneckNodeId: string;
  identifiedBottleneckMachine: string;
  /** A liquid line no unit was seen holding back: what sets its rate (a feed's supply, a unit at capacity) and every rated unit's headroom. */
  lineLimit?: LineLimit;
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
  /** Every pipe averaged over the run, as a stream report lists it: from and to, phase, kg/h, gal/min, items/min, and the °C and mass fractions of what flowed. */
  pipes: StreamState[];
  /** The run's heat and mass balance: mass across the line, and each heating, cooling or phase-changing unit's duty against its streams. */
  balance: RunAudit['balance'];
  /** Liquid lines: whether the output rate had settled by the end of the run. */
  steady?: RunAudit['steady'];
  engineeringDiagnosis: string;
}

/**
 * What limited the line in the run itself: the busiest unit (busy at least 90%
 * of the time) whose neighbours waited on it, the units after it starved or
 * the ones before it blocked for at least 10%. A batch reactor, a slow tank
 * outlet or a breakdown-prone filler shows up here even when the static
 * capacities say nothing limits the line.
 */
export function observedBottleneck(graph: ProcessGraph, result: ReturnType<typeof simulateProcess>, seconds: number): ProcessNode | undefined {
  const share = (id: string, key: 'busyTimeSeconds' | 'starvedTimeSeconds' | 'blockedTimeSeconds') => (result.nodeReports[id]?.[key] ?? 0) / seconds;
  const isUnit = (id: string) => graph.nodes.some((n) => n.id === id && n.kind !== 'TERMINAL');
  let best: { node: ProcessNode; busy: number } | undefined;
  for (const node of graph.nodes) {
    if (node.kind === 'TERMINAL') continue;
    const busy = share(node.id, 'busyTimeSeconds');
    if (busy < 0.9) continue;
    const after = graph.edges.filter((e) => e.sourceNodeId === node.id && isUnit(e.targetNodeId)).map((e) => e.targetNodeId);
    const before = graph.edges.filter((e) => e.targetNodeId === node.id && isUnit(e.sourceNodeId)).map((e) => e.sourceNodeId);
    const waitedOn = after.some((id) => share(id, 'starvedTimeSeconds') >= 0.1) || before.some((id) => share(id, 'blockedTimeSeconds') >= 0.1);
    if (waitedOn && (!best || busy > best.busy)) best = { node, busy };
  }
  return best?.node;
}

/** What sets a liquid line's rate when no unit was seen holding it back. */
export interface LineLimit {
  /** A feed's supply, a unit at its capacity, or nothing the run could see. */
  by: 'feed' | 'unit' | 'none';
  nodeId?: string;
  name?: string;
  summary: string;
  /** Each unit with a rated capacity: what it passed against what it can, most used first. */
  headroom: { unitId: string; unit: string; capacityGpm: number; flowGpm: number; usedPercent: number }[];
}

/** Units reachable downstream of a node. */
function downstreamOf(graph: ProcessGraph, id: string): Set<string> {
  const seen = new Set<string>();
  const todo = [id];
  while (todo.length) {
    const at = todo.pop()!;
    for (const e of graph.edges) {
      if (e.sourceNodeId === at && !seen.has(e.targetNodeId)) {
        seen.add(e.targetNodeId);
        todo.push(e.targetNodeId);
      }
    }
  }
  return seen;
}

/**
 * For a line whose run shows no unit holding it back (no unit busy and
 * waited on, no static bottleneck): what sets its rate. A unit that passed
 * 95 % or more of its rated flow; otherwise the feeds that reach a product
 * and have a supply rate set (a utility feed, such as cooling water that only
 * reaches a return, does not set the product rate); otherwise nothing.
 * Either way, every rated unit's headroom, so "what limits next" is a figure.
 */
export function liquidLimit(graph: ProcessGraph, result: ReturnType<typeof simulateProcess>, minutes: number): LineLimit | undefined {
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const headroom = graph.nodes
    .filter((n) => n.kind !== 'TERMINAL')
    .flatMap((n) => {
      const rep = result.nodeReports[n.id];
      const cap = rep?.designedUnit?.capacityGpm;
      if (!rep?.fluid || !(cap !== undefined && cap > 0) || minutes <= 0) return [];
      const flow = rep.fluid.receivedGallons / minutes;
      return [{ unitId: n.id, unit: n.name, capacityGpm: cap, flowGpm: r1(flow), usedPercent: Math.round((flow / cap) * 100) }];
    })
    .sort((a, b) => b.usedPercent - a.usedPercent);
  const liquidTerminals = result.terminals.filter((t) => t.carries !== 'items' && t.kg > 0);
  if (!liquidTerminals.length) return undefined;
  const top = headroom[0];
  const next = top ? ` First to limit if it rises: "${top.unit}", rated ${top.capacityGpm} gal/min, now passing ${top.flowGpm} (${top.usedPercent}% used).` : '';
  if (top && top.usedPercent >= 95) {
    return { by: 'unit', nodeId: top.unitId, name: top.unit, headroom, summary: `"${top.unit}" runs at ${top.usedPercent}% of its rated ${top.capacityGpm} gal/min: it sets the line's rate. Raise its capacity, or run a second one in parallel.` };
  }
  const products = new Set(result.terminals.filter((t) => t.role === 'product').map((t) => t.nodeId));
  const feeds = graph.nodes.filter((n) => {
    if (terminalRole(n) !== 'feed') return false;
    if (!(terminalSupplyRate(n) > 0 || feedMassSupplyKgPerS(n) !== undefined)) return false;
    const reaches = downstreamOf(graph, n.id);
    return products.size === 0 || [...products].some((p) => reaches.has(p));
  });
  const rate = (id: string) => {
    const t = result.terminals.find((x) => x.nodeId === id);
    if (!t || minutes <= 0) return '';
    return t.gallons > 0 ? `${r1(t.gallons / minutes)} gal/min` : `${r1((t.kg / minutes) * 60)} kg/h`;
  };
  if (feeds.length) {
    const names = feeds.map((f) => `"${f.name}" (${rate(f.id)})`).join(', ');
    return {
      by: 'feed',
      nodeId: feeds[0]!.id,
      name: feeds[0]!.name,
      headroom,
      summary: `No unit reached its capacity: the line runs at what ${feeds.length === 1 ? 'its feed supplies' : 'its feeds supply'}, ${names}.${next}`
    };
  }
  return { by: 'none', headroom, summary: `No unit reached its capacity and no feed limits its supply.${next}` };
}

export function simulateLine(graph: ProcessGraph, durationMinutes?: number, seed?: number, name?: string): SimulationResultPayload {
  const duration = durationMinutes && durationMinutes > 0 ? Math.min(durationMinutes, 24 * 60) : 30;
  const result = simulateProcess(graph, duration, seed !== undefined ? { seed } : {});

  const validation = validateProcessGraph(graph);
  // What the run showed first; the static capacities when the run shows nothing clear.
  const observed = observedBottleneck(graph, result, duration * 60);
  const limit = observed || validation.bottlenecks.bottleneckNodeId ? undefined : liquidLimit(graph, result, duration);
  const bottleneckId = observed?.id ?? validation.bottlenecks.bottleneckNodeId ?? limit?.nodeId ?? 'none';
  const bottleneckNode = graph.nodes.find((n) => n.id === bottleneckId);
  const observedReport = observed ? result.nodeReports[observed.id] : undefined;
  const observedLiquid = Boolean(observedReport?.fluid);
  const bottleneckRate = observed
    ? observedLiquid
      ? (observedReport!.fluid!.deliveredGallons ?? 0) / duration
      : (observedReport?.unitsProduced ?? 0) / duration
    : validation.bottlenecks.maximumSystemThroughputUnitsPerMin;

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
      ...(d?.shortReactions?.length ? [`reaction ${d.shortReactions.join(', ')} ran short of a co-reactant and stopped there`] : []),
      ...(d?.heatBalance ?? []).map(
        (h) =>
          `its "${h.phase}" phase put in ${h.deliveredKwh} kWh (duty × time) where the batch took ${h.neededKwh} kWh (m·cp·ΔT of what was in the vessel), in ${h.batches} batch${h.batches === 1 ? '' : 'es'}: write that phase's time from batch.massKg * batch.cpKjPerKgK`
      )
    ];
    const share = (seconds: number) => {
      const pct = Math.round((seconds / (duration * 60)) * 100);
      // A short breach (a start-up transient) rounds to 0%: say how long it was instead.
      return pct >= 1 ? `${pct}% of the run` : `${seconds} s of the run`;
    };
    const reasons = [...bad.map((c) => `"${c.message}" for ${share(c.seconds)}`), ...failed];
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
  // Units that state their phases: what left each port, in its phase's units.
  const phaseNotes = graph.nodes.flatMap((node) => {
    const streams = result.nodeReports[node.id]?.designedUnit?.streams;
    if (!streams?.length) return [];
    const parts = streams.map((s) =>
      s.phase === 'GAS'
        ? `${s.name} ${s.actualCubicFeetPerMinute} ACFM of gas at ${s.temperatureC} °C (${s.gasKgPerHour} kg/h${s.dispersedKgPerHour ? `, carrying ${Object.entries(s.dispersedKgPerHour).map(([c, v]) => `${v} kg/h ${c}`).join(', ')}` : ''})`
        : s.phase === 'SOLID'
          ? `${s.name} ${s.kgPerHour} kg/h of solids${s.dispersedKgPerHour ? ` (${Object.entries(s.dispersedKgPerHour).map(([c, v]) => `${v} kg/h ${c}`).join(', ')})` : ''}`
          : `${s.name} ${s.gallonsPerMinute ?? 0} gal/min of liquid (${s.kgPerHour} kg/h)`
    );
    return [`"${node.name}" sent: ${parts.join('; ')}.`];
  });
  const notes = [...timeNotes, ...contractNotes, ...phaseNotes];

  // Bulk product in the units of its phase: kg for a powder or a gas, gallons (and kg) for a liquid.
  const products = result.terminals.filter((t) => t.role === 'product' && t.carries !== 'items');
  const bulkProduct = products.some((t) => t.phase === 'SOLID' || t.phase === 'GAS');
  const perHour = (kg: number) => Math.round((kg / duration) * 60 * 10) / 10;
  const liquid =
    result.totalFluidDeliveredGallons > 0 || result.totalFluidDeliveredKg > 0
      ? bulkProduct
        ? ` ${result.totalFluidDeliveredKg} kg of product left the line (${perHour(result.totalFluidDeliveredKg)} kg/h): ${products.map((t) => `${t.kg} kg of ${t.material}${t.phase ? ` (${t.phase.toLowerCase()})` : ''}`).join('; ')}.`
        : ` ${result.totalFluidDeliveredGallons} gal (${result.totalFluidDeliveredKg} kg) of liquid product left the line.`
      : '';
  const offSpec =
    result.totalFluidOffSpecKg > 0
      ? ` ${result.totalFluidOffSpecGallons} gal (${result.totalFluidOffSpecKg} kg) more reached ${products
          .filter((t) => t.offSpecKg)
          .map((t) => `"${t.name}"`)
          .join(', ')} off spec (made while a unit upstream had an ERROR check broken) and was diverted: it is not counted above.`
      : '';
  const amount = (t: TerminalReport) =>
    t.carries === 'items' ? `${t.units} items` : t.phase === 'GAS' || t.phase === 'SOLID' ? `${t.kg} kg (${t.phase.toLowerCase()})` : `${t.gallons} gal`;
  const sides = result.terminals.filter((t) => t.role === 'byproduct' || t.role === 'waste');
  const side = sides.length ? ` Also out: ${sides.map((t) => `${amount(t)} of ${t.material} as ${t.role}`).join('; ')}.` : '';
  const feeds = result.terminals.filter((t) => t.role === 'feed');
  const fed = feeds.length ? ` Fed: ${feeds.map((t) => `${amount(t)} of ${t.material}`).join('; ')}.` : '';
  // A liquid-only line finishes no items: say what it did make.
  const items = result.totalUnitsPackaged > 0 || !liquid ? ` ${result.totalUnitsPackaged} units finished, ${result.averageLineThroughputUnitsPerMin}/min on average.` : '';
  const limitText = limit ? limit.summary : bottleneckAdvice(bottleneckNode, bottleneckRate, graph, observedLiquid ? 'gal/min' : 'units/min');
  const audit = auditRun(graph, result);
  const diagnosis = `${auditHeadline(audit)} Simulated ${duration} minutes:${items}${liquid}${offSpec}${fed}${side}${notes.length ? ` ${notes.join(' ')}` : ''} ${limitText}`;

  return {
    success: true,
    status: audit.status,
    issues: audit.issues,
    facilityName: name || (graph.metadata?.facility as string) || graph.name,
    durationMinutes: duration,
    simulatedSeconds: result.simulatedTimeSeconds,
    seed: result.seed,
    totalUnitsPackaged: result.totalUnitsPackaged,
    totalUnitsScrapped: result.totalUnitsScrapped,
    overallThroughputPpm: result.averageLineThroughputUnitsPerMin,
    liquidOutGallons: result.totalFluidDeliveredGallons,
    liquidOutKg: result.totalFluidDeliveredKg,
    ...(result.totalFluidOffSpecKg > 0 ? { offSpecGallons: result.totalFluidOffSpecGallons, offSpecKg: result.totalFluidOffSpecKg } : {}),
    identifiedBottleneckNodeId: bottleneckId,
    identifiedBottleneckMachine: bottleneckNode ? bottleneckNode.name : bottleneckId,
    ...(limit ? { lineLimit: limit } : {}),
    machineMetrics,
    streams: result.terminals,
    pipes: averageStreamStates(graph, result.telemetryLog),
    balance: audit.balance,
    ...(audit.steady ? { steady: audit.steady } : {}),
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
    liquidOutKg: run.totalFluidDeliveredKg,
    staticCapacityPerMinute: round(stat.maximumSystemThroughputUnitsPerMin, 2),
    bottleneck: bottleneck ? { id: bottleneck.id, name: bottleneck.name } : null,
    limit: bottleneck ? undefined : liquidLimit(graph, run, minutes),
    audit: auditRun(graph, run),
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
    // A change the engine does not read moves nothing at all: say so, rather
    // than let "+0%" read as a measured effect.
    const fingerprint = (run: typeof m.run) => JSON.stringify(Object.values(run.nodeReports).map((r) => ({ ...r, terminal: undefined })));
    const noEffect = applied.length > 0 && fingerprint(m.run) === fingerprint(base.run);
    if (noEffect) warnings.push('The run is identical to the baseline in every unit: at this operating point, these settings change nothing the engine measures.');
    // Throughput is not the only thing a change moves: a heater can pass the
    // same flow and still miss its temperature. Every unit the scenario
    // touches, and every unit whose checks change, reports both.
    const checksOf = (r: typeof base.run.nodeReports[string] | undefined) =>
      Object.fromEntries((r?.designedUnit?.brokenConstraints ?? []).map((c) => [c.id, { severity: c.severity, seconds: c.seconds, message: c.message }]));
    const checkChanged = Object.keys(m.run.nodeReports).filter((id) => {
      const a = Object.keys(checksOf(base.run.nodeReports[id])).sort().join();
      const b = Object.keys(checksOf(m.run.nodeReports[id])).sort().join();
      return a !== b;
    });
    const touched = [...new Set([...applied.map((a) => a.unitId), ...checkChanged])].map((id) => {
      const before = base.run.nodeReports[id];
      const after = m.run.nodeReports[id];
      const cb = checksOf(before);
      const ca = checksOf(after);
      const r1 = (v: number | undefined) => (v === undefined ? undefined : Math.round(v * 10) / 10);
      return {
        unit: changed.nodes.find((n) => n.id === id)?.name ?? id,
        oeeBefore: before?.overallOeePercentage,
        oeeAfter: after?.overallOeePercentage,
        blockedSecondsBefore: before?.blockedTimeSeconds,
        blockedSecondsAfter: after?.blockedTimeSeconds,
        starvedSecondsBefore: before?.starvedTimeSeconds,
        starvedSecondsAfter: after?.starvedTimeSeconds,
        ...(before?.fluid?.averageOutletTemperatureC !== undefined || after?.fluid?.averageOutletTemperatureC !== undefined
          ? { outletTemperatureCBefore: r1(before?.fluid?.averageOutletTemperatureC), outletTemperatureCAfter: r1(after?.fluid?.averageOutletTemperatureC) }
          : {}),
        ...(before?.heat?.averageDutyKw !== undefined || after?.heat?.averageDutyKw !== undefined
          ? { dutyKwBefore: r1(before?.heat?.averageDutyKw), dutyKwAfter: r1(after?.heat?.averageDutyKw) }
          : {}),
        ...(Object.keys(cb).length || Object.keys(ca).length
          ? {
              checksCleared: Object.keys(cb).filter((k) => !(k in ca)),
              checksNowFailing: Object.keys(ca).filter((k) => !(k in cb)).map((k) => ({ id: k, ...ca[k]! })),
              checksStillFailing: Object.keys(ca).filter((k) => k in cb)
            }
          : {})
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
      liquidOutKg: m.liquidOutKg,
      /** By mass: a powder or a gas product has no meaningful gallons. */
      liquidOutChangePercent: pct(m.liquidOutKg, base.liquidOutKg),
      ...(noEffect ? { noEffect: true } : {}),
      staticCapacityPerMinute: m.staticCapacityPerMinute,
      bottleneck: m.bottleneck,
      bottleneckMoved: m.bottleneck?.id !== base.bottleneck?.id,
      /** Checks failing anywhere on the line in this run (designed units' constraints). */
      checksFailing: Object.values(m.run.nodeReports).reduce((n, r) => n + (r?.designedUnit?.brokenConstraints.length ?? 0), 0),
      changedUnits: touched,
      /** This run's verdict on itself (see simulate_process_line): a failed scenario is not a candidate, however much it makes. */
      status: m.audit.status,
      ...(m.audit.issues.some((x) => x.severity !== 'info') ? { issues: m.audit.issues.filter((x) => x.severity !== 'info').map((x) => ({ code: x.code, ...(x.unit ? { unit: x.unit } : {}), message: x.message })) } : {})
    };
  });

  // The most output; on a tie, the one that leaves fewest checks failing.
  // A failed run is never the best, however much it makes; then the most output, then the fewest checks failing.
  const failed = (s: { status: string }) => (s.status === 'failed' ? 1 : 0);
  const best = [...scenarios].sort((a, b) => failed(a) - failed(b) || b.unitsPerMinute - a.unitsPerMinute || b.liquidOutKg - a.liquidOutKg || a.checksFailing - b.checksFailing)[0]!;
  // A line that finishes no items is judged by what it sends out, by mass.
  const byMass = base.unitsPerMinute === 0 && scenarios.every((s) => s.unitsPerMinute === 0) && (base.liquidOutKg > 0 || scenarios.some((s) => s.liquidOutKg > 0));
  const headline = (units: number, kg: number) => (byMass ? `${Math.round((kg / minutes) * 60 * 10) / 10} kg/h out` : `${units}/min`);
  const lines = scenarios.map((s) => {
    const d = byMass ? s.liquidOutChangePercent : s.unitsPerMinuteChangePercent;
    const moved = s.bottleneckMoved && s.bottleneck ? `; the bottleneck moves to ${s.bottleneck.name}` : '';
    const cleared = s.changedUnits.flatMap((u) => ('checksCleared' in u && u.checksCleared?.length ? [`${u.unit} clears ${u.checksCleared.join(', ')}`] : []));
    const broke = s.changedUnits.flatMap((u) => ('checksNowFailing' in u && u.checksNowFailing?.length ? [`${u.unit} now fails ${u.checksNowFailing.map((c) => c.id).join(', ')}`] : []));
    const checks = [...cleared, ...broke].length ? `; ${[...cleared, ...broke].join('; ')}` : '';
    return `${s.name}: ${headline(s.unitsPerMinute, s.liquidOutKg)} (${s.noEffect ? 'no effect' : d === null ? 'new output' : `${d >= 0 ? '+' : ''}${d}%`})${moved}${checks}${s.status === 'failed' ? `; the run FAILED (${(s.issues ?? []).map((x) => x.code).join(', ')})` : ''}.`;
  });
  // A scenario that changes nothing for the better is not "best", even if it is the only one.
  const baseChecks = Object.values(base.run.nodeReports).reduce((n, r) => n + (r?.designedUnit?.brokenConstraints.length ?? 0), 0);
  const beatsBaseline =
    best.status !== 'failed' &&
    (best.unitsPerMinute > base.unitsPerMinute ||
      best.liquidOutKg > base.liquidOutKg ||
      (best.unitsPerMinute === base.unitsPerMinute && best.liquidOutKg === base.liquidOutKg && best.checksFailing < baseChecks));
  return {
    success: true,
    durationMinutes: minutes,
    seed,
    baseline: {
      unitsPerMinute: base.unitsPerMinute,
      unitsFinished: base.unitsFinished,
      unitsScrapped: base.unitsScrapped,
      liquidOutGallons: base.liquidOutGallons,
      liquidOutKg: base.liquidOutKg,
      staticCapacityPerMinute: base.staticCapacityPerMinute,
      bottleneck: base.bottleneck,
      checksFailing: Object.values(base.run.nodeReports).reduce((n, r) => n + (r?.designedUnit?.brokenConstraints.length ?? 0), 0),
      status: base.audit.status
    },
    scenarios,
    summary: `Baseline: ${headline(base.unitsPerMinute, base.liquidOutKg)}, limited by ${base.bottleneck?.name ?? (base.limit?.by === 'feed' ? `the supply of ${base.limit.name}` : base.limit?.by === 'unit' ? base.limit.name : 'nothing in the static analysis')}. ${lines.join(' ')} ${beatsBaseline ? `Best: ${best.name}.` : "None beats the baseline."} Each run used seed ${seed} over ${minutes} min; nothing on the flowsheet was changed.`
  };
}
