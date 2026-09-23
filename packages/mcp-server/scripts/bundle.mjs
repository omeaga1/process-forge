// Builds the file that is published to npm: one ESM script with the
// ProcessForge engine (protocol, simulation-core, theme) inlined, because
// those workspace packages are not published. Only the MCP SDK and zod stay
// external, as real dependencies. Run after `tsc` (the workspace packages
// resolve through their built dist/).
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

await build({
  entryPoints: [new URL('../src/cli.ts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')],
  outfile: new URL('../bundle/cli.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: Object.keys(pkg.dependencies ?? {}).flatMap((d) => [d, `${d}/*`]),
  legalComments: 'none',
  logLevel: 'info'
});
