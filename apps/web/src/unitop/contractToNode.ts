import { drawingToDressing, type ProcessNode, type UnitOpContract, type UnitOpPort } from '@process-forge/protocol';

/**
 * Turns an accepted UnitOpContract into a node the canvas and the engine both
 * understand.
 *
 * This is the last link in the chain the contract work opened up: an engineer
 * describes a unit operation, a sub-agent writes it as a contract, the engine
 * rules on whether it is physically coherent, and then it has to become an
 * actual node on an actual flowsheet. Without this function the loop produced
 * a validated object with nowhere to go.
 *
 * The contract travels on `config.contract`, which is exactly where
 * SimulationEngine.initializeNodes looks for it. Nothing else needs to know the
 * node is contract-driven.
 */

/**
 * A contract port declares what dimension flows through it; a canvas port needs
 * a direction-and-dimension enum pair. Continuous streams are mapped to
 * CONTINUOUS_VOLUME, which is what the existing fluid nodes use.
 */
function toNodePort(port: UnitOpPort): ProcessNode['inputs'][number] {
  const discrete = port.flowDimension === 'DISCRETE_CONTAINER';
  const inlet = port.direction === 'INLET';
  return {
    id: port.id,
    name: port.name,
    type: discrete
      ? inlet
        ? 'DISCRETE_INPUT'
        : 'DISCRETE_OUTPUT'
      : inlet
        ? 'FLUID_INPUT'
        : 'FLUID_OUTPUT',
    flowDimension: discrete ? 'DISCRETE_CONTAINER' : 'CONTINUOUS_VOLUME'
  };
}

export interface ContractNodeOptions {
  /** Canvas position. Defaults to a spot clear of the usual template layout. */
  position?: { x: number; y: number };
  /** Node id. Defaults to a generated one. */
  id?: string;
}

export function contractToProcessNode(
  contract: UnitOpContract,
  options: ContractNodeOptions = {}
): ProcessNode {
  const id =
    options.id ??
    `unitop-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

  return {
    id,
    name: contract.name,
    kind: 'CUSTOM_UNIT_OP',
    position: options.position ?? { x: 320, y: 320 },
    inputs: contract.ports.filter((p) => p.direction === 'INLET').map(toNodePort),
    outputs: contract.ports.filter((p) => p.direction === 'OUTLET').map(toNodePort),
    // The engine reads config.contract. Parameters are mirrored alongside it so
    // the existing property inspector has something to show without needing to
    // understand contracts.
    config: {
      contract,
      ...Object.fromEntries(contract.parameters.map((p) => [p.name, p.value]))
    },
    // Drawn from the contract's own drawing, with each port's nozzle where the
    // author put it. Without one the canvas falls back to a generic vessel.
    ...(contract.drawing ? { dressing: drawingToDressing(contract.drawing, contract.ports) } : {})
  } as ProcessNode;
}
