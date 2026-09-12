import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  OsakaJadePalette,
  OsakaJadeCanvasTokens,
  MachineStateVisuals,
  generateOsakaJadeCssVariables,
  osakaJadeTailwindPreset
} from '../index.js';

describe('Osaka Jade Theme Palette', () => {
  it('contains valid hex color definitions for all surfaces and jade accents', () => {
    const hexRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

    assert.match(OsakaJadePalette.background.base, hexRegex);
    assert.match(OsakaJadePalette.background.canvas, hexRegex);
    assert.match(OsakaJadePalette.background.surface, hexRegex);
    assert.match(OsakaJadePalette.border.glow, hexRegex);
    assert.match(OsakaJadePalette.jade.glow, hexRegex);
    assert.match(OsakaJadePalette.jade[500], hexRegex);
    assert.match(OsakaJadePalette.text.primary, hexRegex);
  });

  it('defines distinct simulation status colors matching Omarchy aesthetics', () => {
    assert.equal(OsakaJadePalette.status.busy, '#10b981'); // Radiant Imperial Jade
    assert.equal(OsakaJadePalette.status.starved, '#38bdf8'); // Ice Cyan
    assert.equal(OsakaJadePalette.status.blocked, '#f59e0b'); // Amber Gold
    assert.equal(OsakaJadePalette.status.failed, '#f43f5e'); // Crimson Rose
  });

  it('provides complete canvas visual tokens for React Flow nodes and edges', () => {
    assert.ok(OsakaJadeCanvasTokens.canvasBackground);
    assert.ok(OsakaJadeCanvasTokens.nodeBackground);
    assert.ok(OsakaJadeCanvasTokens.nodeSelectedBorder);
    assert.ok(OsakaJadeCanvasTokens.streamWireContinuous);
    assert.ok(OsakaJadeCanvasTokens.streamWireDiscrete);
  });

  it('maps all machine operational states with visual badges and glow effects', () => {
    const requiredStates = ['BUSY', 'STARVED', 'BLOCKED', 'FAILED', 'IDLE'];
    for (const state of requiredStates) {
      const visual = MachineStateVisuals[state];
      assert.ok(visual, `Missing visual config for state ${state}`);
      assert.ok(visual.label);
      assert.ok(visual.badgeBg);
      assert.ok(visual.badgeText);
    }
  });

  it('generates valid CSS custom properties string', () => {
    const css = generateOsakaJadeCssVariables();
    assert.ok(css.includes(':root, .theme-osaka-jade'));
    assert.ok(css.includes('--pf-bg-base: #0c1214;'));
    assert.ok(css.includes('--pf-jade-glow: #2dd4bf;'));
  });

  it('provides a structural Tailwind preset with theme color mappings', () => {
    assert.ok(osakaJadeTailwindPreset.theme.extend.colors.pf);
    assert.equal(
      osakaJadeTailwindPreset.theme.extend.colors.pf.bg.base,
      OsakaJadePalette.background.base
    );
  });
});
