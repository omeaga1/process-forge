#!/usr/bin/env node
// Plan 0001 Phase 4 gate: score the keyword rules and Jev on the same fixtures.
//
//   pnpm --filter @process-forge/protocol build
//   TYPESAFE_API_KEY=... node packages/protocol/scripts/measure-decisions.mjs
//
// Without a key it scores the heuristic only. With one it makes one Jev call
// per fixture (36 today, a few hundred tokens each: well under a cent at the
// published $0.042 per million input tokens) and prints the delta, including
// every case the two disagree on. Nothing is cached or written anywhere.
import { heuristicProvider, JevDecisionProvider, httpTransport, scoreProvider } from '../dist/index.js';

const pct = (a, b) => `${a}/${b} (${Math.round((100 * a) / b)}%)`;
const line = (s) =>
  console.log(`${s.provider.padEnd(10)} all ${pct(s.passed, s.total).padEnd(12)} hard ${pct(s.hardPassed, s.hardTotal)}`);

const heuristic = await scoreProvider(heuristicProvider);
line(heuristic);

const key = process.env.TYPESAFE_API_KEY;
if (!key) {
  console.log('\nSet TYPESAFE_API_KEY to score Jev as well.');
  process.exit(0);
}

const fallbacks = [];
const jev = await scoreProvider(
  new JevDecisionProvider({
    transport: httpTransport(key),
    timeoutMs: 5000,
    onFallback: (reason) => fallbacks.push(reason)
  })
);
line(jev);
if (fallbacks.length) {
  // A fallback is scored as the heuristic's answer, so it would flatter or
  // hide Jev. Say so rather than print a misleading number.
  console.log(`\nWARNING: ${fallbacks.length} call(s) fell back to the heuristic: ${[...new Set(fallbacks)].join('; ')}`);
}

console.log('\nWhere they disagree:');
for (let i = 0; i < jev.results.length; i++) {
  const h = heuristic.results[i];
  const j = jev.results[i];
  if (h.passed === j.passed) continue;
  const f = j.fixture;
  console.log(
    `  ${j.passed ? 'jev wins ' : 'jev loses'} ${f.hard ? '[hard] ' : '       '}${f.question.padEnd(18)} ` +
      `"${f.state.message}"  want ${f.expect}  heuristic ${h.got}  jev ${j.got}`
  );
}
