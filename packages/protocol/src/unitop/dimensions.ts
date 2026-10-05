import { parseExpression, type Ast } from './expression.js';

/**
 * Dimensional analysis for unit-op contracts.
 *
 * The expression language works on bare numbers in whatever units the
 * contract declares, so `unit` on a parameter used to be documentation only.
 * Mixing units up (kW for W, gal for L, a flow added to a volume) is the most
 * common physical mistake a model makes when it writes a contract, and nothing
 * caught it: the numbers came out, just wrong.
 *
 * This checks DIMENSIONS, not scale. Every declared unit is reduced to powers
 * of mass, length, time and temperature, every expression's dimension is
 * inferred from what it reads, and the result has to match what it is used
 * for: a derived value its declared unit, behavior.cycleSeconds a time,
 * dutyKw a power. Adding or comparing quantities of different dimensions is
 * rejected.
 *
 * Scale is deliberately left alone. Conversion factors are bare numbers
 * (`ratePerMin / 60`, `duty * 1000`), and a bare number is dimensionless when
 * it multiplies and takes the other side's dimension when it is added or
 * compared (`temperatureC + 273.15`, `flow > 0`). So `x_min * 60` written into
 * a field declared in seconds passes, as it should.
 *
 * A unit the checker does not recognise switches checking off for that value
 * rather than guessing; unitWarnings() lists those so a model can fix them.
 */

/** Exponents of mass, length, time and temperature. Counts (items, batches) are dimensionless. */
export type Dimension = readonly [m: number, l: number, t: number, k: number];

const D = (m: number, l: number, t: number, k: number): Dimension => [m, l, t, k];

export const DIMENSIONLESS: Dimension = D(0, 0, 0, 0);
export const MASS = D(1, 0, 0, 0);
export const LENGTH = D(0, 1, 0, 0);
export const TIME = D(0, 0, 1, 0);
export const TEMPERATURE = D(0, 0, 0, 1);
export const VOLUME = D(0, 3, 0, 0);
export const VOLUME_FLOW = D(0, 3, -1, 0);
export const MASS_FLOW = D(1, 0, -1, 0);
export const RATE = D(0, 0, -1, 0);
export const ENERGY = D(1, 2, -2, 0);
export const POWER = D(1, 2, -3, 0);
export const PRESSURE = D(1, -1, -2, 0);
export const DENSITY = D(1, -3, 0, 0);
export const SPECIFIC_ENERGY = D(0, 2, -2, 0);
export const SPECIFIC_HEAT = D(0, 2, -2, -1);

/** Unit symbols the checker knows, by dimension. Prefixed forms are listed rather than parsed, so "mm" is never mega-something. */
const ATOMS: Record<string, Dimension> = {};
const add = (dim: Dimension, ...names: string[]) => {
  for (const n of names) ATOMS[n] = dim;
};
add(MASS, 'kg', 'g', 'mg', 't', 'tonne', 'tonnes', 'lb', 'lbs', 'lbm', 'oz', 'ton', 'tons');
add(LENGTH, 'm', 'mm', 'cm', 'km', 'um', 'µm', 'in', 'inch', 'inches', 'ft', 'feet', 'foot');
add(TIME, 's', 'sec', 'secs', 'second', 'seconds', 'min', 'mins', 'minute', 'minutes', 'h', 'hr', 'hrs', 'hour', 'hours', 'd', 'day', 'days', 'ms');
add(VOLUME, 'L', 'l', 'mL', 'ml', 'gal', 'gallon', 'gallons', 'bbl', 'cuft');
add(TEMPERATURE, 'K', '°C', 'degC', 'C', '°F', 'degF', 'F', 'R', 'delta°C', 'ΔC', 'Δ°C');
add(ENERGY, 'J', 'kJ', 'MJ', 'GJ', 'Wh', 'kWh', 'MWh', 'BTU', 'Btu', 'btu', 'cal', 'kcal', 'therm');
add(POWER, 'W', 'kW', 'MW', 'hp', 'HP');
add(PRESSURE, 'Pa', 'kPa', 'MPa', 'bar', 'barg', 'bara', 'mbar', 'psi', 'psig', 'psia', 'atm', 'mmHg', 'inH2O');
add(D(1, 1, -2, 0), 'N', 'kN', 'lbf');
add(RATE, 'Hz', 'rpm', 'RPM');
add(VOLUME_FLOW, 'gpm', 'GPM', 'lpm', 'cfm', 'CFM');
add(D(1, -1, -1, 0), 'cP', 'cp', 'Pa·s', 'mPa·s');
/** Counts and ratios: dimensionless. */
add(
  DIMENSIONLESS,
  '-', '%', 'ratio', 'fraction', 'ppm', 'ppb', 'rad', 'deg', '°', 'dB',
  'item', 'items', 'unit', 'units', 'pc', 'pcs', 'piece', 'pieces', 'part', 'parts', 'each', 'ea',
  'bottle', 'bottles', 'can', 'cans', 'case', 'cases', 'carton', 'cartons', 'box', 'boxes', 'bag', 'bags',
  'pallet', 'pallets', 'skid', 'skids', 'layer', 'layers', 'label', 'labels', 'container', 'containers', 'jar', 'jars',
  'cap', 'caps', 'pouch', 'pouches', 'tray', 'trays', 'sheet', 'sheets', 'cup', 'cups', 'tube', 'tubes', 'kit', 'kits',
  'nozzle', 'nozzles', 'head', 'heads', 'lane', 'lanes', 'station', 'stations', 'pocket', 'pockets', 'cavity', 'cavities',
  'batch', 'batches', 'cycle', 'cycles', 'stage', 'stages', 'plate', 'plates', 'pass', 'passes', 'blade', 'blades',
  'mol', 'kmol', 'count', 'x', '×'
);

