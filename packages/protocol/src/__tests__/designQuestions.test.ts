import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  DESIGN_QUESTIONS,
  STANDARD_EQUIPMENT_CATALOG,
  EVAPORATOR_CONTRACT,
  checkDesignCompleteness,
  designChecklist,
  designStateOf,
  heuristicProvider,
  type DesignProfile,
  type UnitOpContract
} from '../index.js';

const profileOf = (message: string) => heuristicProvider.ask({ message }, DESIGN_QUESTIONS) as Promise<DesignProfile>;

describe('Design questions: what a complete design of a unit carries', () => {
  it('asks for an energy balance, a vapour outlet and a solids balance for a dryer, and not for a conveyor', async () => {
    const dryer = designChecklist(await profileOf('Spray dryer: dries milk concentrate to powder with hot air; the vapour leaves in the exhaust'));
    assert.ok(dryer.some((c) => c.startsWith('An energy balance')));
    assert.ok(dryer.some((c) => c.includes('gas or vapour')));
    assert.ok(dryer.some((c) => c.includes('solids')));
    const conveyor = designChecklist(await profileOf('Belt conveyor that carries cases between the packer and the palletizer'));
    assert.ok(!conveyor.some((c) => c.startsWith('An energy balance')), conveyor.join(' | '));
    assert.ok(conveyor.some((c) => c.includes('Item ports')));
  });

  it('asks for components and reactions for a reactor', async () => {
    const r = designChecklist(await profileOf('Continuous reactor converting ethylene oxide and water to glycol'));
    assert.ok(r.some((c) => c.startsWith('components and reactions')), r.join(' | '));
  });

  it('warns when a design misses what the unit needs', async () => {
    const noHeat: UnitOpContract = {
      ...EVAPORATOR_CONTRACT,
      behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'inlet.volumetricFlowGpm' },
      outlets: [{ port: 'vapour', share: 'vapourShare' }, { port: 'concentrate' }]
    };
    const ids = checkDesignCompleteness(noHeat, await profileOf(designStateOf(noHeat).message)).map((w) => w.id);
    assert.ok(ids.includes('energy-duty'), ids.join(','));
    assert.ok(ids.includes('energy-temperature'), ids.join(','));
    const oneOutlet: UnitOpContract = { ...EVAPORATOR_CONTRACT, ports: EVAPORATOR_CONTRACT.ports.filter((p) => p.id !== 'vapour'), outlets: [{ port: 'concentrate' }] };
    assert.ok(checkDesignCompleteness(oneOutlet, await profileOf(designStateOf(oneOutlet).message)).some((w) => w.id === 'outlets'));
  });

  it('finds nothing missing in the designed units of the standard library', async () => {
    for (const item of STANDARD_EQUIPMENT_CATALOG.filter((i) => i.contract)) {
      const warnings = checkDesignCompleteness(item.contract!, await profileOf(designStateOf(item.contract!).message));
      assert.deepEqual(warnings.map((w) => `${w.id}: ${w.message}`), [], item.id);
    }
  });
});
