// Generates packages/protocol/src/thermo/nrtlData.ts: NRTL binary parameters for every pair of
// components in componentData.ts that ChemSep has data for. Data files are read as data only.
// Usage: node scripts/gen-nrtl.cjs <data dir> src/thermo/componentData.ts src/thermo/nrtlData.ts
//
// The data dir holds ChemSep's interaction parameter tables (Artistic-2.0, Kooijman & Taylor),
// as Caleb Bell's `thermo` carries them, fetched with e.g.
//   gh api -H "Accept: application/vnd.github.raw" "repos/CalebBell/thermo/contents/thermo/Interaction%20Parameters/ChemSep/<file>" > <file>
//   nrtl.json    NRTL, tau_ij = bij / T, from DECHEMA's 1 atm fits
//   nrtl.ipd     the same table as ChemSep ships it, for each pair's DECHEMA reference
//   wilson.json  Wilson, Lambda_ij = exp(aij + bij / T)
//
// A pair with no NRTL entry but a Wilson one (2-propanol/water, 1-propanol/water) gets NRTL
// parameters fitted here to the Wilson model's activity coefficients, alpha 0.3, so the engine
// runs one model for the whole mixture.
const fs = require('fs');
const path = require('path');
const [dir, componentsTs, out] = process.argv.slice(2);

const ids = new Map();
for (const m of fs.readFileSync(componentsTs, 'utf8').matchAll(/"id":"(\w+)".*?"cas":"([\d-]+)"/g)) ids.set(m[2], m[1]);
const order = [...ids.values()];
const nrtl = JSON.parse(fs.readFileSync(path.join(dir, 'nrtl.json'), 'utf8')).data;
const wilson = JSON.parse(fs.readFileSync(path.join(dir, 'wilson.json'), 'utf8')).data;

