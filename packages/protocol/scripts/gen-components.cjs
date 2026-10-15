// Generates packages/protocol/src/thermo/componentData.ts from the Poling / PSRK / CRC tables
// published in Caleb Bell's `chemicals` (MIT). Data files are read as data only.
// Usage: node scripts/gen-components.cjs <data dir> src/thermo/componentData.ts
//
// The data dir holds five tables from github.com/CalebBell/chemicals, fetched with e.g.
//   gh api -H "Accept: application/vnd.github.raw" "repos/CalebBell/chemicals/contents/chemicals/<folder>/<file>" > <name>
//   antoine.tsv  Vapor Pressure/Antoine Collection Poling.tsv
//   poling.tsv   Heat Capacity/PolingDatabank.tsv
//   psrk.tsv     Critical Properties/Appendix to PSRK Revision 4.tsv
//   hvap.tsv     Phase Change/CRC Handbook Heat of Vaporization.tsv
//   costald.tsv  Density/COSTALD Parameters.tsv
const fs = require('fs');
const path = require('path');
const [dir, out] = process.argv.slice(2);

const read = (f) => {
  const [head, ...rows] = fs.readFileSync(path.join(dir, f), 'utf8').trim().split(/\r?\n/);
  const cols = head.split('\t');
  const byCas = new Map();
  for (const r of rows) {
    const v = r.split('\t');
    const o = Object.fromEntries(cols.map((c, i) => [c, v[i]]));
    if (!byCas.has(o.CAS)) byCas.set(o.CAS, o);
  }
  return byCas;
};
const antoine = read('antoine.tsv');
const poling = read('poling.tsv');
const psrk = read('psrk.tsv');
const hvap = read('hvap.tsv');
const costald = read('costald.tsv');
const num = (s) => (s === undefined || s === '' ? undefined : Number(s));

// id, CAS, name, formula, molar mass (from the formula, IUPAC 2013 weights), liquid density at 20 °C (kg/m3, CRC; liquids only), aliases
const LIST = [
  ['water', '7732-18-5', 'Water', 'H2O', 18.015, 998.2, ['h2o', 'steam', 'vapour', 'vapor', 'moisture']],
  ['ethanol', '64-17-5', 'Ethanol', 'C2H6O', 46.068, 789.3, ['etoh', 'ethyl_alcohol', 'alcohol']],
  ['methanol', '67-56-1', 'Methanol', 'CH4O', 32.042, 791.4, ['meoh', 'methyl_alcohol']],
  ['acetone', '67-64-1', 'Acetone', 'C3H6O', 58.079, 784.5, ['propanone', 'dimethyl_ketone']],
  ['isopropanol', '67-63-0', '2-Propanol (isopropanol)', 'C3H8O', 60.095, 786.3, ['ipa', '2_propanol', 'isopropyl_alcohol']],
  ['propanol', '71-23-8', '1-Propanol', 'C3H8O', 60.095, 803.4, ['1_propanol', 'n_propanol']],
  ['butanol', '71-36-3', '1-Butanol', 'C4H10O', 74.121, 809.8, ['1_butanol', 'n_butanol']],
  ['pentane', '109-66-0', 'n-Pentane', 'C5H12', 72.149, 626.2, ['n_pentane']],
  ['hexane', '110-54-3', 'n-Hexane', 'C6H14', 86.175, 660.6, ['n_hexane']],
  ['heptane', '142-82-5', 'n-Heptane', 'C7H16', 100.202, 683.8, ['n_heptane']],
  ['octane', '111-65-9', 'n-Octane', 'C8H18', 114.229, 702.5, ['n_octane']],
  ['cyclohexane', '110-82-7', 'Cyclohexane', 'C6H12', 84.159, 778.5, []],
  ['benzene', '71-43-2', 'Benzene', 'C6H6', 78.112, 876.5, []],
  ['toluene', '108-88-3', 'Toluene', 'C7H8', 92.138, 866.9, ['methylbenzene']],
  ['ethylbenzene', '100-41-4', 'Ethylbenzene', 'C8H10', 106.165, 867.0, []],
  ['acetic_acid', '64-19-7', 'Acetic acid', 'C2H4O2', 60.052, 1049.2, ['ethanoic_acid', 'acetic']],
  ['ethyl_acetate', '141-78-6', 'Ethyl acetate', 'C4H8O2', 88.105, 900.3, ['etoac', 'ethyl_ethanoate']],
  ['butanone', '78-93-3', '2-Butanone (MEK)', 'C4H8O', 72.106, 805.4, ['mek', 'methyl_ethyl_ketone']],
  ['dichloromethane', '75-09-2', 'Dichloromethane', 'CH2Cl2', 84.933, 1326.6, ['dcm', 'methylene_chloride']],
  ['glycerol', '56-81-5', 'Glycerol', 'C3H8O3', 92.094, 1261.3, ['glycerin', 'glycerine']],
  ['ethylene_glycol', '107-21-1', 'Ethylene glycol', 'C2H6O2', 62.068, 1113.5, ['meg', 'monoethylene_glycol', 'glycol']],
  ['propylene_glycol', '57-55-6', 'Propylene glycol', 'C3H8O2', 76.095, 1036.1, ['mpg', '1_2_propanediol']],
  ['ammonia', '7664-41-7', 'Ammonia', 'NH3', 17.031, undefined, ['nh3']],
  ['carbon_dioxide', '124-38-9', 'Carbon dioxide', 'CO2', 44.009, undefined, ['co2']],
  ['carbon_monoxide', '630-08-0', 'Carbon monoxide', 'CO', 28.010, undefined, ['co']],
  ['nitrogen', '7727-37-9', 'Nitrogen', 'N2', 28.014, undefined, ['n2']],
  ['oxygen', '7782-44-7', 'Oxygen', 'O2', 31.999, undefined, ['o2']],
  ['argon', '7440-37-1', 'Argon', 'Ar', 39.948, undefined, ['ar']],
  ['hydrogen', '1333-74-0', 'Hydrogen', 'H2', 2.016, undefined, ['h2']],
  ['methane', '74-82-8', 'Methane', 'CH4', 16.043, undefined, ['ch4', 'natural_gas']],
  ['ethylene', '74-85-1', 'Ethylene', 'C2H4', 28.054, undefined, ['ethene', 'c2h4']],
  ['propane', '74-98-6', 'Propane', 'C3H8', 44.096, undefined, ['c3h8']],
  ['butane', '106-97-8', 'n-Butane', 'C4H10', 58.122, undefined, ['n_butane']],
  ['sulfur_dioxide', '7446-09-5', 'Sulfur dioxide', 'SO2', 64.064, undefined, ['so2']],
  ['hydrogen_chloride', '7647-01-0', 'Hydrogen chloride', 'HCl', 36.461, undefined, ['hcl']]
];

