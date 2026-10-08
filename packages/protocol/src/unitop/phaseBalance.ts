import type { UnitOpContract, UnitOpPort, ContractValidationIssue } from './contract.js';
import type { ProcessNode } from '../nodes.js';
import type { ProcessEdge } from '../streams.js';
import { isEndothermic, MECHANISM_TRANSITIONS, type MaterialPhase } from './phases.js';
import { evaluateNumber } from './expression.js';

/**
 * The phase gate: a component may only leave a unit in a phase it arrived in,
 * unless the contract declares the change, and a change that takes heat needs
 * something on the unit to supply it.
 *
 * It applies to contracts that state phases (any port with `phase` or
 * `dispersed`, or any `phaseChanges`). Older contracts carry neither and are
 * left as they were: every continuous port is a liquid, every item port items.
 */

/** The phase a port carries: declared, or implied by its flow dimension. */
export function portPhase(port: Pick<UnitOpPort, 'phase' | 'flowDimension'>): MaterialPhase {
  return port.phase ?? (port.flowDimension === 'DISCRETE_CONTAINER' ? 'ITEMS' : 'LIQUID');
}

/** The phase a component is in at a port. */
export function componentPhaseAt(port: UnitOpPort, component: string): MaterialPhase {
  return port.dispersed?.[component] ?? portPhase(port);
}

/** Whether a contract states phases at all, and so is checked by the phase gate. */
export function isPhaseAware(contract: UnitOpContract): boolean {
  return contract.ports.some((p) => p.phase !== undefined || p.dispersed !== undefined) || (contract.phaseChanges?.length ?? 0) > 0;
}

const TYPICAL_LATENT: Partial<Record<string, string>> = {
  'LIQUID>GAS': 'water ~2,260 kJ/kg at 100 °C, ~2,400 kJ/kg at 40 °C',
  'SOLID>LIQUID': 'ice 334 kJ/kg; waxes 150-250 kJ/kg',
  'SOLID>GAS': 'ice ~2,830 kJ/kg'
};

const isZero = (expr: string) => /^\s*0+(\.0*)?\s*$/.test(expr);

/** Ports the mass balance runs through (a utility does not join it). */
const materialPorts = (c: UnitOpContract, dir: 'INLET' | 'OUTLET') =>
  c.ports.filter((p) => p.direction === dir && (p.role ?? 'MATERIAL') === 'MATERIAL');

const carries = (p: UnitOpPort, component: string) => !p.carries || p.carries.includes(component);

/** The outlets a component can leave by, from the outlet plan and each port's `carries`. */
function outletsFor(contract: UnitOpContract, component: string): UnitOpPort[] {
  const plan = contract.outlets ?? [];
  const byRecovery = plan.some((o) => o.recovery);
  return materialPorts(contract, 'OUTLET').filter((p) => {
    if (!carries(p, component)) return false;
    if (!byRecovery) return true;
    const entry = plan.find((o) => o.port === p.id);
    const r = entry?.recovery?.[component];
    return r === undefined ? true : !isZero(r);
  });
}

function heatSources(contract: UnitOpContract): string[] {
  const out: string[] = [];
  const b = contract.behavior;
  if (b.mode === 'CONTINUOUS_RATE' && b.dutyKw) out.push('behavior.dutyKw');
  if (b.mode === 'BATCH' && b.phases.some((ph) => ph.dutyKw)) out.push('a HOLD phase dutyKw');
  for (const p of contract.ports) {
    if (p.direction !== 'INLET') continue;
    if (p.role === 'UTILITY' || p.role === 'ENERGY') out.push(`${p.role.toLowerCase()} port "${p.id}"`);
    else if (portPhase(p) === 'GAS') out.push(`gas inlet "${p.id}" (hot gas)`);
  }
  return out;
}

