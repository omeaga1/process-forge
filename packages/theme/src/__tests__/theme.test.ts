import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  OsakaJadePalette,
  OsakaJadeDarkPalette,
  OsakaJadeLightPalette,
  getOsakaJadePalette,
  OsakaJadeCanvasTokens,
  OsakaJadeDarkCanvasTokens,
  OsakaJadeLightCanvasTokens,
  getCanvasTokens,
  MachineStateVisuals,
  MachineStateVisualsDark,
  MachineStateVisualsLight,
  getMachineStateVisuals,
  generateOsakaJadeCssVariables,
  osakaJadeTailwindPreset
} from '../index.js';

describe('Osaka Jade Theme Palette (Dual Dark & Light)', () => {
  const hexRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

  it('contains valid hex color definitions for Dark (Omarchy Desktop) surfaces and jade accents', () => {
    assert.match(OsakaJadeDarkPalette.background.base, hexRegex);
    assert.match(OsakaJadeDarkPalette.background.canvas, hexRegex);
    assert.match(OsakaJadeDarkPalette.background.surface, hexRegex);
    assert.match(OsakaJadeDarkPalette.border.glow, hexRegex);
    assert.match(OsakaJadeDarkPalette.jade.glow, hexRegex);
    assert.match(OsakaJadeDarkPalette.jade[500], hexRegex);
    assert.match(OsakaJadeDarkPalette.text.primary, hexRegex);
  });

  it('contains valid hex color definitions for Light (Bamboo Ivory) surfaces and jade accents', () => {
    assert.match(OsakaJadeLightPalette.background.base, hexRegex);
    assert.match(OsakaJadeLightPalette.background.canvas, hexRegex);
    assert.match(OsakaJadeLightPalette.background.surface, hexRegex);
    assert.match(OsakaJadeLightPalette.border.glow, hexRegex);
    assert.match(OsakaJadeLightPalette.jade.glow, hexRegex);
    assert.match(OsakaJadeLightPalette.jade[500], hexRegex);
    assert.match(OsakaJadeLightPalette.text.primary, hexRegex);
  });

  it('verifies dark palette matches distilled Omarchy Linux desktop rice aesthetics', () => {
    assert.equal(OsakaJadeDarkPalette.background.base, '#111c18'); // Kitty & Alacritty background
    assert.equal(OsakaJadeDarkPalette.border.glow, '#71cead'); // Hyprland active border
    assert.equal(OsakaJadeDarkPalette.jade.glow, '#2dd5b7'); // Terminal cyan neon
    assert.equal(OsakaJadeDarkPalette.status.busy, '#549e6a'); // Bamboo jade green
    assert.equal(OsakaJadeDarkPalette.status.starved, '#8cd3cb'); // Ice jade cyan
    assert.equal(OsakaJadeDarkPalette.status.blocked, '#e5c736'); // Bamboo amber gold
    assert.equal(OsakaJadeDarkPalette.status.failed, '#ff5345'); // Coral vermilion
  });

  it('verifies light palette provides balanced daytime ergonomics and high contrast', () => {
    assert.equal(OsakaJadeLightPalette.background.base, '#f8f7f0'); // Bamboo ivory
    assert.equal(OsakaJadeLightPalette.text.primary, '#1e2922'); // Forest pine charcoal
    assert.equal(OsakaJadeLightPalette.status.busy, '#1b7a54'); // Deep emerald
    assert.equal(OsakaJadeLightPalette.status.starved, '#0284c7'); // Sky cyan
    assert.equal(OsakaJadeLightPalette.status.blocked, '#d97706'); // Amber gold
    assert.equal(OsakaJadeLightPalette.status.failed, '#dc2626'); // Crimson rose
  });

  it('getOsakaJadePalette returns respective dark and light palettes with backward compatibility', () => {
    assert.equal(OsakaJadePalette, OsakaJadeDarkPalette);
    assert.equal(getOsakaJadePalette('dark'), OsakaJadeDarkPalette);
    assert.equal(getOsakaJadePalette('light'), OsakaJadeLightPalette);
  });

  it('provides complete canvas visual tokens for React Flow in both themes', () => {
    const darkTokens = getCanvasTokens('dark');
    const lightTokens = getCanvasTokens('light');

    assert.equal(darkTokens, OsakaJadeDarkCanvasTokens);
    assert.equal(lightTokens, OsakaJadeLightCanvasTokens);
    assert.equal(OsakaJadeCanvasTokens, OsakaJadeDarkCanvasTokens);

    assert.equal(darkTokens.canvasBackground, '#11221c');
    assert.equal(lightTokens.canvasBackground, '#f2f0e4');
    assert.ok(darkTokens.nodeSelectedBorder);
    assert.ok(lightTokens.nodeSelectedBorder);
  });

  it('maps all machine operational states with visual badges and glow effects for both themes', () => {
    const requiredStates = ['BUSY', 'STARVED', 'BLOCKED', 'FAILED', 'IDLE'];
    const darkVisuals = getMachineStateVisuals('dark');
    const lightVisuals = getMachineStateVisuals('light');

    assert.equal(MachineStateVisuals, MachineStateVisualsDark);
    assert.equal(darkVisuals, MachineStateVisualsDark);
    assert.equal(lightVisuals, MachineStateVisualsLight);

    for (const state of requiredStates) {
      assert.ok(darkVisuals[state], `Missing dark visual config for state ${state}`);
      assert.ok(lightVisuals[state], `Missing light visual config for state ${state}`);
      assert.ok(darkVisuals[state].label);
      assert.ok(lightVisuals[state].label);
      assert.ok(darkVisuals[state].badgeBg);
      assert.ok(lightVisuals[state].badgeBg);
    }
  });

  it('generates valid CSS custom properties string for dark, light, and combined themes', () => {
    const bothCss = generateOsakaJadeCssVariables();
    assert.ok(bothCss.includes(':root, [data-theme="dark"], .theme-dark, .theme-osaka-jade'));
    assert.ok(bothCss.includes('--pf-bg-base: #111c18;'));
    assert.ok(bothCss.includes('[data-theme="light"], .theme-light'));
    assert.ok(bothCss.includes('--pf-bg-base: #f8f7f0;'));

    const darkCss = generateOsakaJadeCssVariables('dark');
    assert.ok(darkCss.includes('--pf-bg-base: #111c18;'));
    assert.ok(!darkCss.includes('[data-theme="light"]'));

    const lightCss = generateOsakaJadeCssVariables('light');
    assert.ok(lightCss.includes('--pf-bg-base: #f8f7f0;'));
    assert.ok(!lightCss.includes('[data-theme="dark"]'));
  });

  it('provides a structural Tailwind preset with theme color mappings', () => {
    assert.ok(osakaJadeTailwindPreset.theme.extend.colors.pf);
    assert.equal(
      osakaJadeTailwindPreset.theme.extend.colors.pf.bg.base,
      OsakaJadePalette.background.base
    );
    assert.equal(
      osakaJadeTailwindPreset.theme.extend.colors.pf.dark.background.base,
      OsakaJadeDarkPalette.background.base
    );
    assert.equal(
      osakaJadeTailwindPreset.theme.extend.colors.pf.light.background.base,
      OsakaJadeLightPalette.background.base
    );
  });
});
