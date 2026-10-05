import type { NodeKind, ProcessNode } from '../nodes.js';
import type { ProcessEdge } from '../streams.js';
import { AMBIENT_C, DEFAULT_SPECIFIC_HEAT, fluidOf } from '../thermal.js';
import type { UnitOpContract, UnitOpParameter, UnitOpPort } from './contract.js';

/**
 * The built-in equipment kinds, written as contracts.
 *
 * The engine runs contracts and nothing else: a pump, a tank, a filler and a
 * palletizer go through the same code path as a unit an engineer or a model
 * designed. A node's `kind` only says how it is drawn. When a node of a
 * built-in kind carries no contract of its own, its contract is built here
 * from its config, with one parameter per config key and the same names, so
 * the config an engineer edits and the contract the engine runs never
 * disagree (the parameters panel writes both).
 *
 * Each contract is the model the engine used to hard-code for that kind, so
 * flowsheets saved before this behave as they did. Where the old handler was
 * wrong, the contract is right, and says so:
 *  - a filler's and a labeler's reject rate is per container, drawn at random
 *    (the filler used to reject at most one container a cycle);
 *  - breakdowns (MTBF/MTTR) apply to any unit that sets them, liquid units
 *    included.
 */

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

type Dim = UnitOpPort['flowDimension'];
const LIQUID: Dim = 'CONTINUOUS_FLUID';
const ITEMS: Dim = 'DISCRETE_CONTAINER';

/** The kinds the engine has a model for. CUSTOM_UNIT_OP without a contract is a plain pass-through. */
export const STANDARD_KINDS: readonly NodeKind[] = [
  'BATCH_REACTOR',
  'SURGE_TANK',
  'ROTARY_FILLER',
  'CONVEYOR',
  'LABELER',
  'PALLETIZER',
  'PUMP',
  'HEAT_EXCHANGER',
  'SEPARATOR',
  'MIXER',
  'DISTILLATION_COLUMN',
  'SCRUBBER',
  'SPRAY_CHAMBER',
  'CUSTOM_UNIT_OP'
];

/** What each kind's ports carry when the node does not say (old files, bare test graphs). */
const KIND_MATERIAL: Partial<Record<NodeKind, { in: Dim; out: Dim }>> = {
  ROTARY_FILLER: { in: LIQUID, out: ITEMS },
  CONVEYOR: { in: ITEMS, out: ITEMS },
  LABELER: { in: ITEMS, out: ITEMS },
  PALLETIZER: { in: ITEMS, out: ITEMS }
};

/**
 * A node's ports as contract ports: its declared ports, plus any port a pipe
 * names that the node does not declare (older files pipe to ports by id only).
 */
