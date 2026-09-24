import {
  evaluateUnitOp,
  UnitOpContractSchema,
  type ProcessGraph,
  type ProcessNode
} from '@process-forge/protocol';

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
  /** Top rate in units per minute, as the engine would run it; null if not simulated. */
  capacityPerMin: number | null;
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

/** Units per minute as people say it: "48 /min", or "2 /h" for slow units. */
export function formatRate(perMin: number | null): { value: string; per: string } {
  if (perMin === null || !Number.isFinite(perMin)) return { value: '—', per: '' };
  if (perMin > 0 && perMin < 1) return { value: round(perMin * 60), per: '/h' };
  return { value: round(perMin), per: '/min' };
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

export function describeUnitBehavior(node: ProcessNode, graph: ProcessGraph): UnitBehavior {
  const c = node.config as Record<string, unknown>;
  const role = roleOf(node, graph);
  const leavesLine = role === 'end' || role === 'unconnected';

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
      const details = [
        isSource
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
        headline: `${isSource ? 'Makes' : 'Processes'} ${plural(b.unitsPerCycle, 'unit')} every ${formatDuration(b.cycleSeconds)}${
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
      return {
        simulated: true,
        headline: `Fills ${plural(n, 'container')} every ${formatDuration(cycle)}.`,
        details: [
          `${formatDuration(fill)} filling and ${formatDuration(index)} indexing per cycle.`,
          role === 'inline' || role === 'end'
            ? 'It starts on its own: the fluid feed is drawn but not simulated, so the filler never waits for product.'
            : 'It starts on its own, like every filler in the simulation.',
          `On ${round(reject)}% of cycles one container is rejected.`,
          leavesLine ? 'Nothing downstream: filled containers count as finished output.' : 'If the next unit is full, the filler stops until it has room.'
        ],
        capacityPerMin: (n / cycle) * 60 - ((reject / 100) * 60) / cycle,
        engineKeys: ['nozzleCount', 'fillTimePerCycleSeconds', 'indexTimePerCycleSeconds', 'rejectRatePercentage'],
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
    case 'SURGE_TANK': {
      const cap = num(c.capacityGallons, 1000);
      return {
        simulated: false,
        headline: `A buffer that holds up to ${round(cap)}.`,
        details: [
          'The simulation counts what the tank holds in units, not gallons.',
          'It does not drain tanks yet: the tank fills, then holds back whatever feeds it.'
        ],
        capacityPerMin: null,
        engineKeys: ['capacityGallons'],
        role
      };
    }
    default:
      return {
        simulated: false,
        headline: designHeadline(node),
        details: [NOT_SIMULATED],
        capacityPerMin: null,
        engineKeys: [],
        role
      };
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
