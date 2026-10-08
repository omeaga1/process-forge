import { EXPRESSION_FUNCTIONS } from './expression.js';
import { RESERVED_SCOPE_NAMES, BATCH_SCOPE_NAMES, type UnitOpDesignStream } from './contract.js';
import { UNIT_OP_AUTHORING_RULES } from './review.js';
import { WAX_COOLING_BELT_CONTRACT } from './examples/waxCoolingBelt.js';
import { FDM_PRINTER_CONTRACT } from './examples/fdmPrinter.js';
import { EVAPORATOR_CONTRACT } from './examples/evaporator.js';
import { CASE_PACKER_CONTRACT } from './examples/casePacker.js';
import { CRYSTALLISER_CONTRACT } from './examples/crystalliser.js';
import { JUICE_CONCENTRATOR_CONTRACT, NEUTRALISER_CONTRACT } from './examples/componentUnits.js';
import { DUST_COLLECTOR_CONTRACT, SPRAY_DRYER_CONTRACT, VENTURI_SCRUBBER_CONTRACT } from './examples/phaseUnits.js';
import { matchPhaseArchetypes, PHASE_FLOW_BASIS, type MaterialPhase, type PhaseArchetype, type PhaseFlowBasis } from './phases.js';
import { LITERS_PER_GALLON } from '../thermal.js';
import type { ProcessGraph } from '../graph.js';
import type { ProcessNode } from '../nodes.js';

/**
 * The sub-agent interface for designing a unit operation.
 *
 * ARCHITECTURE NOTE, because this is the part that is easy to get backwards:
 *
 * This tool does NOT call a language model. In an MCP deployment the CLIENT is
 * the model -- Claude Desktop, Gemini CLI, whatever the engineer already pays
 * for. A "sub-agent" that reached for its own API key would duplicate the
 * client, require a second subscription, and defeat the BYO-subscription
 * thesis the project is built on.
 *
 * So the division of labour is:
 *
 *   design_unit_op    -> hands the client everything needed to author a
 *                        contract: the target schema, the expression grammar,
 *                        what the engine will supply at evaluation time, a
 *                        worked example, and the surrounding process context.
 *   (client thinks)   -> the model writes a UnitOpContract.
 *   validate_unit_op  -> the ENGINE checks it and returns actionable failures.
 *
 * That third step is what makes the loop converge on something real rather than
 * something confident. The model proposes; the engine decides.
 */

export interface DesignUnitOpParams {
  /** What the engineer said, in their own words. */
  description: string;
  /** Optional: the graph this unit op will join, for surrounding context. */
  graph?: ProcessGraph;
  /** Optional: the node id being designed or replaced, if it already exists. */
  targetNodeId?: string;
  /** Optional: which behavior mode the engineer expects. */
  preferredMode?: 'DISCRETE_CYCLE' | 'CONTINUOUS_RATE' | 'BATCH';
}

export interface NeighbourContext {
  nodeId: string;
  name: string;
  kind: string;
  relation: 'UPSTREAM' | 'DOWNSTREAM';
  streamType?: string;
  streamSummary?: Record<string, unknown>;
}

export interface DesignUnitOpResult {
  success: true;
  brief: string;
  /** Names the engine binds at evaluation time, beyond the contract's own. */
  engineSuppliedNames: readonly string[];
  /** Every function an expression may call. There is no other way to compute. */
  availableFunctions: { name: string; arity: string }[];
  /** Hard rules the contract must satisfy. Stated so the model does not guess. */
  rules: string[];
  /** A complete, valid steady-flow (CONTINUOUS_RATE) contract to pattern-match against. */
  workedExample: unknown;
  /** A complete, valid cycle (DISCRETE_CYCLE) contract: one part per print. */
  cycleExample: unknown;
  /**
   * A complete, valid contract that reads its live inlet and splits and heats
   * its outflow per outlet (an evaporator): designInlet, capacityGpm, outlets,
   * if() and interp().
   */
  liveInletExample: unknown;
  /** A complete, valid contract that takes and makes different items per port (a case packer with a reject lane). */
  assemblyExample: unknown;
  /** A complete, valid BATCH contract: fill, heat (timed from the batch), cool, decant and drop (a crystalliser). */
  batchExample: unknown;
  /** Names a BATCH contract's expressions can read about the batch in hand. */
  batchNames: readonly string[];
  /** A complete, valid contract that separates by component (recovery per outlet): a juice concentrator. */
  componentsExample: unknown;
  /** A complete, valid contract with a mass-balanced reaction: an acid neutraliser. */
  reactionExample: unknown;
  /**
   * Which phase each port carries, and so which physics and flow units apply,
   * decided from the description: the matched equipment archetype (if any),
   * with its ports, phase changes, governing relations and key checks.
   */
  phasePlan: PhasePlan;
  /** How each phase's flow is stated and the relations that govern it. */
  phaseFlowBasis: Record<MaterialPhase, PhaseFlowBasis>;
  /**
   * A complete, valid gas-solid separation (no phase change): a pulse-jet dust
   * collector. Included when the phase plan is a separation of a gas or solid.
   */
  gasSolidExample?: unknown;
  /**
   * A complete, valid unit that takes a liquid in and sends a solid and a gas
   * out: a spray dryer. Included when the phase plan changes a phase.
   */
  phaseChangeExample?: unknown;
  /** What the surrounding process looks like, when a graph was supplied. */
  processContext: {
    available: boolean;
    neighbours: NeighbourContext[];
    notes: string[];
    /** From the liquid stream feeding the unit: a starting point for designInlet. */
    suggestedDesignInlet?: UnitOpDesignStream;
  };
  nextStep: string;
}

