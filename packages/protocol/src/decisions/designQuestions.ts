import type { AnswersFor, ChoiceQuestion, NoulQuestion } from './types.js';
import { text } from './heuristic.js';
import type { UnitOpContract } from '../unitop/contract.js';

/**
 * What a unit operation needs, decided from its description: which physics a
 * design of it has to carry. The engine checks that a contract is consistent;
 * these questions say what it has to CONTAIN to be complete -- an energy
 * balance for a dryer, a vapour outlet for an evaporator, component tracking
 * for a reactor. Answered by a decision model (Jev) when one is available, and
 * by keyword heuristics otherwise.
 *
 * State: { message: the unit's name and description }.
 */

/** How many keywords start a word in the text: stems ("evaporat") match their forms. */
function hits(t: string, keywords: string[]): number {
  // The keywords are plain words written here, so they need no escaping.
  return keywords.filter((k) => t.includes(k) && new RegExp(`(^|[^a-z])${k}`).test(t)).length;
}

const noul = (instructions: string, yes: string, no: string, keywords: string[], against: string[] = []): NoulQuestion => ({
  type: 'noul',
  instructions,
  criteria: { true: yes, false: no },
  heuristic: (state) => {
    const t = text(state);
    const n = hits(t, keywords);
    if (n === 0 && hits(t, against) > 0) return 0.1;
    return n >= 2 ? 0.9 : n === 1 ? 0.75 : 0.2;
  }
});

export type DesignMode = 'CONTINUOUS_RATE' | 'BATCH' | 'DISCRETE_CYCLE';

export const designMode: ChoiceQuestion<DesignMode> = {
  type: 'choice',
  instructions: 'How does this unit operation run?',
  criteria: {
    CONTINUOUS_RATE: 'A steady flow passes through it continuously: pumps, exchangers, columns, continuous reactors, filters, dryers.',
    BATCH: 'It holds a charge of material and runs it through steps (fill, hold or react, drain) before starting again: batch reactors, kettles, fermenters, batch crystallisers.',
    DISCRETE_CYCLE: 'It processes whole items (containers, parts, cases) on a machine cycle: fillers, cappers, packers, presses, printers.'
  },
  heuristic: (state) => {
    const t = text(state);
    return {
      BATCH: hits(t, ['batch', 'kettle', 'fermenter', 'fermentor', 'charge', 'cycle time per batch']),
      DISCRETE_CYCLE: hits(t, ['bottle', 'bottles', 'can', 'cans', 'case', 'cases', 'carton', 'part', 'parts', 'pallet', 'packer', 'capper', 'labeler', 'labeller', 'press', 'printer', 'items', 'units per']),
      CONTINUOUS_RATE: hits(t, ['continuous', 'flow', 'gpm', 'per hour', 't/h', 'kg/h', 'exchanger', 'column', 'dryer', 'filter', 'evaporator', 'pump', 'cstr', 'tubular'])
    };
  }
};