const R = 8.314462618;
const r = (x, n = 6) => (x === undefined || !Number.isFinite(x) ? undefined : Number(x.toPrecision(n)));
const entries = [];
for (const [id, cas, name, formula, mw, rho20, aliases] of LIST) {
  const a = antoine.get(cas);
  const p = poling.get(cas);
  const c = psrk.get(cas);
  const h = hvap.get(cas);
  const z = costald.get(cas);
  if (!c) throw new Error(`no critical constants for ${id}`);
  const tcK = num(c.Tc);
  const pcKpa = num(c.Pc) / 1000;
  const omega = num(c.omega);
  const e = {
    id, name, cas, formula, molarMass: mw, aliases,
    tcK: r(tcK), pcKpa: r(pcKpa), omega: r(omega),
    ...(h && num(h.Tb) ? { tbK: r(num(h.Tb)) } : {}),
    ...(h && num(h.HvapTb) ? { hvapTbKjPerKg: r(num(h.HvapTb) / mw, 5) } : {}),
    ...(a ? { antoine: { A: num(a.A), B: num(a.B), C: num(a.C), tminK: num(a.Tmin), tmaxK: num(a.Tmax) } } : {}),
    ...(p && num(p.Cpl) ? { cpLiquidKjPerKgK: r(num(p.Cpl) / mw, 4) } : {}),
    ...(p && num(p.a0) !== undefined && num(p.Tmin) ? { cpGas: { a: [num(p.a0), num(p.a1), num(p.a2), num(p.a3), num(p.a4)], tminK: num(p.Tmin), tmaxK: num(p.Tmax) } } : {}),
    ...(p && num(p.Cpg) ? { cpGas298KjPerKgK: r(num(p.Cpg) / mw, 4) } : {}),
    ...(rho20 ? { rhoLiquid20KgPerM3: rho20 } : {}),
    zRa: r(z && num(z.Z_RA) ? num(z.Z_RA) : 0.29056 - 0.08775 * omega, 4)
  };
  entries.push(e);
}

const body = `/* eslint-disable */
// GENERATED by a script from the tables Caleb Bell publishes in \`chemicals\`
// (MIT licence, https://github.com/CalebBell/chemicals): Antoine constants and
// ideal-gas and liquid heat capacities from Poling, Prausnitz & O'Connell,
// "The Properties of Gases and Liquids" (5th ed.) appendix; critical constants
// and acentric factors from the PSRK revision 4 appendix; heats of
// vaporisation at the normal boiling point from the CRC Handbook. Molar masses
// are from the formula; liquid densities at 20 °C are CRC values. Rackett Z_RA
// from the COSTALD table, else Yamada-Gunn (0.29056 - 0.08775 omega).
// Edit the generator, not this file.
import type { ComponentData } from './components.js';

export const COMPONENT_DATA: readonly ComponentData[] = [
${entries.map((e) => `  ${JSON.stringify(e)}`).join(',\n')}
];
`;
fs.writeFileSync(out, body);
console.log(`wrote ${entries.length} components to ${out}`);