export interface PhasePlan {
  /** How the plan was reached. */
  decidedBy: 'archetype' | 'none';
  archetype?: Omit<PhaseArchetype, 'keywords'>;
  /** Other archetypes the description also matched, for the model to rule out. */
  alternatives: string[];
  notes: string[];
}

/** The phase plan for a description: the best-matching archetype, stated for a model to write to. */
export function phasePlanFor(description: string): PhasePlan {
  const matches = matchPhaseArchetypes(description);
  const best = matches[0]?.archetype;
  if (!best) {
    return {
      decidedBy: 'none',
      alternatives: [],
      notes: [
        'No phase-changing or multiphase equipment was recognised in the description. If every stream is a liquid (or items), ports need no phase.',
        'If a gas or a solid enters or leaves, give each port its phase (LIQUID, GAS, SOLID) and, for a component carried in another phase, dispersed: { component: phase }. Declare any change of phase in phaseChanges.'
      ]
    };
  }
  const { keywords: _k, ...archetype } = best;
  return {
    decidedBy: 'archetype',
    archetype,
    alternatives: matches.slice(1, 4).map((m) => m.archetype.name),
    notes: [
      `The description reads as a ${best.name}. Write the ports with these phases, state each flow in the units given, and declare these phaseChanges (with latentHeatKjPerKg): the phase gate in validate_unit_op checks that every component leaves only in a phase it entered in or was changed to, and that a change that takes heat has a heat source.`,
      'Rename ports and components to the engineer\'s words (lubricant rather than dust); keep the phases.',
      best.phaseChanges.length
        ? best.example === 'VENTURI_SCRUBBER_CONTRACT'
          ? 'phaseChangeExample (a venturi scrubber) reads each inlet on its own (port.gas_in.*, port.liquor_in.*, with designPorts), works out L/G, droplet size, impaction and Johnstone efficiency, and balances the evaporation against the heat the gas gives up.'
          : 'phaseChangeExample (a spray dryer) shows phaseChanges with a latent heat, the energy balance that pays for them, and per-phase recoveries.'
        : 'gasSolidExample (a dust collector) shows a gas with a dispersed solid separated into gas and solid outlets, sized in ACFM and kg/h.'
    ]
  };
}

function summariseStream(stream: Record<string, unknown>): Record<string, unknown> {
  const keys = [
    'type',
    'designFlowRateGpm',
    'operatingPressurePsi',
    'targetPiecesPerMinute',
    'containerType',
    'containerVolumeGallons'
  ];
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (stream[k] !== undefined) out[k] = stream[k];
  }
  const fluid = stream.fluid as Record<string, unknown> | undefined;
  if (fluid) {
    out.fluid = {
      name: fluid.name,
      temperatureCelsius: fluid.temperatureCelsius,
      densityGPerCm3: fluid.densityGPerCm3,
      specificHeatKjPerKgK: fluid.specificHeatKjPerKgK,
      latentHeatOfFusionKjPerKg: fluid.latentHeatOfFusionKjPerKg
    };
  }
  return out;
}

/**
 * Collects what the neighbouring process imposes on this unit op. This is the
 * channel the sub-agent uses to ask "what is around me?" -- the orchestrator
 * supplies the graph, and the answers come from the graph rather than from the
 * model's imagination.
 */