export function phaseIssues(contract: UnitOpContract): ContractValidationIssue[] {
  if (!isPhaseAware(contract)) return [];
  const issues: ContractValidationIssue[] = [];
  const components = contract.components;
  const changes = contract.phaseChanges ?? [];

  // Each port: a phase that fits its flow dimension.
  contract.ports.forEach((p, i) => {
    const path = `ports[${i}]`;
    const phase = portPhase(p);
    if (p.flowDimension === 'DISCRETE_CONTAINER' && phase !== 'ITEMS') {
      issues.push({ path, message: `port "${p.id}" carries discrete items (DISCRETE_CONTAINER), so its phase is ITEMS, not ${phase}` });
    }
    if (p.flowDimension === 'CONTINUOUS_FLUID' && phase === 'ITEMS') {
      issues.push({ path, message: `port "${p.id}" is a continuous stream, so its phase is LIQUID, GAS or SOLID; ITEMS needs flowDimension DISCRETE_CONTAINER` });
    }
    for (const [c, ph] of Object.entries(p.dispersed ?? {})) {
      if (ph === 'ITEMS') issues.push({ path, message: `port "${p.id}" disperses "${c}" as ITEMS: a dispersed component is LIQUID, GAS or SOLID` });
      if (phase === 'ITEMS') issues.push({ path, message: `port "${p.id}" carries items, which cannot carry a dispersed component` });
      if (components && !components.includes(c)) issues.push({ path, message: `port "${p.id}" disperses "${c}", which is not in components (${components.join(', ')})` });
    }
    for (const c of p.carries ?? []) {
      if (components && !components.includes(c)) issues.push({ path, message: `port "${p.id}" carries "${c}", which is not in components (${components.join(', ')})` });
    }
  });

  // Each declared change: a real transition its mechanism can make.
  changes.forEach((pc, i) => {
    const path = `phaseChanges[${i}]`;
    if (components && !components.includes(pc.component)) {
      issues.push({ path, message: `names component "${pc.component}", which is not in components (${components.join(', ')})` });
    }
    if (pc.from === pc.to) issues.push({ path, message: `"${pc.component}" changes from ${pc.from} to ${pc.to}: that is no change` });
    if (pc.from === 'ITEMS' || pc.to === 'ITEMS') {
      issues.push({ path, message: 'ITEMS is a count, not a phase a component changes into: a unit that turns bulk material into items (a filler, a tablet press) only needs an ITEMS outlet' });
    } else if (!MECHANISM_TRANSITIONS[pc.mechanism].some(([f, t]) => f === pc.from && t === pc.to)) {
      issues.push({
        path,
        message: `${pc.mechanism} does not take a component from ${pc.from} to ${pc.to}. It describes ${MECHANISM_TRANSITIONS[pc.mechanism].map(([f, t]) => `${f} -> ${t}`).join(', ')}`
      });
    }
  });

  const inlets = materialPorts(contract, 'INLET');
  if (inlets.length === 0) return issues; // A source: nothing to balance against.

  // Port level: every phase that leaves comes in, or is made by a declared change.
  const madePhases = new Set(changes.map((pc) => pc.to));
  const inPhases = new Set<MaterialPhase>();
  for (const p of inlets) {
    inPhases.add(portPhase(p));
    for (const ph of Object.values(p.dispersed ?? {})) inPhases.add(ph);
  }
  materialPorts(contract, 'OUTLET').forEach((p) => {
    const phase = portPhase(p);
    if (phase === 'ITEMS' || inPhases.has(phase) || madePhases.has(phase)) return;
    issues.push({
      path: `ports[${contract.ports.indexOf(p)}]`,
      message:
        `outlet "${p.id}" sends out a ${phase}, but nothing comes in as ${phase} (inlets bring ${[...inPhases].join(', ') || 'nothing'}) ` +
        `and no phaseChanges entry makes one. Declare how it forms, e.g. phaseChanges: [{ component, from: '${[...inPhases].find((x) => x !== 'ITEMS') ?? 'LIQUID'}', to: '${phase}', mechanism }], or correct the port's phase.`
    });
  });

  // Component level: each component leaves only in phases it came in as, or was changed to.
  for (const c of components ?? []) {
    const cameIn = new Set(inlets.filter((p) => carries(p, c)).map((p) => componentPhaseAt(p, c)));
    const changesOfC = changes.filter((pc) => pc.component === c);
    for (const pc of changesOfC) {
      if (cameIn.size > 0 && !cameIn.has(pc.from)) {
        issues.push({ path: 'phaseChanges', message: `"${c}" changes from ${pc.from}, but it only enters as ${[...cameIn].join(', ')}` });
      }
    }
    if (cameIn.size === 0) continue; // Made in the unit (by a reaction), or not carried in at all.
    const reachable = new Set(cameIn);
    for (const pc of changesOfC) if (reachable.has(pc.from)) reachable.add(pc.to);
    for (const p of outletsFor(contract, c)) {
      if (portPhase(p) === 'ITEMS') continue;
      const ph = componentPhaseAt(p, c);
      if (reachable.has(ph)) continue;
      const from = [...cameIn][0]!;
      issues.push({
        path: `ports[${contract.ports.indexOf(p)}]`,
        message:
          `"${c}" leaves by "${p.id}" as ${ph}, but it enters only as ${[...cameIn].join(', ')} and no phase change takes it to ${ph}. ` +
          `Either declare the change (phaseChanges: [{ component: '${c}', from: '${from}', to: '${ph}', mechanism: '${suggestMechanism(from, ph)}', latentHeatKjPerKg }]), ` +
          `carry it in its own phase on that port (dispersed: { ${c}: '${from}' }), or stop it leaving by "${p.id}" (recovery ${c}: '0').`
      });
    }
  }

  // Energy: a change that takes heat needs a heat source.
  const sources = heatSources(contract);
  changes.forEach((pc, i) => {
    if (pc.from === 'ITEMS' || pc.to === 'ITEMS') return;
    const path = `phaseChanges[${i}]`;
    if (isEndothermic(pc.from, pc.to)) {
      if (sources.length === 0) {
        issues.push({
          path,
          message:
            `${pc.mechanism.toLowerCase()} of "${pc.component}" (${pc.from} -> ${pc.to}) takes heat` +
            `${TYPICAL_LATENT[`${pc.from}>${pc.to}`] ? ` (${TYPICAL_LATENT[`${pc.from}>${pc.to}`]})` : ''}, but the unit has no heat source. ` +
            'Give behavior.dutyKw, a hot GAS inlet, or a UTILITY inlet (steam), and an energy-balance constraint that shows it is enough.'
        });
      }
    }
  });

  return issues;
}

