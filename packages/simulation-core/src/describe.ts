import {
  contractExpressions,
  effectiveContract,
  referencedNames,
  evaluateUnitOp,
  hasOwnContract,
  isPhaseAware,
  portPhase,
  pipeTemperature,
  terminalCarries,
  terminalMaterial,
  terminalRole,
  terminalSupplyRate,
  terminalPhase,
  feedMassSupplyKgPerS,
  UnitOpContractSchema,
  type ProcessGraph,
  type ProcessNode,
  type UnitOpContract,
  type UnitOpEvaluation
} from '@process-forge/protocol';
import { drawsLiquid, engineRole, isCycleSource, isFluidEdge, itemPipesIn, liquidPipesIn } from './roles.js';

/**
 * What a unit does, in the terms the simulation actually runs it.
 *
 * Generated from the same contract the engine runs and the same rules it
 * applies (roles.ts), so the panel that explains a unit cannot drift from the
 * model: there are no formulas here of the engine's own. A built-in pump and a
 * unit a model designed are described by one code path, because they are run
 * by one code path.
 */
export interface UnitBehavior {
  /** Stepped by the line simulation. False: drawn and checked, but nothing passes through it. */
  simulated: boolean;
  /** One sentence: what the unit does, with its numbers. */
  headline: string;
  /** How the engine models it, one fact per line. */
  details: string[];
  /** Top rate per minute, as the engine would run it (net of rejects and breakdowns); null if it has none. */
  capacityPerMin: number | null;
  /** The share of time it runs between breakdowns, when it has them: capacityPerMin is net of it. */
  uptime?: number;
  /** What the rate counts: whole items, or gallons of liquid. */
  rateUnit?: 'units' | 'gal';
  /** Config keys the engine reads for this unit. Every other numeric key is inert. */
  engineKeys: string[];
  role: 'source' | 'inline' | 'end' | 'unconnected';
  /** The contract's computed values worth showing up front. */
  keyFigures?: { label: string; value: number; unit: string }[];
  /** A unit the engine cannot evaluate. */
  error?: string;
  /** Units that state their phases: each port's phase, and what changes phase inside. */
  phases?: {
    ports: { id: string; name: string; direction: 'INLET' | 'OUTLET'; phase: 'LIQUID' | 'GAS' | 'SOLID' | 'ITEMS'; dispersed?: Record<string, string> }[];
    changes: string[];
  };
}

/** A contract's phases, for the unit panel: per port, and the changes, with latent heats where they are known. */
export function phasesOf(contract: UnitOpContract, derived: Record<string, number> = {}): UnitBehavior['phases'] | undefined {
  if (!isPhaseAware(contract)) return undefined;
  const ports = contract.ports.map((p) => ({
    id: p.id,
    name: p.name,
    direction: p.direction,
    phase: portPhase(p),
    ...(p.dispersed && Object.keys(p.dispersed).length ? { dispersed: p.dispersed as Record<string, string> } : {})
  }));
  const changes = (contract.phaseChanges ?? []).map((pc) => {
    const expr = pc.latentHeatKjPerKg?.trim();
    const latent = expr === undefined ? undefined : /^[0-9.]+$/.test(expr) ? Number(expr) : derived[expr];
    return `${pc.mechanism.toLowerCase()} of ${pc.component} (${pc.from.toLowerCase()} to ${pc.to.toLowerCase()}${latent !== undefined && latent > 0 ? `, ${round(latent)} kJ/kg` : ''})`;
  });
  return { ports, changes };
}

