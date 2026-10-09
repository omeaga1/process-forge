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