const SUPERSCRIPTS: Record<string, string> = { '²': '2', '³': '3', '⁻': '-', '¹': '1', '⁴': '4' };

/** One factor such as "m2", "s^-1", "mm³": its symbol and power. */
function parseFactor(raw: string): { symbol: string; power: number } | null {
  const s = raw.replace(/[²³⁻¹⁴]/g, (c) => SUPERSCRIPTS[c] ?? c);
  const m = /^(.*?)(?:\^?(-?\d+))?$/.exec(s);
  if (!m) return null;
  const symbol = m[1] ?? '';
  // A trailing digit is a power only after a letter ("m2", "s-1"); "E-301" is not a unit.
  if (m[2] !== undefined && !/[A-Za-zµ°]$/.test(symbol)) return null;
  return { symbol, power: m[2] === undefined ? 1 : Number(m[2]) };
}

const times = (a: Dimension, b: Dimension, k = 1): Dimension => D(a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2], a[3] + k * b[3]);

/**
 * The dimension of a unit string, or null when the checker does not know it.
 * Engineering convention: everything after the first "/" is the denominator,
 * so "kJ/kg-K" and "W/m2-K" read as kJ/(kg·K) and W/(m²·K).
 */
export function parseUnit(unit: string): Dimension | null {
  const u = unit.trim();
  if (u === '' || u === '-' || u === '1') return DIMENSIONLESS;
  if (u in ATOMS) return ATOMS[u]!;
  const slash = u.indexOf('/');
  const num = slash < 0 ? u : u.slice(0, slash);
  const den = slash < 0 ? '' : u.slice(slash + 1).replace(/^\(|\)$/g, '');
  let dim = DIMENSIONLESS;
  for (const [part, sign] of [[num, 1], [den, -1]] as const) {
    const factors = part.split(/[\s·*.\-/]+(?![0-9])/).filter(Boolean);
    for (const f of factors) {
      if (/^\d+$/.test(f)) continue; // "1/min"
      const parsed = parseFactor(f);
      if (!parsed) return null;
      if (parsed.symbol === '' || parsed.symbol === '1') continue;
      const atom = ATOMS[parsed.symbol];
      if (!atom) return null;
      dim = times(dim, atom, sign * parsed.power);
    }
  }
  return dim;
}

const SI_NAMES: [Dimension, string][] = [
  [DIMENSIONLESS, 'dimensionless'],
  [MASS, 'mass'],
  [LENGTH, 'length'],
  [D(0, 2, 0, 0), 'area'],
  [VOLUME, 'volume'],
  [TIME, 'time'],
  [TEMPERATURE, 'temperature'],
  [RATE, 'a rate (per time)'],
  [VOLUME_FLOW, 'volumetric flow'],
  [MASS_FLOW, 'mass flow'],
  [D(0, 1, -1, 0), 'speed'],
  [ENERGY, 'energy'],
  [POWER, 'power'],
  [PRESSURE, 'pressure'],
  [DENSITY, 'density'],
  [SPECIFIC_ENERGY, 'energy per mass'],
  [SPECIFIC_HEAT, 'specific heat'],
  [D(0, 0, -1, 1), 'temperature per time'],
  [D(1, 0, -3, -1), 'heat transfer coefficient (power per area per temperature)'],
  [D(1, 0, -2, 0), 'mass per area per time']
];

