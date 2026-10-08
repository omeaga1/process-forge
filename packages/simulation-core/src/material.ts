import {
  AMBIENT_C,
  DEFAULT_SPECIFIC_HEAT,
  LITERS_PER_GALLON,
  evaluateUnitOp,
  fluidOf,
  feedLiquid,
  normalise,
  pipeTemperature,
  react,
  terminalRole,
  terminalSupplyRate,
  feedGasDensityGPerCm3,
  feedMassSupplyKgPerS,
  type EvaluatedBatchPhase,
  type EvaluatedReaction,
  type ProcessEdge,
  type ProcessGraph,
  type ProcessNode,
  type UnitOpContract,
  type UnitOpEvaluation
} from '@process-forge/protocol';
import type { MachineOperationalState } from './types.js';
import { drawsLiquid, isFluidEdge } from './roles.js';

/**
 * Liquid in the line, on a mass basis.
 *
 * Every unit's liquid is a holdup: its mass (kg), its volume (m³), its
 * temperature, its specific heat and its composition (mass fractions). What
 * moves between units is a parcel of the same five things, so density and
 * heat capacity travel with the material: a dense brine and a light solvent
 * mixed in a tank make a holdup of the right mass and the right volume, and
 * temperatures mix by heat content (m·cp·T), not by volume. Inside, everything
 * is SI (kg, m³, s, kW, °C); gallons appear only where a contract states its
 * figures in gallons and in the reports.
 *
 * What a unit does comes from its contract and nothing else:
 *
 *   STORAGE          a tank: takes what it has room for, sends up to its outflow limit
 *   BATCH            a vessel running its phases: fill, hold, drain
 *   CONTINUOUS_RATE  a pass-through: evaluated each second at the stream that
 *                    reaches it, limited to its capacity, split and heated by
 *                    its outlets, reacting what flows through
 *   DISCRETE_CYCLE   with liquidPerCycleGallons and a feed pipe: a bowl the
 *                    cycle draws from (a filler, a press)
 *
 * Feeds and outlets (TERMINAL nodes) are the network's boundary.
 *
 * Liquid is continuous, so it is stepped on a fixed tick, inside the same
 * event loop as the items. Each tick has two passes over the network in flow
 * order:
 *   1. backward: how much each unit can take (a tank's room, a filling batch's
 *      remainder, a pass-through's capacity capped by what is downstream);
 *   2. forward: each unit offers what it can send, shared among its outlets
 *      without exceeding what each can take.
 * So flow is limited by the slowest thing on the path, a full tank backs up
 * whatever feeds it, and an empty one starves whatever it feeds.
 */

export const M3_PER_GALLON = LITERS_PER_GALLON / 1000;
const EPS_M3 = 1e-9;

export type Composition = Record<string, number>;
export type MaterialRole = 'feed' | 'sink' | 'storage' | 'batch' | 'pass' | 'drawer';

/** A quantity of liquid: what a unit holds, or what moves in one tick. */
export interface Parcel {
  kg: number;
  m3: number;
  tempC: number;
  /** kJ/kg·K. */
  cp: number;
  comp: Composition;
}

const emptyParcel = (): Parcel => ({ kg: 0, m3: 0, tempC: AMBIENT_C, cp: DEFAULT_SPECIFIC_HEAT, comp: {} });

/** Adds a parcel to what a unit has sent by one port. */
function tallyPort(u: MaterialUnit, port: string | undefined, p: Parcel): void {
  if (!port || (p.kg <= 0 && p.m3 <= 0)) return;
  const t = (u.byPort[port] ??= emptyParcel());
  mixInto(t, p);
}

/** Adds `b` into `a` (in place): mass and volume add, heat and composition mix by mass. */
function mixInto(a: Parcel, b: Parcel): void {
  if (b.kg <= 0 && b.m3 <= 0) return;
  const heatA = a.kg * a.cp;
  const heatB = b.kg * b.cp;
  const kg = a.kg + b.kg;
  if (heatA + heatB > 0) a.tempC = (heatA * a.tempC + heatB * b.tempC) / (heatA + heatB);
  else a.tempC = b.tempC;
  if (kg > 0) {
    a.cp = (heatA + heatB) / kg;
    const comp: Composition = {};
    for (const k of new Set([...Object.keys(a.comp), ...Object.keys(b.comp)])) {
      const v = ((a.comp[k] ?? 0) * a.kg + (b.comp[k] ?? 0) * b.kg) / kg;
      if (v > 0) comp[k] = v;
    }
    a.comp = comp;
  }
  a.kg = kg;
  a.m3 += b.m3;
}

/** Takes `m3` of a holdup's liquid out (in place) and returns it as a parcel. */
function takeFrom(a: Parcel, m3: number): Parcel {
  const v = Math.max(0, Math.min(m3, a.m3));
  const kg = a.m3 > 0 ? (a.kg * v) / a.m3 : 0;
  a.m3 -= v;
  a.kg = Math.max(0, a.kg - kg);
  if (a.m3 <= EPS_M3) {
    a.m3 = 0;
    a.kg = 0;
  }
  return { kg, m3: v, tempC: a.tempC, cp: a.cp, comp: { ...a.comp } };
}

/** kg/m³ of a holdup, or of what would arrive when it is empty. */
const densityOf = (p: Parcel, fallback = 1000) => (p.m3 > EPS_M3 && p.kg > 0 ? p.kg / p.m3 : fallback);

