import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FORGE_TOOLS } from '../registry.js';
import { lookupComponent } from '../components.js';

/**
 * lookup_component grounds names and figures: a model asks rather than
 * recalls, and an unknown name is refused with what it probably meant.
 */
describe('lookup_component', () => {
  it('is a read-only tool in the registry', () => {
    const t = FORGE_TOOLS.find((x) => x.name === 'lookup_component');
    assert.ok(t);
    assert.equal(t!.access, 'read');
  });

  it('gives a component by alias, with its figures at a temperature and its boiling point at a pressure', () => {
    const r = lookupComponent({ component: 'IPA', temperatureC: 60, pressureKpa: 50 }) as Record<string, any>;
    assert.equal(r.success, true);
    assert.equal(r.id, 'isopropanol');
    assert.ok(r.atTemperature.vapourPressureKpa > 30 && r.atTemperature.vapourPressureKpa < 45, JSON.stringify(r.atTemperature));
    assert.ok(r.boilingPointC > 60 && r.boilingPointC < 70, `IPA boils at ${r.boilingPointC} °C under 50 kPa`);
    assert.match(r.source, /Poling/);
  });

  it('refuses an unknown name with the one it probably meant', () => {
    const r = lookupComponent({ component: 'ethonal' }) as Record<string, any>;
    assert.equal(r.success, false);
    assert.match(r.error, /did you mean ethanol\?/);
    const none = lookupComponent({ component: 'unobtainium' }) as Record<string, any>;
    assert.match(none.error, /is not in the component database\. Call lookup_component/);
  });

  it('gives a mixture its density, specific heat and ideal bubble point, and says the model is ideal', () => {
    const r = lookupComponent({ composition: { benzene: 0.5, toluene: 0.5 } }) as Record<string, any>;
    assert.ok(r.bubblePointC > 90 && r.bubblePointC < 94);
    assert.ok(r.firstVapourMoleFractions.benzene > 0.6, 'the vapour is richer in the lighter one');
    assert.match(r.model, /Raoult/);
    // Ethanol and water are far from ideal: NRTL puts 40 % ethanol at about 83 °C (Raoult said 93.6).
    const spirit = lookupComponent({ composition: { water: 0.6, ethanol: 0.4 } }) as Record<string, any>;
    assert.ok(Math.abs(spirit.bubblePointC - 83) < 1, String(spirit.bubblePointC));
    assert.ok(spirit.firstVapourMoleFractions.ethanol > 0.5);
    assert.match(spirit.model, /NRTL \(ChemSep\) for water–ethanol\./);
    const syrup = lookupComponent({ composition: { water: 0.6, sugar: 0.4 } }) as Record<string, any>;
    assert.match(syrup.model, /ideal solution \(Raoult\)\. No NRTL data, taken as ideal: water–sucrose\./);
    const bad = lookupComponent({ composition: { water: 0.5, resin: 0.5 } }) as Record<string, any>;
    assert.equal(bad.success, false);
    assert.match(bad.error, /resin/);
  });

  it('lists every component when asked for nothing', () => {
    const r = lookupComponent({}) as Record<string, any>;
    assert.ok(r.components.length >= 35);
    assert.ok(r.components.some((c: { id: string }) => c.id === 'sucrose'));
  });
});