/** One sentence on what goes in and out, in which phase. */
function phaseSentence(phases: NonNullable<UnitBehavior['phases']>): string {
  const side = (dir: 'INLET' | 'OUTLET') =>
    list(
      phases.ports
        .filter((p) => p.direction === dir)
        .map((p) => {
          const carried = Object.entries(p.dispersed ?? {}).map(([c, ph]) => `${c} as ${ph.toLowerCase()}`);
          return `${p.name} (${p.phase.toLowerCase()}${carried.length ? `, carrying ${list(carried)}` : ''})`;
        })
    );
  return `In: ${side('INLET')}. Out: ${side('OUTLET')}.${phases.changes.length ? ` Inside: ${list(phases.changes)}.` : ' Nothing changes phase: it separates or moves what it is given.'}`;
}

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
  return v.toLocaleString('en-US', { maximumFractionDigits: a >= 100 ? 0 : a >= 10 ? 1 : 2 });
}

const plural = (n: number, word: string) => `${round(n)} ${word}${n === 1 ? '' : 's'}`;
const list = (names: string[]) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

function positionOf(node: ProcessNode, graph: ProcessGraph): UnitBehavior['role'] {
  const hasIn = graph.edges.some((e) => e.targetNodeId === node.id);
  const hasOut = graph.edges.some((e) => e.sourceNodeId === node.id);
  if (!hasIn && !hasOut) return 'unconnected';
  if (!hasIn) return 'source';
  if (!hasOut) return 'end';
  return 'inline';
}

/** Names of the units on the other end of this unit's liquid pipes. */
function liquidNeighbours(node: ProcessNode, graph: ProcessGraph, dir: 'in' | 'out'): string[] {
  return graph.edges
    .filter((e) => (dir === 'in' ? e.targetNodeId === node.id : e.sourceNodeId === node.id) && isFluidEdge(e, graph))
    .map((e) => graph.nodes.find((n) => n.id === (dir === 'in' ? e.sourceNodeId : e.targetNodeId))?.name)
    .filter((n): n is string => Boolean(n));
}

/** Describes a feed or outlet arrow. */
function describeTerminal(node: ProcessNode, graph: ProcessGraph, tRole: NonNullable<ReturnType<typeof terminalRole>>): UnitBehavior {
  const role = positionOf(node, graph);
  const items = terminalCarries(node) === 'items';
  const what = terminalMaterial(node);
  const connected = graph.edges
    .filter((e) => (tRole === 'feed' ? e.sourceNodeId === node.id : e.targetNodeId === node.id))
    .map((e) => graph.nodes.find((n) => n.id === (tRole === 'feed' ? e.targetNodeId : e.sourceNodeId))?.name)
    .filter((n): n is string => Boolean(n));
  const unit = items ? 'items' : 'gal';
  const phase = items ? undefined : terminalPhase(node);
  const carries = items ? 'whole items' : phase === 'GAS' ? 'a gas' : phase === 'SOLID' ? 'bulk solids' : 'liquid';
  if (tRole === 'feed') {
    const rate = terminalSupplyRate(node);
    const c = node.config as { supplyKgPerHour?: unknown; supplyScfm?: unknown };
    // A supply stated as a mass flow (or SCFM for a gas) wins over gal/min.
    const massRate = items ? undefined : feedMassSupplyKgPerS(node);
    const stated =
      massRate !== undefined
        ? phase === 'GAS' && typeof c.supplyScfm === 'number' && c.supplyScfm > 0
          ? `${round(c.supplyScfm)} SCFM (${round(massRate * 3600)} kg/h)`
          : `${round(massRate * 3600)} kg/h`
        : rate > 0
          ? `${round(rate)} ${unit}/min`
          : undefined;
    const limited = stated !== undefined;
    return {
      simulated: connected.length > 0,
      headline: limited ? `Supplies up to ${stated} of ${what}.` : `Supplies as much ${what} as the line takes.`,
      details: [
        connected.length ? `Feeds ${list(connected)}.` : 'Not piped to anything yet: pipe it into the unit it feeds.',
        limited ? 'Anything that needs more than the supply rate waits for it, so the feed can be the bottleneck.' : 'With no supply rate the feed never runs short; set one to model a limited supply.',
        ...(phase === 'GAS'
          ? [`Supplies a gas: an ideal gas at its temperature${(node.config as { densityGPerCm3?: unknown }).densityGPerCm3 ? ', at the density it states' : ', its density from the molar mass of its composition'}.`]
          : []),
        `Carries ${carries}; an unpiped arrow takes on the kind of the first unit it is piped to.`
      ],
      capacityPerMin: rate > 0 && massRate === undefined ? rate : null,
      rateUnit: items ? 'units' : 'gal',
      engineKeys: ['supplyRate', 'supplyKgPerHour', 'supplyScfm', 'phase'],
      role
    };
  }
  return {
    simulated: connected.length > 0,
    headline: `${what} leaves the flowsheet here, as ${tRole === 'product' ? 'product' : tRole}.`,
    details: [
      connected.length ? `Receives from ${list(connected)}.` : 'Nothing is piped to it yet.',
      'Takes everything it is sent, so it never holds up the line.',
      tRole === 'product' ? "What arrives here is the line's output: the run's throughput counts it." : `Totalled on its own as ${tRole}: it does not count toward the line's output.`,
      ...(phase === 'GAS' || phase === 'SOLID' ? [`Carries ${carries}: counted in kg.`] : [])
    ],
    capacityPerMin: null,
    engineKeys: [],
    role
  };
}