export interface BatchRun {
  index: number;
  phase: EvaluatedBatchPhase;
  /** m³ this phase has moved, and is to move. */
  moved: number;
  target: number;
  startedAt: number;
  endsAt?: number;
  startTempC: number;
  /** Seconds of this phase already run (its clock stops while the unit is down). */
  elapsed: number;
  broken: { id: string; message: string; severity: 'ERROR' | 'WARNING' }[];
  reactions?: EvaluatedReaction[];
  /** Seconds spent in each phase, by name, over the run. */
  secondsByPhase: Record<string, number>;
  /** kWh the phase's duty has put in so far (a HOLD with dutyKw). */
  dutyKwh: number;
}

export interface LiveContract {
  /** m³/s; Infinity when the contract declares no capacity. */
  capacity: number;
  dutyKw?: number;
  outlets: UnitOpEvaluation['outlets'];
  reactions?: EvaluatedReaction[];
}

export interface ContractRunTally {
  evaluations: number;
  broken: Record<string, { message: string; severity: 'ERROR' | 'WARNING'; seconds: number }>;
  firstError?: string;
  errorSeconds: number;
  shortReactions: Record<string, number>;
  /**
   * HOLD phases whose duty over their time does not match the heat the batch
   * took to change temperature (m·cp·ΔT of what is actually in the vessel),
   * by phase name: the worst mismatch seen, and how many batches.
   */
  heatBalance: Record<string, { deliveredKwh: number; neededKwh: number; batches: number }>;
}

export interface HeatTally {
  /** Heat moved, kWh (heating and cooling both count). */
  energyKwh: number;
  /** Seconds a unit with a duty had liquid to work on. */
  activeSeconds: number;
  /** Batch units: seconds spent in phases that change the batch's temperature. */
  heatingSeconds: number;
  /** For the average outlet temperature and composition: what it sent. */
  sent: Parcel;
}

export interface MaterialUnit {
  id: string;
  role: MaterialRole;
  node: ProcessNode;
  contract?: UnitOpContract;
  /** What it holds: a tank's contents, a batch, a bowl, a pass-through's carry-over. */
  hold: Parcel;
  /** m³; Infinity when unbounded. */
  capacity: number;
  /** m³/s in and out, this tick. */
  inRate: number;
  outRate: number;
  /** Over the run. */
  received: Parcel;
  delivered: Parcel;
  /** Liquid that left the line from this unit (no pipe on the way out). */
  leftLine: Parcel;
  /** Liquid no outlet took (vented, evaporated). */
  lost: Parcel;
  /** What it sent out of each outlet port (piped or not), over the run. */
  byPort: Record<string, Parcel>;
  batches: number;
  heat: HeatTally;
  /** Per-tick scratch. */
  accept: number;
  inbox: Parcel;
  /** Down (a breakdown): passes nothing, and a batch's clock stops. */
  down: boolean;
  live?: LiveContract;
  run?: ContractRunTally;
  batchRun?: BatchRun;
  /** A STORAGE unit's outflow limit, m³/s. */
  maxOut?: number;
  /** A drawer: m³ one cycle takes. */
  perCycle?: number;
  /** A feed: m³/s it supplies; Infinity for "whatever its pipes take". */
  supply?: number;
  /** A feed: the liquid it supplies. */
  feedStock?: Parcel;
}


const finite = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const positive = (v: unknown): number | undefined => {
  const n = finite(v);
  return n !== undefined && n > 0 ? n : undefined;
};

const compositionOf = (x: unknown): Composition | undefined => {
  const c = (x as { composition?: unknown } | undefined)?.composition;
  return c && typeof c === 'object' ? normalise(c as Composition) : undefined;
};

/** The liquid a set of pipes says it carries: temperature, density, cp, composition (first pipe that says, for each). */
function pipeStock(edges: readonly ProcessEdge[] | undefined): { tempC?: number; density?: number; cp?: number; comp?: Composition } {
  let density: number | undefined;
  let cp: number | undefined;
  let comp: Composition | undefined;
  for (const e of edges ?? []) {
    const f = fluidOf(e.stream) as Record<string, unknown> | undefined;
    density ??= positive(f?.densityGPerCm3);
    cp ??= positive(f?.specificHeatKjPerKgK);
    const c = compositionOf(f);
    if (!comp && c && Object.keys(c).length) comp = c;
  }
  const tempC = pipeTemperature(edges);
  return { ...(tempC !== undefined ? { tempC } : {}), ...(density ? { density } : {}), ...(cp ? { cp } : {}), ...(comp ? { comp } : {}) };
}

/** A parcel of `m3` of a liquid with these properties. */
function stock(m3: number, props: { tempC?: number; density?: number; cp?: number; comp?: Composition }): Parcel {
  const density = (props.density ?? 1) * 1000;
  return { kg: m3 * density, m3, tempC: props.tempC ?? AMBIENT_C, cp: props.cp ?? DEFAULT_SPECIFIC_HEAT, comp: { ...(props.comp ?? {}) } };
}

interface Outlet {
  target: MaterialUnit;
  /** The unit's outlet port it leaves by. */
  port?: string;
  share: number;
  temp?: number;
  comp?: Composition;
}

interface SplitPlan {
  outs: Outlet[];
  unpipedShare: number;
  lossShare: number;
  /** Declared outlet ports with no pipe: their share leaves the line. */
  unpiped: { port: string; share: number; comp?: Composition; temp?: number }[];
}

export class MaterialNetwork {
  readonly units = new Map<string, MaterialUnit>();
  private readonly edges: ProcessEdge[];
  private readonly order: string[];
  private readonly outEdges = new Map<string, ProcessEdge[]>();
  private readonly inEdges = new Map<string, ProcessEdge[]>();

