import {
  addStreamToGraph,
  createStandardUnitOp,
  findStandardUnitOp,
  planStream,
  type ProcessGraph,
  type ProcessNode
} from '@process-forge/protocol';
import { simulateProcess } from '@process-forge/simulation-core';

/**
 * The landing page's live example: a small paint line, run by the real
 * engine in the visitor's browser.
 *
 *   Feed -> reactors (in parallel) -> surge tank -> filler -> labeler -> Product
 *
 * What limits the line is found the honest way: run it again with each stage
 * made 25% faster, and see which one raises the output. Busy time alone
 * misleads (a reactor that waits on a full tank still reads as busy).
 */

export interface DemoSettings {
  reactors: number;
  fillerNozzles: number;
  labelerSpeed: number;
}

export const DEMO_DEFAULTS: DemoSettings = { reactors: 1, fillerNozzles: 10, labelerSpeed: 40 };

/** One shift, so the first batch's hour of filling and reacting is a small part of it. */
export const DEMO_MINUTES = 480;

export type Stage = 'reactors' | 'filler' | 'labeler';

export const STAGE_LABEL: Record<Stage, string> = {
  reactors: 'the reactors',
  filler: 'the filler',
  labeler: 'the labeler'
};

const item = (id: string) => {
  const found = findStandardUnitOp(id);
  if (!found) throw new Error(`No standard unit ${id}`);
  return found;
};

function place(id: string, node: ProcessNode): ProcessNode {
  return { ...node, id, position: { x: 0, y: 0 } };
}

/** The line for these settings, with one stage 25% faster when asked. */
export function buildDemoLine(s: DemoSettings, faster?: Stage): ProcessGraph {
  const k = 0.8; // 25% faster is 80% of the time
  const nodes: ProcessNode[] = [place('feed', createStandardUnitOp(item('feed'), { material: 'Latex base' }))];
  for (let i = 0; i < s.reactors; i++) {
    const t = faster === 'reactors' ? k : 1;
    nodes.push(
      place(
        `r${i + 1}`,
        createStandardUnitOp(item('batch-reactor'), {
          name: `Reactor R-10${i + 1}`,
          parameters: {
            batchVolumeGallons: 1000,
            fillDurationMinutes: 20 * t,
            reactionDurationMinutes: 45 * t,
            dischargeRateGpm: 70 / t
          }
        })
      )
    );
  }
  nodes.push(
    place(
      'tank',
      createStandardUnitOp(item('surge-tank'), {
        name: 'Surge Tank T-200',
        parameters: { capacityGallons: 3000, initialLevelGallons: 0, maxDischargeRateGpm: 80 }
      })
    )
  );
  const ft = faster === 'filler' ? k : 1;
  nodes.push(
    place(
      'filler',
      createStandardUnitOp(item('rotary-filler'), {
        name: 'Filler F-300',
        parameters: {
          nozzleCount: s.fillerNozzles,
          containerVolumeGallons: 1,
          fillTimePerCycleSeconds: 10 * ft,
          indexTimePerCycleSeconds: 2 * ft,
          rejectRatePercentage: 0
        }
      })
    )
  );
  nodes.push(
    place(
      'labeler',
      createStandardUnitOp(item('labeler'), {
        name: 'Labeler L-400',
        parameters: { maxSpeedUnitsPerMinute: s.labelerSpeed * (faster === 'labeler' ? 1.25 : 1), opticalInspectionFailRate: 0 }
      })
    )
  );
  nodes.push(place('out', createStandardUnitOp(item('product'), { material: 'Filled cans' })));

  let g: ProcessGraph = { id: 'landing-demo', name: 'Paint line', version: '1.0.0', metadata: {}, nodes, edges: [] };
  let t = 0;
  const pipe = (from: string, to: string) => {
    const plan = planStream(g, { from, to }, ++t);
    if (!plan.ok) throw new Error(plan.error);
    g = addStreamToGraph(g, plan.edge);
  };
  for (let i = 1; i <= s.reactors; i++) {
    pipe('feed', `r${i}`);
    pipe(`r${i}`, 'tank');
  }
  pipe('tank', 'filler');
  pipe('filler', 'labeler');
  pipe('labeler', 'out');
  return g;
}

export interface UnitShare {
  id: string;
  busy: number;
  blocked: number;
  starved: number;
}

/** One unit at one minute of the shift, as the engine recorded it. */
export interface UnitFrame {
  state: 'IDLE' | 'BUSY' | 'BLOCKED' | 'STARVED' | 'FAILED';
  /** Tanks and reactors: how full, 0..1. */
  level?: number;
  /** Liquid leaving it now, gal/min. */
  flow?: number;
  phase?: 'FILLING' | 'HEATING' | 'REACTING' | 'DISCHARGING';
  /** Items made (or, for the product outlet, received) so far. */
  made: number;
}

export interface DemoRun {
  /** Filled cans a minute, over the shift. */
  rate: number;
  total: number;
  shares: Record<string, UnitShare>;
  /** The shift minute by minute, for playback: frames[m][nodeId]. */
  frames: Record<string, UnitFrame>[];
}

/** One shift of the line; the same seed every time, so a setting always gives the same answer. */
export function runDemo(s: DemoSettings, faster?: Stage): DemoRun {
  const r = simulateProcess(buildDemoLine(s, faster), DEMO_MINUTES, { seed: 7 });
  const secs = DEMO_MINUTES * 60;
  const shares: Record<string, UnitShare> = {};
  for (const [id, rep] of Object.entries(r.nodeReports)) {
    shares[id] = { id, busy: rep.busyTimeSeconds / secs, blocked: rep.blockedTimeSeconds / secs, starved: rep.starvedTimeSeconds / secs };
  }
  // The engine snapshots every unit once a simulated minute; a minute with no
  // snapshot carries the last one forward.
  const frames: Record<string, UnitFrame>[] = [];
  const byMinute = new Map<number, typeof r.telemetryLog>();
  for (const t of r.telemetryLog) {
    const m = Math.floor(t.timeSeconds / 60);
    (byMinute.get(m) ?? byMinute.set(m, []).get(m)!).push(t);
  }
  let last: Record<string, UnitFrame> = {};
  for (let m = 0; m < DEMO_MINUTES; m++) {
    const next = { ...last };
    for (const t of byMinute.get(m) ?? []) {
      next[t.nodeId] = {
        state: t.state,
        made: t.unitsProduced,
        ...(t.levelFraction !== undefined ? { level: t.levelFraction } : {}),
        ...(t.flowGpm !== undefined ? { flow: t.flowGpm } : {}),
        ...(t.phase ? { phase: t.phase } : {})
      };
    }
    frames.push(next);
    last = next;
  }
  return { rate: r.averageLineThroughputUnitsPerMin, total: r.totalUnitsPackaged, shares, frames };
}

export interface Constraint {
  stage: Stage;
  /** Cans a minute gained by making that stage 25% faster. */
  gain: number;
  /** The best any other stage gains. */
  runnerUp: number;
}

/** Which stage limits the line: the one whose speed-up raises output most. */
export function findConstraint(s: DemoSettings, base: DemoRun): Constraint {
  const stages: Stage[] = ['reactors', 'filler', 'labeler'];
  const gains = stages.map((stage) => ({ stage, gain: runDemo(s, stage).rate - base.rate })).sort((a, b) => b.gain - a.gain);
  return { stage: gains[0]!.stage, gain: gains[0]!.gain, runnerUp: Math.max(0, gains[1]!.gain) };
}