export const DESIGN_QUESTIONS = {
  mode: designMode,
  energyBalance: noul(
    'Does this unit change the temperature or phase of what passes through it, or run on heat or cooling, so that an energy balance matters?',
    'It heats, cools, boils, evaporates, condenses, dries, melts, freezes, sterilises, or runs a reaction that releases or absorbs heat.',
    'Temperature is incidental: it moves, stores, mixes, splits, fills or packs material at the temperature it arrives.',
    ['heat', 'heats', 'heater', 'heating', 'cool', 'cools', 'cooler', 'cooling', 'chill', 'boil', 'evaporat', 'condens', 'drying', 'dries', 'dried', 'dryer', 'drier', 'drying', 'melt', 'freez', 'steriliz', 'sterilis', 'pasteuri', 'exotherm', 'endotherm', 'steam', 'furnace', 'kiln', 'oven', 'roast', 'distil', 'reboiler', 'jacket'],
    ['conveyor', 'labeler', 'palletizer', 'packer']
  ),
  phaseChange: noul(
    'Does part of the stream change phase inside the unit (liquid to vapour, vapour to liquid, liquid to solid, solid out of solution)?',
    'Evaporation, boiling, condensation, crystallisation, drying, melting, freezing or precipitation happens in it.',
    'Every phase leaves as it arrived.',
    ['evaporat', 'boil', 'condens', 'crystal', 'drying', 'dries', 'dried', 'dryer', 'drier', 'drying', 'melt', 'freez', 'precipitat', 'flash', 'distil', 'vapour', 'vapor']
  ),
  changesComposition: noul(
    'Does the unit change what the stream is made of, so the components have to be tracked through it?',
    'It reacts material, or sends different components or phases to different outlets (separation, concentration, extraction, absorption).',
    'Every outlet carries the same mix that came in (moving, storing, heating, splitting by volume, filling).',
    ['react', 'reactor', 'separat', 'concentrat', 'extract', 'absorb', 'strip', 'distil', 'column', 'crystal', 'filter', 'centrifug', 'membrane', 'evaporat', 'drying', 'dries', 'dried', 'dryer', 'neutralis', 'neutraliz', 'ferment'],
    ['pump', 'tank', 'splitter', 'conveyor', 'mixer', 'heater', 'cooler']
  ),
  reaction: noul(
    'Does a chemical or biological reaction take place in the unit?',
    'Reactants are converted to products: synthesis, neutralisation, combustion, fermentation, polymerisation, cure.',
    'No conversion: material is only moved, heated, cooled, mixed or separated.',
    ['react', 'reactor', 'reaction', 'convert', 'conversion', 'neutralis', 'neutraliz', 'combust', 'burning', 'ferment', 'polymer', 'cure', 'synthes', 'oxidi', 'hydrogenat', 'catalyst', 'cstr', 'pfr']
  ),
  splitsStream: noul(
    'Does the unit send its feed out through two or more outlets?',
    'There are several outlet streams: overhead and bottoms, filtrate and cake, vapour and concentrate, product and reject.',
    'One stream goes in and one comes out.',
    ['separat', 'split', 'column', 'overhead', 'bottoms', 'filtrate', 'cake', 'centrate', 'vapour', 'vapor', 'concentrate', 'reject', 'distil', 'flash', 'cyclone', 'decant', 'crystal', 'evaporat', 'dryer']
  ),
  usesUtility: noul(
    'Does the unit use a utility stream (steam, cooling water, refrigerant, hot oil, fuel gas, compressed air) that does not join the product?',
    'A utility supplies or removes heat or power without mixing with the product.',
    'No utility stream, or only electric power.',
    ['steam', 'cooling water', 'chilled water', 'refrigerant', 'glycol', 'hot oil', 'thermal oil', 'fuel', 'gas fired', 'burner', 'compressed air', 'jacket', 'utility']
  ),
  solidLeaves: noul(
    'Does a solid (crystals, cake, powder, granules, paste, pellets) leave the unit?',
    'At least one outlet carries mainly solids.',
    'Everything leaves as liquid, gas or discrete items.',
    ['crystal', 'cake', 'powder', 'granul', 'paste', 'pellet', 'solids', 'dry product', 'dryer', 'drier', 'flake', 'prill', 'sludge']
  ),
  gasLeaves: noul(
    'Does a gas or vapour leave the unit?',
    'At least one outlet carries vapour, steam, off-gas or exhaust.',
    'Nothing leaves as gas.',
    ['vapour', 'vapor', 'off-gas', 'offgas', 'exhaust', 'overhead', 'evaporat', 'boil', 'dryer', 'flash', 'vent', 'distil']
  ),
  handlesItems: noul(
    'Does the unit handle discrete items (containers, parts, cases, pallets) rather than a bulk flow?',
    'It takes in or puts out countable items.',
    'It handles bulk liquid, gas or solids only.',
    ['bottle', 'bottles', 'can', 'cans', 'container', 'containers', 'case', 'cases', 'carton', 'cartons', 'pallet', 'part', 'parts', 'items', 'packer', 'labeler', 'labeller', 'capper', 'filler', 'printer', 'press']
  )
} as const;

export type DesignProfile = AnswersFor<typeof DESIGN_QUESTIONS>;

/** A statement is taken as true for a design at or above this probability. */
const LIKELY = 0.7;

/** The design brief's checklist: what a complete contract for this unit carries. */
export function designChecklist(p: DesignProfile): string[] {
  const out: string[] = [];
  if (p.mode.confidence >= 0.6) out.push(`behavior.mode ${p.mode.value} fits how this unit runs.`);
  if (p.handlesItems.value >= LIKELY) out.push('Item ports (DISCRETE_CONTAINER) for the items it takes in or puts out.');
  if (p.energyBalance.value >= LIKELY)
    out.push('An energy balance: a duty (behavior.dutyKw, or dutyKw on batch phases) from m·cp·ΔT and any latent heat, and outlet temperatures (outlets[].temperatureC).');
  if (p.phaseChange.value >= LIKELY) out.push('The phase change: latent heat in the duty, and the changed phase leaving by its own outlet.');
  if (p.splitsStream.value >= LIKELY || p.gasLeaves.value >= LIKELY || p.solidLeaves.value >= LIKELY)
    out.push('One outlet port per stream that leaves, with a share or component recoveries for each.');
  if (p.gasLeaves.value >= LIKELY) out.push('An outlet for the gas or vapour.');
  if (p.solidLeaves.value >= LIKELY) out.push('An outlet for the solids, with a solids (or moisture) mass balance setting its share.');
  if (p.reaction.value >= LIKELY) out.push('components and reactions (mass basis, coefficients summing to 0), with conversion from the design.');
  else if (p.changesComposition.value >= LIKELY) out.push('components, and outlet recoveries or shares that follow the mass balance.');
  if (p.usesUtility.value >= LIKELY) out.push('The utility: a UTILITY port or a duty that states what the utility supplies or removes.');
  return out;
}

