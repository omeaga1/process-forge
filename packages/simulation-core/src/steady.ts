import { edgePhase, type ProcessGraph } from '@process-forge/protocol';
import { prepareContracts } from './engine.js';
import { M3_PER_GALLON, MaterialNetwork, liquidM3, type MaterialUnit, type Parcel } from './material.js';
import { isFluidEdge } from './roles.js';
import { isThermalContract, judgeUnitEnergy, type UnitEnergyBalance } from './balance.js';

/**
 * The line's steady state, solved rather than waited for.
 *
 * Not a second engine: it steps the same material network the dynamic run
 * steps (material.ts), with what the dynamic run's own clock adds taken away:
 * tanks start empty, and nothing waits on an item event. Each step sends every
 * unit's stream on in flow order, so on a line without recycles one sweep
 * reaches steady state, as a sequential-modular simulator's does. A recycle
 * arrives at the unit it returns to after that unit has stepped (the network
 * keeps it for the next step: material.ts `late`); those arrivals are this
 * solve's tear streams, and they are accelerated by bounded Wegstein, the
 * method Aspen Plus defaults to for tears (q held to −5..0, two direct
 * substitutions before the first acceleration).
 *
 * Converged when no stream (kg/s of each component, heat content) moves by
 * more than the tolerance (relative, 1e-6) for three steps running. Because
 * it is the same network, the steady state it finds is the one a long enough
 * dynamic run settles to, and it reports the same stream table, duties,
 * checks and balance, in a few milliseconds.
 *
 * What it does not do: batch units and cycle units that draw liquid run in
 * cycles, so a line with them has no steady state in this sense (the dynamic
 * run averages them). A tank whose outflow cannot keep up with what reaches it
 * fills without end: that is reported (how fast, and when it is full), not
 * waited for.
 */

export interface SteadyStream {
  id: string;
  number: string;
  from: string;
  to: string;
  phase: 'LIQUID' | 'GAS' | 'SOLID' | 'ITEMS';
  kgPerHour: number;
  gpm?: number;
  temperatureC?: number;
  composition?: Record<string, number>;
}

export interface SteadyUnit {
  nodeId: string;
  name: string;
  role: string;
  inKgPerHour: number;
  outKgPerHour: number;
  outletTemperatureC?: number;
  dutyKw?: number;
  /** Of its rated flow, at this steady state. */
  capacityUsedPercent?: number;
  /** Its contract's checks that fail at this steady state. */
  failingChecks?: { id: string; severity: 'ERROR' | 'WARNING'; message: string }[];
  /** A tank: kg it holds, and kg/h it gains (zero at steady state). */
  holdKg?: number;
  fillingKgPerHour?: number;
}

export interface SteadyResult {
  status: 'converged' | 'not-converged' | 'no-steady-state' | 'not-applicable';
  message: string;
  iterations: number;
  /** Units a recycle returns to, whose inlets were the tear streams. */
  tears: string[];
  /** Largest relative change of any stream at each step (every step up to 60, then every tenth). */
  history: { iteration: number; maxRelativeChange: number; stream?: string }[];
  /** How the tears behaved: settled, settling slowly, oscillating, or growing. */
  pattern?: 'settled' | 'slow' | 'oscillating' | 'diverging';
  streams: SteadyStream[];
  units: SteadyUnit[];
  /** Mass in and out per hour, and how far apart they are. */
  massBalance: { inKgPerHour: number; outKgPerHour: number; accumulatingKgPerHour: number };
  energy: UnitEnergyBalance[];
  elapsedMs: number;
}

