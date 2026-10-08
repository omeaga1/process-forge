import { parseUnit, type Dimension } from './dimensions.js';

/**
 * Converting a value between units of the same dimension: what lets an
 * engineer type a pressure in bar into a parameter the contract declares in
 * psi, or read a temperature in °F, without the contract changing.
 *
 * dimensions.ts checks that units AGREE; this knows how BIG each one is. Every
 * unit is reduced to SI (kg, m, s, K) by a factor, and a temperature on its
 * own by a factor and an offset (°C, °F). In a compound unit a temperature is
 * a difference (kJ/kg-K = kJ/kg-°C), so only the factor applies.
 *
 * Gauge pressures (psig, barg) convert only to each other: turning a gauge
 * reading into an absolute one needs the local atmosphere, which a unit
 * string does not carry.
 */

interface Scale {
  /** SI value of one of this unit. */
  f: number;
  /** For a lone temperature: SI (K) = f * v + o. */
  o?: number;
  gauge?: true;
}

const G = 9.80665;
const LB = 0.45359237;
const FT = 0.3048;
const GAL = 3.785411784e-3;
const BTU = 1055.05585262;

const S: Record<string, Scale> = {};
const def = (f: number, ...names: string[]) => {
  for (const n of names) S[n] = { f };
};
def(1, 'kg');
def(1e-3, 'g');
def(1e-6, 'mg');
def(1000, 't', 'tonne', 'tonnes');
def(LB, 'lb', 'lbs', 'lbm');
def(LB / 16, 'oz');
def(2000 * LB, 'ton', 'tons');
def(LB / 7000, 'gr', 'grain', 'grains');
def(1, 'm');
def(1e-3, 'mm');
def(1e-2, 'cm');
def(1e3, 'km');
def(1e-6, 'um', 'µm');
def(0.0254, 'in', 'inch', 'inches');
def(FT, 'ft', 'feet', 'foot');
def(1, 's', 'sec', 'secs', 'second', 'seconds');
def(1e-3, 'ms');
def(60, 'min', 'mins', 'minute', 'minutes');
def(3600, 'h', 'hr', 'hrs', 'hour', 'hours');
def(86400, 'd', 'day', 'days');
def(1e-3, 'L', 'l');
def(1e-6, 'mL', 'ml');
def(GAL, 'gal', 'gallon', 'gallons');
def(0.158987294928, 'bbl');
def(FT ** 3, 'cuft', 'scf', 'acf', 'SCF', 'ACF');
def(1000 * FT ** 3, 'kcf', 'kacf', 'kscf');
def(1, 'Nm3', 'Nm³', 'Sm3');
def(1, 'K', 'delta°C', 'ΔC', 'Δ°C');
def(5 / 9, 'R');
def(1, 'J');
def(1e3, 'kJ');
def(1e6, 'MJ');
def(1e9, 'GJ');
def(3600, 'Wh');
def(3.6e6, 'kWh');
def(3.6e9, 'MWh');
def(BTU, 'BTU', 'Btu', 'btu');
def(4.184, 'cal');
def(4184, 'kcal');
def(1.05505585262e8, 'therm');
def(1, 'W');
def(1e3, 'kW');
def(1e6, 'MW');
def(745.69987158, 'hp', 'HP');
def(1, 'Pa');
def(1e3, 'kPa');
def(1e6, 'MPa');
def(1e5, 'bar', 'bara');
def(100, 'mbar');
def(6894.757293, 'psi', 'psia');
def(101325, 'atm');
def(133.322387, 'mmHg');
def(249.08891, 'inH2O');
def(1, 'N');
def(1e3, 'kN');
def(LB * G, 'lbf');
def(1, 'Hz');
def(1 / 60, 'rpm', 'RPM');
def(GAL / 60, 'gpm', 'GPM');
def(1e-3 / 60, 'lpm');
def(FT ** 3 / 60, 'cfm', 'CFM', 'acfm', 'ACFM', 'scfm', 'SCFM');
def(1e-3, 'cP', 'cp', 'mPa·s');
def(1, 'Pa·s');
def(1, '-', 'ratio', 'fraction', 'x', '×', 'count', 'rad');
def(0.01, '%');
def(1e-6, 'ppm');
def(1e-9, 'ppb');
// Lone temperatures carry an offset; in a compound unit they are differences.
S['°C'] = { f: 1, o: 273.15 };
S['degC'] = S['°C'];
S['C'] = S['°C'];
S['°F'] = { f: 5 / 9, o: 459.67 * (5 / 9) };
S['degF'] = S['°F'];
S['F'] = S['°F'];
S['psig'] = { f: 6894.757293, gauge: true };
S['barg'] = { f: 1e5, gauge: true };
S['kPag'] = { f: 1e3, gauge: true };

const SUPERSCRIPTS: Record<string, string> = { '²': '2', '³': '3', '⁻': '-', '¹': '1', '⁴': '4' };

/** How big a unit is in SI, or null when it is not one this knows. Counts (items, bottles) are 1. */
export function unitScale(unit: string): Scale | null {
  const u = unit.trim();
  if (u === '' || u === '1') return { f: 1 };
  if (Object.prototype.hasOwnProperty.call(S, u)) return S[u]!;
  const dim = parseUnit(u);
  if (!dim) return null;
  const slash = u.indexOf('/');
  const num = slash < 0 ? u : u.slice(0, slash);
  const den = slash < 0 ? '' : u.slice(slash + 1).replace(/^\(|\)$/g, '');
  let f = 1;
  for (const [part, sign] of [[num, 1], [den, -1]] as const) {
    for (const raw of part.split(/[\s·*.\-/]+(?![0-9])/).filter(Boolean)) {
      if (/^\d+$/.test(raw)) continue;
      if (Object.prototype.hasOwnProperty.call(S, raw)) {
        const s = S[raw]!;
        if (s.gauge) return null;
        f *= s.f ** sign;
        continue;
      }
      const t = raw.replace(/[²³⁻¹⁴]/g, (c) => SUPERSCRIPTS[c] ?? c);
      const m = /^(.*?)\^?(-?\d+)$/.exec(t);
      const sym = m ? m[1]! : t;
      const pow = m ? Number(m[2]) : 1;
      if (Object.prototype.hasOwnProperty.call(S, sym)) {
        const s = S[sym]!;
        if (s.gauge) return null;
        f *= s.f ** (sign * pow);
        continue;
      }
      // A count word (items, bottles): dimensionless, size 1.
      const d = parseUnit(sym);
      if (d && d.every((x) => x === 0)) continue;
      return null;
    }
  }
  return { f };
}

