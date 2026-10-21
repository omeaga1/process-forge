import { OsakaJadeDarkPalette, type ThemePalette } from '@process-forge/theme';

/**
 * The public site's own palette: ink on warm drafting paper, with one
 * vermilion accent, like a well-printed equipment manual. The studio keeps
 * its Osaka Jade; the site only frames it (clips and drawings stay as the
 * app draws them).
 *
 * It keeps the theme's shape so every site component reads it the same way.
 * The accent still lives under `jade`, the key the components already use.
 */
export const SITE: ThemePalette = {
  ...OsakaJadeDarkPalette,
  background: {
    ...OsakaJadeDarkPalette.background,
    base: '#f3efe6',
    canvas: '#1a1816',
    surface: '#fbf9f4',
    surfaceElevated: '#ece7dc',
    surfaceHover: '#e6e0d3',
    surfaceActive: '#f6e1d5',
    surfaceMuted: '#efeadf'
  },
  border: {
    ...OsakaJadeDarkPalette.border,
    subtle: '#e3ddd0',
    default: '#d6cfc1',
    strong: '#b5ac9c'
  },
  jade: {
    ...OsakaJadeDarkPalette.jade,
    400: '#c2410c',
    500: '#e0561a',
    600: '#a8350a',
    glow: '#d4460f',
    muted: '#f8e2d6'
  },
  text: {
    ...OsakaJadeDarkPalette.text,
    primary: '#1b1814',
    secondary: '#4f4840',
    muted: '#70675d',
    inverse: '#fffaf3',
    accent: '#c2410c',
    gold: '#9a5b00'
  },
  status: {
    ...OsakaJadeDarkPalette.status,
    busy: '#3f8f5a',
    starved: '#4b9fb5',
    blocked: '#d49a00'
  },
  streams: {
    ...OsakaJadeDarkPalette.streams,
    continuousFluid: '#1f8f84',
    cold: '#3c6fd6',
    discreteContainer: '#4b9fb5'
  }
};

/** The title's face: a variable serif with weight and softness to animate. */
export const DISPLAY_FONT = "'Fraunces', 'Iowan Old Style', Georgia, serif";
export const DISPLAY_FONT_HREF = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,200..900,0..100;1,9..144,200..900,0..100&display=swap';
