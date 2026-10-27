import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JUICE_CONCENTRATION_LINE, PAINT_CANNING_LINE, applyFlowsheetEdit, graphFingerprint, type ProcessGraph } from '@process-forge/protocol';
import { simulateProcess, solveSteadyState } from '@process-forge/simulation-core';
import { flowsheetStatus } from '../model/flowsheetStatus.js';
import { cardsFromRun, cardsFromSteady, pipeFigure } from '../model/streamCards.js';
import { streamStates, finalSnapshots } from '@process-forge/simulation-core';

/**
 * The status line follows the sequence a simulator's status bar does: what is
 * missing, ready, solved, the run's verdict, and results gone stale.
 */
describe('the flowsheet status line', () => {
  it('says an empty flowsheet is empty', () => {
    const empty = { ...PAINT_CANNING_LINE, nodes: [], edges: [] } as ProcessGraph;
    assert.equal(flowsheetStatus({ graph: empty }).tone, 'empty');
  });

  it('solves a liquid line at steady state before any run', () => {
    const s = flowsheetStatus({ graph: JUICE_CONCENTRATION_LINE, steady: solveSteadyState(JUICE_CONCENTRATION_LINE) });
    assert.equal(s.tone, 'solved');
    assert.match(s.headline, /^Solved at steady state: 1,377 kg\/h of product, balance closes/);
    assert.match(s.detail!, /steady state in \d+ steps/);
  });

  it('is ready to run when the line runs in cycles and has no steady state', () => {
    const s = flowsheetStatus({ graph: PAINT_CANNING_LINE, steady: solveSteadyState(PAINT_CANNING_LINE) });
    assert.equal(s.tone, 'ready');
  });

  it('gives the run\'s verdict, and says when the results no longer match the flowsheet', () => {
    // Long enough for its batch reactor to finish two batches.
    const result = simulateProcess(PAINT_CANNING_LINE, 480);
    const done = flowsheetStatus({ graph: PAINT_CANNING_LINE, result });
    assert.equal(done.tone, 'ok', JSON.stringify(done.problems));
    assert.match(done.headline, /^Run done: [\d.]+\/min, mass balances/);
    // 30 minutes is the reactor's first fill: the bar says so, on the reactor.
    const short = flowsheetStatus({ graph: PAINT_CANNING_LINE, result: simulateProcess(PAINT_CANNING_LINE, 30) });
    assert.equal(short.tone, 'warnings');
    assert.ok(short.problems.some((p) => p.nodeId === 'reactor-101' && /mostly start-up/.test(p.message)), JSON.stringify(short.problems));
    const stale = flowsheetStatus({ graph: PAINT_CANNING_LINE, result, stale: true });
    assert.equal(stale.tone, 'stale');
    assert.match(stale.headline, /before your last edit/);
  });

  it('lists an unconnected unit as a problem with its unit, for F4', () => {
    const lab = PAINT_CANNING_LINE.nodes.find((n) => n.id === 'labeler-500')!;
    const g = { ...PAINT_CANNING_LINE, nodes: [...PAINT_CANNING_LINE.nodes, { ...lab, id: 'copy', name: 'Labeler copy' }] } as ProcessGraph;
    const s = flowsheetStatus({ graph: g });
    assert.ok(s.problems.some((p) => p.nodeId === 'copy' && /not connected/.test(p.message)), JSON.stringify(s.problems));
  });

  it('keeps the fingerprint when only the drawing changes, so moving a unit does not make results stale', () => {
    const moved = { ...PAINT_CANNING_LINE, nodes: PAINT_CANNING_LINE.nodes.map((n) => ({ ...n, position: { x: n.position.x + 50, y: n.position.y } })) };
    assert.equal(graphFingerprint(moved), graphFingerprint(PAINT_CANNING_LINE));
    const changed = applyFlowsheetEdit(PAINT_CANNING_LINE, { op: 'update-unit', unit: 'LB-500', parameters: { maxSpeedUnitsPerMinute: 40 } });
    assert.ok(changed.ok);
    assert.notEqual(graphFingerprint(changed.graph), graphFingerprint(PAINT_CANNING_LINE));
  });
});

describe('what a pipe carries, on its card and its label', () => {
  it('reads the steady state before a run, with each end, the flows and the mix', () => {
    const cards = cardsFromSteady(JUICE_CONCENTRATION_LINE, solveSteadyState(JUICE_CONCENTRATION_LINE));
    const c = cards.get('juice-ev-201-concentrate-to-p-401')!;
    assert.equal(c.source, 'steady state');
    assert.match(c.from, /Vacuum Evaporator EV-201 · Concentrate/);
    assert.deepEqual(c.rows.map(([k]) => k), ['Mass flow', 'Volume flow', 'Temperature']);
    assert.equal(c.composition![0]![0], 'water');
  });

  it('reads the run at the playhead once there is one', () => {
    const r = simulateProcess(JUICE_CONCENTRATION_LINE, 10);
    const cards = cardsFromRun(streamStates(JUICE_CONCENTRATION_LINE, finalSnapshots(r.telemetryLog)), 'at 10:00 of the run');
    assert.equal(cards.get('juice-ev-201-concentrate-to-p-401')!.source, 'at 10:00 of the run');
  });

  it('labels a liquid pipe in gal/min and a gas or solids pipe in kg/h, never gallons of gas', () => {
    assert.equal(pipeFigure('LIQUID', { gpm: 20, kgPerHour: 4760, temperatureC: 10 }), '20 gpm · 10 °C');
    assert.equal(pipeFigure('GAS', { gpm: 999, kgPerHour: 3383.8, temperatureC: 70 }), '3,384 kg/h · 70 °C');
  });
});
