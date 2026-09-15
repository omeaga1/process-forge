import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  OsakaJadePalette,
  OsakaJadeDarkPalette,
  OsakaJadeLightPalette,
  OsakaJadeDarkCanvasTokens,
  OsakaJadeLightCanvasTokens,
  MachineStateVisualsDark,
  MachineStateVisualsLight,
  getOsakaJadePalette,
  getCanvasTokens
} from '@process-forge/theme';
import { getInitialTheme } from '../hooks/useTheme.js';

describe('Theme System & Palette Tokens', () => {
  it('defines distinct background and surface tokens for dark and light variants', () => {
    assert.notEqual(OsakaJadeDarkPalette.background.base, OsakaJadeLightPalette.background.base);
    assert.notEqual(OsakaJadeDarkPalette.background.surface, OsakaJadeLightPalette.background.surface);
    assert.notEqual(OsakaJadeDarkPalette.text.primary, OsakaJadeLightPalette.text.primary);
    assert.notEqual(OsakaJadeDarkPalette.border.default, OsakaJadeLightPalette.border.default);
  });

  it('provides dark mode with deep obsidian/charcoal surfaces and light text', () => {
    assert.equal(OsakaJadeDarkPalette.background.base, '#111c18');
    assert.equal(OsakaJadeDarkPalette.background.surface, '#16241f');
    assert.equal(OsakaJadeDarkPalette.text.primary, '#f6f5dd');
  });

  it('provides light mode with warm bamboo ivory surfaces and dark forest text', () => {
    assert.equal(OsakaJadeLightPalette.background.base, '#f8f7f0');
    assert.equal(OsakaJadeLightPalette.background.surface, '#ffffff');
    assert.equal(OsakaJadeLightPalette.text.primary, '#1e2922');
  });

  it('shares high-contrast industrial jade accents across palettes', () => {
    assert.ok(OsakaJadeDarkPalette.jade[500]);
    assert.ok(OsakaJadeLightPalette.jade[500]);
    assert.ok(OsakaJadeDarkPalette.jade.glow);
    assert.ok(OsakaJadeLightPalette.jade.glow);
  });

  it('defines matching canvas grid and node background tokens for React Flow', () => {
    assert.notEqual(OsakaJadeDarkCanvasTokens.canvasBackground, OsakaJadeLightCanvasTokens.canvasBackground);
    assert.notEqual(OsakaJadeDarkCanvasTokens.nodeBackground, OsakaJadeLightCanvasTokens.nodeBackground);
    assert.equal(OsakaJadeDarkCanvasTokens.canvasBackground, OsakaJadeDarkPalette.background.canvas);
    assert.equal(OsakaJadeLightCanvasTokens.canvasBackground, OsakaJadeLightPalette.background.canvas);
    assert.equal(OsakaJadeDarkCanvasTokens.nodeBackground, OsakaJadeDarkPalette.background.surface);
    assert.equal(OsakaJadeLightCanvasTokens.nodeBackground, OsakaJadeLightPalette.background.surface);
  });

  it('provides status visuals for machine states in both dark and light modes', () => {
    const states = ['BUSY', 'STARVED', 'BLOCKED', 'FAILED', 'IDLE'] as const;
    for (const state of states) {
      assert.ok(MachineStateVisualsDark[state], `Dark machine visual for ${state} must exist`);
      assert.ok(MachineStateVisualsLight[state], `Light machine visual for ${state} must exist`);
      assert.ok(MachineStateVisualsDark[state].badgeBg);
      assert.ok(MachineStateVisualsLight[state].badgeBg);
      assert.ok(MachineStateVisualsDark[state].badgeText);
      assert.ok(MachineStateVisualsLight[state].badgeText);
      assert.ok(MachineStateVisualsDark[state].indicatorGlow);
      assert.ok(MachineStateVisualsLight[state].indicatorGlow);
    }
  });

  it('preserves backward compatibility: OsakaJadePalette aliases to OsakaJadeDarkPalette', () => {
    assert.equal(OsakaJadePalette.background.base, OsakaJadeDarkPalette.background.base);
    assert.equal(OsakaJadePalette.text.primary, OsakaJadeDarkPalette.text.primary);
  });

  it('correctly maps getOsakaJadePalette and getCanvasTokens across mode arguments', () => {
    assert.equal(getOsakaJadePalette('dark'), OsakaJadeDarkPalette);
    assert.equal(getOsakaJadePalette('light'), OsakaJadeLightPalette);
    assert.equal(getCanvasTokens('dark'), OsakaJadeDarkCanvasTokens);
    assert.equal(getCanvasTokens('light'), OsakaJadeLightCanvasTokens);
  });

  it('evaluates getInitialTheme() safely in Node/SSR environment', () => {
    const initialTheme = getInitialTheme();
    assert.ok(initialTheme === 'dark' || initialTheme === 'light');
  });
});
