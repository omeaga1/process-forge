import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { EXAMPLE_LINES, JUICE_CONCENTRATION_LINE, executeValidateUnitOp, type UnitOpContract } from '@process-forge/protocol';
import { simulateProcess } from '../engine.js';

/**
 * The juice concentration line, against hand calculations made apart from
 * the engine (Antoine for the boiling point, steam-table latent heat):
 *   feed 20 gal/min x 1.048 = 4,760.5 kg/h;  preheat 1.322 kg/s x 3.85 x 58 K = 295.3 kW;
 *   boil at 31.2 kPa: 70.08 °C;  vapour (2200 - 10.2) / 2333 = 3,378 kg/h;
 *   concentrate 1,382 kg/h at 41.3 °Brix;  condenser 2,189 kW;  cooling water 25 -> 42.35 °C.
 * The engine uses IF97 and its own latent-heat curve, so it lands within 0.4 %.
 */
const near = (got: number, want: number, rel: number, what: string) => assert.ok(Math.abs(got - want) <= rel * Math.abs(want), `${what}: ${got} vs ${want}`);

describe('the juice concentration line', () => {
  it('ships as an example line', () => {
    assert.equal(EXAMPLE_LINES['juice-concentration-line'], JUICE_CONCENTRATION_LINE);
  });

  it('is built from designed units that each pass their governing relation', () => {
    for (const n of JUICE_CONCENTRATION_LINE.nodes) {
      const contract = (n.config as { contract?: UnitOpContract }).contract;
      if (!contract) continue;
      const v = executeValidateUnitOp({ contract });
      assert.equal(v.verdict, 'ACCEPTED', `${n.name}: ${v.revisionGuidance}`);
      assert.equal(v.gates.physicsAlignment.decidedBy, 'declared', n.name);
      assert.ok(v.gates.physicsAlignment.relations.length > 0, `${n.name} has a relation`);
      assert.ok(v.gates.physicsAlignment.relations.every((r) => r.status === 'holds'), `${n.name}: ${JSON.stringify(v.gates.physicsAlignment.relations)}`);
    }
  });

  it('simulates to the hand calculations, unit by unit', () => {
    const r = simulateProcess(JUICE_CONCENTRATION_LINE, 60);
    const byTag = (tag: string) => {
      const n = JUICE_CONCENTRATION_LINE.nodes.find((x) => x.name.endsWith(tag))!;
      return r.nodeReports[n.id]!;
    };
    const p101 = byTag('P-101');
    near(p101.fluid!.receivedKg!, 4760.5, 0.002, 'juice fed, kg in an hour');
    near(p101.heat!.averageDutyKw!, 0.497, 0.01, 'feed pump shaft kW');
    const e101 = byTag('E-101');
    near(e101.heat!.averageDutyKw!, 295.3, 0.005, 'preheat kW');
    near(e101.fluid!.averageOutletTemperatureC!, 68, 0.001, 'preheat outlet °C');
    const ev = byTag('EV-201').designedUnit!;
    const vapour = ev.streams!.find((s) => s.port === 'vapour')!;
    const conc = ev.streams!.find((s) => s.port === 'concentrate')!;
    near(vapour.temperatureC!, 70.08, 0.005, 'boiling point °C');
    near(vapour.kgPerHour, 3378.4, 0.005, 'vapour kg/h');
    near(conc.kgPerHour, 1382.1, 0.01, 'concentrate kg/h');
    near((100 * conc.componentsKg!.sugar!) / conc.kg, 41.33, 0.01, 'concentrate °Brix');
    const c301 = byTag('C-301');
    near(c301.heat!.averageDutyKw!, 2189.4, 0.005, 'condensing kW');
    const cw = c301.designedUnit!.streams!.find((s) => s.port === 'cw_out')!;
    near(cw.temperatureC!, 42.35, 0.005, 'cooling water return °C');
    const condensate = c301.designedUnit!.streams!.find((s) => s.port === 'condensate')!;
    // Condensate is a liquid: about 14.9 gal/min, not the vapour's volume.
    near(condensate.gallonsPerMinute!, 14.9, 0.02, 'condensate gal/min');
    // Mass and sugar balance across the line.
    near(condensate.kg + conc.kg, p101.fluid!.receivedKg!, 0.0005, 'mass balance');
    near(conc.componentsKg!.sugar!, 0.12 * p101.fluid!.receivedKg!, 0.0005, 'sugar balance');
    for (const n of JUICE_CONCENTRATION_LINE.nodes) {
      const broken = r.nodeReports[n.id]?.designedUnit?.brokenConstraints ?? [];
      assert.deepEqual(broken, [], `${n.name} breaks no check during the run`);
    }
  });
});
