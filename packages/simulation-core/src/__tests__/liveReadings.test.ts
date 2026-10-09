import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { JUICE_CONCENTRATION_LINE } from '@process-forge/protocol';
import { simulateProcess } from '../index.js';

describe('a unit that sets its outlet temperature reports it', () => {
  it("the juice preheater's outlet reads its 68 °C target, not the 10 °C feed it holds", () => {
    const r = simulateProcess(JUICE_CONCENTRATION_LINE, 10);
    const heater = JUICE_CONCENTRATION_LINE.nodes.find((n) => /E-101/.test(n.name))!;
    const last = r.telemetryLog.filter((x) => x.nodeId === heater.id).at(-1)!;
    const out = last.portFlows?.out;
    assert.ok(out, JSON.stringify(last));
    assert.equal(out.temperatureC, 68);
    assert.ok(out.kgPerHour > 0);
  });
});

describe("a unit's current rate is what it is doing now, not the run's average", () => {
  it('the paint filler reads 0/min once its tank has run dry, though it averaged 13/min', async () => {
    const { PAINT_CANNING_LINE } = await import('@process-forge/protocol');
    const r = simulateProcess(PAINT_CANNING_LINE, 30);
    const log = r.telemetryLog.filter((x) => x.nodeId === 'rotary-filler-300');
    const last = log.at(-1)!;
    assert.equal(last.state, 'STARVED');
    assert.ok(last.unitsProduced > 300, String(last.unitsProduced));
    assert.equal(last.instantaneousRatePerMin, 0);
    // While it had paint it ran at its full rate.
    assert.ok(Math.max(...log.map((x) => x.instantaneousRatePerMin)) > 35);
  });
});

describe('a stream reports what it is made of', () => {
  it("the evaporator's concentrate is about 41.5 % sugar, its vapour pure water", () => {
    const r = simulateProcess(JUICE_CONCENTRATION_LINE, 10);
    const evap = JUICE_CONCENTRATION_LINE.nodes.find((n) => /EV-201/.test(n.name))!;
    const last = r.telemetryLog.filter((x) => x.nodeId === evap.id).at(-1)!;
    const flows = Object.values(last.portFlows ?? {});
    const vapour = flows.find((f) => f.phase === 'GAS')!;
    const concentrate = flows.find((f) => f.phase === 'LIQUID')!;
    assert.deepEqual(vapour.composition, { water: 1 });
    assert.ok(Math.abs(concentrate.composition!.sugar! - 0.415) < 0.005, JSON.stringify(concentrate.composition));
  });
});

describe('streams averaged over a run', () => {
  it('the paint line: zero at 30 min (tank dry), but 13.3 cans/min and ~12 gal/min of paint over the run', async () => {
    const { PAINT_CANNING_LINE } = await import('@process-forge/protocol');
    const { averageStreamStates, streamStates, finalSnapshots } = await import('../index.js');
    const r = simulateProcess(PAINT_CANNING_LINE, 30);
    const now = streamStates(PAINT_CANNING_LINE, finalSnapshots(r.telemetryLog));
    const avg = averageStreamStates(PAINT_CANNING_LINE, r.telemetryLog);
    const cans = (rows: typeof avg) => rows.find((s) => s.phase === 'ITEMS')!.itemsPerMin!;
    assert.equal(cans(now), 0);
    assert.ok(Math.abs(cans(avg) - 13.3) < 0.2, String(cans(avg)));
    const paint = avg.find((s) => /ST-200/.test(s.from.unit))!;
    assert.ok(paint.gpm! > 10 && paint.gpm! < 14, String(paint.gpm));
  });
});