function portsOf(node: ProcessNode, edges: readonly ProcessEdge[]): UnitOpPort[] {
  const material = KIND_MATERIAL[node.kind] ?? { in: LIQUID, out: LIQUID };
  const dim = (d: string | undefined, fallback: Dim): Dim => (d === undefined ? fallback : d.startsWith('CONTINUOUS') ? LIQUID : ITEMS);
  const ports: UnitOpPort[] = [];
  const seen = new Set<string>();
  const push = (id: string, name: string, direction: UnitOpPort['direction'], flowDimension: Dim) => {
    const key = `${direction}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    ports.push({ id, name, direction, role: 'MATERIAL', flowDimension, required: false });
  };
  for (const p of node.inputs) push(p.id, p.name, 'INLET', dim(p.flowDimension, material.in));
  for (const p of node.outputs) push(p.id, p.name, 'OUTLET', dim(p.flowDimension, material.out));
  for (const e of edges) {
    const stream = (e.stream as { type?: string } | undefined)?.type;
    if (e.targetNodeId === node.id) push(e.targetPortId, e.targetPortId, 'INLET', dim(stream, material.in));
    if (e.sourceNodeId === node.id) push(e.sourcePortId, e.sourcePortId, 'OUTLET', dim(stream, material.out));
  }
  return ports;
}

function param(config: Record<string, unknown>, name: string, label: string, unit: string, fallback: number, min?: number, max?: number): UnitOpParameter {
  const v = num(config[name]);
  return { name, label, unit, value: v ?? fallback, ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) };
}

/** No flow yet: what a pass-through is checked at before liquid reaches it. */
const AT_REST: UnitOpContract['designInlet'] = { temperatureC: AMBIENT_C, volumetricFlowGpm: 0, massFlowKgPerS: 0, densityGPerCm3: 1, specificHeatKjPerKgK: DEFAULT_SPECIFIC_HEAT };

function base(node: ProcessNode, ports: UnitOpPort[], description: string): Omit<UnitOpContract, 'behavior'> {
  return {
    contractVersion: 1,
    id: `standard-kind-${node.kind.toLowerCase().replace(/_/g, '-')}`,
    name: node.name,
    description,
    ports,
    parameters: [],
    derived: [],
    constraints: [],
    provenance: { authoredBy: 'TEMPLATE', engineerConfirmed: [] }
  };
}

/** Breakdowns, when the config sets both MTBF and MTTR. */
function reliability(config: Record<string, unknown>, params: UnitOpParameter[]): Pick<UnitOpContract, 'reliability'> {
  const mtbf = num(config.meanTimeBetweenFailuresMinutes);
  const mttr = num(config.meanTimeToRepairMinutes);
  if (!(mtbf! > 0 && mttr! > 0)) return {};
  params.push(
    { name: 'meanTimeBetweenFailuresMinutes', label: 'Mean time between failures', unit: 'min', value: mtbf!, min: 0 },
    { name: 'meanTimeToRepairMinutes', label: 'Mean time to repair', unit: 'min', value: mttr!, min: 0 }
  );
  return { reliability: { mtbfMinutes: 'meanTimeBetweenFailuresMinutes', mttrMinutes: 'meanTimeToRepairMinutes' } };
}

/**
 * A liquid's own properties, for a unit whose config carries `fluid`. A
 * tank's fluid temperature is what it holds; a reactor's is its reaction
 * temperature, so it is left out there.
 */
function fluidDesign(config: Record<string, unknown>, withTemperature = false): UnitOpContract['designInlet'] {
  const f = fluidOf(config) as Record<string, unknown> | undefined;
  const t = num(f?.temperatureCelsius);
  const density = num(f?.densityGPerCm3);
  const cp = num(f?.specificHeatKjPerKgK);
  const comp = f?.composition;
  return {
    ...(withTemperature && t !== undefined ? { temperatureC: t } : {}),
    ...(density && density > 0 ? { densityGPerCm3: density } : {}),
    ...(cp && cp > 0 ? { specificHeatKjPerKgK: cp } : {}),
    ...(comp && typeof comp === 'object' ? { composition: comp as Record<string, number> } : {})
  };
}

/**
 * The contract a node of a built-in kind runs on, built from its config.
 * Undefined for a TERMINAL (feeds and outlets are the line's boundary, not
 * units) and for any kind without a model.
 */
export function standardContract(node: ProcessNode, edges: readonly ProcessEdge[] = []): UnitOpContract | undefined {
  const c = node.config as Record<string, unknown>;
  const touching = edges.filter((e) => e.sourceNodeId === node.id || e.targetNodeId === node.id);
  const ports = portsOf(node, touching);
  const parameters: UnitOpParameter[] = [];

  switch (node.kind) {
    case 'ROTARY_FILLER': {
      parameters.push(
        param(c, 'nozzleCount', 'Filling nozzles', 'nozzles', 10, 1, 64),
        param(c, 'containerVolumeGallons', 'Container volume', 'gal', 1, 0),
        param(c, 'fillTimePerCycleSeconds', 'Fill time per cycle', 's', 10, 0),
        param(c, 'indexTimePerCycleSeconds', 'Index time per cycle', 's', 2, 0),
        param(c, 'bufferQueueCapacity', 'Output buffer', 'containers', 50, 1),
        param(c, 'rejectRatePercentage', 'Reject rate', '%', 0.5, 0, 100)
      );
      const rel = reliability(c, parameters);
      return {
        ...base(node, ports, 'Fills one container per nozzle each cycle, drawing the liquid from its bowl when it is piped; rejects are drawn per container.'),
        parameters,
        ...rel,
        behavior: {
          mode: 'DISCRETE_CYCLE',
          cycleSeconds: 'fillTimePerCycleSeconds + indexTimePerCycleSeconds',
          unitsPerCycle: 'nozzleCount',
          scrapFraction: 'rejectRatePercentage / 100',
          scrapRandom: true,
          queueCapacity: 'bufferQueueCapacity',
          liquidPerCycleGallons: 'nozzleCount * containerVolumeGallons'
        }
      };
    }
    case 'CONVEYOR': {
      parameters.push(
        param(c, 'lengthMeters', 'Length', 'm', 10, 0),
        param(c, 'speedMetersPerSecond', 'Belt speed', 'm/s', 0.5, 0),
        param(c, 'maxItemCapacity', 'Items it holds', 'items', 48, 1)
      );
      const rel = reliability(c, parameters);
      return {
        ...base(node, ports, 'Carries items end to end; it holds up to its capacity, and passes one on each time an item has had its share of the transit.'),
        parameters,
        ...rel,
        behavior: {
          mode: 'DISCRETE_CYCLE',
          cycleSeconds: 'max(0.1, lengthMeters / speedMetersPerSecond / max(1, maxItemCapacity))',
          unitsPerCycle: '1',
          queueCapacity: 'maxItemCapacity',
          itemsRequired: true
        }
      };
    }
    case 'LABELER': {
      parameters.push(
        param(c, 'maxSpeedUnitsPerMinute', 'Top speed', 'items/min', 40, 0),
        param(c, 'opticalInspectionFailRate', 'Inspection reject rate', '%', 0.2, 0, 100)
      );
      const rel = reliability(c, parameters);
      return {
        ...base(node, ports, 'Labels one item at a time at its top speed; the vision check rejects each item at random at its reject rate.'),
        parameters,
        ...rel,
        behavior: {
          mode: 'DISCRETE_CYCLE',
          cycleSeconds: '60 / maxSpeedUnitsPerMinute',
          unitsPerCycle: '1',
          scrapFraction: 'opticalInspectionFailRate / 100',
          scrapRandom: true,
          itemsRequired: true
        }
      };
    }
    case 'PALLETIZER': {
      parameters.push(
        param(c, 'containersPerLayer', 'Containers per layer', 'containers', 20, 1),
        param(c, 'cycleSecondsPerLayer', 'Time per layer', 's', 30, 0)
      );
      const rel = reliability(c, parameters);
      return {
        ...base(node, ports, 'Builds a layer once a whole layer of containers has arrived, and sends it on.'),
        parameters,
        ...rel,
        behavior: {
          mode: 'DISCRETE_CYCLE',
          cycleSeconds: 'cycleSecondsPerLayer',
          unitsPerCycle: 'containersPerLayer',
          fullCyclesOnly: true,
          itemsRequired: true
        }
      };
    }
    case 'SURGE_TANK': {
      parameters.push(
        param(c, 'capacityGallons', 'Capacity', 'gal', 1000, 0),
        param(c, 'initialLevelGallons', 'Starting level', 'gal', 0, 0),
        param(c, 'maxDischargeRateGpm', 'Most it discharges', 'gal/min', 0, 0)
      );
      const cap = parameters[0]!.value;
      parameters[1]!.value = Math.min(parameters[1]!.value, cap);
      const rel = reliability(c, parameters);
      return {
        ...base(node, ports, 'Holds liquid between units. Full, it backs up whatever feeds it; empty, it starves whatever it feeds.'),
        parameters,
        ...rel,
        ...(Object.keys(fluidDesign(c, true) ?? {}).length ? { designInlet: fluidDesign(c, true) } : {}),
        behavior: {
          mode: 'STORAGE',
          capacityGallons: 'capacityGallons',
          initialGallons: 'initialLevelGallons',
          // 0 (or unset) means no limit of its own: its pipes decide.
          ...(parameters[2]!.value > 0 ? { maxOutflowGpm: 'maxDischargeRateGpm' } : {})
        }
      };
    }
    case 'BATCH_REACTOR': {
      const fluid = fluidOf(c) as Record<string, unknown> | undefined;
      const reactC = num(fluid?.temperatureCelsius);
      const jacket = num(c.jacketDutyKw);
      const design = fluidDesign(c);
      parameters.push(
        param(c, 'batchVolumeGallons', 'Batch volume', 'gal', 800, 0),
        param(c, 'fillDurationMinutes', 'Fill time', 'min', 15, 0),
        param(c, 'reactionDurationMinutes', 'Reaction time', 'min', 30, 0),
        param(c, 'dischargeRateGpm', 'Discharge rate', 'gal/min', 50, 0)
      );
      const heated = reactC !== undefined;
      if (heated) {
        parameters.push(
          { name: 'reactionTemperatureC', label: 'Reaction temperature', unit: '°C', value: reactC! },
          { name: 'jacketDutyKw', label: 'Jacket duty', unit: 'kW', value: jacket && jacket > 0 ? jacket : 0, min: 0 },
          { name: 'specificHeatKjPerKgK', label: 'Specific heat of the charge', unit: 'kJ/kg-K', value: design?.specificHeatKjPerKgK ?? DEFAULT_SPECIFIC_HEAT, min: 0.1 }
        );
      }
      const rel = reliability(c, parameters);
      return {
        ...base(node, ports, 'Fills, brings the batch to reaction temperature on its jacket, reacts for a set time, then discharges.'),
        parameters,
        ...rel,
        // Charged without a feed pipe, it charges its own fluid at ambient,
        // with the charge's specific heat.
        designInlet: { temperatureC: AMBIENT_C, ...design, ...(heated ? { specificHeatKjPerKgK: parameters.find((p) => p.name === 'specificHeatKjPerKgK')!.value } : {}) },
        behavior: {
          mode: 'BATCH',
          batchGallons: 'batchVolumeGallons',
          phases: [
            { name: 'Filling', kind: 'FILL', rateGpm: 'batchVolumeGallons / max(fillDurationMinutes, 1e-6)' },
            ...(heated
              ? [
                  {
                    name: 'Heating',
                    kind: 'HOLD' as const,
                    // m cp dT / Q on the jacket; with no jacket duty the batch is there at once.
                    seconds: 'if(jacketDutyKw > 0, batch.massKg * batch.cpKjPerKgK * abs(reactionTemperatureC - batch.temperatureC) / jacketDutyKw, 0)',
                    temperatureC: 'reactionTemperatureC',
                    dutyKw: 'if(jacketDutyKw > 0, jacketDutyKw, 0)'
                  }
                ]
              : []),
            { name: 'Reacting', kind: 'HOLD', seconds: 'reactionDurationMinutes * 60' },
            { name: 'Discharging', kind: 'DRAIN', rateGpm: 'max(dischargeRateGpm, 1e-6)' }
          ]
        }
      };
    }
    case 'PUMP':
    case 'HEAT_EXCHANGER':
    case 'CUSTOM_UNIT_OP': {
      const key = node.kind === 'PUMP' ? 'designFlowRateGpm' : node.kind === 'HEAT_EXCHANGER' ? 'shellSideFlowGpm' : 'designThroughput';
      parameters.push(param(c, key, node.kind === 'PUMP' ? 'Design flow' : node.kind === 'HEAT_EXCHANGER' ? 'Shell-side flow' : 'Design throughput', 'gal/min', 0, 0));
      // 0 (or unset) means no rating: what is around it decides.
      const capacity = parameters[0]!.value > 0 ? { capacityGpm: key } : {};
      const target = num(c.targetTemperatureCelsius);
      const rel = reliability(c, parameters);
      if (node.kind !== 'HEAT_EXCHANGER' || target === undefined) {
        return {
          ...base(node, ports, node.kind === 'PUMP' ? 'Passes liquid up to its design flow.' : 'Passes liquid through, up to its rated flow.'),
          parameters,
          ...rel,
          designInlet: AT_REST,
          behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'inlet.volumetricFlowGpm', ...capacity }
        };
      }
      const rated = num(c.dutyKw);
      parameters.push(
        { name: 'targetTemperatureCelsius', label: 'Target outlet temperature', unit: '°C', value: target },
        { name: 'dutyKw', label: 'Rated duty (0: unlimited)', unit: 'kW', value: rated !== undefined && rated >= 0 ? rated : 0, min: 0 }
      );
      const outlets = ports.filter((p) => p.direction === 'OUTLET');
      return {
        ...base(node, ports, 'Brings the stream to its target temperature, within its rated duty: Q = m·cp·ΔT from the live stream.'),
        parameters,
        ...rel,
        derived: [
          { name: 'neededKw', label: 'Duty to reach the target', unit: 'kW', expr: 'inlet.massFlowKgPerS * inlet.specificHeatKjPerKgK * (inlet.temperatureC - targetTemperatureCelsius)', description: 'Positive: cooling.' },
          { name: 'usedKw', label: 'Duty used', unit: 'kW', expr: 'if(dutyKw > 0, clamp(neededKw, -dutyKw, dutyKw), neededKw)' },
          {
            name: 'outletC',
            label: 'Outlet temperature',
            unit: '°C',
            expr: 'if(inlet.massFlowKgPerS > 0, inlet.temperatureC - usedKw / (inlet.massFlowKgPerS * inlet.specificHeatKjPerKgK), targetTemperatureCelsius)'
          }
        ],
        constraints: [
          {
            id: 'duty-limited',
            expr: 'dutyKw <= 0 || abs(neededKw) <= dutyKw * 1.000001 + 0.000001',
            severity: 'WARNING',
            message: 'The rated duty is too small to reach the target temperature at this flow.',
            hint: 'Raise dutyKw, or lower the flow through it.'
          }
        ],
        designInlet: AT_REST,
        outlets: outlets.map((p) => ({ port: p.id, temperatureC: 'outletC' })),
        behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'inlet.volumetricFlowGpm', ...capacity, dutyKw: 'abs(usedKw)' }
      };
    }
    case 'SEPARATOR': {
      parameters.push(param(c, 'vaporSplitRatio', 'Share to the vapour overhead', '-', 0.25, 0, 1));
      parameters[0]!.value = Math.min(1, Math.max(0, parameters[0]!.value));
      const rel = reliability(c, parameters);
      const outlets = ports.filter((p) => p.direction === 'OUTLET');
      return {
        ...base(node, ports, 'Splits its feed between the vapour overhead (its first outlet) and the liquid bottoms, by its vapour ratio.'),
        parameters,
        ...rel,
        designInlet: AT_REST,
        ...(outlets.length >= 2 ? { outlets: [{ port: outlets[0]!.id, share: 'vaporSplitRatio' }, ...outlets.slice(1).map((p) => ({ port: p.id }))] } : {}),
        behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'inlet.volumetricFlowGpm' }
      };
    }
    case 'MIXER':
    case 'DISTILLATION_COLUMN':
    case 'SCRUBBER':
    case 'SPRAY_CHAMBER': {
      const rel = reliability(c, parameters);
      return {
        ...base(node, ports, 'Passes liquid through, mixing what arrives.'),
        parameters,
        ...rel,
        designInlet: AT_REST,
        behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'inlet.volumetricFlowGpm' }
      };
    }
    default:
      return undefined;
  }
}

/**
 * The contract a node runs on: its own, or, for a built-in kind, the one
 * built from its config. Undefined for feeds and outlets.
 */
export function effectiveContract(node: ProcessNode, edges: readonly ProcessEdge[] = []): UnitOpContract | undefined {
  const own = (node.config as { contract?: UnitOpContract }).contract;
  return own ?? standardContract(node, edges);
}

/** True when a node runs on a contract it carries, rather than one built for its kind. */
export function hasOwnContract(node: ProcessNode): boolean {
  return Boolean((node.config as { contract?: unknown }).contract);
}
