import {
  evaluateUnitOp,
  UnitOpContractSchema,
  terminalCarries,
  terminalMaterial,
  terminalRole,
  terminalSupplyRate,
  type ProcessGraph,
  type ProcessNode
} from '@process-forge/protocol';
import { isFluidEdge } from '@process-forge/simulation-core';

/**
 * What a unit does, in the terms the simulation engine actually uses.
 *
 * Every figure here is computed with the engine's own formulas and defaults
 * (packages/simulation-core/src/engine.ts), so the unit panel describes the
 * model the simulation runs -- including, plainly, the kinds it does not step
 * yet -- rather than a generic list of settings.
 */
export interface UnitBehavior {
  /** Stepped by the line simulation. False: drawn and checked, but inert. */
  simulated: boolean;
  /** One sentence: what the unit does, with its numbers. */
  headline: string;
  /** How the engine models it, one fact per line. */
  details: string[];
  /** Top rate per minute, as the engine would run it; null if it has none. */
  capacityPerMin: number | null;
  /** What the rate counts: whole units, or gallons of liquid. */
  rateUnit?: 'units' | 'gal';
  /** Config keys the engine reads for this unit. Every other numeric key is inert. */
  engineKeys: string[];
  role: 'source' | 'inline' | 'end' | 'unconnected';
  /** Contract units: the engine's computed values worth showing up front. */
  keyFigures?: { label: string; value: number; unit: string }[];
  /** Contract units the engine cannot evaluate. */
  error?: string;
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** 30 -> "30 s", 90 -> "1.5 min", 1800 -> "30 min", 7200 -> "2 h". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  if (seconds < 90) return `${round(seconds)} s`;
  if (seconds < 5400) return `${round(seconds / 60)} min`;
  return `${round(seconds / 3600)} h`;
}

/** A rate as people say it: "48 /min", "2 /h" for slow units, "12 gal/min" for liquid. */
export function formatRate(perMin: number | null, unit: 'units' | 'gal' = 'units'): { value: string; per: string } {
  if (perMin === null || !Number.isFinite(perMin)) return { value: '—', per: '' };
  const prefix = unit === 'gal' ? ' gal' : '';
  if (perMin > 0 && perMin < 1) return { value: round(perMin * 60), per: `${prefix}/h` };
  return { value: round(perMin), per: `${prefix}/min` };
}

function round(v: number): string {
  const a = Math.abs(v);
  return v.toLocaleString(undefined, { maximumFractionDigits: a >= 100 ? 0 : a >= 10 ? 1 : 2 });
}

const plural = (n: number, word: string) => `${round(n)} ${word}${n === 1 ? '' : 's'}`;

function roleOf(node: ProcessNode, graph: ProcessGraph): UnitBehavior['role'] {
  const hasIn = graph.edges.some((e) => e.targetNodeId === node.id);
  const hasOut = graph.edges.some((e) => e.sourceNodeId === node.id);
  if (!hasIn && !hasOut) return 'unconnected';
  if (!hasIn) return 'source';
  if (!hasOut) return 'end';
  return 'inline';
}

const NOT_SIMULATED =
  'The line simulation does not step this kind of unit yet: nothing passes through it, so its settings do not change the results. Whatever feeds it queues up and then backs up the line.';
const NOT_SIMULATED_NO_PIPE =
  'No liquid pipe connects to it, so nothing flows through it in the simulation and its settings do not change the results.';
/** Kinds that pass liquid on when piped (the engine's fluid network, simulation-core/fluid.ts). */
const PASS_THROUGH = new Set(['PUMP', 'HEAT_EXCHANGER', 'SEPARATOR', 'MIXER', 'DISTILLATION_COLUMN', 'SCRUBBER', 'SPRAY_CHAMBER', 'CUSTOM_UNIT_OP']);

/** Names of the units on the other end of this unit's liquid pipes. */
function liquidNeighbours(node: ProcessNode, graph: ProcessGraph, dir: 'in' | 'out'): string[] {
  return graph.edges
    .filter((e) => (dir === 'in' ? e.targetNodeId === node.id : e.sourceNodeId === node.id) && isFluidEdge(e, graph))
    .map((e) => graph.nodes.find((n) => n.id === (dir === 'in' ? e.sourceNodeId : e.targetNodeId))?.name)
    .filter((n): n is string => Boolean(n));
}

