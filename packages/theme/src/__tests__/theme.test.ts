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
  osakaJadeTailwindPreset,
  fontFamily,
  fontSize,
  fontWeight,
  spacing,
  radius,
  getElevation,
  elevationDark,
  elevationLight,
  motion,
  zIndex
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
    assert.equal(OsakaJadeLightPalette.status.blocked, '#804a04'); // Amber, deep enough to read as text, even on its own tint
    assert.equal(OsakaJadeLightPalette.status.failed, '#a51818'); // Crimson, deep enough to read as text, even on its own tint
  });

  it('keeps text readable: muted text and the amber meet WCAG AA (4.5:1) on every surface, both themes', () => {
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
    };
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)];
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    for (const p of [OsakaJadeDarkPalette, OsakaJadeLightPalette]) {
      for (const bg of [p.background.base, p.background.canvas, p.background.surface, p.background.surfaceElevated]) {
        assert.ok(ratio(p.text.muted, bg) >= 4.5, `muted ${p.text.muted} on ${bg}: ${ratio(p.text.muted, bg).toFixed(2)}`);
        assert.ok(ratio(p.text.secondary, bg) >= 4.5, `secondary ${p.text.secondary} on ${bg}: ${ratio(p.text.secondary, bg).toFixed(2)}`);
      }
    }
    assert.ok(ratio(OsakaJadeLightPalette.status.blocked, '#ffffff') >= 4.5, 'light amber on white');
    const L = OsakaJadeLightPalette;
    for (const bg of [L.background.base, L.background.canvas, L.background.surface, L.background.surfaceElevated]) {
      for (const [what, fg] of [['accent', L.text.accent], ['glow', L.jade.glow], ['failed', L.status.failed], ['blocked', L.status.blocked]] as const) {
        assert.ok(ratio(fg, bg) >= 4.5, `light ${what} ${fg} on ${bg}: ${ratio(fg, bg).toFixed(2)}`);
      }
      // Chips and badges set a colour's text on that colour's own tint (up to 16 %), or on the jade tint for accents.
      const mix = (fg: string, base: string, a: number) =>
        '#' + [1, 3, 5].map((i) => Math.round(parseInt(fg.slice(i, i + 2), 16) * a + parseInt(base.slice(i, i + 2), 16) * (1 - a)).toString(16).padStart(2, '0')).join('');
      for (const [what, fg, tintOf] of [['failed', L.status.failed, L.status.failed], ['blocked', L.status.blocked, L.status.blocked], ['glow', L.jade.glow, L.jade[500]], ['accent', L.text.accent, L.jade[500]]] as const) {
        const under = mix(tintOf, bg, 0.16);
        assert.ok(ratio(fg, under) >= 4.5, `light ${what} ${fg} on its tint over ${bg}: ${ratio(fg, under).toFixed(2)}`);
      }
    }
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

  it('provides Omarchy-derived typography scale with monospace priority for data', () => {
    assert.ok(fontFamily.mono.includes('JetBrains Mono'));
    assert.ok(fontFamily.sans.includes('Inter'));
    assert.equal(fontSize['2xs'], 10);
    assert.equal(fontSize.xs, 11);
    assert.equal(fontSize.sm, 12);
    assert.equal(fontSize.base, 13);
    assert.equal(fontSize.md, 14);
    assert.equal(fontSize.lg, 16);
    assert.equal(fontWeight.normal, 400);
    assert.equal(fontWeight.semibold, 600);
    assert.equal(fontWeight.bold, 700);
  });

  it('provides 4px-grid spatial scale and tight desktop-rice border radii', () => {
    assert.equal(spacing[1], 4);
    assert.equal(spacing[2], 8);
    assert.equal(spacing[3], 12);
    assert.equal(spacing[4], 16);

    // Tight radii matching Omarchy terminal/desktop aesthetics (not bubbly 12px)
    assert.equal(radius.none, 0);
    assert.equal(radius.sm, 2);
    assert.equal(radius.md, 4);
    assert.equal(radius.lg, 6);
    assert.equal(radius.full, 9999);
  });

  it('provides calibrated dark and light elevation tokens', () => {
    const darkElev = getElevation('dark');
    const lightElev = getElevation('light');

    assert.equal(darkElev, elevationDark);
    assert.equal(lightElev, elevationLight);
    assert.ok(darkElev.glow.includes('113, 206, 173')); // Hyprland active border jade
    assert.ok(darkElev.glowWarning.includes('229, 199, 54')); // Amber gold
    assert.ok(lightElev.glow.includes('30, 126, 88')); // Imperial jade
  });

  it('provides motion curves and z-index hierarchy', () => {
    assert.ok(motion.fast);
    assert.ok(motion.normal);
    assert.ok(motion.smooth);
    assert.ok(zIndex.modal > zIndex.panel);
    assert.ok(zIndex.panel > zIndex.base);
  });
});