export interface CompletenessWarning {
  id: string;
  message: string;
  /** The probability behind it, for the engineer and the model. */
  probability: number;
}

/**
 * What a design seems to be missing, given what the unit is. Warnings, not
 * errors: they come from a judgment about the description, and the design may
 * have a reason (a heater with a fixed outlet temperature and no stated duty).
 */
export function checkDesignCompleteness(contract: UnitOpContract, p: DesignProfile): CompletenessWarning[] {
  const w: CompletenessWarning[] = [];
  const b = contract.behavior;
  const outletPorts = contract.ports.filter((x) => x.direction === 'OUTLET' && x.role !== 'UTILITY');
  const hasDuty =
    (b.mode === 'CONTINUOUS_RATE' && Boolean(b.dutyKw)) ||
    (b.mode === 'BATCH' && b.phases.some((ph) => ph.dutyKw || ph.temperatureC)) ||
    contract.ports.some((x) => x.role === 'UTILITY' || x.role === 'ENERGY');
  const hasTemps = (contract.outlets ?? []).some((o) => o.temperatureC) || (b.mode === 'BATCH' && b.phases.some((ph) => ph.temperatureC));
  // A batch that drains to different ports splits its contents, as outlet shares do.
  const drainPorts = new Set(b.mode === 'BATCH' ? b.phases.filter((ph) => ph.kind === 'DRAIN' && ph.port).map((ph) => ph.port) : []);
  const tracksComposition = Boolean(contract.components?.length) || (contract.outlets ?? []).some((o) => o.recovery || o.share) || drainPorts.size >= 2;
  const hasItems = contract.ports.some((x) => x.flowDimension === 'DISCRETE_CONTAINER');

  if (p.mode.confidence >= 0.75 && p.mode.value !== b.mode)
    w.push({ id: 'mode', message: `This unit looks like a ${p.mode.value} unit, but the design runs as ${b.mode}.`, probability: p.mode.confidence });
  if (p.energyBalance.value >= LIKELY && !hasDuty)
    w.push({ id: 'energy-duty', message: 'It looks like this unit heats, cools or changes phase, but the design states no duty (dutyKw), utility or heated phase.', probability: p.energyBalance.value });
  if (p.energyBalance.value >= LIKELY && !hasTemps && b.mode !== 'DISCRETE_CYCLE')
    w.push({ id: 'energy-temperature', message: 'It looks like this unit changes temperature, but no outlet temperature is set, so everything leaves at the inlet temperature.', probability: p.energyBalance.value });
  if ((p.splitsStream.value >= LIKELY || p.gasLeaves.value >= LIKELY || p.solidLeaves.value >= LIKELY) && outletPorts.length < 2)
    w.push({ id: 'outlets', message: 'It looks like more than one stream leaves this unit (vapour, solids, or several products), but the design has one outlet.', probability: Math.max(p.splitsStream.value, p.gasLeaves.value, p.solidLeaves.value) });
  if (p.reaction.value >= LIKELY && !contract.reactions?.length)
    w.push({ id: 'reaction', message: 'It looks like a reaction happens here, but the design declares no reactions, so the outlet composition does not change.', probability: p.reaction.value });
  else if (p.changesComposition.value >= LIKELY && !tracksComposition)
    w.push({ id: 'composition', message: 'It looks like this unit changes what the stream is made of, but the design has no components, recoveries or shares.', probability: p.changesComposition.value });
  if (p.handlesItems.value >= 0.8 && !hasItems)
    w.push({ id: 'items', message: 'It looks like this unit handles discrete items, but it has no item ports.', probability: p.handlesItems.value });
  return w;
}

/** The text the questions are asked about, for a contract. */
export const designStateOf = (c: Pick<UnitOpContract, 'name' | 'description'>) => ({ message: `${c.name}. ${c.description ?? ''}`.trim() });
