import {
  EXPRESSION_FUNCTIONS,
  RESERVED_SCOPE_NAMES,
  WAX_COOLING_BELT_CONTRACT,
  type ProcessGraph,
  type ProcessNode
} from '@process-forge/protocol';

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
  preferredMode?: 'DISCRETE_CYCLE' | 'CONTINUOUS_RATE';
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
  /** A complete, valid contract to pattern-match against. */
  workedExample: unknown;
  /** What the surrounding process looks like, when a graph was supplied. */
  processContext: {
    available: boolean;
    neighbours: NeighbourContext[];
    notes: string[];
  };
  nextStep: string;
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

  if (neighbours.length > 2) {
    notes.push(
      'NOTE: the engine currently routes along the first outgoing edge only, so a branching topology will not distribute as drawn. See docs/audit/02-engine.md section 4.1.'
    );
  }

  return { available: true, neighbours, notes };
}

const RULES: string[] = [
  'A contract is DATA. Emit JSON. Do not emit JavaScript, and do not expect any code you write to run.',
  'Every expression is evaluated by a restricted evaluator: arithmetic, comparison, && || !, parentheses, and the whitelisted functions below. Nothing else exists.',
  'Every name an expression references must be a parameter you declared, a derived value declared EARLIER in the list, or one of the engine-supplied names. Unknown names are a validation error, not a zero.',
  'Derived values resolve in declaration order. Forward references are rejected, so order your derived list as a calculation sequence.',
  'Declare min/max on every parameter as the PHYSICALLY meaningful domain, not a UI range. A value outside its own bounds is a validation error.',
  'Put the physics that must hold in `constraints`, not in prose. severity ERROR means the unit op cannot operate as specified and the engine will refuse to simulate it; WARNING means operable but outside good practice.',
  'Write each constraint `message` so an engineer can act on it, and add a `hint` naming the knob to turn. These strings are fed back to you verbatim when a design is rejected.',
  'Prefer a constraint that is INDEPENDENT of the quantity it guards. A check that reduces algebraically to another check adds no information.',
  'CONTINUOUS_RATE evaluates steady-state relations. The engine does not integrate. If a unit op genuinely requires a time-resolved profile, say so plainly rather than approximating it with an algebraic stand-in.',
  'Set provenance.authoredBy to SUB_AGENT and list in engineerConfirmed only the parameters the engineer actually stated. Do not claim confirmation for values you chose.'
];

export function executeDesignUnitOp(params: DesignUnitOpParams): DesignUnitOpResult {
  const { description, graph, targetNodeId, preferredMode } = params;

  const availableFunctions = Object.entries(EXPRESSION_FUNCTIONS).map(([name, def]) => ({
    name,
    arity: Array.isArray(def.arity) ? `${def.arity[0]}-${def.arity[1]} args` : `${def.arity} arg(s)`
  }));

  const modeLine = preferredMode
    ? `The engineer expects behavior.mode = ${preferredMode}.`
    : 'Choose behavior.mode: DISCRETE_CYCLE for machines that process items on a cycle, CONTINUOUS_RATE for steady flow transformations.';

  const brief = [
    `Design a unit operation from this description: "${description}"`,
    '',
    modeLine,
    '',
    'Return a single UnitOpContract as JSON, then call validate_unit_op with it.',
    'The engine will evaluate your expressions and check your constraints. If any',
    'ERROR-severity constraint fails, or any expression fails to resolve, the',
    'design is rejected and you will be handed the specific failures to revise',
    'against. A contract that cannot survive its own simulator is not a design.'
  ].join('\n');

  return {
    success: true,
    brief,
    engineSuppliedNames: RESERVED_SCOPE_NAMES,
    availableFunctions,
    rules: RULES,
    workedExample: WAX_COOLING_BELT_CONTRACT,
    processContext: buildProcessContext(graph, targetNodeId),
    nextStep:
      'Author the contract, then call validate_unit_op with { contract }. Revise and re-validate until it passes. Only then attach it to a node as config.contract.'
  };
}
