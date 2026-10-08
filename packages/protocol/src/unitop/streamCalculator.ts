import {
  M3_PER_FT3,
  MOLAR_MASS_WATER,
  SCFM_STD_C,
  STD_PRESSURE_KPA,
  humidityRatio,
  idealGasDensity,
  mixtureMolarMass,
  waterSaturationPressureKpa,
  type MaterialPhase
} from './phases.js';
import { LITERS_PER_GALLON } from '../thermal.js';
import type { UnitOpDesignStream } from './contract.js';

/**
 * A stream in every unit a design might state it in. Models get unit
 * conversions wrong more often than physics: ACFM for SCFM, a gas at the
 * wrong temperature, gallons of powder. This does the arithmetic once,
 * deterministically, and hands back a designInlet ready to paste.
 */

export const FLOW_UNITS = ['kg/s', 'kg/h', 'lb/h', 't/h', 'ACFM', 'SCFM', 'Nm3/h', 'm3/h', 'gal/min', 'L/min'] as const;
export type FlowUnit = (typeof FLOW_UNITS)[number];

export interface StreamCalcInput {
  phase: Exclude<MaterialPhase, 'ITEMS'>;
  flow: { value: number; unit: FlowUnit };
  temperatureC?: number;
  /** Absolute pressure, kPa (101.325 at sea level). */
  pressureKpa?: number;
  /** Mass fractions by component. A gas without one is dry air. */
  composition?: Record<string, number>;
  /** A liquid's density, or a solid's bulk density, kg/m³ (1000 and 600 when absent). */
  densityKgPerM3?: number;
  /** A gas: its relative humidity 0..1, which sets its water content (air plus water). */
  relativeHumidity?: number;
}

export interface StreamCalcResult {
  success: boolean;
  error?: string;
  phase?: Exclude<MaterialPhase, 'ITEMS'>;
  temperatureC?: number;
  pressureKpa?: number;
  densityKgPerM3?: number;
  molarMass?: number;
  composition?: Record<string, number>;
  mass?: { kgPerS: number; kgPerHour: number; lbPerHour: number; tonnesPerHour: number };
  volume?: { actualM3PerHour: number; actualCubicFeetPerMinute: number; standardCubicFeetPerMinute?: number; normalM3PerHour?: number; gallonsPerMinute?: number; litersPerMinute?: number };
  humidity?: { humidityRatioKgPerKg: number; relativeHumidity: number; dewPointC: number };
  /** Paste into a contract's designInlet (or a port's design stream). */
  designInlet?: UnitOpDesignStream;
  notes?: string[];
}

const sig = (v: number, n = 4) => (Number.isFinite(v) ? Number(v.toPrecision(n)) : v);