  /**
   * @param contracts every node's contract (terminals have none)
   * @param evaluations each contract evaluated at its design point
   */
  constructor(graph: ProcessGraph, contracts: Map<string, UnitOpContract>, evaluations: Map<string, UnitOpEvaluation>) {
    this.edges = graph.edges.filter((e) => isFluidEdge(e, graph));
    for (const e of this.edges) {
      (this.outEdges.get(e.sourceNodeId) ?? this.outEdges.set(e.sourceNodeId, []).get(e.sourceNodeId)!).push(e);
      (this.inEdges.get(e.targetNodeId) ?? this.inEdges.set(e.targetNodeId, []).get(e.targetNodeId)!).push(e);
    }
    const touches = (id: string) => this.outEdges.has(id) || this.inEdges.has(id);

    for (const node of graph.nodes) {
      const contract = contracts.get(node.id);
      const ev = evaluations.get(node.id);
      const b = ev?.behavior;
      let role: MaterialRole | null = null;
      if (node.kind === 'TERMINAL') {
        const t = terminalRole(node);
        if (t === 'feed' && this.outEdges.has(node.id)) role = 'feed';
        else if (t !== 'feed' && this.inEdges.has(node.id)) role = 'sink';
      } else if (b?.mode === 'STORAGE') role = 'storage';
      // A batch vessel runs its phases whether or not it is piped.
      else if (b?.mode === 'BATCH') role = 'batch';
      else if (b?.mode === 'DISCRETE_CYCLE') role = drawsLiquid(b, this.inEdges.get(node.id)?.length ?? 0) ? 'drawer' : null;
      else if (b?.mode === 'CONTINUOUS_RATE' && touches(node.id)) role = 'pass';
      if (!role) continue;

      const design = contract?.designInlet;
      const designStock = {
        ...(design?.temperatureC !== undefined ? { tempC: design.temperatureC } : {}),
        ...(design?.densityGPerCm3 ? { density: design.densityGPerCm3 } : {}),
        ...(design?.specificHeatKjPerKgK ? { cp: design.specificHeatKjPerKgK } : {}),
        ...(design?.composition ? { comp: normalise(design.composition) } : {})
      };
      const fromPipesIn = pipeStock(this.inEdges.get(node.id));
      const u: MaterialUnit = {
        id: node.id,
        role,
        node,
        ...(contract ? { contract, run: { evaluations: 0, broken: {}, errorSeconds: 0, shortReactions: {}, heatBalance: {} } } : {}),
        hold: emptyParcel(),
        capacity: Infinity,
        inRate: 0,
        outRate: 0,
        received: emptyParcel(),
        delivered: emptyParcel(),
        leftLine: emptyParcel(),
        lost: emptyParcel(),
        byPort: {},
        batches: 0,
        heat: { energyKwh: 0, activeSeconds: 0, heatingSeconds: 0, sent: emptyParcel() },
        accept: 0,
        inbox: emptyParcel(),
        down: false
      };
      // What it starts holding at, so a unit's temperature reads sensibly before liquid arrives.
      u.hold.tempC = fromPipesIn.tempC ?? designStock.tempC ?? AMBIENT_C;

      if (role === 'feed') {
        const props = { ...pipeStock(this.outEdges.get(node.id)) };
        const own = compositionOf(node.config);
        if (own && Object.keys(own).length) props.comp = own;
        // What the feed says it supplies wins over what its pipe says.
        const liquid = feedLiquid(node);
        if (liquid.temperatureC !== undefined) props.tempC = liquid.temperatureC;
        if (liquid.densityGPerCm3 !== undefined) props.density = liquid.densityGPerCm3;
        if (liquid.specificHeatKjPerKgK !== undefined) props.cp = liquid.specificHeatKjPerKgK;
        // A gas feed with no density of its own is an ideal gas at its temperature.
        const gas = liquid.densityGPerCm3 === undefined ? feedGasDensityGPerCm3(node, props.tempC ?? AMBIENT_C) : undefined;
        if (gas !== undefined) props.density = gas;
        if (gas !== undefined && liquid.specificHeatKjPerKgK === undefined) props.cp = 1.006;
        u.feedStock = stock(1, props);
        u.hold.tempC = u.feedStock.tempC;
        // Supply stated as a mass flow (kg/h, or SCFM for a gas) wins over gal/min.
        const kgPerS = feedMassSupplyKgPerS(node);
        const gpm = terminalSupplyRate(node);
        u.supply = kgPerS !== undefined ? kgPerS / densityOf(u.feedStock) : gpm > 0 ? (gpm * M3_PER_GALLON) / 60 : Infinity;
      } else if (b?.mode === 'STORAGE') {
        u.capacity = b.capacityGallons * M3_PER_GALLON;
        const props = { ...fromPipesIn, ...designStock };
        if (designStock.tempC === undefined && fromPipesIn.tempC !== undefined) props.tempC = fromPipesIn.tempC;
        u.hold = stock(Math.min(b.initialGallons, b.capacityGallons) * M3_PER_GALLON, props);
        if (u.hold.m3 <= 0) u.hold.comp = {};
        if (b.maxOutflowGpm !== undefined) u.maxOut = (b.maxOutflowGpm * M3_PER_GALLON) / 60;
      } else if (b?.mode === 'BATCH') {
        u.capacity = Math.max(EPS_M3, b.batchGallons * M3_PER_GALLON);
        u.hold.tempC = designStock.tempC ?? AMBIENT_C;
      } else if (role === 'drawer' && b?.mode === 'DISCRETE_CYCLE') {
        u.perCycle = (b.liquidPerCycleGallons ?? 0) * M3_PER_GALLON;
        // The bowl holds two cycles' worth, so the next cycle can be ready.
        u.capacity = Math.max(EPS_M3, u.perCycle * 2);
      } else if (role === 'pass' && ev && !ev.error) {
        u.live = liveOf(ev);
      }
      this.units.set(node.id, u);
    }
    this.order = this.topologicalOrder();
    for (const u of this.units.values()) if (u.role === 'batch') this.startPhase(u, 0, 0);
  }

