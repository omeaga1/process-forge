import { NRTL_PAIRS } from './nrtlData.js';

/**
 * Liquid activity coefficients by NRTL (Renon & Prausnitz, 1968), so unlike
 * liquids (ethanol and water) boil where they really do rather than where an
 * ideal solution would.
 *
 *   tau_ij = b_ij / T,  G_ij = exp(-alpha_ij tau_ij)
 *   ln gamma_i = S_i / D_i + sum_j x_j G_ij / D_j · (tau_ij − S_j / D_j)
 *   with D_i = sum_k x_k G_ki and S_i = sum_k x_k tau_ki G_ki
 *
 * Binary parameters come from ChemSep's tables (nrtlData.ts, every pair with
 * its source). A pair with no parameters is taken as ideal (tau = 0), and
 * reported, so the caller can say which pairs were guessed.
 */

export interface NrtlPair {
  i: string;
  j: string;
  /** tau_ij = bij / T, K. */
  bij: number;
  /** tau_ji = bji / T, K. */
  bji: number;
  alpha: number;
  source: string;
}

const key = (i: string, j: string) => `${i}|${j}`;
const PAIRS = new Map<string, NrtlPair>();
for (const p of NRTL_PAIRS) {
  PAIRS.set(key(p.i, p.j), p);
  PAIRS.set(key(p.j, p.i), p);
}

/** The NRTL parameters for a pair of component ids, either way round, or undefined. */
export function nrtlPair(i: string, j: string): NrtlPair | undefined {
  return PAIRS.get(key(i, j));
}

/** b and alpha for i → j, oriented: tau_ij = b / T. */
function oriented(i: string, j: string): { b: number; alpha: number } | undefined {
  const p = PAIRS.get(key(i, j));
  if (!p) return undefined;
  return { b: p.i === i ? p.bij : p.bji, alpha: p.alpha };
}

export interface ActivityResult {
  /** gamma by component id. */
  gamma: Record<string, number>;
  /** Pairs present in the liquid with NRTL parameters, "ethanol–water". */
  pairs: string[];
  /** Pairs present with none: taken as ideal. */
  missing: string[];
}

/** Activity coefficients at mole fractions x (by component id) and T °C. A component given at 0 gets its value at infinite dilution. */
export function nrtlGammas(x: Record<string, number>, tC: number): ActivityResult {
  const ids = Object.keys(x).filter((c) => x[c]! >= 0);
  const T = tC + 273.15;
  const n = ids.length;
  const tau: number[][] = [];
  const G: number[][] = [];
  const pairs: string[] = [];
  const missing: string[] = [];
  for (let a = 0; a < n; a++) {
    tau.push([]);
    G.push([]);
    for (let b = 0; b < n; b++) {
      const o = a === b ? undefined : oriented(ids[a]!, ids[b]!);
      const t = o ? o.b / T : 0;
      tau[a]!.push(t);
      G[a]!.push(o ? Math.exp(-o.alpha * t) : 1);
      if (a < b) (o ? pairs : missing).push(`${ids[a]}–${ids[b]}`);
    }
  }
  const xs = ids.map((c) => x[c]!);
  const D = ids.map((_, i) => xs.reduce((s, xk, k) => s + xk * G[k]![i]!, 0));
  const S = ids.map((_, i) => xs.reduce((s, xk, k) => s + xk * tau[k]![i]! * G[k]![i]!, 0));
  const gamma: Record<string, number> = {};
  ids.forEach((c, i) => {
    let ln = S[i]! / D[i]!;
    for (let j = 0; j < n; j++) ln += ((xs[j]! * G[i]![j]!) / D[j]!) * (tau[i]![j]! - S[j]! / D[j]!);
    gamma[c] = Math.exp(ln);
  });
  return { gamma, pairs, missing };
}