function buildProcessContext(
  graph: ProcessGraph | undefined,
  targetNodeId: string | undefined
): DesignUnitOpResult['processContext'] {
  if (!graph || !targetNodeId) {
    return {
      available: false,
      neighbours: [],
      notes: [
        'No graph was supplied, so the unit op is being designed in isolation.',
        'Pass `graph` and `targetNodeId` to receive upstream/downstream stream conditions, which constrain what the contract can legitimately assume about its inlet.'
      ]
    };
  }

  const byId = new Map<string, ProcessNode>(graph.nodes.map((n) => [n.id, n]));
  const neighbours: NeighbourContext[] = [];

  for (const edge of graph.edges) {
    if (edge.targetNodeId === targetNodeId) {
      const n = byId.get(edge.sourceNodeId);
      if (n) {
        neighbours.push({
          nodeId: n.id,
          name: n.name,
          kind: n.kind,
          relation: 'UPSTREAM',
          streamType: (edge.stream as { type?: string }).type,
          streamSummary: summariseStream(edge.stream as unknown as Record<string, unknown>)
        });
      }
    }
    if (edge.sourceNodeId === targetNodeId) {
      const n = byId.get(edge.targetNodeId);
      if (n) {
        neighbours.push({
          nodeId: n.id,
          name: n.name,
          kind: n.kind,
          relation: 'DOWNSTREAM',
          streamType: (edge.stream as { type?: string }).type,
          streamSummary: summariseStream(edge.stream as unknown as Record<string, unknown>)
        });
      }
    }
  }

  const notes: string[] = [];
  const upstream = neighbours.filter((n) => n.relation === 'UPSTREAM');
  const downstream = neighbours.filter((n) => n.relation === 'DOWNSTREAM');

  if (upstream.length === 0) {
    notes.push('No upstream node: this unit op is a source and will cycle without waiting for feed.');
  } else {
    notes.push(
      `Inlet is fed by ${upstream.map((u) => `${u.name} (${u.kind})`).join(', ')}. ` +
        'The contract must not assume inlet conditions more favourable than that stream provides.'
    );
  }

  if (downstream.length === 0) {
    notes.push('No downstream node: output leaves the system and cannot exert backpressure.');
  } else {
    notes.push(
      `Discharges to ${downstream.map((d) => `${d.name} (${d.kind})`).join(', ')}. ` +
        'If this unit op outpaces that node it will block, which is a throughput finding rather than a contract error.'
    );
  }

  if (downstream.length > 1) {
    notes.push(
      'With several outgoing streams: liquid splits by your outlets[].share (evenly across ports without one); whole items go to them in turn (round robin).'
    );
  }

  const feed = upstream.find((u) => u.streamType === 'CONTINUOUS_FLUID')?.streamSummary;
  const fluid = feed?.fluid as { temperatureCelsius?: number; densityGPerCm3?: number; specificHeatKjPerKgK?: number } | undefined;
  const gpm = typeof feed?.designFlowRateGpm === 'number' ? feed.designFlowRateGpm : undefined;
  const suggestedDesignInlet: UnitOpDesignStream | undefined = feed
    ? {
        ...(typeof fluid?.temperatureCelsius === 'number' ? { temperatureC: fluid.temperatureCelsius } : {}),
        ...(gpm !== undefined ? { volumetricFlowGpm: gpm } : {}),
        ...(typeof fluid?.densityGPerCm3 === 'number' ? { densityGPerCm3: fluid.densityGPerCm3 } : {}),
        ...(typeof fluid?.specificHeatKjPerKgK === 'number' ? { specificHeatKjPerKgK: fluid.specificHeatKjPerKgK } : {}),
        ...(gpm !== undefined
          ? { massFlowKgPerS: Math.round(((gpm / 60) * LITERS_PER_GALLON * (fluid?.densityGPerCm3 ?? 1)) * 1000) / 1000 }
          : {})
      }
    : undefined;
  if (suggestedDesignInlet) {
    notes.push('suggestedDesignInlet is the design stream feeding this unit. Use it for designInlet, adjusted to what the engineer says; the run supplies the live values.');
  }

  return { available: true, neighbours, notes, ...(suggestedDesignInlet ? { suggestedDesignInlet } : {}) };
}