  /** True when there is any liquid to step. */
  get active(): boolean {
    return this.units.size > 0;
  }

  /** A cycle unit fed by a pipe waits for its liquid; one without cycles on its own. */
  isDrawer(nodeId: string): boolean {
    return this.units.get(nodeId)?.role === 'drawer';
  }

  /** Whether a drawer's bowl holds one cycle's liquid. */
  cycleReady(nodeId: string): boolean {
    const u = this.units.get(nodeId);
    return !u || u.role !== 'drawer' || u.hold.m3 + 1e-9 >= (u.perCycle ?? 0);
  }

  /** Takes one cycle's liquid out of a drawer's bowl. */
  drawCycle(nodeId: string): void {
    const u = this.units.get(nodeId);
    if (u?.role === 'drawer') takeFrom(u.hold, u.perCycle ?? 0);
  }

  /** A breakdown: the unit passes nothing until it is repaired, and a batch's clock stops. */
  setDown(nodeId: string, down: boolean): void {
    const u = this.units.get(nodeId);
    if (u) u.down = down;
  }

  // ------------------------------------------------------------ batch units

  /**
   * Starts a batch unit's phase: evaluates the contract at the batch as it is
   * now (batch.gallons, batch.temperatureC, batch.massKg, ...), so the phase's
   * amounts and times follow from the physics of this batch.
   */
  private startPhase(u: MaterialUnit, index: number, now: number): void {
    const ev = evaluateUnitOp(u.contract!, {
      batch: {
        gallons: u.hold.m3 / M3_PER_GALLON,
        temperatureC: u.hold.tempC,
        massKg: u.hold.kg,
        number: u.batches + 1,
        cpKjPerKgK: u.hold.cp,
        composition: u.hold.comp
      }
    });
    const run = u.run!;
    run.evaluations++;
    const declared = (u.contract!.behavior as { phases: { name: string; kind: EvaluatedBatchPhase['kind']; react?: boolean }[] }).phases[index]!;
    let phase: EvaluatedBatchPhase = { name: declared.name, kind: declared.kind };
    if (ev.error) {
      if (!run.firstError) run.firstError = `${ev.error.path}: ${ev.error.message}`;
      // The phase is skipped (nothing to move, no time); the next one is tried.
      phase = { ...phase, ...(declared.kind === 'HOLD' ? { seconds: 0 } : { gallons: 0 }) };
    } else if (ev.behavior.mode === 'BATCH') {
      phase = ev.behavior.phases[index] ?? phase;
    }
    const target =
      phase.kind === 'FILL'
        ? phase.gallons !== undefined
          ? phase.gallons * M3_PER_GALLON
          : Math.max(0, u.capacity - u.hold.m3)
        : phase.kind === 'DRAIN'
          ? phase.gallons !== undefined
            ? phase.gallons * M3_PER_GALLON
            : u.hold.m3
          : 0;
    u.batchRun = {
      index,
      phase,
      moved: 0,
      target,
      startedAt: now,
      elapsed: 0,
      ...(phase.kind === 'HOLD' ? { endsAt: phase.seconds ?? 0 } : {}),
      startTempC: u.hold.tempC,
      broken: ev.error ? [] : ev.constraints.filter((c) => !c.satisfied).map((c) => ({ id: c.id, message: c.message, severity: c.severity })),
      ...(!ev.error && declared.react ? { reactions: ev.reactions } : {}),
      secondsByPhase: u.batchRun?.secondsByPhase ?? {},
      dutyKwh: 0
    };
    // A HOLD of no time (a batch already at temperature, a heater with no
    // duty) takes effect at once rather than costing a tick. A batch always has
    // a FILL and a DRAIN, so this cannot loop.
    if (phase.kind === 'HOLD' && !((phase.seconds ?? 0) > 0)) this.finishHold(u, now);
  }

  /** The next phase, or the first again once a batch is done. */
  private nextPhase(u: MaterialUnit, now: number): void {
    const phases = (u.contract!.behavior as { phases: unknown[] }).phases;
    let next = u.batchRun!.index + 1;
    if (next >= phases.length) {
      next = 0;
      u.batches++;
    }
    this.startPhase(u, next, now);
  }

