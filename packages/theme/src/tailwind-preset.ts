import { OsakaJadePalette, OsakaJadeDarkPalette, OsakaJadeLightPalette } from './palette.js';

/**
 * Tailwind CSS configuration preset for Osaka Jade theme.
 */
export const osakaJadeTailwindPreset = {
  theme: {
    extend: {
      colors: {
        pf: {
          bg: {
            base: OsakaJadePalette.background.base,
            canvas: OsakaJadePalette.background.canvas,
            surface: OsakaJadePalette.background.surface,
            elevated: OsakaJadePalette.background.surfaceElevated,
            hover: OsakaJadePalette.background.surfaceHover,
            active: OsakaJadePalette.background.surfaceActive,
            muted: OsakaJadePalette.background.surfaceMuted,
            selected: OsakaJadePalette.background.selectedBg
          },
          border: {
            subtle: OsakaJadePalette.border.subtle,
            default: OsakaJadePalette.border.default,
            strong: OsakaJadePalette.border.strong,
            glow: OsakaJadePalette.border.glow,
            glowAmber: OsakaJadePalette.border.glowAmber,
            glowRose: OsakaJadePalette.border.glowRose,
            division: OsakaJadePalette.border.division
          },
          jade: OsakaJadePalette.jade,
          text: OsakaJadePalette.text,
          status: OsakaJadePalette.status,
          streams: OsakaJadePalette.streams,
          dark: OsakaJadeDarkPalette,
          light: OsakaJadeLightPalette
        }
      },
      boxShadow: {
        'jade-glow': '0 0 15px -3px rgba(113, 206, 173, 0.45)',
        'jade-glow-lg': '0 0 25px -2px rgba(113, 206, 173, 0.6)'
      }
    }
  }
};
