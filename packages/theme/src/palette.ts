/**
 * Osaka Jade Color Palette
 *
 * Inspired by the Omarchy Linux desktop rice aesthetic:
 * Deep mineral slate surfaces paired with radiant jade and emerald accents.
 */
export const OsakaJadePalette = {
  // Deep Mineral Surfaces & Backgrounds
  background: {
    base: '#0c1214', // Deepest obsidian-teal background
    canvas: '#0f171a', // Flow diagram workspace grid background
    surface: '#152024', // Node containers, cards, and primary panels
    surfaceElevated: '#1a292f', // Property inspectors, floating drawers, toolbars
    surfaceHover: '#21333a', // Hover highlight for interactive items
    surfaceActive: '#293e47', // Selected state background
    surfaceMuted: '#121b1f' // Inactive / dimmed elements
  },

  // Subtle and Glowing Borders
  border: {
    subtle: '#1b2a30', // Very light separation line
    default: '#253942', // Standard card and node outline
    strong: '#354f5c', // Prominent separators
    glow: '#2dd4bf', // Active node glow (luminous teal-jade)
    glowAmber: '#f59e0b', // Blocked warning glow
    glowRose: '#f43f5e' // Machine jam / failure glow
  },

  // Luminous Jade Accent Hierarchy
  jade: {
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981', // Standard Imperial Jade
    600: '#059669',
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
    glow: '#2dd4bf', // Bright Neon Jade
    muted: '#134e4a' // Background tint for active badges
  },

  // Typography & Foreground Text
  text: {
    primary: '#e8f2f0', // Crisp, high-contrast cool silver with a hint of mint
    secondary: '#9ab3ba', // Balanced secondary metadata text
    muted: '#5c7882', // Dimmed labels, hints, and timestamps
    inverse: '#080d0f', // Text on bright jade accents
    accent: '#34d399' // Highlighted inline text
  },

  // Industrial Machine Status & Flow Dynamics
  status: {
    busy: '#10b981', // Jade Green: Machine running normally
    starved: '#38bdf8', // Ice Cyan: Machine starved, waiting for upstream infeed
    blocked: '#f59e0b', // Amber Gold: Machine blocked by downstream buffer backpressure
    failed: '#f43f5e', // Crimson Rose: Machine stopped due to jam/fault
    idle: '#64748b' // Cool Slate: Machine offline / unconfigured
  },

  // Canvas Flow Stream Wire Colors
  streams: {
    continuousFluid: '#2dd4bf', // Luminous jade-teal wire for piping & fluid
    discreteContainer: '#38bdf8', // Ice-cyan pulsed wire for conveyors & cans
    backpressureBlocked: '#f59e0b' // Pulsing amber warning for blocked conveyors
  }
} as const;

export type ThemePalette = typeof OsakaJadePalette;