const sameDim = (a: Dimension, b: Dimension) => a.every((v, i) => Math.abs(v - b[i]!) < 1e-9);

/** A readable name for a dimension: "power", or "kg^1 m^2 s^-3" when it has no common name. */
export function describeDimension(d: Dimension): string {
  const named = SI_NAMES.find(([dim]) => sameDim(dim, d));
  if (named) return named[1];
  const base = ['kg', 'm', 's', 'K'];
  return d
    .map((p, i) => (p === 0 ? '' : `${base[i]}${p === 1 ? '' : `^${Math.round(p * 100) / 100}`}`))
    .filter(Boolean)
    .join('·');
}

/**
 * What an expression's value is. `lit` is a bare number (or arithmetic on bare
 * numbers): it fits any dimension. `unknown` reads something whose unit the
 * checker does not know, and is not checked.
 */
export type Inferred =
  | { kind: 'dim'; dim: Dimension }
  | { kind: 'lit' }
  | { kind: 'unknown' }
  | { kind: 'bool' };

const LIT: Inferred = { kind: 'lit' };
const UNKNOWN: Inferred = { kind: 'unknown' };
const BOOL: Inferred = { kind: 'bool' };
const dimOf = (dim: Dimension): Inferred => ({ kind: 'dim', dim });

/** The dimensions of the names the engine supplies. */
export const ENGINE_NAME_DIMENSIONS: Record<string, Dimension> = {
  'inlet.temperatureC': TEMPERATURE,
  'inlet.massFlowKgPerS': MASS_FLOW,
  'inlet.volumetricFlowGpm': VOLUME_FLOW,
  'inlet.piecesPerMinute': RATE,
  'inlet.densityGPerCm3': DENSITY,
  'inlet.specificHeatKjPerKgK': SPECIFIC_HEAT,
  'inlet.latentHeatKjPerKg': SPECIFIC_ENERGY,
  'utility.temperatureC': TEMPERATURE,
  'utility.massFlowKgPerS': MASS_FLOW,
  'utility.specificHeatKjPerKgK': SPECIFIC_HEAT,
  'batch.gallons': VOLUME,
  'batch.temperatureC': TEMPERATURE,
  'batch.massKg': MASS,
  'batch.number': DIMENSIONLESS,
  'batch.cpKjPerKgK': SPECIFIC_HEAT,
  'batch.densityGPerCm3': DENSITY,
  PI: DIMENSIONLESS,
  E: DIMENSIONLESS
};

export interface DimensionProblem {
  message: string;
}

/** The dimension of a name an expression reads: engine-supplied, a component fraction, or declared. */
export type DimensionEnv = (name: string) => Inferred;

/** A constant exponent, when the AST is one (2, -1, 0.5). */
function constantOf(a: Ast): number | null {
  if (a.k === 'num') return a.v;
  if (a.k === 'unary' && a.op === '-') {
    const v = constantOf(a.a);
    return v === null ? null : -v;
  }
  if (a.k === 'bin' && a.op === '/') {
    const x = constantOf(a.a);
    const y = constantOf(a.b);
    return x === null || y === null || y === 0 ? null : x / y;
  }
  return null;
}

/**
 * Infers an expression's dimension, collecting every place it adds or compares
 * unlike quantities. Never throws on dimensions; a syntax error is left to the
 * structural checks.
 */
