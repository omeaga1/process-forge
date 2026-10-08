import { evaluateNumber } from './expression.js';
import { parseUnit, type Dimension } from './dimensions.js';
import { ENGINE_NAME_UNITS, type UnitOpContract } from './contract.js';
import { unitScale } from './unitConversion.js';
import type { UnitOpEvaluation } from './evaluate.js';
import { ARCHETYPE_RELATIONS, type PhysicsRelation } from './archetypes.js';

/**
 * Checking an archetype's governing relations against a contract's own
 * numbers (see PhysicsRelation in archetypes.ts).
 *
 * Every role is bound to one of the contract's quantities, its design-point
 * value read from the evaluation, converted to SI by its declared unit, and
 * the two sides of the relation compared. Binding is by contract.roles when
 * the contract states it; otherwise by kind of quantity (the unit's
 * dimension) and name, preferring what the contract works out (derived
 * values), then what the engine supplies (inlet.*), then parameters. Two
 * candidates that hold the same quantity in different units (acfm and m3/s)
 * count as one.
 */

export interface RelationBinding {
  role: string;
  name: string;
  value: number;
  unit: string;
  si: number;
}

export interface RelationResult {
  id: string;
  what: string;
  status: 'holds' | 'fails' | 'unbound';
  bindings: RelationBinding[];
  /** Roles that could not be bound, and why. */
  missing?: { role: string; what: string; reason: string }[];
  lhs?: number;
  rhs?: number;
  /** (lhs - rhs) / max(|lhs|, |rhs|). */
  deviation?: number;
  fix: string;
}

const sameDim = (a: Dimension, b: Dimension) => a.every((v, i) => Math.abs(v - b[i]!) < 1e-9);

interface Candidate {
  name: string;
  label: string;
  unit: string;
  value: number;
  tier: number;
}

/** Everything the contract has a design-point value for: derived (tier 0), engine names (1), parameters (2). */
function candidates(contract: UnitOpContract, ev: UnitOpEvaluation): Candidate[] {
  const out: Candidate[] = [];
  for (const d of contract.derived) {
    const v = ev.derived[d.name];
    if (v !== undefined && Number.isFinite(v)) out.push({ name: d.name, label: d.label, unit: d.unit, value: v, tier: 0 });
  }
  const design = contract.designInlet as Record<string, unknown> | undefined;
  for (const [field, unit] of Object.entries(ENGINE_NAME_UNITS)) {
    const v = design?.[field];
    if (typeof v === 'number') out.push({ name: `inlet.${field}`, label: `inlet ${field}`, unit, value: v, tier: 1 });
  }
  for (const [port, d] of Object.entries(contract.designPorts ?? {})) {
    for (const [field, unit] of Object.entries(ENGINE_NAME_UNITS)) {
      const v = (d as Record<string, unknown>)[field];
      if (typeof v === 'number') out.push({ name: `port.${port}.${field}`, label: `port ${port} ${field}`, unit, value: v, tier: 1 });
    }
  }
  for (const p of contract.parameters) {
    const v = ev.parameters[p.name];
    if (v !== undefined) out.push({ name: p.name, label: p.label, unit: p.unit, value: v, tier: 2 });
  }
  return out;
}

/** A value in SI: a lone temperature in K, everything else by its unit's size. */
export function toSI(value: number, unit: string): number | null {
  const s = unitScale(unit);
  if (!s) return null;
  return s.f * value + (s.o ?? 0);
}