/** Breakdowns: a line saying how often, and the share of time it is up. */
function breakdowns(ev: UnitOpEvaluation): { line?: string; uptime: number } {
  const r = ev.reliability;
  if (!r) return { uptime: 1 };
  const down = r.mttrSeconds / (r.mtbfSeconds + r.mttrSeconds);
  return {
    line: `Breaks down on average every ${formatDuration(r.mtbfSeconds)} and takes ${formatDuration(r.mttrSeconds)} to repair, so it is down about ${round(down * 100)}% of the time.`,
    uptime: 1 - down
  };
}

/** What a unit does, in the engine's terms. */
export function describeUnit(node: ProcessNode, graph: ProcessGraph): UnitBehavior {
  const tRole = terminalRole(node);
  if (tRole) return describeTerminal(node, graph, tRole);

  const role = positionOf(node, graph);
  const own = hasOwnContract(node);
  let contract: UnitOpContract | undefined;
  if (own) {
    const parsed = UnitOpContractSchema.safeParse((node.config as { contract?: unknown }).contract);
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
    contract = parsed.data;
  } else {
    contract = effectiveContract(node, graph.edges);
  }
  if (!contract) {
    return { simulated: false, headline: `A ${node.kind.replace(/_/g, ' ').toLowerCase()}.`, details: ['The engine has no model for this unit.'], capacityPerMin: null, engineKeys: [], role };
  }

  // Evaluated at the stream that will reach it, where the pipes say what that is.
  const inletC = pipeTemperature(graph.edges.filter((e) => e.targetNodeId === node.id && isFluidEdge(e, graph)));
  const ev = evaluateUnitOp(contract, inletC !== undefined ? { inlet: { temperatureC: inletC } } : {});
  const keys = own ? ['contract'] : contract.parameters.map((p) => p.name);
  const keyFigures = rankDerived(contract)
    .slice(0, 6)
    .map((d) => ({ label: d.label ?? d.name, value: ev.derived[d.name] ?? NaN, unit: d.unit }));
  const phases = phasesOf(contract, { ...Object.fromEntries(contract.parameters.map((p) => [p.name, p.value])), ...ev.derived });
  const figures = { ...(keyFigures.length ? { keyFigures } : {}), ...(phases ? { phases } : {}) };
  if (ev.error) {
    return {
      simulated: false,
      headline: 'The engine cannot evaluate this unit, so the simulation will not run it.',
      details: [ev.error.message],
      capacityPerMin: null,
      engineKeys: keys,
      role,
      ...figures,
      error: ev.error.message
    };
  }

  const failing = ev.constraints.filter((k) => !k.satisfied && k.severity === 'ERROR').length;
  const refusal = failing ? [`${plural(failing, 'check')} fail at its design point, so the simulation refuses to run it until they pass.`] : [];
  const feeds = liquidNeighbours(node, graph, 'in');
  const sendsTo = liquidNeighbours(node, graph, 'out');
  const leavesLine = role === 'end' || role === 'unconnected';
  const down = breakdowns(ev);
  const withBreakdowns = (details: string[]) => (down.line ? [...details, down.line] : details);
  const b = ev.behavior;

  switch (engineRole(node, ev, graph)) {
    case 'cycle': {
      if (b.mode !== 'DISCRETE_CYCLE') break;
      const source = isCycleSource(b, itemPipesIn(node.id, graph));
      const liquid = drawsLiquid(b, liquidPipesIn(node.id, graph));
      const good = b.outputs ? b.outputs.filter((o) => !o.scrap).reduce((sum, o) => sum + o.perCycle, 0) : b.unitsPerCycle * (1 - b.scrapFraction);
      const kit = b.inputs?.map((x) => `${x.perCycle} from ${x.port}`).join(' and ');
      const waitsForItems = !source && itemPipesIn(node.id, graph) === 0;
      const details = [
        ...refusal,
        liquid
          ? `Each cycle draws ${round(b.liquidPerCycleGallons!)} gal from ${list(feeds)}, about ${round((b.liquidPerCycleGallons! / b.cycleSeconds) * 60)} gal/min flat out, and waits when it is not there.`
          : b.liquidPerCycleGallons !== undefined
            ? 'No liquid pipe, so it does not wait for liquid: each cycle starts on its own.'
            : feeds.length
              ? `Its liquid feed from ${list(feeds)} is not drawn: set liquidPerCycleGallons for it to draw liquid each cycle.`
              : '',
        kit
          ? `Each cycle takes a whole kit, ${kit}, and waits until every part is there.`
          : source
            ? 'Nothing feeds it items, so it is a source: every cycle starts on its own.'
            : waitsForItems
              ? 'It only works on items it is sent, and nothing is piped to it yet, so it waits.'
              : b.fullCyclesOnly
                ? `Waits until ${plural(b.unitsPerCycle, 'item')} are queued, then runs a cycle.`
                : `Each cycle takes up to ${plural(b.unitsPerCycle, 'item')} from its queue, and waits when the queue is empty.`,
        b.outputs
          ? `Each cycle sends ${b.outputs.map((o) => `${o.perCycle} to ${o.port}${o.scrap ? ' (rejects)' : ''}`).join(', ')}.`
          : b.scrapFraction > 0
            ? b.scrapRandom
              ? `Each item has a ${round(b.scrapFraction * 100)}% chance of being rejected, drawn at random.`
              : `Scraps ${round(b.scrapFraction * 100)}% of each cycle, rounded down to whole items${b.unitsPerCycle * b.scrapFraction < 1 ? ' (so none at this cycle size)' : ''}.`
            : 'No rejects.',
        ...(ev.cycleTimeCv ? [`Cycle times vary at random, by about ${round(ev.cycleTimeCv * 100)}% either way.`] : []),
        leavesLine ? 'Nothing downstream: what it makes counts as finished output.' : 'Output goes to the next unit; if that is full, this unit waits.'
      ].filter(Boolean);
      return {
        simulated: failing === 0,
        headline: `${source || liquid ? 'Makes' : 'Processes'} ${plural(b.unitsPerCycle, 'item')} every ${formatDuration(b.cycleSeconds)}${good !== b.unitsPerCycle ? `, ${round(good)} good on average` : ''}.`,
        details: withBreakdowns(details),
        capacityPerMin: failing === 0 ? (good / b.cycleSeconds) * 60 * down.uptime : null,
        ...(down.uptime < 1 ? { uptime: down.uptime } : {}),
        engineKeys: own ? [...keys, 'bufferCapacity'] : keys,
        role,
        ...figures
      };
    }
    case 'batch': {
      if (b.mode !== 'BATCH') break;
      const steps = b.phases.map((ph) =>
        ph.kind === 'HOLD'
          ? `${ph.name}: hold ${formatDuration(ph.seconds ?? 0)}${ph.temperatureC !== undefined ? ` to ${round(ph.temperatureC)} °C` : ''}${ph.dutyKw ? ` on ${round(ph.dutyKw)} kW` : ''}`
          : `${ph.name}: ${ph.kind === 'FILL' ? 'fill' : 'drain'} ${round(ph.gallons ?? b.batchGallons)} gal${ph.rateGpm !== undefined ? ` at ${round(ph.rateGpm)} gpm` : ''}${ph.port ? ` to ${ph.port}` : ''}`
      );
      return {
        simulated: failing === 0,
        headline: `Runs ${round(b.batchGallons)} gal batches${b.cycleSecondsEstimate > 0 ? `, about one every ${formatDuration(b.cycleSecondsEstimate)}` : ''}.`,
        details: withBreakdowns([
          ...refusal,
          `${steps.join('; ')}.`,
          feeds.length ? `It fills from ${list(feeds)}, and waits when that runs dry.` : 'No feed pipe, so it charges itself: its raw materials are not modelled.',
          sendsTo.length ? `It drains to ${list(sendsTo)}; if that is full, the batch waits.` : 'Nothing downstream: each batch leaves the line when it drains.',
          'Each phase is worked out when it starts, from the batch as it is then, so times and amounts follow its mass and temperature.'
        ]),
        capacityPerMin: failing === 0 && Number.isFinite(b.gallonsPerMinute) ? b.gallonsPerMinute * down.uptime : null,
        ...(down.uptime < 1 ? { uptime: down.uptime } : {}),
        rateUnit: 'gal',
        engineKeys: keys,
        role,
        ...figures
      };
    }
    case 'storage': {
      if (b.mode !== 'STORAGE') break;
      if (!feeds.length && !sendsTo.length) {
        return {
          simulated: false,
          headline: `A tank that holds up to ${round(b.capacityGallons)} gal.`,
          details: ['No liquid pipe connects to it, so the simulation has nothing to put in it or take out.'],
          capacityPerMin: null,
          engineKeys: [],
          role
        };
      }
      return {
        simulated: failing === 0,
        headline: `Holds up to ${round(b.capacityGallons)} gal, starting at ${round(b.initialGallons)} gal.`,
        details: withBreakdowns([
          ...refusal,
          feeds.length ? `Fed by ${list(feeds)}.` : 'Nothing feeds it: it only drains what it starts with.',
          sendsTo.length ? `It sends to ${list(sendsTo)}${b.maxOutflowGpm !== undefined ? ` at up to ${round(b.maxOutflowGpm)} gpm` : ''}.` : 'Nothing downstream: it collects what reaches it.',
          'Its level rises while it is fed faster than it drains, and falls otherwise. Full, it backs up what feeds it; empty, what it feeds waits.'
        ]),
        capacityPerMin: sendsTo.length && b.maxOutflowGpm !== undefined ? b.maxOutflowGpm * down.uptime : null,
        ...(down.uptime < 1 ? { uptime: down.uptime } : {}),
        rateUnit: 'gal',
        engineKeys: keys,
        role,
        ...figures
      };
    }
    case 'pass': {
      if (b.mode !== 'CONTINUOUS_RATE') break;
      const cap = b.capacityGpm;
      const splits = Object.entries(ev.outlets)
        .filter(([, o]) => o.share !== undefined)
        .map(([port, o]) => `${round(o.share! * 100)}% to ${port}`);
      const temps = Object.entries(ev.outlets)
        .filter(([, o]) => o.temperatureC !== undefined)
        .map(([port, o]) => `${port} at ${round(o.temperatureC!)} °C`);
      return {
        simulated: failing === 0,
        headline: contract.description?.trim() || 'A continuous unit, evaluated at the stream that reaches it.',
        details: withBreakdowns([
          ...refusal,
          ...(phases ? [phaseSentence(phases)] : []),
          feeds.length ? `It passes on what reaches it from ${list(feeds)}.` : 'Nothing feeds it, so nothing flows through it.',
          cap !== undefined ? `Passes at most ${round(cap)} gpm, and only as fast as what is downstream takes it.` : 'It sets no flow limit of its own: what is up- and downstream does.',
          ...(splits.length ? [`It splits its outflow: ${splits.join(', ')}; outlets without a share take the rest.`] : []),
          ...(temps.length ? [`At its design point it sends ${temps.join(', ')}.`] : []),
          ...(b.dutyKw !== undefined && b.dutyKw !== 0 ? [`At its design point it moves ${round(Math.abs(b.dutyKw))} kW.`] : []),
          sendsTo.length ? `It sends to ${list(sendsTo)}.` : 'Nothing downstream: what passes through leaves the line.',
          'In a run it is re-evaluated every second at the stream that actually reaches it; any check that breaks there is reported with how long it was broken.'
        ]),
        capacityPerMin: failing === 0 && cap !== undefined ? cap * down.uptime : null,
        ...(down.uptime < 1 ? { uptime: down.uptime } : {}),
        rateUnit: 'gal',
        engineKeys: keys,
        role,
        ...figures
      };
    }
    case 'inert':
      break;
  }
  return {
    simulated: false,
    headline: contract.description?.trim() || `A ${node.kind.replace(/_/g, ' ').toLowerCase()}.`,
    details: [
      ...(figures.phases ? [phaseSentence(figures.phases)] : []),
      figures.phases
        ? 'No pipe connects to it yet, so nothing flows through it in the simulation and its settings do not change the results.'
        : 'No liquid pipe connects to it, so nothing flows through it in the simulation and its settings do not change the results.'
    ],
    capacityPerMin: null,
    engineKeys: own ? ['contract'] : [],
    role,
    ...figures
  };
}

