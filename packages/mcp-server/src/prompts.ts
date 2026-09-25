/**
 * MCP prompts: ready-made requests a client can offer as slash commands
 * (Claude Desktop, Claude Code, VS Code and others list them). Each spells out
 * the tool sequence, so a model new to ProcessForge follows the same path an
 * experienced user would.
 */

interface PromptArg {
  name: string;
  description: string;
  required?: boolean;
}

interface PromptDef {
  name: string;
  title: string;
  description: string;
  arguments: PromptArg[];
  text: (args: Record<string, string>) => string;
}

const or = (v: string | undefined, fallback: string) => (v && v.trim() ? v.trim() : fallback);

export const PROMPTS: PromptDef[] = [
  {
    name: 'debottleneck-line',
    title: 'Debottleneck my line',
    description: 'Find what limits the open line, test fixes with what-if runs, and recommend the best one.',
    arguments: [{ name: 'goal', description: 'Optional target, e.g. "40 cans/min" or "20% more output".' }],
    text: (a) => `Help me debottleneck my ProcessForge line. Goal: ${or(a.goal, 'as much output as the equipment allows')}.

1. Call get_open_flowsheet and summarise the line in a few lines (units in order, what each makes or moves).
2. Call diagnose_bottlenecks, then simulate_process_line for 120 minutes. Say which unit limits the line and why, quoting the engine's numbers (starved/blocked time, OEE, capacities).
3. Propose two to four concrete fixes using the units' real setting names, and test them in one compare_scenarios call. Include at least one fix at the bottleneck and one that checks where the bottleneck moves next.
4. Report a short table: scenario, output per minute, change vs baseline, new bottleneck. Recommend one, and say what it would take physically.
5. Ask before changing anything on the flowsheet.`
  },
  {
    name: 'design-unit-op',
    title: 'Design a unit op',
    description: 'Design a new piece of equipment as a checked contract and place it on the flowsheet.',
    arguments: [{ name: 'description', description: 'The equipment, in your own words.', required: true }],
    text: (a) => `Design this unit operation for my ProcessForge flowsheet: ${or(a.description, '(describe the equipment)')}

1. First check it is not already available: list_standard_unit_ops, then search_community_unit_ops. If one fits, suggest it instead (community units are unreviewed; say so).
2. Otherwise call design_unit_op with the description. It includes the stream conditions around the unit when a flowsheet is open.
3. Write the UnitOpContract, parameters, derived values, constraints and a drawing with one nozzle per port, and call validate_unit_op. If it is REJECTED, fix exactly what the gates name and validate again.
4. When it is ACCEPTED, show me its key numbers and constraints, then call add_unit_op_to_flowsheet and pipe it in with add_stream.
5. Finish with simulate_process_line and tell me how the line changed.`
  },
  {
    name: 'build-line',
    title: 'Build a line from a description',
    description: 'Lay out a whole line from standard equipment, pipe it, and simulate it.',
    arguments: [
      { name: 'description', description: 'The process, e.g. "latex paint: batch reactor, tank, filler, labeler, palletizer at 30 cans/min".', required: true }
    ],
    text: (a) => `Build this line in ProcessForge: ${or(a.description, '(describe the process)')}

1. Call list_standard_unit_ops and map each step to a standard unit (or a community or designed one if nothing fits). Start with a Feed and end with a Product outlet; add Byproduct or Waste outlets where material leaves.
2. Show me the plan as a list (unit, key settings) before placing anything.
3. Place each unit with add_standard_unit_op, in flow order, naming each with a tag (P-101, T-201...), and connect them with connectFrom or add_stream.
4. Run diagnose_bottlenecks and simulate_process_line for 120 minutes, and tell me whether the line meets the rate, and what limits it.`
  }
];

export function renderPrompt(name: string, args: Record<string, string>) {
  const p = PROMPTS.find((x) => x.name === name);
  if (!p) return null;
  for (const a of p.arguments) {
    if (a.required && !(args[a.name] && String(args[a.name]).trim())) {
      throw new Error(`The "${p.name}" prompt needs "${a.name}": ${a.description}`);
    }
  }
  return {
    description: p.description,
    messages: [{ role: 'user' as const, content: { type: 'text' as const, text: p.text(args) } }]
  };
}
