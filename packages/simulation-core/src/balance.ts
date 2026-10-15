import type { ProcessGraph, UnitOpContract } from '@process-forge/protocol';
import type { MaterialNetwork, MaterialUnit, Parcel } from './material.js';

/**
 * The run's own books: does mass add up across the line, and does each
 * heating, cooling or phase-changing unit's stated duty agree with what its
 * streams carried in and out?
 *
 * Every figure a run reports is computed, but "computed" is not "right": a
 * contract can state a heater duty its temperatures do not need, or a
 * condenser that warms its cooling water without declaring that the vapour
 * condenses. A simulator's heat and mass balance is how an engineer catches
 * that, so the engine closes its own on every run and says where it does not.
 *
 * Mass: in (feeds, self-charging batches, what units held at the start, and
 * what reactions made) = out (outlets, liquid that left the line, losses,
 * liquid drawn into containers) + what units hold at the end. This must close
 * to rounding; when it does not, the engine has lost or made material, which
 * is an engine fault, and the report says so.
 *
 * Energy, per continuous unit that changes temperature or phase: heat content
 * out (m·cp·T) + its change in holdup + the latent heat of its declared
 * phase changes − heat content in = the heat it must have taken from outside.
 * A heater's or a dryer's stated duty should equal that; an exchanger (its
 * streams kept apart in channels) moves heat between its own streams, so it
 * should be zero.
 */

export interface ComponentBalance {
  inKg: number;
  outKg: number;
  accumulatedKg: number;
  /** Made by reactions (negative: consumed). */
  generatedKg: number;
  /** in + generated − out − accumulated. Zero, to rounding, when mass is conserved. */
  closureKg: number;
}

export interface MassBalance {
  inKg: number;
  outKg: number;
  /** What units hold at the end less what they held at the start. */
  accumulatedKg: number;
  closureKg: number;
  /** |closure| over the larger of in and out. */
  relativeError: number;
  /** Closes to 1 part in 10^6. */
  closes: boolean;
  breakdown: {
    feedsKg: number;
    selfChargedKg: number;
    heldAtStartKg: number;
    toOutletsKg: number;
    leftLineKg: number;
    lostKg: number;
    intoContainersKg: number;
    heldAtEndKg: number;
  };
  /** By component; mass of no stated kind is `unspecified`. */
  components: Record<string, ComponentBalance>;
}

export interface UnitEnergyBalance {
  nodeId: string;
  name: string;
  /**
   * heater: its duty is heat from outside (a steam jacket, a burner);
   * exchanger: its streams are kept apart and trade heat, so nothing comes from outside;
   * machine: its duty is shaft power (a pump, a fan), of which only the losses warm the fluid.
   */
  kind: 'heater' | 'exchanger' | 'machine';
  inKwh: number;
  outKwh: number;
  accumulatedKwh: number;
  latentKwh: number;
  /** out + accumulated + latent − in: the heat the streams say it took from outside. */
  impliedHeatKwh: number;
  /** What its contract's dutyKw added up to over the run, when it states one (always counted positive). */
  statedDutyKwh?: number;
  /**
   * consistent: within 10 % (or 1 kWh). Ten, not less: the engine carries one
   *   specific heat per stream (its mix, by mass), and a contract may allow for
   *   a heat loss through a wall the engine does not model;
   * mismatch: the stated duty and the streams disagree;
   * not-checked: a phase change happened with no latent heat stated, or nothing flowed.
   */
  verdict: 'consistent' | 'mismatch' | 'not-checked';
  mismatchPercent?: number;
  note: string;
}

export interface LineBalance {
  mass: MassBalance;
  energy: UnitEnergyBalance[];
}

const UNSPECIFIED = 'unspecified';
const r1 = (x: number) => Math.round(x * 10) / 10;
const sig = (x: number) => (Math.abs(x) >= 100 ? r1(x) : Number(x.toPrecision(3)));

/** kJ of a parcel's heat content above 0 °C, by its own cp. */
const heatKj = (p: Parcel | undefined) => (p ? p.kg * p.cp * p.tempC : 0);

/** kg of each component in a parcel, with mass of no stated kind as `unspecified`. */
function componentKg(p: Parcel | undefined, into: Record<string, number>, sign = 1): void {
  if (!p || p.kg <= 0) return;
  let stated = 0;
  for (const [c, f] of Object.entries(p.comp)) {
    if (!(f > 0)) continue;
    into[c] = (into[c] ?? 0) + sign * f * p.kg;
    stated += f;
  }
  const rest = Math.max(0, 1 - stated) * p.kg;
  if (rest > 0) into[UNSPECIFIED] = (into[UNSPECIFIED] ?? 0) + sign * rest;
}

