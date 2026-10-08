import { referencedNames } from './expression.js';
import { parseUnit, type Dimension } from './dimensions.js';
import { contractExpressions, type UnitOpContract } from './contract.js';
import { matchPhaseArchetypes, PHASE_ARCHETYPES, type MaterialPhase, type PhaseArchetype } from './phases.js';
import { phaseEnergy, portPhase } from './phaseBalance.js';
import type { UnitOpEvaluation } from './evaluate.js';
import type { PhysicsRequirement, RequirementCheck } from './archetypes.js';

/**
 * Does the contract describe the physics of the equipment it says it is?
 *
 * The other gates check that a contract is coherent: its expressions parse,
 * its units agree, its own constraints hold. None of them can tell that a
 * "spray dryer" never evaporates anything, that a "pump" has no shaft power,
 * or that an "exchanger" mixes its hot and cold streams. A model can write a
 * contract that is coherent and wrong, and the loop would accept it.
 *
 * This holds the contract to its archetype -- the one it declares
 * (contract.archetype), or failing that the one its name and description
 * read as -- and to energy and the second law at its design point:
 *
 *  1. Ports: every phase the equipment takes in or sends out has a port.
 *  2. Phase changes: every change the equipment makes is declared.
 *  3. Behavior: it runs in a mode that equipment runs in.
 *  4. Requirements: the quantities and checks a complete design has (a
 *     pump's shaft power, a baghouse's air-to-cloth check), archetypes.ts.
 *  5. Energy: outlets that leave hotter or colder than what came in need
 *     heat from somewhere, and enough of it.
 *  6. Second law: streams that only exchange heat with each other cannot
 *     cross (a cold side cannot leave hotter than the hot side came in), and
 *     what one gives up the other gains.
 *
 * A declared archetype makes its findings binding (ERROR fails the
 * contract); an inferred one only warns, since a keyword match can be wrong.
 * Each finding carries the fix, so the model can act on it in one round.
 */

export interface AlignmentFinding {
  /** Where in the contract. */
  path: string;
  severity: 'ERROR' | 'WARNING';
  message: string;
  /** What to change, written for the model. */
  fix: string;
  /** The archetype requirement it comes from, if any. */
  requirement?: string;
}

export interface PhysicsAlignment {
  archetype?: { id: string; name: string };
  decidedBy: 'declared' | 'inferred' | 'custom' | 'none';
  /** Other archetypes the description also read as. */
  alternatives: string[];
  /** Each requirement of the archetype, met or not: the checklist. */
  checklist: { id: string; what: string; met: boolean; severity: 'ERROR' | 'WARNING' }[];
  errors: AlignmentFinding[];
  warnings: AlignmentFinding[];
  /** The energy balance at the design point, when it could be written. */
  energy?: { neededKw: number; suppliedKw?: number; note: string };
}

const sameDim = (a: Dimension, b: Dimension) => a.every((v, i) => Math.abs(v - b[i]!) < 1e-9);

const refs = (expr: string): string[] => {
  try {
    return referencedNames(expr);
  } catch {
    return [];
  }
};

/** Every name each constraint reads, followed through the derived values it uses. */
function constraintReach(contract: UnitOpContract): Set<string> {
  const reach = new Map<string, Set<string>>();
  for (const d of contract.derived) {
    const s = new Set<string>();
    for (const r of refs(d.expr)) {
      s.add(r);
      for (const x of reach.get(r) ?? []) s.add(x);
    }
    reach.set(d.name, s);
  }
  const out = new Set<string>();
  for (const c of contract.constraints) {
    for (const r of refs(c.expr)) {
      out.add(r);
      for (const x of reach.get(r) ?? []) out.add(x);
    }
  }
  return out;
}

function quantityMet(contract: UnitOpContract, check: Extract<RequirementCheck, { kind: 'quantity' }>, guarded: Set<string>): boolean {
  const dim = parseUnit(check.unit);
  if (!dim) return true;
  const re = check.names ? new RegExp(check.names, 'i') : null;
  const values = check.computed ? contract.derived : [...contract.parameters, ...contract.derived];
  return values.some((v) => {
    const d = parseUnit(v.unit);
    if (!d || !sameDim(d, dim)) return false;
    if (re && !re.test(v.name) && !re.test(v.label)) return false;
    return !check.guarded || guarded.has(v.name);
  });
}