const list = (names: string[]) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** What a unit does, plus its breakdowns when it is a machine the engine steps and both settings are set. */
export function describeUnitBehavior(node: ProcessNode, graph: ProcessGraph): UnitBehavior {
  const b = describeCore(node, graph);
  const c = node.config as Record<string, unknown>;
  const mtbf = c.meanTimeBetweenFailuresMinutes;
  const mttr = c.meanTimeToRepairMinutes;
  if (!b.simulated || b.rateUnit === 'gal' || typeof mtbf !== 'number' || typeof mttr !== 'number' || mtbf <= 0 || mttr <= 0) {
    return b;
  }
  const down = mttr / (mtbf + mttr);
  return {
    ...b,
    details: [
      ...b.details,
      `Breaks down on average every ${formatDuration(mtbf * 60)} and takes ${formatDuration(mttr * 60)} to repair, so it is down about ${round(down * 100)}% of the time.`
    ],
    capacityPerMin: b.capacityPerMin === null ? null : b.capacityPerMin * (1 - down),
    engineKeys: [...b.engineKeys, 'meanTimeBetweenFailuresMinutes', 'meanTimeToRepairMinutes']
  };
}

function describeCore(node: ProcessNode, graph: ProcessGraph): UnitBehavior {
  const c = node.config as Record<string, unknown>;
  const role = roleOf(node, graph);
  const leavesLine = role === 'end' || role === 'unconnected';
  const feeds = liquidNeighbours(node, graph, 'in');
  const sendsTo = liquidNeighbours(node, graph, 'out');
  const onLiquidPath = feeds.length > 0 || sendsTo.length > 0;

  // ---- a feed or outlet arrow ---------------------------------------------------
  const tRole = terminalRole(node);
  if (tRole) {
    const items = terminalCarries(node) === 'items';
    const what = terminalMaterial(node);
    const connected = graph.edges
      .filter((e) => (tRole === 'feed' ? e.sourceNodeId === node.id : e.targetNodeId === node.id))
      .map((e) => graph.nodes.find((n) => n.id === (tRole === 'feed' ? e.targetNodeId : e.sourceNodeId))?.name)
      .filter((n): n is string => Boolean(n));
    const unit = items ? 'items' : 'gal';
    if (tRole === 'feed') {
      const rate = terminalSupplyRate(node);
      return {
        simulated: connected.length > 0,
        headline: rate > 0 ? `Supplies up to ${round(rate)} ${unit}/min of ${what}.` : `Supplies as much ${what} as the line takes.`,
        details: [
          connected.length ? `Feeds ${list(connected)}.` : 'Not piped to anything yet: pipe it into the unit it feeds.',
          rate > 0
            ? 'Anything that needs more than the supply rate waits for it, so the feed can be the bottleneck.'
            : 'With no supply rate the feed never runs short; set one to model a limited supply.',
          `Carries ${items ? 'whole items' : 'liquid'}; an unpiped arrow takes on the kind of the first unit it is piped to.`
        ],
        capacityPerMin: rate > 0 ? rate : null,
        rateUnit: items ? 'units' : 'gal',
        engineKeys: ['supplyRate'],
        role
      };
    }
    const counts =
      tRole === 'product'
        ? 'What arrives here is the line\'s output: the run\'s throughput counts it.'
        : `Totalled on its own as ${tRole}: it does not count toward the line's output.`;
    return {
      simulated: connected.length > 0,
      headline: `${what} leaves the flowsheet here, as ${tRole === 'product' ? 'product' : tRole}.`,
      details: [
        connected.length ? `Receives from ${list(connected)}.` : 'Nothing is piped to it yet.',
        'Takes everything it is sent, so it never holds up the line.',
        counts
      ],
      capacityPerMin: null,
      engineKeys: [],
      role
    };
  }

  // ---- designed by contract ---------------------------------------------------
  if (c.contract !== undefined) {
    const parsed = UnitOpContractSchema.safeParse(c.contract);
    if (!parsed.success) {
      return {
        simulated: false,
        headline: 'This unit carries a design the engine cannot read.',
        details: [parsed.error.issues[0]?.message ?? 'The contract does not match the schema.'],
        capacityPerMin: null,
        engineKeys: ['contract'],
        role,
        error: 'Unreadable contract'
      };
    }
    const contract = parsed.data;
    const ev = evaluateUnitOp(contract);
    const keyFigures = contract.derived
      .slice(0, 4)
      .map((d) => ({ label: d.label ?? d.name, value: ev.derived[d.name] ?? NaN, unit: d.unit }));
    if (ev.error) {
      return {
        simulated: false,
        headline: 'The engine cannot evaluate this design, so the simulation will not run it.',
        details: [ev.error.message],
        capacityPerMin: null,
        engineKeys: ['contract'],
        role,
        keyFigures,
        error: ev.error.message
      };
    }
    const failing = ev.constraints.filter((k) => !k.satisfied && k.severity === 'ERROR').length;
    const b = ev.behavior;
    if (b.mode === 'DISCRETE_CYCLE') {
      const isSource = role === 'source' || role === 'unconnected';
      const good = b.unitsPerCycle * (1 - b.scrapFraction);
      const liquidFed = feeds.length > 0;
      const details = [
        liquidFed
          ? `Its liquid feed from ${list(feeds)} is not drawn down by the simulation: each cycle starts on its own.`
          : isSource
          ? `Nothing feeds it, so it is a source: every cycle starts on its own.`
          : `Each cycle takes up to ${plural(b.unitsPerCycle, 'unit')} from its queue, and waits when the queue is empty.`,
        b.scrapFraction > 0
          ? `Scraps ${round(b.scrapFraction * 100)}% of each cycle, rounded down to whole units${
              b.unitsPerCycle * b.scrapFraction < 1 ? ' (so none at this batch size)' : ''
            }.`
          : 'No scrap.',
        leavesLine ? 'Nothing downstream: what it makes counts as finished output.' : 'Output goes to the next unit; if that is full, this unit waits.'
      ];
      if (failing) details.unshift(`${plural(failing, 'check')} fail, so the simulation refuses to run this unit until they pass.`);
      return {
        simulated: failing === 0,
        headline: `${isSource || liquidFed ? 'Makes' : 'Processes'} ${plural(b.unitsPerCycle, 'unit')} every ${formatDuration(b.cycleSeconds)}${
          good !== b.unitsPerCycle ? `, ${round(good)} good` : ''
        }.`,
        details,
        capacityPerMin: failing === 0 ? b.unitsPerMinute * (1 - b.scrapFraction) : null,
        engineKeys: ['contract', 'bufferCapacity'],
        role,
        keyFigures
      };
    }
    return {
      simulated: false,
      headline: contract.description?.trim() || `A continuous unit, checked by the engine at steady state.`,
      details: [
        `At steady state: ${round(b.throughputPerMinute)} per minute through it${b.dutyKw !== undefined ? `, ${round(b.dutyKw)} kW duty` : ''}${
          b.residenceTimeSeconds !== undefined ? `, ${formatDuration(b.residenceTimeSeconds)} residence` : ''
        }.`,
        failing
          ? `${plural(failing, 'check')} fail at this operating point.`
          : 'Every physics check passes at this operating point.',
        'The line simulation checks continuous units but does not step them yet, so it does not pace the line.'
      ],
      capacityPerMin: null,
      engineKeys: ['contract'],
      role,
      keyFigures
    };
  }

  // ---- the kinds the engine steps ---------------------------------------------
  switch (node.kind) {
    case 'ROTARY_FILLER': {
      const n = num(c.nozzleCount, 10);
      const fill = num(c.fillTimePerCycleSeconds, 10);
      const index = num(c.indexTimePerCycleSeconds, 2);
      const reject = num(c.rejectRatePercentage, 0.5);
      const cycle = fill + index;
      const gallons = num(c.containerVolumeGallons, 1);
      const pipeFed = feeds.length > 0;
      return {
        simulated: true,
        headline: `Fills ${plural(n, 'container')} every ${formatDuration(cycle)}.`,
        details: [
          `${formatDuration(fill)} filling and ${formatDuration(index)} indexing per cycle.`,
          pipeFed
            ? `Each cycle draws ${round(n * gallons)} gal from ${list(feeds)} (${plural(n, 'container')} of ${round(gallons)} gal), about ${round(((n * gallons) / cycle) * 60)} gal/min flat out. When the feed runs short, it waits.`
            : 'No feed pipe, so it fills on its own and never waits for product.',
          `On ${round(reject)}% of cycles one container is rejected.`,
          leavesLine ? 'Nothing downstream: filled containers count as finished output.' : 'If the next unit is full, the filler stops until it has room.'
        ],
        capacityPerMin: (n / cycle) * 60 - ((reject / 100) * 60) / cycle,
        engineKeys: [
          'nozzleCount',
          'fillTimePerCycleSeconds',
          'indexTimePerCycleSeconds',
          'rejectRatePercentage',
          ...(pipeFed ? ['containerVolumeGallons'] : [])
        ],
        role
      };
    }
    case 'CONVEYOR': {
      const length = num(c.lengthMeters, 10);
      const speed = num(c.speedMetersPerSecond, 0.5);
      const items = num(c.maxItemCapacity, 48);
      const travel = length / speed;
      const perItem = Math.max(0.1, travel / Math.max(1, items));
      return {
        simulated: true,
        headline: `Carries up to ${plural(items, 'item')} along ${round(length)} m at ${round(speed)} m/s.`,
        details: [
          `${formatDuration(travel)} end to end, so it can hand on one item every ${formatDuration(perItem)}.`,
          'It runs only while something is on it.',
          leavesLine ? 'Nothing downstream: items leaving the end count as finished output.' : 'If the next unit is full, the belt stops.'
        ],
        capacityPerMin: 60 / perItem,
        engineKeys: ['lengthMeters', 'speedMetersPerSecond', 'maxItemCapacity'],
        role
      };
    }
    case 'LABELER': {
      const speed = num(c.maxSpeedUnitsPerMinute, 40);
      const fail = num(c.opticalInspectionFailRate, 0.2);
      return {
        simulated: true,
        headline: `Labels up to ${round(speed)} containers a minute.`,
        details: [
          `${round(fail)}% fail the optical inspection and are scrapped.`,
          'It runs only when containers reach it.',
          leavesLine ? 'Nothing downstream: labelled containers count as finished output.' : 'If the next unit is full, it holds one container and waits.'
        ],
        capacityPerMin: speed * (1 - fail / 100),
        engineKeys: ['maxSpeedUnitsPerMinute', 'opticalInspectionFailRate'],
        role
      };
    }
    case 'PALLETIZER': {
      const layer = num(c.containersPerLayer, 20);
      const cycle = num(c.cycleSecondsPerLayer, 30);
      const details = [
        `Waits until ${plural(layer, 'container')} are queued, then builds a layer.`,
        'End of the line: every container stacked counts as finished output, and nothing leaves it.'
      ];
      if (layer > 100) details.unshift('It queues at most 100 containers, so a layer this large never starts. Lower the layer size.');
      return {
        simulated: true,
        headline: `Stacks a layer of ${plural(layer, 'container')} every ${formatDuration(cycle)}.`,
        details,
        capacityPerMin: layer > 100 ? 0 : (layer / cycle) * 60,
        engineKeys: ['containersPerLayer', 'cycleSecondsPerLayer'],
        role
      };
    }
    case 'BATCH_REACTOR': {
      const batch = num(c.batchVolumeGallons, 800);
      const fillMin = num(c.fillDurationMinutes, 15);
      const reactMin = num(c.reactionDurationMinutes, 30);
      const discharge = Math.max(1e-6, num(c.dischargeRateGpm, 50));
      const dischargeMin = batch / discharge;
      const cycleMin = fillMin + reactMin + dischargeMin;
      return {
        simulated: true,
        headline: `Makes ${round(batch)} gal batches, one every ${formatDuration(cycleMin * 60)}.`,
        details: [
          `${formatDuration(fillMin * 60)} filling, ${formatDuration(reactMin * 60)} reacting, then ${formatDuration(dischargeMin * 60)} discharging at ${round(discharge)} gpm.`,
          feeds.length
            ? `It fills from ${list(feeds)}, and waits when that runs dry.`
            : 'No feed pipe, so it charges itself: the raw materials are not modelled.',
          sendsTo.length
            ? `It discharges to ${list(sendsTo)}; if that is full, the batch waits in the reactor.`
            : 'Nothing downstream: each batch leaves the line when it discharges.',
          `On average that is ${round(batch / cycleMin)} gal/min, however fast the discharge.`
        ],
        capacityPerMin: batch / cycleMin,
        rateUnit: 'gal',
        engineKeys: ['batchVolumeGallons', 'fillDurationMinutes', 'reactionDurationMinutes', 'dischargeRateGpm'],
        role
      };
    }
    case 'SURGE_TANK': {
      const cap = num(c.capacityGallons, 1000);
      if (!onLiquidPath) {
        return {
          simulated: false,
          headline: `A tank that holds up to ${round(cap)} gal.`,
          details: ['No liquid pipe connects to it, so the simulation has nothing to put in it or take out.'],
          capacityPerMin: null,
          engineKeys: [],
          role
        };
      }
      const start = Math.min(cap, num(c.initialLevelGallons, 0));
      const maxOut = num(c.maxDischargeRateGpm, 0);
      return {
        simulated: true,
        headline: `Holds up to ${round(cap)} gal, starting at ${round(start)} gal.`,
        details: [
          feeds.length ? `Fed by ${list(feeds)}.` : 'Nothing feeds it: it only drains what it starts with.',
          sendsTo.length
            ? `It sends to ${list(sendsTo)}${maxOut > 0 ? ` at up to ${round(maxOut)} gpm` : ''}.`
            : 'Nothing downstream: it collects what reaches it.',
          'Its level rises while it is fed faster than it drains, and falls otherwise. Full, it backs up what feeds it; empty, what it feeds waits.'
        ],
        capacityPerMin: sendsTo.length && maxOut > 0 ? maxOut : null,
        rateUnit: 'gal',
        engineKeys: ['capacityGallons', 'initialLevelGallons', 'maxDischargeRateGpm'],
        role
      };
    }
    default: {
      if (!onLiquidPath || !PASS_THROUGH.has(node.kind)) {
        return {
          simulated: false,
          headline: designHeadline(node),
          details: [onLiquidPath ? NOT_SIMULATED : `${NOT_SIMULATED_NO_PIPE}`],
          capacityPerMin: null,
          engineKeys: [],
          role
        };
      }
      // Pumps, exchangers, separators and other process units pass liquid on.
      const cap =
        node.kind === 'PUMP' ? c.designFlowRateGpm : node.kind === 'HEAT_EXCHANGER' ? c.shellSideFlowGpm : node.kind === 'CUSTOM_UNIT_OP' ? c.designThroughput : undefined;
      const capGpm = typeof cap === 'number' && cap > 0 ? cap : null;
      const capKey = node.kind === 'PUMP' ? 'designFlowRateGpm' : node.kind === 'HEAT_EXCHANGER' ? 'shellSideFlowGpm' : node.kind === 'CUSTOM_UNIT_OP' ? 'designThroughput' : null;
      const details = [
        feeds.length ? `It passes on what reaches it from ${list(feeds)}, holding none.` : 'Nothing feeds it, so nothing flows through it.',
        capGpm !== null ? `At most ${round(capGpm)} gpm, and only as fast as what is downstream takes it.` : 'It does not limit the flow itself: what is up- and downstream does.',
        sendsTo.length ? `It sends to ${list(sendsTo)}.` : 'Nothing downstream: what passes through leaves the line.'
      ];
      if (node.kind === 'SEPARATOR') {
        const ratio = Math.min(1, Math.max(0, num(c.vaporSplitRatio, 0.25)));
        details.splice(1, 0, `It splits the flow: ${round(ratio * 100)}% to its first outlet (${node.outputs[0]?.name ?? 'overhead'}), ${round((1 - ratio) * 100)}% to the rest.`);
      }
      if (node.kind === 'HEAT_EXCHANGER') details.push('Its heat duty is recorded with the design; the line simulation moves the flow but does not model the heat.');
      return {
        simulated: true,
        headline: node.kind === 'SEPARATOR' ? `Splits its feed by the vapor ratio.` : capGpm !== null ? `Moves up to ${round(capGpm)} gpm.` : `Passes liquid through.`,
        details,
        capacityPerMin: capGpm,
        rateUnit: 'gal',
        engineKeys: [...(capKey ? [capKey] : []), ...(node.kind === 'SEPARATOR' ? ['vaporSplitRatio'] : [])],
        role
      };
    }
  }
}