// DECHEMA Chemistry Data Series references from the .ipd ("p61 1/1a": page 61, volume I/1a).
const refs = new Map();
for (const line of fs.readFileSync(path.join(dir, 'nrtl.ipd'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([\d-]+)\s+([\d-]+)\s+\S+\s+\S+\s+\S+\s+\S+(?:\s+(.*))?$/.exec(line);
  if (!m || !m[3]) continue;
  const ref = /\b(p\d+\s+\S+)\s*$/.exec(m[3]);
  if (ref) refs.set(`${m[1]} ${m[2]}`, ref[1]).set(`${m[2]} ${m[1]}`, ref[1]);
}

const r = (x, n = 6) => Number(x.toPrecision(n));

/** NRTL ln gamma for a binary, tau = b / T. */
function nrtlLn(x1, T, b12, b21, a) {
  const x2 = 1 - x1;
  const t12 = b12 / T, t21 = b21 / T;
  const G12 = Math.exp(-a * t12), G21 = Math.exp(-a * t21);
  const l1 = x2 * x2 * (t21 * (G21 / (x1 + x2 * G21)) ** 2 + (t12 * G12) / (x2 + x1 * G12) ** 2);
  const l2 = x1 * x1 * (t12 * (G12 / (x2 + x1 * G12)) ** 2 + (t21 * G21) / (x1 + x2 * G21) ** 2);
  return [l1, l2];
}

/** Wilson ln gamma for a binary, Lambda_ij = exp(aij + bij / T). */
function wilsonLn(x1, T, w) {
  const x2 = 1 - x1;
  const L12 = Math.exp(w.a12 + w.b12 / T), L21 = Math.exp(w.a21 + w.b21 / T);
  const l1 = -Math.log(x1 + x2 * L12) + x2 * (L12 / (x1 + x2 * L12) - L21 / (x2 + x1 * L21));
  const l2 = -Math.log(x2 + x1 * L21) - x1 * (L12 / (x1 + x2 * L12) - L21 / (x2 + x1 * L21));
  return [l1, l2];
}

/** b12, b21 (K) at alpha 0.3 that best match the Wilson curves from 330 to 375 K (Nelder-Mead, several starts). */
function fitToWilson(w) {
  const a = 0.3;
  const xs = Array.from({ length: 25 }, (_, i) => 0.02 + i * 0.04);
  const Ts = [330, 345, 360, 375];
  const cost = ([b12, b21]) => {
    let s = 0;
    for (const T of Ts) for (const x of xs) {
      const n = nrtlLn(x, T, b12, b21, a);
      const v = wilsonLn(x, T, w);
      s += (n[0] - v[0]) ** 2 + (n[1] - v[1]) ** 2;
    }
    return s / (xs.length * Ts.length * 2);
  };
  let best = null;
  for (const start of [[0, 300], [300, 0], [-100, 600], [600, -100], [200, 200]]) {
    let simplex = [start, [start[0] + 100, start[1]], [start[0], start[1] + 100]].map((p) => ({ p, f: cost(p) }));
    for (let it = 0; it < 4000; it++) {
      simplex.sort((u, v) => u.f - v.f);
      const [lo, mid, hi] = simplex;
      const c = [(lo.p[0] + mid.p[0]) / 2, (lo.p[1] + mid.p[1]) / 2];
      const at = (k) => [c[0] + k * (hi.p[0] - c[0]), c[1] + k * (hi.p[1] - c[1])];
      const refl = { p: at(-1) };
      refl.f = cost(refl.p);
      if (refl.f < lo.f) {
        const exp = { p: at(-2) };
        exp.f = cost(exp.p);
        simplex[2] = exp.f < refl.f ? exp : refl;
      } else if (refl.f < mid.f) simplex[2] = refl;
      else {
        const con = { p: at(0.5) };
        con.f = cost(con.p);
        if (con.f < hi.f) simplex[2] = con;
        else simplex = simplex.map((s, i) => (i === 0 ? s : { p: [(s.p[0] + lo.p[0]) / 2, (s.p[1] + lo.p[1]) / 2], f: cost([(s.p[0] + lo.p[0]) / 2, (s.p[1] + lo.p[1]) / 2]) }));
      }
    }
    simplex.sort((u, v) => u.f - v.f);
    if (!best || simplex[0].f < best.f) best = simplex[0];
  }
  return { b12: best.p[0], b21: best.p[1], alpha: a, rms: Math.sqrt(best.f) };
}

const pairs = [];
for (let i = 0; i < order.length; i++) {
  for (let j = i + 1; j < order.length; j++) {
    const [ci, cj] = [order[i], order[j]].map((id) => [...ids].find(([, v]) => v === id)[0]);
    const ij = nrtl[`${ci} ${cj}`];
    const ji = nrtl[`${cj} ${ci}`];
    const name = (ij ?? ji)?.name;
    if (ij && ji) {
      const ref = refs.get(`${ci} ${cj}`);
      pairs.push({ i: order[i], j: order[j], bij: r(ij.bij), bji: r(ji.bij), alpha: ij.alphaij, source: `ChemSep NRTL, ${name}${ref ? ` (DECHEMA ${ref})` : ''}` });
      continue;
    }
    const wij = wilson[`${ci} ${cj}`];
    const wji = wilson[`${cj} ${ci}`];
    if (wij && wji) {
      const fit = fitToWilson({ a12: wij.aij, b12: wij.bij, a21: wji.aij, b21: wji.bij });
      console.log(`fitted ${order[i]}/${order[j]} to Wilson: rms ln gamma ${fit.rms.toFixed(4)}`);
      pairs.push({ i: order[i], j: order[j], bij: r(fit.b12), bji: r(fit.b21), alpha: fit.alpha, source: `NRTL fitted to ChemSep Wilson, ${wij.name}` });
    }
  }
}

const body = `/* eslint-disable */
// GENERATED by scripts/gen-nrtl.cjs from ChemSep's interaction parameter tables
// (Artistic-2.0 licence, H. Kooijman and R. Taylor, http://www.chemsep.org), as
// carried by Caleb Bell's \`thermo\`: NRTL from DECHEMA's 1 atm fits, tau_ij =
// bij / T (K), G_ij = exp(-alpha tau_ij). Pairs ChemSep has no NRTL for but a
// Wilson fit are NRTL fitted to that Wilson model. Every pair names its source.
// Edit the generator, not this file.
import type { NrtlPair } from './activity.js';

export const NRTL_PAIRS: readonly NrtlPair[] = [
${pairs.map((p) => `  ${JSON.stringify(p)}`).join(',\n')}
];
`;
fs.writeFileSync(out, body);
console.log(`wrote ${pairs.length} pairs to ${out}`);
