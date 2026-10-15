/**
 * "Did you mean": the names closest to one that was not found, so a model's
 * typo (outletTempertureC) or near miss (outletTemp) gets the real name back
 * instead of being taken as something new.
 */

/** Edit distance with transpositions (optimal string alignment), case-insensitive. */
export function editDistance(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  const d: number[][] = Array.from({ length: s.length + 1 }, (_, i) => [i, ...Array<number>(t.length).fill(0)]);
  for (let j = 1; j <= t.length; j++) d[0]![j] = j;
  for (let i = 1; i <= s.length; i++) {
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
    }
  }
  return d[s.length]![t.length]!;
}

const squash = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The words of a name: camelCase, snake_case, dotted or spaced (steamDutyKw → steam, duty, kw). */
const words = (x: string) =>
  x
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** Every word of `a` is a word of `b` (a word left out: steamKw for steamDutyKw). */
const wordsWithin = (a: string, b: string) => {
  const wa = words(a);
  const wb = new Set(words(b));
  return wa.length >= 2 && wa.every((w) => wb.has(w));
};

/**
 * Up to `max` candidates close to `name`, closest first: within a third of
 * its length in edits (at least 2), one containing the other once case
 * and punctuation are ignored (outletTemp, outlet_temp_c → outletTempC), or
 * one made of the other's words with some left out (steamKw → steamDutyKw).
 */
export function closestNames(name: string, candidates: Iterable<string>, max = 3): string[] {
  const n = squash(name);
  if (!n) return [];
  const scored: { c: string; score: number }[] = [];
  for (const c of new Set(candidates)) {
    const k = squash(c);
    if (!k) continue;
    const dist = editDistance(n, k);
    const limit = Math.max(2, Math.floor(Math.max(n.length, k.length) / 3));
    const contains = n.length >= 3 && k.length >= 3 && (k.includes(n) || n.includes(k));
    const sameWords = wordsWithin(name, c) || wordsWithin(c, name);
    if (dist <= limit || contains || sameWords) scored.push({ c, score: contains || sameWords ? Math.min(dist, 1.5) : dist });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.c.localeCompare(b.c))
    .slice(0, max)
    .map((x) => x.c);
}

/** " Did you mean a, b or c?" — or nothing when nothing is close. */
export function didYouMean(name: string, candidates: Iterable<string>): string {
  const near = closestNames(name, candidates);
  if (!near.length) return '';
  const list = near.length === 1 ? near[0] : `${near.slice(0, -1).join(', ')} or ${near[near.length - 1]}`;
  return ` Did you mean ${list}?`;
}