/** For kinds the engine does not step: the design, as the unit's own settings state it. */
function designHeadline(node: ProcessNode): string {
  const c = node.config as Record<string, unknown>;
  const has = (k: string) => typeof c[k] === 'number';
  switch (node.kind) {
    case 'PUMP':
      return has('designFlowRateGpm')
        ? `Pumps ${round(c.designFlowRateGpm as number)} gpm${has('totalDynamicHeadFeet') ? ` against ${round(c.totalDynamicHeadFeet as number)} ft of head` : ''}.`
        : 'A pump.';
    case 'BATCH_REACTOR':
      return has('batchVolumeGallons')
        ? `Reacts ${round(c.batchVolumeGallons as number)} gal batches${has('reactionDurationMinutes') ? ` over ${round(c.reactionDurationMinutes as number)} min` : ''}.`
        : 'A batch reactor.';
    case 'HEAT_EXCHANGER':
      return has('dutyKw') ? `Transfers ${round(c.dutyKw as number)} kW.` : 'A heat exchanger.';
    default:
      return `A ${node.kind.replace(/_/g, ' ').toLowerCase()}.`;
  }
}

/** The config keys the engine reads for this unit; every other numeric key changes nothing. */
export function engineKeysOf(node: ProcessNode): string[] {
  const alone: ProcessGraph = { id: '', name: '', version: '', metadata: {}, nodes: [node], edges: [] };
  return describeUnitBehavior(node, alone).engineKeys;
}