function hasDuty(contract: UnitOpContract): boolean {
  const b = contract.behavior;
  if (b.mode === 'CONTINUOUS_RATE' && b.dutyKw && !/^\s*0+(\.0*)?\s*$/.test(b.dutyKw)) return true;
  if (b.mode === 'BATCH' && b.phases.some((p) => p.dutyKw)) return true;
  if (contract.ports.some((p) => p.role === 'UTILITY' || p.role === 'ENERGY')) return true;
  if (contract.channels?.length) return true;
  return contract.ports.some((p) => p.direction === 'INLET' && portPhase(p) === 'GAS');
}

function requirementMet(contract: UnitOpContract, check: RequirementCheck, guarded: Set<string>): boolean {
  const b = contract.behavior;
  switch (check.kind) {
    case 'quantity':
      return quantityMet(contract, check, guarded);
    case 'duty':
      return hasDuty(contract);
    case 'channels':
      return (contract.channels?.length ?? 0) > 0;
    case 'reactions':
      return (contract.reactions?.length ?? 0) > 0;
    case 'recoveries':
      return (contract.outlets ?? []).some((o) => o.recovery && Object.keys(o.recovery).length > 0);
    case 'outletTemperature':
      return (contract.outlets ?? []).some((o) => !!o.temperatureC);
    case 'liquidPerCycle':
      return b.mode === 'DISCRETE_CYCLE' && !!b.liquidPerCycleGallons;
    case 'perPortReads':
      return contractExpressions(contract).some((e) => refs(e.expr).some((r) => r.startsWith('port.')));
    case 'itemsRequired':
      return b.mode === 'DISCRETE_CYCLE' && !!b.itemsRequired;
    case 'assembly':
      return b.mode === 'DISCRETE_CYCLE' && (!!b.inputs?.length || !!b.outputs?.length || !!b.fullCyclesOnly);
    case 'capacity':
      return b.mode === 'STORAGE' || (b.mode === 'CONTINUOUS_RATE' && (!!b.capacityGpm || !!b.capacityKgPerHour)) || b.mode === 'BATCH';
  }
}

/** "a pump", "an evaporator". */
const an = (w: string) => `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}`;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const PHASE_WORD: Record<MaterialPhase, string> = { LIQUID: 'a liquid', GAS: 'a gas', SOLID: 'a solid', ITEMS: 'items' };

function portSnippet(p: PhaseArchetype['ports'][number]): string {
  const dim = p.phase === 'ITEMS' ? 'DISCRETE_CONTAINER' : 'CONTINUOUS_FLUID';
  const extra = [p.dispersed ? `dispersed: ${JSON.stringify(p.dispersed)}` : '', p.carries ? `carries: ${JSON.stringify(p.carries)}` : '', p.role ? `role: '${p.role}'` : ''].filter(Boolean).join(', ');
  return `{ id: '${p.id}', name: '${p.name}', direction: '${p.direction}', flowDimension: '${dim}', phase: '${p.phase}'${extra ? `, ${extra}` : ''} }`;
}

/** The archetype a contract is held to: declared, inferred from its words, or none. */
export function resolveArchetype(contract: Pick<UnitOpContract, 'archetype' | 'name' | 'description'>): { archetype?: PhaseArchetype; decidedBy: PhysicsAlignment['decidedBy']; alternatives: string[] } {
  if (contract.archetype === 'custom') return { decidedBy: 'custom', alternatives: [] };
  if (contract.archetype) {
    const a = PHASE_ARCHETYPES.find((x) => x.id === contract.archetype);
    return a ? { archetype: a, decidedBy: 'declared', alternatives: [] } : { decidedBy: 'none', alternatives: [] };
  }
  // The name says what it is; the description can mention its neighbours ("pumps to the filler").
  const byName = matchPhaseArchetypes(contract.name);
  const matches = byName.length ? byName : matchPhaseArchetypes(`${contract.name}. ${contract.description ?? ''}`);
  const best = matches[0]?.archetype;
  return best ? { archetype: best, decidedBy: 'inferred', alternatives: matches.slice(1, 4).map((m) => m.archetype.id) } : { decidedBy: 'none', alternatives: [] };
}

/**
 * The physics alignment of a contract: its archetype's requirements and the
 * energy and second-law checks at the design point. Pass the design-point
 * evaluation for the energy checks.
 */