  /** A HOLD ends: the batch is at its temperature, its reactions have run, and the next phase starts. */
  private finishHold(u: MaterialUnit, now: number): void {
    const run = u.batchRun!;
    const ph = run.phase;
    if (ph.temperatureC !== undefined) {
      const neededKwh = (u.hold.kg * u.hold.cp * Math.abs(ph.temperatureC - run.startTempC)) / 3600;
      // A change of temperature with no duty stated still took heat: m·cp·ΔT.
      if (!ph.dutyKw && neededKwh > 1e-9) u.heat.energyKwh += neededKwh;
      // With a duty, the phase's time should be what that duty takes to move
      // this batch: duty × time = m·cp·ΔT. When it is not, the contract's time
      // does not follow from what is in the vessel (a cp of its own, say).
      if (ph.dutyKw && neededKwh > 1e-6 && Math.abs(run.dutyKwh - neededKwh) > 0.05 * neededKwh) {
        const t = u.run!.heatBalance[ph.name];
        const worse = !t || Math.abs(run.dutyKwh - neededKwh) / neededKwh > Math.abs(t.deliveredKwh - t.neededKwh) / t.neededKwh;
        u.run!.heatBalance[ph.name] = {
          deliveredKwh: worse ? run.dutyKwh : t!.deliveredKwh,
          neededKwh: worse ? neededKwh : t!.neededKwh,
          batches: (t?.batches ?? 0) + 1
        };
      }
      u.hold.tempC = ph.temperatureC;
    }
    if (run.reactions?.length) {
      const r = react(u.hold.comp, run.reactions);
      u.hold.comp = r.composition;
      for (const id of r.short) u.run!.shortReactions[id] = (u.run!.shortReactions[id] ?? 0) + 1;
    }
    this.nextPhase(u, now);
  }

  /** A batch unit's phase, as far as this tick goes: time, heat, self-charging. */
  private stepBatch(u: MaterialUnit, now: number, dt: number): void {
    const run = u.batchRun!;
    if (u.down) return;
    run.secondsByPhase[run.phase.name] = (run.secondsByPhase[run.phase.name] ?? 0) + dt;
    for (const b of run.broken) {
      const t = u.run!.broken[b.id] ?? (u.run!.broken[b.id] = { message: b.message, severity: b.severity, seconds: 0 });
      t.seconds += dt;
    }
    const ph = run.phase;
    if (ph.kind === 'HOLD') {
      const span = run.endsAt ?? 0;
      const spent = Math.max(0, Math.min(dt, span - run.elapsed));
      run.elapsed += dt;
      const heats = ph.temperatureC !== undefined && Math.abs(ph.temperatureC - run.startTempC) > 1e-9;
      if (heats) u.heat.heatingSeconds += spent;
      if (ph.dutyKw) {
        u.heat.energyKwh += (ph.dutyKw * spent) / 3600;
        u.heat.activeSeconds += spent;
        run.dutyKwh += (ph.dutyKw * spent) / 3600;
      }
      if (ph.temperatureC !== undefined) {
        const f = Math.min(1, run.elapsed / Math.max(1e-9, span));
        u.hold.tempC = run.startTempC + (ph.temperatureC - run.startTempC) * f;
      }
      if (run.elapsed >= span - 1e-9) this.finishHold(u, now);
      return;
    }
    if (ph.kind === 'FILL' && !this.inEdges.has(u.id)) {
      // No feed pipe: it charges itself (its raw materials are not modelled).
      const design = u.contract!.designInlet;
      const rate = ((ph.rateGpm ?? design?.volumetricFlowGpm ?? 50) * M3_PER_GALLON) / 60;
      const add = Math.max(0, Math.min(u.capacity - u.hold.m3, run.target - run.moved, rate * dt));
      const parcel = stock(add, {
        tempC: design?.temperatureC ?? AMBIENT_C,
        ...(design?.densityGPerCm3 ? { density: design.densityGPerCm3 } : {}),
        ...(design?.specificHeatKjPerKgK ? { cp: design.specificHeatKjPerKgK } : {}),
        comp: design?.composition ? normalise(design.composition) : u.hold.comp
      });
      mixInto(u.hold, parcel);
      mixInto(u.received, parcel);
      u.inRate = add / dt;
      run.moved += add;
    }
  }

  // ------------------------------------------------------- continuous units

  /**
   * A pass-through mixes this tick's arrivals into what it carries over,
   * after evaluating its contract at what arrived: capacity, duty, outlet
   * shares and temperatures follow the live stream, and every constraint it
   * breaks is timed. A failed evaluation keeps the last good one and is reported.
   */
  private condition(u: MaterialUnit, dt: number): void {
    if (u.inbox.m3 <= EPS_M3) return;
    if (u.contract) this.evaluateLive(u, dt);
    mixInto(u.hold, u.inbox);
    const reactions = u.live?.reactions;
    if (reactions?.length) {
      const r = react(u.hold.comp, reactions);
      u.hold.comp = r.composition;
      for (const id of r.short) u.run!.shortReactions[id] = (u.run!.shortReactions[id] ?? 0) + dt;
    }
  }

  private evaluateLive(u: MaterialUnit, dt: number): void {
    const p = u.inbox;
    const run = u.run!;
    const ev = evaluateUnitOp(u.contract!, {
      inlet: {
        temperatureC: p.tempC,
        volumetricFlowGpm: (p.m3 / dt / M3_PER_GALLON) * 60,
        massFlowKgPerS: p.kg / dt,
        densityGPerCm3: densityOf(p) / 1000,
        specificHeatKjPerKgK: p.cp,
        ...(Object.keys(p.comp).length ? { composition: p.comp } : {})
      }
    });
    run.evaluations++;
    if (ev.error) {
      run.errorSeconds += dt;
      if (!run.firstError) run.firstError = `${ev.error.path}: ${ev.error.message}`;
      return;
    }
    for (const c of ev.constraints) {
      if (c.satisfied) continue;
      const t = run.broken[c.id] ?? (run.broken[c.id] = { message: c.message, severity: c.severity, seconds: 0 });
      t.seconds += dt;
    }
    u.live = liveOf(ev);
    const duty = u.live.dutyKw;
    if (duty !== undefined) {
      u.heat.energyKwh += (Math.abs(duty) * dt) / 3600;
      u.heat.activeSeconds += dt;
    }
  }

