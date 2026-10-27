import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLE_LINES, PAINT_CANNING_LINE, applyFlowsheetEdit, type ProcessGraph, type UnitOpContract } from '@process-forge/protocol';
import { simulateProcess } from '@process-forge/simulation-core';
import { changesBetween, compareRuns } from '../runCompare.js';

/** An example line with a designed unit (one that carries its own contract). */
const withDesignedUnit = (): ProcessGraph =>
  Object.values(EXAMPLE_LINES).find((g) => g.nodes.some((n) => (n.config as { contract?: unknown }).contract))!;

/**
 * A pinned run against a later one: what moved, next to what was changed.
 */
describe('comparing a run with a pinned one', () => {
  const pinned = { graph: PAINT_CANNING_LINE, result: simulateProcess(PAINT_CANNING_LINE, 480) };

  it('shows a shorter reaction speeding the line, the change that did it, and less waiting on the reactor', () => {
    const edit = applyFlowsheetEdit(PAINT_CANNING_LINE, { op: 'update-unit', unit: 'B-101', parameters: { reactionDurationMinutes: 30 } });
    assert.ok(edit.ok);
    const c = compareRuns(pinned, { graph: edit.graph, result: simulateProcess(edit.graph, 480) });
    assert.equal(c.per, '/min');
    assert.ok(c.rate.after > c.rate.before, JSON.stringify(c.rate));
    assert.ok((c.rate.changePercent ?? 0) > 0);
    assert.deepEqual(c.changes, [{ unit: 'Batch Reactor B-101 (Dispersion & Letdown)', what: 'reaction time 45 → 30 min' }]);
    assert.ok(c.waited && c.waited.after < c.waited.before, JSON.stringify(c.waited));
    assert.ok(c.oee && c.oee.after > c.oee.before, JSON.stringify(c.oee));
    const reacting = c.causes.find((x) => x.unitId === 'reactor-101' && x.doing === 'Reacting');
    assert.ok(reacting && reacting.after < reacting.before, JSON.stringify(c.causes));
    assert.match(c.summary, /\/min \(\+[\d.]+%\) after Batch Reactor B-101/);
  });

  it('says nothing was changed when the same line is run again, and every figure holds', () => {
    const c = compareRuns(pinned, { graph: PAINT_CANNING_LINE, result: simulateProcess(PAINT_CANNING_LINE, 480) });
    assert.deepEqual(c.changes, []);
    assert.equal(c.rate.changePercent, 0);
    assert.ok(c.causes.every((x) => x.before === x.after));
    assert.match(c.summary, /with nothing on the flowsheet changed/);
  });

  it("names a designed unit's setting by its label, though it lives in the unit's contract", () => {
    const g = withDesignedUnit();
    const node = g.nodes.find((n) => (n.config as { contract?: unknown }).contract)!;
    const p = (node.config as { contract: UnitOpContract }).contract.parameters[0]!;
    const edit = applyFlowsheetEdit(g, { op: 'update-unit', unit: node.id, parameters: { [p.name]: p.value + 1 } });
    assert.ok(edit.ok);
    assert.deepEqual(changesBetween(g, edit.graph), [{ unit: node.name, what: `${p.label.toLowerCase()} ${p.value} → ${p.value + 1}${p.unit !== '-' ? ` ${p.unit}` : ''}` }]);
  });

  it('keeps the two run lengths, so a short run against a long one is visible', () => {
    const c = compareRuns(pinned, { graph: PAINT_CANNING_LINE, result: simulateProcess(PAINT_CANNING_LINE, 120) });
    assert.deepEqual(c.minutes, { before: 480, after: 120 });
  });
});
