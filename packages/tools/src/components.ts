import {
  COMPONENTS,
  ComponentError,
  bubblePoint,
  componentCpGas,
  componentHvap,
  componentPsat,
  componentRhoLiquid,
  componentTsat,
  describeComponent,
  findComponent,
  liquidMixture,
  moleFractions,
  nearComponents
} from '@process-forge/protocol';

/**
 * lookup_component: the engine's component database, so a model grounds a
 * chemical's name and figures instead of recalling them. Unknown names are
 * refused with the names they probably meant, never guessed.
 */

export interface LookupComponentParams {
  component?: string;
  /** Mass fractions of a liquid mixture: its density, specific heat and bubble point. */
  composition?: Record<string, number>;
  temperatureC?: number;
  pressureKpa?: number;
}

const sig = (v: number) => Number(v.toPrecision(5));
const tryNum = (f: () => number): number | undefined => {
  try {
    const v = f();
    return Number.isFinite(v) ? sig(v) : undefined;
  } catch {
    return undefined;
  }
};

const FUNCTIONS =
  "In a contract: psat('name', T °C) -> kPa, tsat('name', P kPa) -> °C, hvap('name', T) -> kJ/kg, cp_liquid('name') -> kJ/kg-K, cp_gas('name', T) -> kJ/kg-K, rho_liquid('name', T) -> kg/m3, molar_mass('name') -> kg/kmol.";

export function lookupComponent(params: LookupComponentParams): Record<string, unknown> {
  const t = params.temperatureC ?? 25;
  const p = params.pressureKpa ?? 101.325;

  if (params.composition && typeof params.composition === 'object' && Object.keys(params.composition).length) {
    const unknown = Object.keys(params.composition).filter((c) => !findComponent(c));
    if (unknown.length) {
      return {
        success: false,
        error: `Not in the component database: ${unknown.map((u) => `"${u}"${nearComponents(u).length ? ` (did you mean ${nearComponents(u).join(', ')}?)` : ''}`).join(', ')}. A pseudo-component (solids, resin) has no properties here: state its density and specific heat on the feed.`
      };
    }
    const mix = liquidMixture(params.composition, t);
    let bubble: { temperatureC: number; vapour: Record<string, number> } | undefined;
    let bubbleNote: string | undefined;
    try {
      bubble = bubblePoint(params.composition, p);
    } catch (e) {
      bubbleNote = (e as Error).message;
    }
    return {
      success: true,
      composition: params.composition,
      moleFractions: Object.fromEntries(Object.entries(moleFractions(params.composition).x).map(([k, v]) => [k, sig(v)])),
      atTemperatureC: t,
      ...(mix ? { liquidDensityKgPerM3: sig(mix.densityKgPerM3), liquidCpKjPerKgK: sig(mix.cpKjPerKgK) } : { liquidNote: 'Some component has no liquid data (a gas at ordinary conditions): no liquid density or specific heat.' }),
      ...(bubble
        ? { bubblePointC: sig(bubble.temperatureC), atPressureKpa: p, firstVapourMoleFractions: Object.fromEntries(Object.entries(bubble.vapour).map(([k, v]) => [k, sig(v)])) }
        : { bubblePointNote: bubbleNote }),
      model:
        'Ideal mixing (volumes add, cp by mass) and an ideal solution (Raoult). Right for sugar and salt solutions to about 1 %; mixtures of unlike liquids (ethanol and water) shrink when mixed and boil below Raoult: treat those figures as first estimates and say so.'
    };
  }

  if (!params.component) {
    return {
      success: true,
      components: COMPONENTS.map((c) => ({ id: c.id, name: c.name, ...(c.formula ? { formula: c.formula } : {}), aliases: c.aliases, ...(c.nonVolatile ? { nonVolatile: true } : {}) })),
      note: `${COMPONENTS.length} components. Name one for its properties, or give a composition for a mixture's. ${FUNCTIONS}`
    };
  }

  const c = findComponent(params.component);
  if (!c) {
    const near = nearComponents(params.component);
    return { success: false, error: `"${params.component}" is not in the component database${near.length ? `; did you mean ${near.join(', ')}?` : '.'} Call lookup_component with no arguments for the list.` };
  }
  try {
    return {
      success: true,
      ...describeComponent(c.id),
      atTemperatureC: t,
      atTemperature: {
        ...(tryNum(() => componentPsat(c.id, t)) !== undefined ? { vapourPressureKpa: tryNum(() => componentPsat(c.id, t)) } : {}),
        ...(tryNum(() => componentHvap(c.id, t)) !== undefined ? { heatOfVaporisationKjPerKg: tryNum(() => componentHvap(c.id, t)) } : {}),
        ...(tryNum(() => componentRhoLiquid(c.id, t)) !== undefined ? { liquidDensityKgPerM3: tryNum(() => componentRhoLiquid(c.id, t)) } : {}),
        ...(tryNum(() => componentCpGas(c.id, t)) !== undefined ? { gasCpKjPerKgK: tryNum(() => componentCpGas(c.id, t)) } : {})
      },
      ...(tryNum(() => componentTsat(c.id, p)) !== undefined ? { boilingPointC: tryNum(() => componentTsat(c.id, p)), atPressureKpa: p } : {}),
      functions: FUNCTIONS
    };
  } catch (e) {
    if (e instanceof ComponentError) return { success: false, error: e.message };
    throw e;
  }
}
