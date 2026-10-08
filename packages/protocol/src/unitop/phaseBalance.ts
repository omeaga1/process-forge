import type { UnitOpContract, UnitOpPort, ContractValidationIssue } from './contract.js';
import { isEndothermic, MECHANISM_TRANSITIONS, type MaterialPhase } from './phases.js';

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
  const gasOut = contract.ports.some((p) => p.direction === 'OUTLET' && portPhase(p) === 'GAS');
  if (gasOut && b.mode === 'CONTINUOUS_RATE' && b.capacityGpm) {
    out.push({ path: 'behavior.capacityGpm', message: 'capacityGpm limits the flow in gallons of liquid; a gas or solid unit is sized by its own figures (ACFM, kg/h) in derived values and constraints' });
  }
  return out;
}

function suggestMechanism(from: MaterialPhase, to: MaterialPhase): string {
  for (const [m, list] of Object.entries(MECHANISM_TRANSITIONS)) {
    if (m !== 'REACTION' && list.some(([f, t]) => f === from && t === to)) return m;
  }
  return 'REACTION';
}
