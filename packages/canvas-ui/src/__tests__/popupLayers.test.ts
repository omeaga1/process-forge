import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * A popup (menu, tooltip, select list) is portalled into a positioner, and the
 * positioner is its own stacking layer: the popup's z-index counts only inside
 * it. A positioner without a layer of its own draws under the panels, which is
 * how the unit panel's More actions menu (Duplicate, Publish, Delete) came to
 * open behind the panel and could not be clicked.
 */

const roots = [path.resolve('src'), path.resolve('../../apps/web/src')];

function files(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return /__tests__/.test(e.name) ? [] : files(p);
    return /\.tsx$/.test(e.name) ? [p] : [];
  });
}

describe('Popups draw above the panels', () => {
  it('every Base UI positioner carries the popup layer class', () => {
    const bare: string[] = [];
    for (const f of roots.flatMap(files)) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/<Base\w+\.Positioner\b[^>]*>/g)) {
        if (!/className="[^"]*\bpf-layer\b/.test(m[0])) bare.push(`${path.relative(process.cwd(), f)}: ${m[0].slice(0, 80)}`);
      }
    }
    assert.deepEqual(bare, [], `positioners without .pf-layer:\n${bare.join('\n')}`);
  });

  it('the layer sits above the unit panel', async () => {
    const { UI_CSS } = await import('../ui/styles.js');
    const layer = /\.pf-layer\s*\{\s*z-index:\s*(\d+)/.exec(UI_CSS);
    assert.ok(layer, 'a .pf-layer rule with a z-index');
    assert.ok(Number(layer![1]) > 40, `the unit panel is at 40; the layer is ${layer![1]}`);
  });
});