/** The dew point, °C, of water vapour at partial pressure p_v (kPa): the inverse of the Buck saturation curve. */
export function dewPointC(vapourPressureKpa: number): number {
  if (!(vapourPressureKpa > 0)) return -Infinity;
  let lo = -60;
  let hi = 200;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (waterSaturationPressureKpa(mid) < vapourPressureKpa) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function calculateStream(input: StreamCalcInput): StreamCalcResult {
  const phase = input.phase;
  if (!['GAS', 'LIQUID', 'SOLID'].includes(phase)) return { success: false, error: 'phase must be GAS, LIQUID or SOLID' };
  const { value, unit } = input.flow ?? ({} as StreamCalcInput['flow']);
  if (!(typeof value === 'number' && Number.isFinite(value) && value >= 0)) return { success: false, error: 'flow.value must be a number >= 0' };
  if (!FLOW_UNITS.includes(unit)) return { success: false, error: `flow.unit must be one of ${FLOW_UNITS.join(', ')}` };
  const T = input.temperatureC ?? 20;
  const P = input.pressureKpa ?? STD_PRESSURE_KPA;
  if (!(P > 0)) return { success: false, error: 'pressureKpa is absolute and must be > 0' };
  const notes: string[] = [];

  // What it is made of; a gas at a stated humidity is air plus water.
  let comp = { ...(input.composition ?? {}) };
  if (phase === 'GAS' && input.relativeHumidity !== undefined) {
    const rh = Math.min(Math.max(input.relativeHumidity, 0), 1);
    const pv = rh * waterSaturationPressureKpa(T);
    if (pv >= P) return { success: false, error: 'at that temperature and pressure the water would boil: the gas is steam, not humid air' };
    const Y = humidityRatio(pv, P);
    const dry = Object.entries(comp).filter(([c, w]) => c !== 'water' && w > 0);
    const dryTotal = dry.reduce((a, [, w]) => a + w, 0);
    comp = Object.fromEntries([
      ...(dryTotal > 0 ? dry.map(([c, w]) => [c, (w / dryTotal) / (1 + Y)]) : [['air', 1 / (1 + Y)]]),
      ['water', Y / (1 + Y)]
    ]);
  }
  if (phase === 'GAS' && Object.keys(comp).length === 0) comp = { air: 1 };

  const molarMass = phase === 'GAS' ? mixtureMolarMass(comp) : undefined;
  const rho = phase === 'GAS' ? idealGasDensity(T, P, molarMass) : input.densityKgPerM3 ?? (phase === 'SOLID' ? 600 : 1000);
  if (phase !== 'GAS' && input.densityKgPerM3 === undefined) notes.push(`No density given: ${phase === 'SOLID' ? 'a bulk density of 600' : '1000'} kg/m3 assumed.`);
  const rhoStd = phase === 'GAS' ? idealGasDensity(SCFM_STD_C, STD_PRESSURE_KPA, molarMass) : rho;
  const rhoNormal = phase === 'GAS' ? idealGasDensity(0, STD_PRESSURE_KPA, molarMass) : rho;

  // Everything to kg/s.
  let kgPerS: number;
  switch (unit) {
    case 'kg/s': kgPerS = value; break;
    case 'kg/h': kgPerS = value / 3600; break;
    case 'lb/h': kgPerS = (value * 0.45359237) / 3600; break;
    case 't/h': kgPerS = (value * 1000) / 3600; break;
    case 'ACFM': kgPerS = (value * M3_PER_FT3 * rho) / 60; break;
    case 'SCFM':
      if (phase !== 'GAS') return { success: false, error: 'SCFM states a gas at standard conditions; give a GAS phase or another unit' };
      kgPerS = (value * M3_PER_FT3 * rhoStd) / 60;
      break;
    case 'Nm3/h':
      if (phase !== 'GAS') return { success: false, error: 'Nm3/h states a gas at normal conditions; give a GAS phase or another unit' };
      kgPerS = (value * rhoNormal) / 3600;
      break;
    case 'm3/h': kgPerS = (value * rho) / 3600; break;
    case 'gal/min': kgPerS = (value * (LITERS_PER_GALLON / 1000) * rho) / 60; break;
    case 'L/min': kgPerS = ((value / 1000) * rho) / 60; break;
  }
  if (phase === 'GAS' && (unit === 'gal/min' || unit === 'L/min')) notes.push('A gas flow in gal/min or L/min is read as actual volume at the stated temperature and pressure.');
  if (phase === 'SOLID' && (unit === 'gal/min' || unit === 'L/min' || unit === 'ACFM' || unit === 'm3/h')) notes.push('A solid flow by volume is read at its bulk density.');

  const m3PerS = kgPerS / rho;
  const result: StreamCalcResult = {
    success: true,
    phase,
    temperatureC: T,
    pressureKpa: P,
    densityKgPerM3: sig(rho),
    ...(molarMass !== undefined ? { molarMass: sig(molarMass) } : {}),
    ...(Object.keys(comp).length ? { composition: Object.fromEntries(Object.entries(comp).map(([c, w]) => [c, sig(w, 5)])) } : {}),
    mass: { kgPerS: sig(kgPerS), kgPerHour: sig(kgPerS * 3600), lbPerHour: sig((kgPerS * 3600) / 0.45359237), tonnesPerHour: sig((kgPerS * 3600) / 1000) },
    volume: {
      actualM3PerHour: sig(m3PerS * 3600),
      actualCubicFeetPerMinute: sig((m3PerS / M3_PER_FT3) * 60),
      ...(phase === 'GAS'
        ? { standardCubicFeetPerMinute: sig((kgPerS / rhoStd / M3_PER_FT3) * 60), normalM3PerHour: sig((kgPerS / rhoNormal) * 3600) }
        : { gallonsPerMinute: sig((m3PerS / (LITERS_PER_GALLON / 1000)) * 60), litersPerMinute: sig(m3PerS * 1000 * 60) })
    }
  };

  if (phase === 'GAS' && (comp.water ?? 0) > 0) {
    const waterW = comp.water ?? 0;
    const dryW = 1 - waterW;
    const Y = dryW > 0 ? waterW / dryW : Infinity;
    // Partial pressure from the mole fraction of water in the mixture.
    const yWater = waterW / MOLAR_MASS_WATER / (1 / (molarMass ?? 28.96));
    const pv = yWater * P;
    result.humidity = { humidityRatioKgPerKg: sig(Y), relativeHumidity: sig(pv / waterSaturationPressureKpa(T), 3), dewPointC: sig(dewPointC(pv), 3) };
    if (pv >= waterSaturationPressureKpa(T)) notes.push('The gas is at or past saturation at this temperature: water condenses.');
  }

  result.designInlet = {
    temperatureC: T,
    massFlowKgPerS: sig(kgPerS),
    densityGPerCm3: sig(rho / 1000),
    ...(phase === 'LIQUID' ? { volumetricFlowGpm: sig((m3PerS / (LITERS_PER_GALLON / 1000)) * 60) } : {}),
    ...(Object.keys(comp).length ? { composition: result.composition! } : {})
  };
  if (notes.length) result.notes = notes;
  return result;
}