export interface SteadyOptions {
  /** Relative change below which a stream has settled (default 1e-6). */
  tolerance?: number;
  maxIterations?: number;
  /** Wegstein on the tear streams (default true). */
  accelerate?: boolean;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

/** kg of each component of a parcel, with mass of no stated kind under "unspecified". */
function componentsOf(p: Parcel): Record<string, number> {
  const out: Record<string, number> = {};
  let stated = 0;
  for (const [c, f] of Object.entries(p.comp)) {
    if (!(f > 0)) continue;
    out[c] = f * p.kg;
    stated += f;
  }
  const rest = Math.max(0, 1 - stated) * p.kg;
  if (rest > 1e-15) out['unspecified'] = rest;
  return out;
}

/** The numbers a stream is judged settled by: kg/s of each component, and its heat content. */
function vectorOf(units: Map<string, MaterialUnit>): Map<string, number> {
  const v = new Map<string, number>();
  for (const u of units.values()) {
    for (const [port, p] of Object.entries(u.tickPort)) {
      const key = `${u.id}:${port}`;
      for (const [c, kg] of Object.entries(componentsOf(p))) v.set(`${key}:${c}`, kg);
      v.set(`${key}:H`, p.kg * p.cp * p.tempC);
    }
  }
  return v;
}

/** One late parcel as numbers Wegstein can step: kg of each component, heat, volume, gas. */
type TearVec = Record<string, number>;
const tearVec = (p: Parcel): TearVec => ({ ...Object.fromEntries(Object.entries(componentsOf(p)).map(([c, kg]) => [`c:${c}`, kg])), H: p.kg * p.cp * p.tempC, m3: p.m3, gasKg: p.gasKg ?? 0, gasM3: p.gasM3 ?? 0 });

function parcelFrom(v: TearVec, like: Parcel): Parcel {
  const comps = Object.entries(v).filter(([k]) => k.startsWith('c:')).map(([k, kg]) => [k.slice(2), Math.max(0, kg)] as const);
  const kg = comps.reduce((a, [, x]) => a + x, 0);
  const comp = Object.fromEntries(comps.filter(([c, x]) => c !== 'unspecified' && x > 0).map(([c, x]) => [c, kg > 0 ? x / kg : 0]));
  const cp = like.cp > 0 ? like.cp : 4.186;
  const m3 = Math.max(0, v.m3 ?? 0);
  const out: Parcel = { kg, m3, tempC: kg > 0 ? (v.H ?? 0) / (kg * cp) : like.tempC, cp, comp, ...(like.offSpec ? { offSpec: like.offSpec } : {}) };
  if ((v.gasM3 ?? 0) > 0 || (v.gasKg ?? 0) > 0) {
    out.gasM3 = Math.min(m3, Math.max(0, v.gasM3 ?? 0));
    out.gasKg = Math.min(kg, Math.max(0, v.gasKg ?? 0));
  }
  return out;
}

const QMIN = -5;
const QMAX = 0;

export function solveSteadyState(graph: ProcessGraph, options: SteadyOptions = {}): SteadyResult {
  const t0 = performance.now();
  const tol = options.tolerance ?? 1e-6;
  const maxIter = Math.max(10, Math.min(options.maxIterations ?? 4000, 50000));
  const empty = (status: SteadyResult['status'], message: string): SteadyResult => ({
    status,
    message,
    iterations: 0,
    tears: [],
    history: [],
    streams: [],
    units: [],
    massBalance: { inKgPerHour: 0, outKgPerHour: 0, accumulatingKgPerHour: 0 },
    energy: [],
    elapsedMs: Math.round(performance.now() - t0)
  });

  const { contracts, evaluations } = prepareContracts(graph);
  const net = new MaterialNetwork(graph, contracts, evaluations);
  const units = net.units;
  const cyclic = [...units.values()].filter((u) => u.role === 'batch' || u.role === 'drawer');
  if (cyclic.length) {
    const names = cyclic.map((u) => u.node.name).join(', ');
    return empty('not-applicable', `${names} run${cyclic.length === 1 ? 's' : ''} in cycles (a batch, or a machine that draws liquid per cycle), so the line has no steady state to solve: use simulate_process_line, which averages the cycles.`);
  }
  if (![...units.values()].some((u) => u.role === 'feed')) {
    return empty('not-applicable', 'Nothing feeds liquid, gas or solids into this line, so there is no stream to solve. Items lines are read with simulate_process_line and diagnose_bottlenecks.');
  }
  // Tanks start empty: what a tank held at the start is the dynamic run's business, not the steady state's.
  for (const u of units.values()) {
    if (u.role === 'storage') {
      u.hold = { kg: 0, m3: 0, tempC: u.hold.tempC, cp: u.hold.cp, comp: {} };
      u.startHold = { ...u.hold, comp: {} };
    }
  }

  const tearUnits = new Set<string>();
  // Wegstein memory per tear (unit:port): what was fed in, and what came back, at the last step.
  const prevFed = new Map<string, TearVec>();
  const prevGot = new Map<string, TearVec>();
  let directSteps = 0;
  const history: SteadyResult['history'] = [];
  let prev = new Map<string, number>();
  let settledRun = 0;
  let k = 0;
  let converged = false;
  const errs: number[] = [];
  const minIter = units.size + 3;

  for (k = 1; k <= maxIter; k++) {
    net.tick(k, 1);
    // The tears: arrivals a unit received after it had stepped.
    const lates = [...units.values()].filter((u) => u.late);
    for (const u of lates) tearUnits.add(u.node.name);
    if (options.accelerate !== false && lates.length) {
      directSteps++;
      for (const u of lates) {
        const late = u.late!;
        const ports = Object.keys(late.byPort).length ? Object.entries(late.byPort) : [['', late.inbox] as const];
        const rebuilt: Record<string, Parcel> = {};
        for (const [port, got] of ports) {
          const key = `${u.id}:${port}`;
          const g = tearVec(got);
          const fedBefore = prevFed.get(key);
          const gotBefore = prevGot.get(key);
          let x = g;
          if (directSteps > 2 && fedBefore && gotBefore) {
            x = {};
            for (const name of new Set([...Object.keys(g), ...Object.keys(fedBefore)])) {
              const gx = g[name] ?? 0;
              const dx = (fedBefore[name] ?? 0) - (prevFed.get(`${key}#prev`)?.[name] ?? 0);
              const dg = gx - (gotBefore[name] ?? 0);
              let q = 0;
              if (Math.abs(dx) > 1e-15) {
                const s = dg / dx;
                q = Math.abs(s - 1) > 1e-12 ? s / (s - 1) : 0;
              }
              q = Math.min(QMAX, Math.max(QMIN, q));
              x[name] = q * (fedBefore[name] ?? 0) + (1 - q) * gx;
            }
          }
          if (fedBefore) prevFed.set(`${key}#prev`, fedBefore);
          prevFed.set(key, x);
          prevGot.set(key, g);
          rebuilt[port] = parcelFrom(x, got);
        }
        // The inbox is what reached it by every port together.
        if (Object.keys(late.byPort).length) {
          late.byPort = Object.fromEntries(Object.entries(rebuilt));
          const inbox: Parcel = { kg: 0, m3: 0, tempC: late.inbox.tempC, cp: late.inbox.cp, comp: {} };
          let heat = 0;
          const compKg: Record<string, number> = {};
          let gasKg = 0;
          let gasM3 = 0;
          for (const p of Object.values(rebuilt)) {
            inbox.kg += p.kg;
            inbox.m3 += p.m3;
            heat += p.kg * p.cp * p.tempC;
            for (const [c, f] of Object.entries(p.comp)) compKg[c] = (compKg[c] ?? 0) + f * p.kg;
            gasKg += p.gasKg ?? 0;
            gasM3 += p.gasM3 ?? 0;
          }
          if (inbox.kg > 0) {
            const cpMix = Object.values(rebuilt).reduce((a, p) => a + p.kg * p.cp, 0) / inbox.kg;
            inbox.cp = cpMix;
            inbox.tempC = heat / (inbox.kg * cpMix);
            inbox.comp = Object.fromEntries(Object.entries(compKg).map(([c, x]) => [c, x / inbox.kg]));
          }
          if (gasKg > 0 || gasM3 > 0) {
            inbox.gasKg = gasKg;
            inbox.gasM3 = gasM3;
          }
          late.inbox = inbox;
        } else {
          late.inbox = rebuilt['']!;
        }
      }
    }

    const now = vectorOf(units);
    let scale = 0;
    for (const v of now.values()) scale = Math.max(scale, Math.abs(v));
    let worst = 0;
    let worstKey: string | undefined;
    for (const key of new Set([...now.keys(), ...prev.keys()])) {
      const a = now.get(key) ?? 0;
      const b = prev.get(key) ?? 0;
      const e = Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-9 * scale, 1e-15);
      if (e > worst) {
        worst = e;
        worstKey = key;
      }
    }
    prev = now;
    errs.push(worst);
    // A line with nothing left to move repeats "0" until the minimum steps are done: keep the first and the last of those.
    const stillZero = worst === 0 && history[history.length - 1]?.maxRelativeChange === 0;
    if ((k <= 60 || k % 10 === 0) && !stillZero) {
      const [unitId, port] = (worstKey ?? '').split(':');
      const name = unitId ? units.get(unitId)?.node.name : undefined;
      history.push({ iteration: k, maxRelativeChange: Number(worst.toPrecision(3)), ...(name ? { stream: `${name}${port ? ` (${port})` : ''}` } : {}) });
    }
    settledRun = worst <= tol ? settledRun + 1 : 0;
    if (settledRun >= 3 && k >= minIter) {
      converged = true;
      break;
    }
  }
  const iterations = Math.min(k, maxIter);
  if (history.length && history[history.length - 1]!.iteration !== iterations && errs[iterations - 1] === 0) history.push({ iteration: iterations, maxRelativeChange: 0 });

