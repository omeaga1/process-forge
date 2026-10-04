import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Every colour in the studio comes from the theme (palette tokens, tint(),
 * or the --pf-* CSS variables), so both themes stay consistent. A colour
 * literal in a component is how the UI drifted before: Tailwind greens and
 * reds next to the palette's jade and coral, white washes that vanish in the
 * light theme, a dialog with a purple of its own.
 *
 * Shadows may use plain black: elevation is not a theme colour.
 */

const roots = [path.resolve('src'), path.resolve('../../apps/web/src')];
// The landing page is deliberately dark-only and reads the dark palette directly.
const skip = [/__tests__/, /[\\/]landing[\\/]/, /ProductLandingPage/, /accountManager\.ts$/, /hooks[\\/]useTheme\.tsx$/];
const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;

function files(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.(tsx|ts)$/.test(e.name) && !skip.some((r) => r.test(p)) ? [p] : [];
  });
}

describe('Theme consistency', () => {
  it('no component hard-codes a colour', () => {
    const offenders: string[] = [];
    for (const f of roots.flatMap(files)) {
      fs.readFileSync(f, 'utf8')
        .split(/\r?\n/)
        .forEach((line, i) => {
          if (!COLOR.test(line)) return;
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
          if (/boxShadow|box-shadow|drop-shadow|textShadow/.test(line)) return;
          // A drawing's fallback for SVG rendered outside the app, where the CSS variables do not exist.
          if (/var\(--pf-[a-z0-9-]+, ?#/.test(line)) return;
          offenders.push(`${path.relative(process.cwd(), f)}:${i + 1}: ${line.trim().slice(0, 100)}`);
        });
    }
    assert.deepEqual(offenders, [], `Use palette tokens, tint() or var(--pf-*) instead:\n${offenders.join('\n')}`);
  });

  it('the studio does not read the fixed dark palette', () => {
    const offenders = roots
      .flatMap(files)
      .filter((f) => /import\s*\{[^}]*\b(OsakaJadePalette|OsakaJadeDarkPalette)\b[^}]*\}\s*from\s*'@process-forge\/theme'/.test(fs.readFileSync(f, 'utf8')));
    assert.deepEqual(offenders.map((f) => path.relative(process.cwd(), f)), [], 'read the palette from useTheme(), so the component follows the theme');
  });
});