export function inferDimension(src: string, env: DimensionEnv): { result: Inferred; problems: string[] } {
  const problems: string[] = [];
  let ast: Ast;
  try {
    ast = parseExpression(src);
  } catch {
    return { result: UNKNOWN, problems };
  }

  /** Two values that must share a dimension (sum, comparison, min, if branches). */
  const unify = (a: Inferred, b: Inferred, what: string): Inferred => {
    if (a.kind === 'bool' || b.kind === 'bool') return a.kind === 'bool' && b.kind === 'bool' ? BOOL : UNKNOWN;
    if (a.kind === 'unknown' || b.kind === 'unknown') return UNKNOWN;
    if (a.kind === 'lit') return b;
    if (b.kind === 'lit') return a;
    if (!sameDim(a.dim, b.dim)) {
      problems.push(`${what} ${describeDimension(a.dim)} and ${describeDimension(b.dim)}`);
      return UNKNOWN;
    }
    return a;
  };

  const scale = (a: Inferred, b: Inferred, k: 1 | -1): Inferred => {
    if (a.kind === 'unknown' || b.kind === 'unknown' || a.kind === 'bool' || b.kind === 'bool') return UNKNOWN;
    if (a.kind === 'lit' && b.kind === 'lit') return LIT;
    const da = a.kind === 'lit' ? DIMENSIONLESS : a.dim;
    const db = b.kind === 'lit' ? DIMENSIONLESS : b.dim;
    return dimOf(times(da, db, k));
  };

  const power = (base: Inferred, exponent: Ast, expDim: Inferred): Inferred => {
    if (expDim.kind === 'dim' && !sameDim(expDim.dim, DIMENSIONLESS)) {
      problems.push(`an exponent must be dimensionless, not ${describeDimension(expDim.dim)}`);
    }
    if (base.kind !== 'dim') return base.kind === 'lit' ? LIT : base;
    if (sameDim(base.dim, DIMENSIONLESS)) return base;
    const k = constantOf(exponent);
    if (k === null) return UNKNOWN;
    return dimOf(D(base.dim[0] * k, base.dim[1] * k, base.dim[2] * k, base.dim[3] * k));
  };

  const mustBeDimensionless = (v: Inferred, fn: string): void => {
    if (v.kind === 'dim' && !sameDim(v.dim, DIMENSIONLESS)) {
      problems.push(`${fn}() needs a dimensionless argument, not ${describeDimension(v.dim)}; divide by a reference value first`);
    }
  };

  const walk = (n: Ast): Inferred => {
    switch (n.k) {
      case 'num':
        return LIT;
      case 'ref':
        return env(n.name);
      case 'unary':
        return n.op === '!' ? BOOL : walk(n.a);
      case 'bin': {
        if (n.op === '&&' || n.op === '||') {
          walk(n.a);
          walk(n.b);
          return BOOL;
        }
        const a = walk(n.a);
        if (n.op === '^') return power(a, n.b, walk(n.b));
        const b = walk(n.b);
        switch (n.op) {
          case '+':
          case '-':
            return unify(a, b, `adds or subtracts`);
          case '%':
            return unify(a, b, `takes a remainder of`);
          case '*':
            return scale(a, b, 1);
          case '/':
            return scale(a, b, -1);
          default:
            unify(a, b, `compares`);
            return BOOL;
        }
      }
      case 'call': {
        const args = n.args.map(walk);
        switch (n.name) {
          case 'if':
            return args.length === 3 ? unify(args[1]!, args[2]!, 'if() chooses between') : UNKNOWN;
          case 'min':
          case 'max':
          case 'clamp':
            return args.reduce((acc, v) => unify(acc, v, `${n.name}() mixes`), LIT);
          case 'abs':
          case 'floor':
          case 'ceil':
          case 'round':
            return args[0] ?? UNKNOWN;
          case 'sign':
            return LIT;
          case 'sqrt':
            return args[0] ? power(args[0], { k: 'num', v: 0.5 }, LIT) : UNKNOWN;
          case 'pow':
            return args.length === 2 ? power(args[0]!, n.args[1]!, args[1]!) : UNKNOWN;
          case 'exp':
          case 'log':
          case 'log10':
            if (args[0]) mustBeDimensionless(args[0], n.name);
            return LIT;
          case 'interp': {
            const [x, ...pts] = args;
            let xs: Inferred = x ?? UNKNOWN;
            let ys: Inferred = LIT;
            pts.forEach((p, i) => {
              if (i % 2 === 0) xs = unify(xs, p, 'interp() looks up x as');
              else ys = unify(ys, p, 'interp() table mixes y values of');
            });
            return ys;
          }
          default:
            return UNKNOWN;
        }
      }
    }
  };

  return { result: walk(ast), problems };
}

/**
 * Checks that an expression's dimension fits what it is used for. `expected`
 * null means anything numeric (a reported figure in the contract's own unit).
 */
export function checkDimension(src: string, expected: Dimension | null, env: DimensionEnv, what: string): string[] {
  const { result, problems } = inferDimension(src, env);
  const out = problems.map((p) => `the expression ${p}: check the units of what it reads`);
  if (expected && result.kind === 'dim' && !sameDim(result.dim, expected)) {
    out.push(`${what} must be ${describeDimension(expected)}, but the expression works out to ${describeDimension(result.dim)}`);
  }
  if (result.kind === 'bool' && expected) out.push(`${what} must be a number, not a comparison`);
  return out;
}

export { sameDim as sameDimension };