export function executeDesignUnitOp(params: DesignUnitOpParams): DesignUnitOpResult {
  const { description, graph, targetNodeId, preferredMode } = params;

  const availableFunctions = [
    { name: 'if', arity: '3 args: if(condition, then, else); only the branch taken is evaluated' },
    ...Object.entries(EXPRESSION_FUNCTIONS).map(([name, def]) => ({
      name,
      arity:
        name === 'interp'
          ? 'interp(x, x1, y1, x2, y2, ...): piecewise-linear table, x ascending, clamped at the ends'
          : Array.isArray(def.arity)
            ? `${def.arity[0]}-${def.arity[1]} args`
            : `${def.arity} arg(s)`
    }))
  ];

  const modeLine = preferredMode
    ? `The engineer expects behavior.mode = ${preferredMode}.`
    : 'Choose behavior.mode: DISCRETE_CYCLE for machines that process whole items on a cycle, CONTINUOUS_RATE for steady flow transformations, BATCH for a vessel that holds a charge of liquid and runs it through fill, hold and drain steps.';

  const phasePlan = phasePlanFor(description);
  const plannedPorts = phasePlan.archetype?.ports ?? [];
  const changesPhase = (phasePlan.archetype?.phaseChanges.length ?? 0) > 0;
  const multiphase = plannedPorts.some((p) => p.phase === 'GAS' || p.phase === 'SOLID');

  const brief = [
    `Design a unit operation from this description: "${description}"`,
    '',
    modeLine,
    '',
    'Return a single UnitOpContract as JSON, including its drawing, then call',
    'validate_unit_op with it. The engine evaluates your expressions, checks your',
    'constraints, and checks that the drawing gives every port a nozzle. If',
    'anything fails you get the specific failures back to revise against.',
    '',
    'The drawing is how the unit appears on the flowsheet: draw the actual',
    'equipment (see the rules), and put each nozzle where that stream really',
    'connects. Four worked examples show the format: workedExample is steady flow',
    '(CONTINUOUS_RATE, a wax cooling belt); cycleExample makes whole parts on a',
    'cycle (DISCRETE_CYCLE, a 3D printer); liveInletExample (an evaporator) reads',
    'what flows in (inlet.*, checked at designInlet) and splits and heats its',
    'outflow per outlet port; assemblyExample (a case packer) takes a kit of items',
    'from several ports and sends good items and rejects to their own ports;',
    'batchExample (a crystalliser, BATCH) fills, heats for a time computed from the',
    'batch itself, cools, and drains the top and the bottom to different ports;',
    'componentsExample (a juice concentrator) separates water from sugar by',
    'component recovery; reactionExample (a neutraliser) reacts HCl with NaOH on a',
    'mass basis. Streams carry named components (mass fractions): read them as',
    'inlet.x.<name> and change them with reactions and recovery. During a run the engine evaluates your design every',
    'second at the stream that actually reaches it, so write the physics in terms',
    'of inlet.* wherever the feed matters, rather than as fixed parameters.',
    '',
    'Phases decide the physics. phasePlan says which phase each port carries for',
    'this kind of unit (LIQUID, GAS, SOLID or ITEMS), what is carried in another',
    'phase (dust in air, moisture in a powder), which phase changes happen, and in',
    'what units each flow is stated (phaseFlowBasis). gasSolidExample (a dust',
    'collector) separates a powder from air with no phase change; phaseChangeExample',
    '(a spray dryer) takes a liquid in and sends a powder and humid air out, with the',
    'evaporation, its latent heat and the energy balance that pays for it.'
  ].join('\n');

  return {
    success: true,
    brief,
    engineSuppliedNames: RESERVED_SCOPE_NAMES,
    availableFunctions,
    rules: [...UNIT_OP_AUTHORING_RULES],
    workedExample: WAX_COOLING_BELT_CONTRACT,
    cycleExample: FDM_PRINTER_CONTRACT,
    liveInletExample: EVAPORATOR_CONTRACT,
    assemblyExample: CASE_PACKER_CONTRACT,
    batchExample: CRYSTALLISER_CONTRACT,
    batchNames: BATCH_SCOPE_NAMES,
    componentsExample: JUICE_CONCENTRATOR_CONTRACT,
    reactionExample: NEUTRALISER_CONTRACT,
    phasePlan,
    phaseFlowBasis: PHASE_FLOW_BASIS,
    // The examples are large, so only the one this unit needs comes back.
    ...(multiphase && !changesPhase ? { gasSolidExample: DUST_COLLECTOR_CONTRACT } : {}),
    ...(changesPhase ? { phaseChangeExample: phasePlan.archetype?.example === 'VENTURI_SCRUBBER_CONTRACT' ? VENTURI_SCRUBBER_CONTRACT : SPRAY_DRYER_CONTRACT } : {}),
    processContext: buildProcessContext(graph, targetNodeId),
    nextStep:
      'Author the contract with its drawing, call validate_unit_op with { contract }, and revise until it is ACCEPTED. Then call add_unit_op_to_flowsheet with { contract } to put it on the flowsheet open in ProcessForge Desktop, and add_stream to pipe it to the units it connects to. If the desktop app is not running, give the engineer the contract JSON to paste into Design a unit op.'
  };
}
