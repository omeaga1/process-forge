import type { ProcessGraph } from '../graph.js';
import type { ProcessEdge } from '../streams.js';
import type { ProcessNode } from '../nodes.js';
import type { UnitOpContract } from '../unitop/contract.js';
import { contractToProcessNode } from '../unitop/toNode.js';
import { addStreamToGraph, createTerminalNode } from '../terminals.js';
import { DUST_COLLECTOR_CONTRACT, SPRAY_DRYER_CONTRACT } from '../unitop/examples/phaseUnits.js';

/**
 * A powder line that crosses every phase: a maltodextrin solution (liquid)
 * and process air (gas) go into a spray dryer; the powder (solid) is the
 * product; the exhaust (gas, carrying fines) goes through a product-recovery
 * baghouse, which returns the fines and sends the humid air to the stack.
 *
 * Built from the standard contracts, so it is checked by the same gates as
 * anything a model designs. The baghouse is the standard dust collector set
 * for this powder: its dust component is the dryer's `solids`, and its sticky
 * point is maltodextrin's rather than a stearate's.
 */

/** The standard dust collector, catching `solids` (the dryer's fines) instead of `lubricant`. */
function recoveryBaghouse(): UnitOpContract {
  const renamed = JSON.parse(JSON.stringify(DUST_COLLECTOR_CONTRACT).replace(/\blubricant\b/g, 'solids')) as UnitOpContract;
  return {
    ...renamed,
    id: 'product-recovery-baghouse-v1',
    name: 'Product-recovery baghouse',
    description: 'Catches the spray dryer\'s fines from its exhaust and returns them as product. Humid exhaust in; clean air to the stack; powder out of the hopper.',
    parameters: renamed.parameters.map((p) =>
      p.name === 'dustMeltC'
        ? { ...p, value: 140, description: 'Maltodextrin turns sticky well above the exhaust temperature at this moisture.' }
        : p.name === 'filterAreaFt2'
          ? { ...p, value: 400 }
          : p.name === 'kstBarMPerS'
            ? { ...p, value: 100, description: 'Maltodextrin dust is combustible (St1).' }
            : p
    ),
    designInlet: { temperatureC: 90, massFlowKgPerS: 0.47, densityGPerCm3: 0.000943, specificHeatKjPerKgK: 1.06, composition: { air: 0.9573, water: 0.0422, solids: 0.0005 } }
  };
}

const place = (contract: UnitOpContract, id: string, x: number, y: number): ProcessNode => ({
  ...contractToProcessNode(contract, { position: { x, y } }),
  id,
  name: contract.name
});

const pipe = (from: string, fromPort: string, to: string, toPort: string, fluid: { name: string; densityGPerCm3: number; temperatureCelsius: number }): ProcessEdge => ({
  id: `${from}:${fromPort}->${to}:${toPort}`,
  sourceNodeId: from,
  sourcePortId: fromPort,
  targetNodeId: to,
  targetPortId: toPort,
  stream: { type: 'CONTINUOUS_FLUID', designFlowRateGpm: 45, operatingPressurePsi: 15, pipeDiameterInches: 6, fluid: { ...fluid, viscosityCentipoise: 1 } }
});

function buildPowderLine(): ProcessGraph {
  const solution = createTerminalNode('feed', {
    id: 'feed-solution',
    material: 'Maltodextrin solution (40 %)',
    phase: 'LIQUID',
    supplyKgPerHour: 100,
    temperatureC: 25,
    densityGPerCm3: 1.15,
    specificHeatKjPerKgK: 3.1,
    composition: { water: 0.6, solids: 0.4 },
    position: { x: 40, y: 80 }
  });
  const air = createTerminalNode('feed', {
    id: 'feed-air',
    material: 'Process air',
    phase: 'GAS',
    supplyKgPerHour: 1633,
    temperatureC: 25,
    composition: { air: 0.99206, water: 0.00794 },
    position: { x: 40, y: 300 }
  });
  const dryer = place(SPRAY_DRYER_CONTRACT, 'spray-dryer-1', 300, 140);
  const baghouse = place(recoveryBaghouse(), 'baghouse-1', 620, 40);
  const powder = createTerminalNode('product', { id: 'product-powder', material: 'Maltodextrin powder', phase: 'SOLID', position: { x: 560, y: 560 } });
  const fines = createTerminalNode('product', { id: 'product-fines', material: 'Recovered fines', phase: 'SOLID', position: { x: 900, y: 420 } });
  const stack = createTerminalNode('waste', { id: 'stack', material: 'Exhaust to stack', phase: 'GAS', position: { x: 900, y: 20 } });

  let g: ProcessGraph = {
    id: 'spray-drying-line-01',
    name: 'Spray Drying & Product Recovery Line',
    version: '1.0.0',
    metadata: { facility: 'Example powder plant', productLine: 'Maltodextrin DE-10 powder', containerType: 'Bulk bag' },
    nodes: [solution, air, dryer, baghouse, powder, fines, stack],
    edges: []
  };
  const liquid = { name: 'Maltodextrin solution', densityGPerCm3: 1.15, temperatureCelsius: 25 };
  const gas = (t: number) => ({ name: 'Air', densityGPerCm3: 0.0012 * (298.15 / (t + 273.15)), temperatureCelsius: t });
  const solid = { name: 'Powder', densityGPerCm3: 0.55, temperatureCelsius: 90 };
  for (const e of [
    pipe('feed-solution', solution.outputs[0]!.id, 'spray-dryer-1', 'feed', liquid),
    pipe('feed-air', air.outputs[0]!.id, 'spray-dryer-1', 'air_in', gas(25)),
    pipe('spray-dryer-1', 'powder', 'product-powder', powder.inputs[0]!.id, solid),
    pipe('spray-dryer-1', 'exhaust', 'baghouse-1', 'dirty_air', gas(90)),
    pipe('baghouse-1', 'hopper', 'product-fines', fines.inputs[0]!.id, solid),
    pipe('baghouse-1', 'clean_air', 'stack', stack.inputs[0]!.id, gas(90))
  ]) {
    g = addStreamToGraph(g, e);
  }
  return g;
}

export const SPRAY_DRYING_LINE: ProcessGraph = buildPowderLine();