  // At the converged step: every rate, from what moved in one last step (tallies before and after it).
  const before = new Map([...units.values()].map((u) => [u.id, { received: u.received.kg, outflow: u.outflow.kg, leftLine: u.leftLine.kg, lost: u.lost.kg, hold: u.hold.kg + Object.values(u.channelHold).reduce((a, p) => a + p.kg, 0), recvH: heat(u.received), outH: heat(u.outflow), latent: u.latentKj, duty: u.heat.energyKwh, broken: Object.fromEntries(Object.entries(u.run?.broken ?? {}).map(([id, b]) => [id, b.seconds])) }]));
  net.tick(iterations + 1, 1);
  const deltaOf = (u: MaterialUnit) => before.get(u.id)!;

  let inRate = 0;
  let outRate = 0;
  const unitsOut: SteadyUnit[] = [];
  const filling: string[] = [];
  const energy: UnitEnergyBalance[] = [];
  for (const u of units.values()) {
    const b = deltaOf(u);
    const recvKg = u.received.kg - b.received;
    const outKg = u.outflow.kg - b.outflow;
    if (u.role === 'feed') inRate += outKg;
    else if (u.role === 'sink') outRate += recvKg;
    else outRate += u.leftLine.kg - b.leftLine + (u.lost.kg - b.lost);
    if (u.role === 'feed' || u.role === 'sink') continue;
    const holdNow = u.hold.kg + Object.values(u.channelHold).reduce((a, p) => a + p.kg, 0);
    const fill = (holdNow - b.hold) * 3600;
    // The checks its contract fails at this step: their time grew over it.
    const failing = Object.entries(u.run?.broken ?? {})
      .filter(([id, x]) => x.seconds > (b.broken[id] ?? 0))
      .map(([id, x]) => ({ id, severity: x.severity, message: x.message }));
    const outs = Object.values(u.tickPort);
    const outKgS = outs.reduce((a, p) => a + p.kg, 0);
    const outT = outKgS > 0 ? outs.reduce((a, p) => a + p.kg * p.cp * p.tempC, 0) / outs.reduce((a, p) => a + p.kg * p.cp, 0) : undefined;
    const cap = u.live && Number.isFinite(u.live.capacity) && u.live.capacity > 0 ? (liquidM3(u.received) > 0 ? (u.inRate / u.live.capacity) * 100 : 0) : undefined;
    unitsOut.push({
      nodeId: u.id,
      name: u.node.name,
      role: u.role,
      inKgPerHour: r1(recvKg * 3600),
      outKgPerHour: r1(outKg * 3600),
      ...(outT !== undefined ? { outletTemperatureC: r1(outT) } : {}),
      ...(u.live?.dutyKw !== undefined ? { dutyKw: r1(u.live.dutyKw) } : {}),
      ...(cap !== undefined ? { capacityUsedPercent: Math.round(cap) } : {}),
      ...(failing.length ? { failingChecks: failing } : {}),
      ...(u.role === 'storage' ? { holdKg: r1(holdNow), fillingKgPerHour: r1(fill) } : {})
    });
    if (u.role === 'storage' && fill > 1e-3 * Math.max(1, inRate * 3600)) filling.push(u.id);
    const c = u.contract;
    if (u.role === 'pass' && c && isThermalContract(c)) {
      energy.push(
        judgeUnitEnergy({
          nodeId: u.id,
          name: u.node.name,
          contract: c,
          inKj: (heat(u.received) - b.recvH) * 3600,
          outKj: (heat(u.outflow) - b.outH) * 3600,
          accKj: 0,
          latentKj: (u.latentKj - b.latent) * 3600,
          ...(c.behavior.mode === 'CONTINUOUS_RATE' && c.behavior.dutyKw ? { statedKj: (u.heat.energyKwh - b.duty) * 3600 * 3600 } : {}),
          flowedKg: recvKg,
          latentMissing: [...u.latentMissing],
          basis: 'hour'
        })
      );
    }
  }