export function physicsAlignment(contract: UnitOpContract, evaluation?: UnitOpEvaluation): PhysicsAlignment {
  const { archetype, decidedBy, alternatives } = resolveArchetype(contract);
  const out: PhysicsAlignment = {
    ...(archetype ? { archetype: { id: archetype.id, name: archetype.name } } : {}),
    decidedBy,
    alternatives,
    checklist: [],
    errors: [],
    warnings: []
  };
  const binding = decidedBy === 'declared';
  const add = (f: AlignmentFinding) => {
    const finding = binding ? f : { ...f, severity: 'WARNING' as const };
    (finding.severity === 'ERROR' ? out.errors : out.warnings).push(finding);
  };

  if (archetype) {
    const what = archetype.name.toLowerCase();
    // 1. Ports: each phase the equipment moves, in each direction.
    const has = (dir: 'INLET' | 'OUTLET', phase: MaterialPhase, utility: boolean) =>
      contract.ports.some((p) => p.direction === dir && portPhase(p) === phase && (utility ? p.role === 'UTILITY' || p.role === 'MATERIAL' : p.role !== 'UTILITY'));
    const seen = new Set<string>();
    for (const p of archetype.ports) {
      if (p.optional) continue;
      const key = `${p.direction}:${p.phase}:${p.role === 'UTILITY'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!has(p.direction, p.phase, p.role === 'UTILITY')) {
        add({
          path: 'ports',
          severity: p.role === 'UTILITY' ? 'WARNING' : 'ERROR',
          message: `${cap(an(what))} ${p.direction === 'INLET' ? 'takes in' : 'sends out'} ${PHASE_WORD[p.phase]} (${p.name.toLowerCase()}), but no ${p.direction.toLowerCase()} port of this contract is ${p.phase}.`,
          fix: `Add (or re-phase) a port: ${portSnippet(p)}.`
        });
      }
    }
    // Phases the equipment does not move at all are worth a look (a "dust collector" with a liquid outlet is a scrubber).
    const archetypePhases = new Set(archetype.ports.map((p) => `${p.direction}:${p.phase}`));
    for (const p of contract.ports) {
      if (p.role !== 'MATERIAL' || archetypePhases.has(`${p.direction}:${portPhase(p)}`)) continue;
      const better = PHASE_ARCHETYPES.filter((a) => a.id !== archetype.id && a.ports.some((x) => x.direction === p.direction && x.phase === portPhase(p))).map((a) => a.id);
      out.warnings.push({
        path: `ports.${p.id}`,
        severity: 'WARNING',
        message: `Port "${p.id}" ${p.direction === 'INLET' ? 'takes in' : 'sends out'} ${PHASE_WORD[portPhase(p)]}, which ${an(what)} does not.`,
        fix: better.length ? `Check the phase, or whether this is really ${better.slice(0, 3).join(' / ')} (set archetype accordingly).` : 'Check the port\'s phase.'
      });
    }
    // 2. Phase changes the equipment makes.
    for (const pc of archetype.phaseChanges) {
      // Absorbing a gas depends on there being a soluble gas to absorb (a particulate scrubber has none).
      if (pc.mechanism === 'ABSORPTION' || pc.mechanism === 'DESORPTION') continue;
      const made = (contract.phaseChanges ?? []).some((x) => x.from === pc.from && x.to === pc.to);
      if (!made) {
        add({
          path: 'phaseChanges',
          severity: 'ERROR',
          message: `${cap(an(what))} turns ${pc.component} from ${pc.from.toLowerCase()} to ${pc.to.toLowerCase()} (${pc.mechanism.toLowerCase()}), but the contract declares no ${pc.from}→${pc.to} change.`,
          fix: `Add phaseChanges: [{ component: '${pc.component}', from: '${pc.from}', to: '${pc.to}', mechanism: '${pc.mechanism}'${pc.from === 'LIQUID' && pc.to === 'GAS' ? ", latentHeatKjPerKg: 'latentKjPerKg'" : ''} }] (rename the component to yours).`
        });
      }
    }
    // 3. Behavior mode.
    if (archetype.behaviorModes?.length && !archetype.behaviorModes.includes(contract.behavior.mode)) {
      add({
        path: 'behavior.mode',
        severity: 'ERROR',
        message: `${cap(an(what))} runs as ${archetype.behaviorModes.join(' or ')}, not ${contract.behavior.mode}.`,
        fix: `Use behavior.mode ${archetype.behaviorModes[0]}${archetype.behaviorModes.length > 1 ? ` (or ${archetype.behaviorModes.slice(1).join(', ')})` : ''}.`
      });
    }
    // 4. Requirements.
    const guarded = constraintReach(contract);
    for (const r of archetype.requirements ?? []) {
      const met = requirementMet(contract, r.check, guarded);
      out.checklist.push({ id: r.id, what: r.what, met, severity: r.severity });
      if (!met) add({ path: pathOf(r), severity: r.severity, message: `${cap(an(what))} needs ${r.what}; this contract has none.`, fix: r.fix, requirement: r.id });
    }
    if (decidedBy === 'inferred') {
      out.warnings.push({
        path: 'archetype',
        severity: 'WARNING',
        message: `Read as ${an(what)} from its name and description${alternatives.length ? ` (also possible: ${alternatives.join(', ')})` : ''}.`,
        fix: `State archetype: '${archetype.id}' to be held to its physics, or archetype: 'custom' if it is something else.`
      });
    }
  }

  if (evaluation && !evaluation.error) {
    energyChecks(contract, evaluation, out);
  }
  return out;
}

function pathOf(r: PhysicsRequirement): string {
  switch (r.check.kind) {
    case 'quantity':
      return r.check.guarded ? 'constraints' : 'derived';
    case 'duty':
      return 'behavior.dutyKw';
    case 'channels':
      return 'channels';
    case 'reactions':
      return 'reactions';
    case 'recoveries':
    case 'outletTemperature':
      return 'outlets';
    case 'liquidPerCycle':
      return 'behavior.liquidPerCycleGallons';
    case 'itemsRequired':
      return 'behavior.itemsRequired';
    case 'assembly':
      return 'behavior.inputs';
    case 'capacity':
      return 'behavior';
    case 'perPortReads':
      return 'designPorts';
  }
}

const fmt = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-US') : Number(v.toPrecision(3)).toString());

/** Energy and the second law at the design point. */
function energyChecks(contract: UnitOpContract, ev: UnitOpEvaluation, out: PhysicsAlignment): void {
  if (contract.behavior.mode !== 'CONTINUOUS_RATE') return;
  const reacts = (contract.reactions?.length ?? 0) > 0;

  // Channels: streams that only trade heat with each other.
  if (contract.channels?.length) {
    const sides = contract.channels
      .map((ch) => {
        const d = contract.designPorts?.[ch.inlet];
        const tOut = ev.outlets[ch.outlet]?.temperatureC;
        if (!d || d.temperatureC === undefined || !d.massFlowKgPerS || tOut === undefined) return null;
        const cp = d.specificHeatKjPerKgK ?? 4.18;
        return { ch, tIn: d.temperatureC, tOut, kw: d.massFlowKgPerS * cp * (tOut - d.temperatureC) };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
    if (sides.length === contract.channels.length && sides.length >= 2) {
      const external = (contract.phaseChanges?.length ?? 0) > 0 || contract.ports.some((p) => p.role === 'UTILITY' || p.role === 'ENERGY') || reacts;
      for (const s of sides) {
        const others = sides.filter((o) => o !== s);
        const hottestIn = Math.max(...others.map((o) => o.tIn));
        const coldestIn = Math.min(...others.map((o) => o.tIn));
        if (!external && s.tOut > s.tIn + 0.05 && s.tOut > hottestIn + 0.05) {
          out.errors.push({
            path: `outlets.${s.ch.outlet}`,
            severity: 'ERROR',
            message: `Temperature cross: "${s.ch.outlet}" leaves at ${fmt(s.tOut)} °C, hotter than any stream that heats it comes in (${fmt(hottestIn)} °C). Heat does not flow from cold to hot.`,
            fix: 'Rate the duty so it cannot exceed what the temperatures allow: Q = eps x Cmin x (Th,in - Tc,in) with eps <= 1, and each outlet temperature from Q.'
          });
        }
        if (!external && s.tOut < s.tIn - 0.05 && s.tOut < coldestIn - 0.05) {
          out.errors.push({
            path: `outlets.${s.ch.outlet}`,
            severity: 'ERROR',
            message: `Temperature cross: "${s.ch.outlet}" leaves at ${fmt(s.tOut)} °C, colder than any stream that cools it comes in (${fmt(coldestIn)} °C).`,
            fix: 'Rate the duty with eps <= 1 and work each outlet temperature out from the same Q.'
          });
        }
      }
      const gained = sides.filter((s) => s.kw > 0).reduce((a, s) => a + s.kw, 0);
      const lost = -sides.filter((s) => s.kw < 0).reduce((a, s) => a + s.kw, 0);
      const scale = Math.max(gained, lost);
      if (!external && scale > 0.5 && Math.abs(gained - lost) > 0.03 * scale + 0.5) {
        out.warnings.push({
          path: 'outlets',
          severity: 'WARNING',
          message: `Energy does not balance across the channels: the hot side gives up ${fmt(lost)} kW but the cold side gains ${fmt(gained)} kW at the design point.`,
          fix: 'Compute one duty Q and take each outlet temperature from it: T_out = T_in -/+ Q / (m cp) on each side.'
        });
      }
      out.energy = { neededKw: gained, suppliedKw: lost, note: 'heat gained by the cold side(s) against heat given up by the hot side(s)' };
    }
    return;
  }

  // One mixed stream through: outlets hotter or colder than what came in need heat from somewhere.
  const d = contract.designInlet;
  if (!d || d.temperatureC === undefined || !d.massFlowKgPerS || reacts) return;
  const cp = d.specificHeatKjPerKgK ?? 4.18;
  const outletPorts = contract.ports.filter((p) => p.direction === 'OUTLET' && p.flowDimension === 'CONTINUOUS_FLUID' && p.role === 'MATERIAL');
  if (!outletPorts.length) return;
  const byRecovery = Object.values(ev.outlets).some((o) => o.recovery);
  // Several inlets of different phases: the design inlet is the mix, and a hot gas may supply the heat; leave those to the phase-energy check.
  if (contract.ports.filter((p) => p.direction === 'INLET' && p.flowDimension === 'CONTINUOUS_FLUID').length > 1 && contract.ports.some((p) => p.direction === 'INLET' && portPhase(p) === 'GAS')) return;
  let sensible = 0;
  let known = true;
  const total = Object.values(d.composition ?? {}).reduce((a, v) => a + v, 0);
  const shareSum = Object.values(ev.outlets).reduce((a, o) => a + (o.share ?? 0), 0);
  const unshared = outletPorts.filter((p) => ev.outlets[p.id]?.share === undefined && !ev.outlets[p.id]?.recovery);
  for (const p of outletPorts) {
    const o = ev.outlets[p.id];
    const t = o?.temperatureC ?? d.temperatureC;
    let m: number;
    if (byRecovery) {
      if (!o?.recovery || !(total > 0)) {
        known = known && (t === d.temperatureC);
        continue;
      }
      m = Object.entries(o.recovery).reduce((a, [c, r]) => a + d.massFlowKgPerS! * ((d.composition![c] ?? 0) / total) * r, 0);
    } else if (o?.share !== undefined) m = d.massFlowKgPerS * o.share;
    else if (unshared.length) m = (d.massFlowKgPerS * Math.max(0, 1 - shareSum)) / unshared.length;
    else m = 0;
    sensible += m * cp * (t - d.temperatureC);
  }
  if (!known) return;
  const latent = phaseEnergy(contract, ev)?.latentKw ?? 0;
  const needed = sensible + latent;
  const b = contract.behavior;
  const duty = b.mode === 'CONTINUOUS_RATE' && ev.behavior.mode === 'CONTINUOUS_RATE' ? ev.behavior.dutyKw : undefined;
  const source = contract.ports.some((p) => p.role === 'UTILITY' || p.role === 'ENERGY');
  const scale = d.massFlowKgPerS * cp; // kW per K of the stream
  out.energy = { neededKw: needed, ...(duty !== undefined ? { suppliedKw: duty } : {}), note: 'heat the outlet temperatures (and phase changes) take, against the stated duty' };
  if (Math.abs(needed) < Math.max(1, 0.5 * scale)) return; // within half a degree: nothing to explain
  if (duty === undefined && !source) {
    out.warnings.push({
      path: 'behavior.dutyKw',
      severity: 'WARNING',
      message: `The outlets leave ${needed > 0 ? 'hotter' : 'colder'} than the feed: that takes ${fmt(Math.abs(needed))} kW ${needed > 0 ? 'in' : 'out'} at the design point, and nothing in the contract ${needed > 0 ? 'supplies' : 'removes'} it.`,
      fix: 'Give behavior.dutyKw (= m cp (T_out - T_in), plus any latent heat) or a UTILITY port, or leave the outlets at the inlet temperature.'
    });
    return;
  }
  if (duty !== undefined && !source && Math.abs(needed) > Math.abs(duty) * 1.25 + 1) {
    out.warnings.push({
      path: 'behavior.dutyKw',
      severity: 'WARNING',
      message: `The stated duty (${fmt(Math.abs(duty))} kW) is short of the ${fmt(Math.abs(needed))} kW the outlet temperatures${latent ? ' and phase changes' : ''} take at the design point.`,
      fix: 'Work the outlet temperature out from the duty (T_out = T_in + Q / (m cp)), or the duty from the temperatures, so they agree.'
    });
  }
}
