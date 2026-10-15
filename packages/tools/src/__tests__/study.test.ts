import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JUICE_CONCENTRATION_LINE as juice, PAINT_CANNING_LINE as paint } from '@process-forge/protocol';
import { simulateProcess } from '@process-forge/simulation-core';
import { readMetric, solveLineTarget, sweepLine } from '../study.js';

/**
 * Line studies run by the engine: a sweep, and a design spec ("vary X so that
 * Y = target") solved over full runs, never by the model's own arithmetic.
 */
describe('reading a result of a run by name', () => {
  it('reads the line\'s output and any unit\'s results', () => {
    const r = simulateProcess(juice, 30);
    assert.ok((readMetric(juice, r, 'output.kgPerHour') as number) > 1300);
    assert.ok(Math.abs((readMetric(juice, r, 'E-101.outletTemperatureC') as number) - 68) < 0.5);
    assert.ok(Math.abs((readMetric(juice, r, 'P-600.fraction.sugar') as number) - 0.415) < 0.01);
    assert.ok((readMetric(juice, r, 'EV-201.dutyKw') as number) > 2000);
  });

  it('says why a metric has no value', () => {
    const r = simulateProcess(juice, 10);
    assert.match((readMetric(juice, r, 'X-999.kgPerHour') as { error: string }).error, /names no unit/);
    assert.match((readMetric(juice, r, 'E-101.colour') as { error: string }).error, /not a result of a unit/);
  });
});

describe('sweep_line', () => {
  it('runs the line at each value on one seed and tabulates what was asked, with each run\'s status', () => {
    const s = sweepLine(juice, { vary: { unit: 'F-100', parameter: 'supplyRate' }, values: [16, 20, 24], metrics: ['output.kgPerHour', 'P-600.fraction.sugar'], durationMinutes: 30 }) as Record<string, any>;
    assert.equal(s.success, true);
    assert.equal(s.rows.length, 3);
    assert.equal(s.rows[0].status, 'failed', 'at 16 gal/min the concentrate is too thick to pump');
    assert.equal(s.rows[1].status, 'ok');
    assert.ok(s.rows[2]['output.kgPerHour'] > s.rows[1]['output.kgPerHour'], 'more juice, more concentrate, until the pump limits it');
    assert.ok(s.rows[2]['P-600.fraction.sugar'] < s.rows[1]['P-600.fraction.sugar'], 'and thinner');
  });

  it('refuses a setting the unit does not have', () => {
    const s = sweepLine(juice, { vary: { unit: 'F-100', parameter: 'supplyRate' }, values: [20] }) as Record<string, any>;
    assert.equal(s.success, true);
    const bad = sweepLine(juice, { vary: { unit: 'E-101', parameter: 'targetTemp' }, values: [60, 70] }) as Record<string, any>;
    assert.match(bad.rows[0].error, /has no setting "targetTemp".*Did you mean targetC\?/);
  });
});

describe('solve_line_target', () => {
  it('finds the steam duty that makes 50 °Brix concentrate, within the range the evaporator\'s design holds', () => {
    const r = solveLineTarget(juice, { vary: { unit: 'EV-201', parameter: 'steamKw' }, target: { metric: 'P-600.fraction.sugar', value: 0.5 }, durationMinutes: 30 }) as Record<string, any>;
    assert.equal(r.solved, true, JSON.stringify(r));
    assert.ok(Math.abs(r.achieved - 0.5) <= 0.0025);
    assert.ok(r.value > 2200 && r.value < 2500, `steam ${r.value} kW`);
    assert.equal(r.status, 'ok');
    assert.ok(r.runs <= 12, `${r.runs} runs`);
    assert.ok(r.notes?.some((n: string) => /design fails its checks/.test(n)), 'says where the design stops holding');
    assert.match(r.nextStep, /Nothing on the flowsheet changed/);
  });

  it('reports a target out of reach with the nearest value, and a result that does not respond', () => {
    const far = solveLineTarget(juice, { vary: { unit: 'F-100', parameter: 'supplyRate', min: 18, max: 30 }, target: { metric: 'output.kgPerHour', value: 5000 }, durationMinutes: 20 }) as Record<string, any>;
    assert.equal(far.solved, false);
    assert.equal(far.reason, 'out-of-reach');
    assert.ok(far.nearest.result < 5000);
    // The paint line is limited by its batch reactor: the labeler's speed does not move its output.
    const flat = solveLineTarget(paint, { vary: { unit: 'LB-500', parameter: 'maxSpeedUnitsPerMinute', min: 60, max: 200 }, target: { metric: 'output.unitsPerMinute', value: 20 }, durationMinutes: 60 }) as Record<string, any>;
    assert.equal(flat.solved, false);
    assert.equal(flat.reason, 'insensitive', JSON.stringify(flat).slice(0, 400));
  });
});