function bind(role: string, spec: PhysicsRelation['roles'][string], contract: UnitOpContract, all: Candidate[]): RelationBinding | { reason: string } {
  const want = parseUnit(spec.unit);
  if (!want) return { reason: 'unknown unit' };
  const fits = (c: Candidate) => {
    const d = parseUnit(c.unit);
    return !!d && sameDim(d, want);
  };
  const stated = contract.roles?.[role];
  if (stated) {
    const c = all.find((x) => x.name === stated);
    if (!c) return { reason: `roles.${role} names "${stated}", which has no design-point value` };
    if (!fits(c)) return { reason: `roles.${role} names "${stated}" (${c.unit}), which is not ${spec.unit === '-' ? 'dimensionless' : `${spec.unit}-like`}` };
    const si = toSI(c.value, c.unit);
    return si === null ? { reason: `the unit of "${stated}" is not one the engine can convert` } : { role, name: c.name, value: c.value, unit: c.unit, si };
  }
  // The name pattern is a ranked list: an earlier alternative is a better match
  // ("steam" before "heat" for an evaporator's duty). Then what the contract
  // works out beats what the engine supplies, which beats a typed-in parameter.
  const alts = (spec.names ?? '').split('|').filter(Boolean).map((x) => new RegExp(x, 'i'));
  const rank = (c: Candidate) => {
    if (!alts.length) return 0;
    const i = alts.findIndex((re) => re.test(c.name) || re.test(c.label));
    return i < 0 ? Infinity : i;
  };
  const pool = all.filter((c) => fits(c) && rank(c) < Infinity);
  if (pool.length) {
    const best = Math.min(...pool.map(rank));
    const top = pool.filter((c) => rank(c) === best);
    const tier = Math.min(...top.map((c) => c.tier));
    const here = top.filter((c) => c.tier === tier);
    const sis = here.map((c) => toSI(c.value, c.unit));
    if (sis.some((v) => v === null)) return { reason: `the unit of ${here.map((c) => c.name).join(', ')} is not one the engine can convert` };
    const first = sis[0]!;
    // Several names for one quantity (acfm and m3/s) are fine; different quantities are not.
    const agree = sis.every((v) => Math.abs(v! - first) <= 1e-3 * Math.max(Math.abs(first), 1e-12));
    if (!agree) return { reason: `more than one ${spec.unit === '-' ? 'dimensionless' : `${spec.unit}-like`} value could be ${spec.what} (${here.map((c) => c.name).join(', ')}): state roles.${role}` };
    const c = here[0]!;
    return { role, name: c.name, value: c.value, unit: c.unit, si: first };
  }
  return { reason: `no ${spec.unit === '-' ? 'dimensionless' : `${spec.unit}-like`} value that reads as ${spec.what}` };
}

export function checkRelations(contract: UnitOpContract, archetypeId: string, ev: UnitOpEvaluation): RelationResult[] {
  const relations = ARCHETYPE_RELATIONS[archetypeId] ?? [];
  if (!relations.length || ev.error) return [];
  const all = candidates(contract, ev);
  return relations.map((rel) => {
    const bindings: RelationBinding[] = [];
    const missing: NonNullable<RelationResult['missing']> = [];
    for (const [role, spec] of Object.entries(rel.roles)) {
      const b = bind(role, spec, contract, all);
      if ('reason' in b) missing.push({ role, what: spec.what, reason: b.reason });
      else bindings.push(b);
    }
    const base = { id: rel.id, what: rel.what, bindings, fix: rel.fix };
    if (missing.length) return { ...base, status: 'unbound' as const, missing };
    const scope = Object.fromEntries(bindings.map((b) => [b.role, b.si]));
    let lhs: number;
    let rhs: number;
    try {
      lhs = evaluateNumber(rel.lhs, scope);
      rhs = evaluateNumber(rel.rhs, scope);
    } catch {
      return { ...base, status: 'unbound' as const, missing: [{ role: '-', what: rel.what, reason: 'could not be evaluated at the design point' }] };
    }
    const scale = Math.max(Math.abs(lhs), Math.abs(rhs), 1e-12);
    const deviation = (lhs - rhs) / scale;
    const tol = rel.tolerance ?? 0.03;
    const op = rel.relation ?? '=';
    const holds = op === '=' ? Math.abs(deviation) <= tol : op === '>=' ? deviation >= -tol : deviation <= tol;
    return { ...base, status: holds ? ('holds' as const) : ('fails' as const), lhs, rhs, deviation };
  });
}

/** "4.19 kW x 0.7" style, for messages: each binding's own value and unit. */
export function describeBindings(r: RelationResult): string {
  return r.bindings.map((b) => `${b.role} = ${b.name} (${Number(b.value.toPrecision(4))} ${b.unit})`).join(', ');
}