  // Streams: each pipe carries its share of what its source port sent at the last step.
  const fluidEdges = graph.edges.filter((e) => isFluidEdge(e, graph));
  const streams: SteadyStream[] = graph.edges.flatMap((e, i) => {
    if (!fluidEdges.includes(e)) return [];
    const src = units.get(e.sourceNodeId);
    const p = src?.tickPort[e.sourcePortId];
    const siblings = fluidEdges.filter((x) => x.sourceNodeId === e.sourceNodeId && x.sourcePortId === e.sourcePortId && units.has(x.targetNodeId)).length || 1;
    const name = (id: string) => graph.nodes.find((n) => n.id === id)?.name ?? id;
    const phase = edgePhase(graph.nodes, e) ?? 'LIQUID';
    if (!p || p.kg <= 0) return [{ id: e.id, number: `S${i + 1}`, from: name(e.sourceNodeId), to: name(e.targetNodeId), phase, kgPerHour: 0 }];
    const comps = componentsOf(p);
    const total = Object.values(comps).reduce((a, b) => a + b, 0);
    return [
      {
        id: e.id,
        number: `S${i + 1}`,
        from: name(e.sourceNodeId),
        to: name(e.targetNodeId),
        phase,
        kgPerHour: r1((p.kg / siblings) * 3600),
        ...(phase === 'LIQUID' ? { gpm: r1((liquidM3(p) / siblings / M3_PER_GALLON) * 60) } : {}),
        temperatureC: r1(p.tempC),
        ...(total > 0 && Object.keys(p.comp).length ? { composition: Object.fromEntries(Object.entries(comps).map(([c, kg]) => [c, round4(kg / total)] as [string, number]).sort((a, b) => b[1] - a[1])) } : {})
      }
    ];
  });