/** Warnings, not errors: a heat-driven change with no latent heat stated, so its energy balance cannot be written. */
export function phaseWarnings(contract: UnitOpContract): ContractValidationIssue[] {
  if (!isPhaseAware(contract)) return [];
  const out: ContractValidationIssue[] = [];
  (contract.phaseChanges ?? []).forEach((pc, i) => {
    if (pc.from === 'ITEMS' || pc.to === 'ITEMS' || pc.mechanism === 'REACTION') return;
    if (!pc.latentHeatKjPerKg && isEndothermic(pc.from, pc.to)) {
      const typical = TYPICAL_LATENT[`${pc.from}>${pc.to}`];
      out.push({
        path: `phaseChanges[${i}]`,
        message: `no latentHeatKjPerKg for ${pc.component} ${pc.from} -> ${pc.to}: state it${typical ? ` (${typical})` : ''} so the energy balance can be checked`
      });
    }
  });
  const b = contract.behavior;
  const gasIn = contract.ports.some((p) => p.direction === 'INLET' && (p.role ?? 'MATERIAL') === 'MATERIAL' && portPhase(p) === 'GAS');
  if (gasIn && b.mode === 'CONTINUOUS_RATE' && b.capacityGpm) {
    out.push({ path: 'behavior.capacityGpm', message: 'capacityGpm limits the flow in gallons, which means nothing for a gas: size a gas unit in ACFM or kg/s in derived values and constraints' });
  }
  return out;
}

function suggestMechanism(from: MaterialPhase, to: MaterialPhase): string {
  for (const [m, list] of Object.entries(MECHANISM_TRANSITIONS)) {
    if (m !== 'REACTION' && list.some(([f, t]) => f === from && t === to)) return m;
  }
  return 'REACTION';
}

/**
 * The phase a node's port carries, when it says: a designed unit's port
 * phase, or a feed's or outlet's stated phase. Undefined for units that state
 * none (they carry liquid or items, by their flow dimension).
 */
export function nodePortPhase(node: Pick<ProcessNode, 'kind' | 'config'> | undefined, portId: string): MaterialPhase | undefined {
  if (!node) return undefined;
  const config = node.config as { phase?: unknown; contract?: { ports?: unknown } };
  if (node.kind === 'TERMINAL') return config.phase === 'GAS' || config.phase === 'SOLID' || config.phase === 'LIQUID' ? config.phase : undefined;
  const ports = Array.isArray(config.contract?.ports) ? (config.contract!.ports as Partial<UnitOpPort>[]) : [];
  const port = ports.find((p) => p?.id === portId);
  return port?.phase;
}

/** What a pipe carries, from the port it leaves (or, failing that, the one it enters). */
export function edgePhase(nodes: readonly Pick<ProcessNode, 'id' | 'kind' | 'config'>[], edge: Pick<ProcessEdge, 'sourceNodeId' | 'sourcePortId' | 'targetNodeId' | 'targetPortId'>): MaterialPhase | undefined {
  const byId = (id: string) => nodes.find((n) => n.id === id);
  return nodePortPhase(byId(edge.sourceNodeId), edge.sourcePortId) ?? nodePortPhase(byId(edge.targetNodeId), edge.targetPortId);
}