  private topologicalOrder(): string[] {
    const ids = [...this.units.keys()];
    const indegree = new Map(ids.map((id) => [id, 0]));
    for (const e of this.edges) {
      if (this.units.has(e.sourceNodeId) && indegree.has(e.targetNodeId)) indegree.set(e.targetNodeId, indegree.get(e.targetNodeId)! + 1);
    }
    const ready = ids.filter((id) => indegree.get(id) === 0);
    const out: string[] = [];
    while (ready.length) {
      const id = ready.shift()!;
      out.push(id);
      for (const e of this.outEdges.get(id) ?? []) {
        if (!indegree.has(e.targetNodeId)) continue;
        const d = indegree.get(e.targetNodeId)! - 1;
        indegree.set(e.targetNodeId, d);
        if (d === 0) ready.push(e.targetNodeId);
      }
    }
    // A recycle loop: step its members in graph order rather than drop them.
    for (const id of ids) if (!out.includes(id)) out.push(id);
    return out;
  }

  private pipedPorts(u: MaterialUnit): Map<string, ProcessEdge[]> {
    const piped = new Map<string, ProcessEdge[]>();
    for (const e of this.outEdges.get(u.id) ?? []) {
      if (!this.units.has(e.targetNodeId)) continue;
      const list = piped.get(e.sourcePortId) ?? [];
      list.push(e);
      piped.set(e.sourcePortId, list);
    }
    return piped;
  }

  private hasOutletPlan(u: MaterialUnit): boolean {
    return Boolean(u.live && Object.keys(u.live.outlets).length);
  }

  /**
   * Where a unit's outflow goes: by its contract's outlet plan when it has
   * one, else evenly to every pipe. `unpipedShare` leaves the line through a
   * declared outlet with no pipe; `lossShare` is what no outlet takes.
   */
  private split(u: MaterialUnit): SplitPlan {
    const piped = this.pipedPorts(u);
    if (!this.hasOutletPlan(u)) {
      const edges = [...piped.values()].flat();
      return { outs: edges.map((e) => ({ target: this.units.get(e.targetNodeId)!, port: e.sourcePortId, share: 1 / edges.length })), unpipedShare: 0, lossShare: 0, unpiped: [] };
    }
    const plan = u.live!.outlets;
    if (Object.values(plan).some((o) => o.recovery)) return this.recoverySplit(u, piped);
    const declared = Object.values(plan).reduce((sum, o) => sum + (o.share ?? 0), 0);
    const open = [...piped.keys()].filter((port) => plan[port]?.share === undefined);
    const rest = Math.max(0, 1 - declared);
    const outs: Outlet[] = [];
    let pipedShare = 0;
    for (const [port, list] of piped) {
      const share = plan[port]?.share ?? (open.length ? rest / open.length : 0);
      pipedShare += share;
      const temp = plan[port]?.temperatureC;
      for (const e of list) outs.push({ target: this.units.get(e.targetNodeId)!, port, share: share / list.length, ...(temp !== undefined ? { temp } : {}) });
    }
    const unpiped = Object.entries(plan)
      .filter(([port, o]) => !piped.has(port) && (o.share ?? 0) > 0)
      .map(([port, o]) => ({ port, share: o.share!, ...(o.temperatureC !== undefined ? { temp: o.temperatureC } : {}) }));
    const unpipedShare = unpiped.reduce((sum, o) => sum + o.share, 0);
    return { outs, unpipedShare, lossShare: Math.max(0, 1 - pipedShare - unpipedShare), unpiped };
  }

  /**
   * Separation by component: each component's mass goes to the ports that
   * recover it; ports that do not name it split what is left; the rest is
   * lost. Each port's flow and composition follow from the mass it gets.
   */
  private recoverySplit(u: MaterialUnit, piped: Map<string, ProcessEdge[]>): SplitPlan {
    const plan = u.live!.outlets;
    const ports = [...new Set([...Object.keys(plan), ...piped.keys()])];
    const mass: Record<string, Composition> = Object.fromEntries(ports.map((p) => [p, {}]));
    for (const [c, f] of Object.entries(normalise(u.hold.comp))) {
      const declared = ports.filter((p) => plan[p]?.recovery?.[c] !== undefined);
      const taken = declared.reduce((a, p) => a + plan[p]!.recovery![c]!, 0);
      for (const p of declared) mass[p]![c] = f * plan[p]!.recovery![c]!;
      const open = ports.filter((p) => piped.has(p) && plan[p]?.recovery?.[c] === undefined);
      for (const p of open) mass[p]![c] = (f * Math.max(0, 1 - taken)) / open.length;
    }
    const outs: Outlet[] = [];
    let pipedShare = 0;
    let unpipedShare = 0;
    const unpiped: SplitPlan['unpiped'] = [];
    for (const p of ports) {
      const share = Object.values(mass[p]!).reduce((a, v) => a + v, 0);
      if (!piped.has(p)) {
        unpipedShare += share;
        if (share > 0) unpiped.push({ port: p, share, comp: normalise(mass[p]), ...(plan[p]?.temperatureC !== undefined ? { temp: plan[p]!.temperatureC } : {}) });
        continue;
      }
      pipedShare += share;
      const list = piped.get(p)!;
      const temp = plan[p]?.temperatureC;
      const comp = normalise(mass[p]);
      for (const e of list) outs.push({ target: this.units.get(e.targetNodeId)!, port: p, share: share / list.length, comp, ...(temp !== undefined ? { temp } : {}) });
    }
    return { outs, unpipedShare, lossShare: Math.max(0, 1 - pipedShare - unpipedShare), unpiped };
  }