/** The config keys the engine reads for this unit; every other numeric key changes nothing. */
export function engineKeysOf(node: ProcessNode): string[] {
  const alone: ProcessGraph = { id: '', name: '', version: '', metadata: {}, nodes: [node], edges: [] };
  return describeUnit(node, alone).engineKeys;
}

/**
 * The derived values worth showing up front: results, not working. A value
 * the engine runs on (behavior, outlets), a check reads, or a governing
 * relation binds counts most; one nothing later uses (a final result) next;
 * the first steps of a calculation (water in the feed) last.
 */
function rankDerived(contract: UnitOpContract): UnitOpContract['derived'] {
  const refs = (expr: string | undefined): string[] => {
    if (!expr) return [];
    try {
      return referencedNames(expr);
    } catch {
      return [];
    }
  };
  const used = new Map<string, number>();
  const bump = (name: string, by: number) => used.set(name, (used.get(name) ?? 0) + by);
  for (const e of contractExpressions(contract)) {
    const w = e.path.startsWith('constraints.') ? 2 : e.path.startsWith('derived.') ? 0 : 3;
    for (const r of refs(e.expr)) bump(r, w);
  }
  for (const name of Object.values(contract.roles ?? {})) bump(name, 3);
  const laterUse = (i: number, name: string) => contract.derived.slice(i + 1).some((d) => refs(d.expr).includes(name));
  const scored = contract.derived.map((d, i) => ({ d, i, score: (used.get(d.name) ?? 0) + (laterUse(i, d.name) ? 0 : 2) }));
  return scored.sort((a, b) => b.score - a.score || b.i - a.i).map((x) => x.d);
}