/** The latent duty of a contract's phase changes at its design point, against its stated duty. */
export interface PhaseEnergyCheck {
  /** Per heat-taking change: kg/s changing phase and kW it takes. */
  changes: { component: string; from: MaterialPhase; to: MaterialPhase; kgPerS: number; latentKjPerKg: number; kw: number; estimate: boolean }[];
  latentKw: number;
  /** behavior.dutyKw at the design point, when the unit states one. */
  dutyKw?: number;
}

/**
 * How much heat the declared phase changes take at the design point, from the
 * design inlet, the evaluated outlet plan and each change's latent heat: the
 * mass of the component leaving in its new phase times its latent heat. Set
 * against behavior.dutyKw, it catches a design whose duty cannot pay for its
 * own evaporation. Only for continuous units with a design inlet.
 */
export function phaseEnergy(
  contract: UnitOpContract,
  ev: { parameters: Record<string, number>; derived: Record<string, number>; outlets: Record<string, { share?: number; recovery?: Record<string, number> }>; behavior: { mode: string; dutyKw?: number } }
): PhaseEnergyCheck | undefined {
  if (!isPhaseAware(contract) || contract.behavior.mode !== 'CONTINUOUS_RATE') return undefined;
  const design = contract.designInlet;
  const m = design?.massFlowKgPerS;
  if (!m || m <= 0) return undefined;
  const scope = { ...ev.parameters, ...ev.derived };
  const total = Object.values(design?.composition ?? {}).reduce((a, v) => a + v, 0);
  const x = (c: string) => (total > 0 ? (design!.composition![c] ?? 0) / total : 0);
  const outlets = materialPorts(contract, 'OUTLET');
  const byRecovery = Object.values(ev.outlets).some((o) => o.recovery);
  const changes: PhaseEnergyCheck['changes'] = [];
  for (const pc of contract.phaseChanges ?? []) {
    if (pc.from === 'ITEMS' || pc.to === 'ITEMS' || !isEndothermic(pc.from, pc.to) || !pc.latentHeatKjPerKg) continue;
    let latent: number;
    try {
      latent = evaluateNumber(pc.latentHeatKjPerKg, scope);
    } catch {
      continue;
    }
    if (!(latent > 0)) continue;
    // Mass leaving in the new phase: by recovery, the component's own share; by share, the port's whole share.
    let kgPerS = 0;
    for (const p of outlets) {
      if (componentPhaseAt(p, pc.component) !== pc.to) continue;
      const o = ev.outlets[p.id];
      if (byRecovery) kgPerS += m * x(pc.component) * (o?.recovery?.[pc.component] ?? 0);
      else if (o?.share !== undefined) kgPerS += m * o.share;
    }
    // Less what already arrives in the new phase, when the inlets say so; else the figure is an upper bound.
    const arrivesChanged = materialPorts(contract, 'INLET').some((p) => carries(p, pc.component) && componentPhaseAt(p, pc.component) === pc.to);
    if (kgPerS <= 0) continue;
    changes.push({ component: pc.component, from: pc.from, to: pc.to, kgPerS, latentKjPerKg: latent, kw: kgPerS * latent, estimate: arrivesChanged });
  }
  if (!changes.length) return undefined;
  const latentKw = changes.reduce((a, c) => a + c.kw, 0);
  return { changes, latentKw, ...(ev.behavior.mode === 'CONTINUOUS_RATE' && ev.behavior.dutyKw !== undefined ? { dutyKw: ev.behavior.dutyKw } : {}) };
}

/** A warning when the latent duty at the design point is more than the unit's stated duty. */
export function phaseEnergyWarnings(check: PhaseEnergyCheck | undefined): string[] {
  if (!check || check.dutyKw === undefined) return [];
  const exact = check.changes.every((c) => !c.estimate);
  if (exact ? check.latentKw <= Math.abs(check.dutyKw) * 1.001 : true) return [];
  const what = check.changes.map((c) => `${c.component} ${c.from.toLowerCase()} to ${c.to.toLowerCase()}: ${round3(c.kgPerS)} kg/s x ${Math.round(c.latentKjPerKg)} kJ/kg = ${Math.round(c.kw)} kW`).join('; ');
  return [
    `phase-energy: at the design point the phase changes take ${Math.round(check.latentKw)} kW of latent heat (${what}), more than the unit's duty of ${Math.round(Math.abs(check.dutyKw))} kW. The duty cannot make the change it declares: raise the duty, or let less change phase.`
  ];
}

const round3 = (v: number) => Number(v.toPrecision(3));