  const massBalance = { inKgPerHour: r1(inRate * 3600), outKgPerHour: r1(outRate * 3600), accumulatingKgPerHour: r1((inRate - outRate) * 3600) };
  const tail = errs.slice(-20);
  const pattern: SteadyResult['pattern'] = converged
    ? 'settled'
    : tail.length >= 4 && tail[tail.length - 1]! > tail[0]! * 2
      ? 'diverging'
      : tail.length >= 4 && tail.slice(1).filter((e, i) => (e - tail[i]!) * ((tail[i + 2] ?? e) - e) < 0).length > tail.length / 2
        ? 'oscillating'
        : 'slow';
  const base = { iterations, tears: [...tearUnits], history, streams, units: unitsOut, massBalance, energy, elapsedMs: Math.round(performance.now() - t0) };

  if (filling.length) {
    const lines = filling.map((id) => {
      const su = unitsOut.find((x) => x.nodeId === id)!;
      const u = units.get(id)!;
      const roomKg = Number.isFinite(u.capacity) && u.hold.m3 > 0 ? ((u.capacity - u.hold.m3) * u.hold.kg) / u.hold.m3 : undefined;
      const hours = roomKg !== undefined && su.fillingKgPerHour! > 0 ? roomKg / su.fillingKgPerHour! : undefined;
      return `"${su.name}" gains ${su.fillingKgPerHour} kg/h: what reaches it is more than its outflow limit lets out${hours !== undefined ? `, so it is full in about ${hours >= 1 ? `${r1(hours)} h` : `${Math.round(hours * 60)} min`} and then backs up what feeds it` : ''}`;
    });
    return { status: 'no-steady-state', message: `No steady state: ${lines.join('; ')}. Raise its outflow limit (a bigger pump or valve), or feed less.`, pattern, ...base };
  }
  if (converged && Math.abs(massBalance.accumulatingKgPerHour) > 1e-4 * Math.max(1, massBalance.inKgPerHour)) {
    const atRating = unitsOut.filter((x) => (x.capacityUsedPercent ?? 0) >= 99).map((x) => `"${x.name}" (${x.capacityUsedPercent}% of its rated flow)`);
    const loop = tearUnits.size ? ` A recycle returns to ${[...tearUnits].join(', ')}: if nothing (or too little) leaves the loop, what comes in can only build up.` : '';
    return {
      status: 'no-steady-state',
      message: `No steady state: ${massBalance.accumulatingKgPerHour} kg/h more comes in than goes out.${atRating.length ? ` ${atRating.join(', ')} cannot pass what reaches ${atRating.length === 1 ? 'it' : 'them'}, so the line backs up behind ${atRating.length === 1 ? 'it' : 'them'}: raise the rating or send less.` : ''}${loop} Run simulate_process_line to see how the line backs up over time.`,
      pattern,
      ...base
    };
  }
  if (!converged) {
    const why =
      pattern === 'diverging'
        ? 'The streams grow from step to step: a recycle that returns more than it takes out (a component with no way out of the loop builds up).'
        : pattern === 'oscillating'
          ? 'The streams swing back and forth around the answer: a recycle whose split or capacity depends strongly on its own flow.'
          : 'The streams are still settling, slowly: a recycle that returns most of what passes through it.';
    return { status: 'not-converged', message: `Not converged after ${iterations} steps (largest change ${Number(errs[errs.length - 1]!.toPrecision(3))}, tolerance ${tol}). ${why}${tearUnits.size ? ` Tears at: ${[...tearUnits].join(', ')}.` : ''}`, pattern, ...base };
  }
  return {
    status: 'converged',
    message: `Converged in ${iterations} steps${tearUnits.size ? ` (recycle torn at ${[...tearUnits].join(', ')}${options.accelerate !== false ? ', Wegstein-accelerated' : ''})` : ''}: ${massBalance.inKgPerHour} kg/h in, ${massBalance.outKgPerHour} kg/h out.`,
    pattern,
    ...base
  };
}

function heat(p: Parcel): number {
  return p.kg * p.cp * p.tempC;
}