/** Everything a unit holds now: its holdup, its channels, and what reached it late in the last tick. */
function heldNow(u: MaterialUnit): Parcel[] {
  return [u.hold, ...Object.values(u.channelHold), ...(u.late ? [u.late.inbox] : [])];
}

function isThermal(c: UnitOpContract | undefined): boolean {
  if (!c) return false;
  return Boolean(c.outlets?.some((o) => o.temperatureC !== undefined) || c.phaseChanges?.length || c.channels?.length);
}

/** Machines whose duty is shaft work: what warms the fluid is only part of it; the rest is pressure or motion. */
const MACHINE = /pump|compressor|fan|blower|agitat|mill|grinder|homogen/i;
function isMachine(c: UnitOpContract): boolean {
  return MACHINE.test(c.archetype ?? '') || MACHINE.test(c.id);
}

function isExchanger(c: UnitOpContract): boolean {
  return Boolean(c.channels?.length) || c.ports.some((p) => p.role === 'UTILITY');
}

export function lineBalance(graph: ProcessGraph, network: MaterialNetwork): LineBalance {
  const b = { feedsKg: 0, selfChargedKg: 0, heldAtStartKg: 0, toOutletsKg: 0, leftLineKg: 0, lostKg: 0, intoContainersKg: 0, heldAtEndKg: 0 };
  const ins: Record<string, number> = {};
  const outs: Record<string, number> = {};
  const start: Record<string, number> = {};
  const end: Record<string, number> = {};
  const generated: Record<string, number> = {};

  for (const u of network.units.values()) {
    if (u.role === 'feed') {
      b.feedsKg += u.outflow.kg;
      componentKg(u.outflow, ins);
      continue;
    }
    if (u.role === 'sink') {
      b.toOutletsKg += u.received.kg;
      componentKg(u.received, outs);
      continue;
    }
    b.selfChargedKg += u.selfCharged.kg;
    componentKg(u.selfCharged, ins);
    b.heldAtStartKg += u.startHold.kg;
    componentKg(u.startHold, start);
    b.leftLineKg += u.leftLine.kg;
    componentKg(u.leftLine, outs);
    b.lostKg += u.lost.kg;
    componentKg(u.lost, outs);
    b.intoContainersKg += u.packed.kg;
    componentKg(u.packed, outs);
    for (const p of heldNow(u)) {
      b.heldAtEndKg += p.kg;
      componentKg(p, end);
    }
    for (const [c, kg] of Object.entries(u.generatedKg)) generated[c] = (generated[c] ?? 0) + kg;
  }

  const inKg = b.feedsKg + b.selfChargedKg;
  const outKg = b.toOutletsKg + b.leftLineKg + b.lostKg + b.intoContainersKg;
  const accumulatedKg = b.heldAtEndKg - b.heldAtStartKg;
  const closureKg = inKg - outKg - accumulatedKg;
  const scale = Math.max(inKg + b.heldAtStartKg, outKg + b.heldAtEndKg, 1e-9);
  const components: Record<string, ComponentBalance> = {};
  for (const c of new Set([...Object.keys(ins), ...Object.keys(outs), ...Object.keys(start), ...Object.keys(end), ...Object.keys(generated)])) {
    const i = ins[c] ?? 0;
    const o = outs[c] ?? 0;
    const acc = (end[c] ?? 0) - (start[c] ?? 0);
    const g = generated[c] ?? 0;
    if (Math.abs(i) + Math.abs(o) + Math.abs(acc) + Math.abs(g) < 1e-6) continue;
    components[c] = { inKg: r1(i), outKg: r1(o), accumulatedKg: r1(acc), generatedKg: r1(g), closureKg: Number((i + g - o - acc).toPrecision(3)) };
  }
  const relativeError = Math.abs(closureKg) / scale;

  const energy: UnitEnergyBalance[] = [];
  for (const u of network.units.values()) {
    const c = u.contract;
    if (u.role !== 'pass' || !c || !isThermal(c)) continue;
    const node = graph.nodes.find((n) => n.id === u.id);
    const inKj = heatKj(u.received);
    const outKj = heatKj(u.outflow);
    const accKj = heldNow(u).reduce((a, p) => a + heatKj(p), 0) - heatKj(u.startHold);
    const implied = outKj + accKj + u.latentKj - inKj;
    const kind = isExchanger(c) ? 'exchanger' : isMachine(c) ? 'machine' : 'heater';
    const stated = c.behavior.mode === 'CONTINUOUS_RATE' && c.behavior.dutyKw ? u.heat.energyKwh : undefined;
    const kwh = (kj: number) => kj / 3600;
    const row: UnitEnergyBalance = {
      nodeId: u.id,
      name: node?.name ?? u.id,
      kind,
      inKwh: sig(kwh(inKj)),
      outKwh: sig(kwh(outKj)),
      accumulatedKwh: sig(kwh(accKj)),
      latentKwh: sig(kwh(u.latentKj)),
      impliedHeatKwh: sig(kwh(implied)),
      ...(stated !== undefined ? { statedDutyKwh: sig(stated) } : {}),
      verdict: 'consistent',
      note: ''
    };
    const impliedKwh = kwh(implied);
    if (u.received.kg <= 1e-9) {
      row.verdict = 'not-checked';
      row.note = 'Nothing flowed through it.';
    } else if (u.latentMissing.size) {
      row.verdict = 'not-checked';
      row.note = `A phase change happened with no latent heat stated (${[...u.latentMissing].join(', ')}): give its latentHeatKjPerKg so the engine can check this unit's energy balance.`;
    } else if (kind === 'machine') {
      const work = stated ?? 0;
      if (impliedKwh < -1 || impliedKwh > work * 1.05 + 1) {
        row.verdict = 'mismatch';
        row.note =
          impliedKwh < 0
            ? `Its streams left ${sig(-impliedKwh)} kWh cooler than they came: a machine's shaft work cannot cool what it moves.`
            : `Its streams took ${sig(impliedKwh)} kWh of heat, more than its ${sig(work)} kWh of shaft work: the outlet temperature does not follow from its power.`;
      } else {
        row.note = `Of its ${sig(work)} kWh of shaft work, ${sig(Math.max(0, impliedKwh))} kWh warmed the fluid; the rest went into pressure and motion, which the engine does not track.`;
      }
    } else if (kind === 'exchanger') {
      // Its streams trade heat; none should come from outside. Judged against the heat it moved.
      const moved = Math.max(stated ?? 0, Math.abs(kwh(outKj - inKj)), 1e-9);
      const pct = (Math.abs(impliedKwh) / moved) * 100;
      row.mismatchPercent = r1(pct);
      if (pct > 10 && Math.abs(impliedKwh) > 1) {
        row.verdict = 'mismatch';
        row.note =
          impliedKwh > 0
            ? `Its streams left with ${sig(impliedKwh)} kWh more heat than they brought, and an exchanger has no heat of its own: a stream gains heat no other stream gives up. Declare the phase change that releases it (a condensing vapour) or correct the outlet temperatures.`
            : `Its streams left with ${sig(-impliedKwh)} kWh less heat than they brought, and an exchanger has nowhere to put it: a stream gives up heat no other stream takes. Declare the phase change that absorbs it or correct the outlet temperatures.`;
      } else {
        row.note = 'The heat one side gives up is the heat the other takes.';
      }
    } else if (stated === undefined) {
      if (Math.abs(impliedKwh) > 1) {
        row.verdict = 'mismatch';
        row.note = `Its streams need ${sig(impliedKwh)} kWh ${impliedKwh > 0 ? 'from' : 'taken away by'} a heat source, and its contract states no duty: give it a dutyKw (or the heat source's stream).`;
      } else row.note = 'No heat needed, none stated.';
    } else {
      const pct = (Math.abs(Math.abs(impliedKwh) - stated) / Math.max(stated, 1e-9)) * 100;
      row.mismatchPercent = r1(pct);
      if (pct > 10 && Math.abs(Math.abs(impliedKwh) - stated) > 1) {
        row.verdict = 'mismatch';
        row.note = `Its stated duty added up to ${sig(stated)} kWh, but its streams carried ${sig(Math.abs(impliedKwh))} kWh ${impliedKwh >= 0 ? 'more' : 'less'} heat out than in (latent heat included): the duty does not follow from its temperatures and flows. Write dutyKw from them, e.g. m·cp·(T_out − T_in) + evaporated × latent heat.`;
      } else {
        row.note = 'Its stated duty is the heat its streams took.';
      }
    }
    energy.push(row);
  }

  return {
    mass: {
      inKg: r1(inKg),
      outKg: r1(outKg),
      accumulatedKg: r1(accumulatedKg),
      closureKg: Number(closureKg.toPrecision(3)),
      relativeError: Number(relativeError.toPrecision(3)),
      closes: relativeError <= 1e-6,
      breakdown: Object.fromEntries(Object.entries(b).map(([k, v]) => [k, r1(v)])) as MassBalance['breakdown'],
      components
    },
    energy
  };
}