  /** A batch unit's outlets while it drains: one port if the phase names it, else by its outlet plan. */
  private batchSplit(u: MaterialUnit): SplitPlan {
    const port = u.batchRun?.phase.port;
    if (!port) return this.split(u);
    const edges = (this.outEdges.get(u.id) ?? []).filter((e) => e.sourcePortId === port && this.units.has(e.targetNodeId));
    return {
      outs: edges.map((e) => ({ target: this.units.get(e.targetNodeId)!, port, share: 1 / edges.length })),
      unpipedShare: edges.length === 0 ? 1 : 0,
      lossShare: 0,
      unpiped: edges.length === 0 ? [{ port, share: 1 }] : []
    };
  }

  /** The design flow of a unit's outlet pipes, m³/s (45 gal/min each by default). */
  private pipeDesignRate(u: MaterialUnit): number {
    const gpm = (this.outEdges.get(u.id) ?? []).reduce((sum, e) => {
      const g = (e.stream as { designFlowRateGpm?: unknown }).designFlowRateGpm;
      return sum + (typeof g === 'number' && g > 0 ? g : 45);
    }, 0);
    return (gpm * M3_PER_GALLON) / 60;
  }

  /** Delivers a parcel to a unit: into a pass-through's inbox, or mixed into what it holds. */
  private receive(target: MaterialUnit, parcel: Parcel, dt: number): void {
    mixInto(target.received, parcel);
    target.inRate += parcel.m3 / dt;
    if (target.role === 'pass') mixInto(target.inbox, parcel);
    else mixInto(target.hold, parcel);
    if (target.role === 'batch') target.batchRun!.moved += parcel.m3;
  }

  /** Advances the liquid by `dt` seconds, ending at time `now`. */
  tick(now: number, dt: number): void {
    for (const u of this.units.values()) {
      u.inbox = emptyParcel();
      u.inRate = 0;
      u.outRate = 0;
      if (u.role === 'batch') this.stepBatch(u, now, dt);
    }

    // Backward pass: what each unit can take this tick (m³).
    for (let i = this.order.length - 1; i >= 0; i--) {
      const u = this.units.get(this.order[i]!)!;
      if (u.down) {
        u.accept = 0;
        continue;
      }
      switch (u.role) {
        case 'storage':
        case 'drawer':
          u.accept = Math.max(0, u.capacity - u.hold.m3);
          break;
        case 'sink':
          u.accept = Infinity;
          break;
        case 'feed':
          u.accept = 0;
          break;
        case 'batch': {
          const run = u.batchRun!;
          const rate = run.phase.rateGpm !== undefined ? ((run.phase.rateGpm * M3_PER_GALLON) / 60) * dt : Infinity;
          u.accept = run.phase.kind === 'FILL' && this.inEdges.has(u.id) ? Math.max(0, Math.min(u.capacity - u.hold.m3, run.target - run.moved, rate)) : 0;
          break;
        }
        case 'pass': {
          const { outs } = this.split(u);
          const downstream = outs.length
            ? Math.min(...outs.map((o) => (o.share > 0 ? o.target.accept / o.share : Infinity)))
            : this.outEdges.has(u.id)
              ? 0 // piped into a unit that takes no liquid
              : Infinity; // nothing downstream: it leaves the line
          const cap = (u.live?.capacity ?? Infinity) * dt;
          u.accept = Math.max(0, Math.min(cap, downstream) - u.hold.m3);
          break;
        }
      }
    }

    // Forward pass: send what each unit offers, within what each target takes.
    const remaining = new Map([...this.units.values()].map((u) => [u.id, u.accept]));
    for (const id of this.order) {
      const u = this.units.get(id)!;
      if (u.down) continue;
      let offer = 0;
      let source: Parcel = u.hold;
      if (u.role === 'batch' && u.batchRun!.phase.kind === 'DRAIN') {
        const run = u.batchRun!;
        // With no rate set, it drains as fast as its outlet pipes' design flow.
        const rate = run.phase.rateGpm !== undefined ? ((run.phase.rateGpm * M3_PER_GALLON) / 60) * dt : this.outEdges.has(u.id) ? this.pipeDesignRate(u) * dt : Infinity;
        offer = Math.max(0, Math.min(u.hold.m3, run.target - run.moved, rate));
      } else if (u.role === 'storage' && this.outEdges.has(u.id)) {
        offer = Math.min(u.hold.m3, u.maxOut !== undefined ? u.maxOut * dt : Infinity);
      } else if (u.role === 'pass') {
        this.condition(u, dt);
        offer = u.hold.m3;
      } else if (u.role === 'feed') {
        offer = Number.isFinite(u.supply!) ? u.supply! * dt : Infinity;
        source = { ...u.feedStock!, kg: Infinity, m3: Infinity };
      }
      if (offer <= EPS_M3) continue;

      const plan = u.role === 'batch' ? this.batchSplit(u) : this.split(u);
      const outs = plan.outs;
      let sent = 0;
      if (outs.length === 0) {
        // No liquid outlet. A unit at the end of a line sends its liquid out of
        // the line; one piped into a unit that takes no liquid cannot send
        // anything. A batch draining to an unpiped port empties out of the line.
        if (!this.outEdges.has(u.id) || (u.role === 'batch' && plan.unpipedShare > 0)) {
          sent = Number.isFinite(offer) ? offer : 0;
          const parcel = this.take(u, source, sent);
          mixInto(u.leftLine, parcel);
          mixInto(u.heat.sent, parcel);
          mixInto(u.delivered, parcel);
          // Out of the line by its declared ports, in their proportions.
          const declared = plan.unpiped.reduce((a, x) => a + x.share, 0);
          for (const x of plan.unpiped) {
            const f = declared > 0 ? x.share / declared : 0;
            tallyPort(u, x.port, { ...parcel, kg: parcel.kg * f, m3: parcel.m3 * f, ...(x.comp ? { comp: x.comp } : {}), ...(x.temp !== undefined ? { tempC: x.temp } : {}) });
          }
        }
      } else {
        // Largest total that respects every outlet's share and room.
        let total = Math.min(offer, ...outs.map((o) => (o.share > 0 ? remaining.get(o.target.id)! / o.share : Infinity)));
        // A feed with no supply rate into units with no limit of their own
        // (an unrated mixer, an outlet): the pipes' design flow is the limit.
        if (!Number.isFinite(total)) total = this.pipeDesignRate(u) * dt;
        const parcel = this.take(u, source, total);
        const kgPerM3 = parcel.m3 > 0 ? parcel.kg / parcel.m3 : 0;
        for (const o of outs) {
          const v = total * o.share;
          if (v <= 0) continue;
          remaining.set(o.target.id, remaining.get(o.target.id)! - v);
          const piece: Parcel = { kg: v * kgPerM3, m3: v, tempC: o.temp ?? parcel.tempC, cp: parcel.cp, comp: o.comp ?? { ...parcel.comp } };
          this.receive(o.target, piece, dt);
          mixInto(u.heat.sent, piece);
          tallyPort(u, o.port, piece);
        }
        if (this.hasOutletPlan(u) && !u.batchRun?.phase.port) {
          // A declared outlet with no pipe leaves the line; the unclaimed remainder is lost.
          const scale = (f: number): Parcel => ({ ...parcel, kg: parcel.kg * f, m3: parcel.m3 * f, comp: { ...parcel.comp } });
          if (plan.unpipedShare > 0) mixInto(u.leftLine, scale(plan.unpipedShare));
          for (const x of plan.unpiped) tallyPort(u, x.port, { ...scale(x.share), ...(x.comp ? { comp: x.comp } : {}), ...(x.temp !== undefined ? { tempC: x.temp } : {}) });
          if (plan.lossShare > 0) mixInto(u.lost, scale(plan.lossShare));
        }
        mixInto(u.delivered, parcel);
        sent = total;
      }
      u.outRate = sent / dt;
      if (u.role === 'batch') u.batchRun!.moved += sent;
    }

    // Batch phase changes that follow from contents.
    for (const u of this.units.values()) {
      if (u.role !== 'batch' || u.down) continue;
      const run = u.batchRun!;
      const done =
        run.phase.kind === 'FILL'
          ? run.moved >= run.target - 1e-9 || u.hold.m3 >= u.capacity - 1e-9
          : run.phase.kind === 'DRAIN'
            ? run.moved >= run.target - 1e-9 || u.hold.m3 <= EPS_M3
            : false;
      if (done) this.nextPhase(u, now);
    }
  }