/** `value` in `from` expressed in `to`, or null when they are not the same kind of quantity. */
export function convertUnit(value: number, from: string, to: string): number | null {
  if (from.trim() === to.trim()) return value;
  const a = unitScale(from);
  const b = unitScale(to);
  if (!a || !b) return null;
  if (!!a.gauge !== !!b.gauge) return null;
  const da = parseUnit(from) ?? (a.gauge ? PRESSURE_DIM : null);
  const db = parseUnit(to) ?? (b.gauge ? PRESSURE_DIM : null);
  if (!da || !db || !sameDim(da, db)) return null;
  // A lone temperature is absolute, with its offset; otherwise a pure scale.
  const lone = a.o !== undefined || b.o !== undefined;
  if (lone && isTemperature(da)) {
    const si = a.f * value + (a.o ?? 0);
    return (si - (b.o ?? 0)) / b.f;
  }
  return (value * a.f) / b.f;
}

const PRESSURE_DIM: Dimension = [1, -1, -2, 0];
const sameDim = (a: Dimension, b: Dimension) => a.every((v, i) => Math.abs(v - b[i]!) < 1e-9);
const isTemperature = (d: Dimension) => sameDim(d, [0, 0, 0, 1]);

/** The units an engineer is likely to want for a quantity, by dimension. The declared unit is always offered too. */
const FAMILIES: string[][] = [
  ['°C', '°F', 'K'],
  ['psi', 'bar', 'kPa', 'inH2O', 'mmHg', 'atm'],
  ['psig', 'barg', 'kPag'],
  ['gal/min', 'L/min', 'm3/h', 'ft3/min', 'L/s'],
  ['kg/h', 'kg/s', 'lb/h', 't/h', 'kg/min', 'lb/min'],
  ['kW', 'hp', 'W', 'BTU/h', 'MW'],
  ['kJ', 'kWh', 'BTU', 'MJ'],
  ['kg', 'lb', 'g', 't'],
  ['m', 'mm', 'in', 'ft', 'cm', 'um'],
  ['m2', 'ft2', 'cm2', 'in2'],
  ['gal', 'L', 'm3', 'ft3', 'bbl'],
  ['s', 'min', 'h', 'day'],
  ['kJ/kg', 'BTU/lb', 'J/g'],
  ['kJ/kg-K', 'BTU/lb-°F', 'J/g-K'],
  ['kg/m3', 'g/cm3', 'lb/ft3', 'lb/gal'],
  ['m/s', 'ft/min', 'ft/s', 'm/min'],
  ['W/m2-K', 'BTU/h-ft2-°F', 'kW/m2-K'],
  ['W/m-K', 'BTU/h-ft-°F'],
  ['cP', 'Pa·s'],
  ['rpm', 'Hz', '1/min'],
  ['%', '-'],
  ['mg/Nm3', 'g/Nm3', 'gr/cuft'],
  ['ppm', '%']
];

/**
 * Other units a value declared in `unit` can be shown and typed in: the same
 * dimension, from the families engineers use. Empty when the unit is not one
 * this knows, or nothing else fits.
 */
export function alternativeUnits(unit: string): string[] {
  const dim = parseUnit(unit);
  const sc = unitScale(unit);
  if (!dim || !sc) return [];
  // A count (items/min, bottles) is not an rpm or a percentage, though the dimensions agree.
  const counted = unit
    .split(/[\s·*.\-/]+/)
    .some((t) => t !== '' && !/^\d+$/.test(t) && !['%', '1'].includes(t) && !Object.prototype.hasOwnProperty.call(S, t) && parseUnit(t)?.every((x) => x === 0));
  const dimensionless = dim.every((x) => x === 0);
  for (const fam of FAMILIES) {
    if ((counted || dimensionless) && !fam.includes(unit)) continue;
    const fits = fam.filter((u) => {
      const d = parseUnit(u);
      const s = unitScale(u);
      return d && s && sameDim(d, dim) && !!s.gauge === !!sc.gauge;
    });
    if (fits.length && fits.some((u) => convertUnit(1, unit, u) !== null)) {
      const out = [unit, ...fits.filter((u) => u !== unit && convertUnit(1, unit, u) !== null)];
      return out.length > 1 ? out : [];
    }
  }
  return [];
}

/**
 * A value typed with or without a unit: "3.2 bar", "150", "-40 °F", "1.2e3
 * kg/h". The number is converted into `unit`; a bare number is taken to be in
 * `assumed` (the unit being shown). Null when it cannot be read or converted.
 */
export function parseQuantity(text: string, unit: string, assumed: string = unit): number | null {
  const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*(.*?)\s*$/.exec(text.replace(/,/g, ''));
  if (!m) return null;
  const v = Number(m[1]);
  if (!Number.isFinite(v)) return null;
  const typed = (m[2] ?? '').trim();
  const from = typed === '' ? assumed : typed;
  return convertUnit(v, from, unit);
}