  /** Takes `m3` from what a unit offers: its holdup, or a feed's endless stock. */
  private take(u: MaterialUnit, source: Parcel, m3: number): Parcel {
    if (u.role === 'feed') return stock(m3, { tempC: source.tempC, density: densityOf(u.feedStock!) / 1000, cp: source.cp, comp: source.comp });
    return takeFrom(u.hold, m3);
  }

  /** The operating state a unit's liquid implies. Drawers are the engine's to set. */
  stateOf(u: MaterialUnit): MachineOperationalState {
    const flowing = (r: number) => r * 60 > 1e-9;
    switch (u.role) {
      case 'batch': {
        const kind = u.batchRun!.phase.kind;
        if (kind === 'HOLD') return 'BUSY';
        if (kind === 'DRAIN') return flowing(u.outRate) ? 'BUSY' : 'BLOCKED';
        return flowing(u.inRate) ? 'BUSY' : 'STARVED';
      }
      case 'storage':
        if (!this.outEdges.has(u.id)) return flowing(u.inRate) ? 'BUSY' : 'IDLE';
        if (flowing(u.outRate)) return 'BUSY';
        return u.hold.m3 <= EPS_M3 ? 'STARVED' : 'BLOCKED';
      case 'pass':
        if (flowing(u.outRate)) return 'BUSY';
        return u.hold.m3 > EPS_M3 ? 'BLOCKED' : 'STARVED';
      case 'feed':
        return flowing(u.outRate) ? 'BUSY' : 'IDLE';
      case 'sink':
        return flowing(u.inRate) ? 'BUSY' : 'IDLE';
      default:
        return 'IDLE';
    }
  }
}

/** What a continuous contract evaluates to, in the terms the liquid step uses. */
function liveOf(ev: UnitOpEvaluation): LiveContract {
  const b = ev.behavior;
  const live: LiveContract = { capacity: Infinity, outlets: ev.outlets ?? {}, ...(ev.reactions?.length ? { reactions: ev.reactions } : {}) };
  if (b.mode === 'CONTINUOUS_RATE') {
    if (b.capacityGpm !== undefined) live.capacity = (Math.max(0, b.capacityGpm) * M3_PER_GALLON) / 60;
    if (b.dutyKw !== undefined) live.dutyKw = b.dutyKw;
  }
  return live;
}

/** Gallons of a parcel. */
export const gallonsOf = (p: Parcel) => p.m3 / M3_PER_GALLON;
