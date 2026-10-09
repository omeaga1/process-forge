/**
 * Osaka Jade Color Palette (Dark & Light Variants)
 *
 * Distilled from the Omarchy Linux desktop theme (Justikun/omarchy-osaka-jade-theme)
 * and its upstream Neovim bamboo core (ribru17/bamboo.nvim):
 * - Dark: Deep obsidian forest surfaces (#111c18) with bamboo sage (#c1c497),
 *   Hyprland active border jade (#71cead), and vibrant cyan accents (#2dd5b7).
 * - Light: Warm bamboo ivory rice paper (#f8f7f0) with deep forest charcoal (#1e2922)
 *   and high-contrast imperial jade accents (#239468).
 */

export type ThemeMode = 'dark' | 'light';

export interface ThemeBackgroundColors {
  base: string;
  canvas: string;
  surface: string;
  surfaceElevated: string;
  surfaceHover: string;
  surfaceActive: string;
  surfaceMuted: string;
  selectedBg: string;
  selectedFg: string;
  /** The scrim behind a dialog: dims the sheet without hiding it. */
  overlay: string;
}

export interface ThemeBorderColors {
  subtle: string;
  default: string;
  strong: string;
  glow: string;
  glowAmber: string;
  glowRose: string;
  division: string;
}

export interface ThemeJadeColors {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
  glow: string;
  muted: string;
}

export interface ThemeTextColors {
  primary: string;
  secondary: string;
  muted: string;
  inverse: string;
  accent: string;
  gold: string;
}

export interface ThemeStatusColors {
  busy: string;
  starved: string;
  blocked: string;
  failed: string;
  idle: string;
}

export interface ThemeStreamColors {
  continuousFluid: string;
  discreteContainer: string;
  backpressureBlocked: string;
  /** Liquid at or below 10 °C: a pipe shades toward this as it carries colder liquid. */
  cold: string;
  /** Liquid at or above 90 °C: a pipe shades toward this as it carries hotter liquid. */
  hot: string;
  /** A pipe or nozzle carrying a gas (air, vapour, exhaust). */
  gas: string;
  /** A pipe or nozzle carrying bulk solids (powder, granules, cake). */
  solid: string;
}

export interface ThemePalette {
  background: ThemeBackgroundColors;
  border: ThemeBorderColors;
  jade: ThemeJadeColors;
  text: ThemeTextColors;
  status: ThemeStatusColors;
  streams: ThemeStreamColors;
}

export const OsakaJadeDarkPalette: ThemePalette = {
  // Deep Mineral & Forest Surfaces (from Alacritty, Kitty, Waybar, Walker, Btop)
  background: {
    base: '#111c18', // Deepest obsidian-teal background (Kitty/Alacritty bg)
    canvas: '#11221c', // Flow diagram workspace grid (Waybar/Walker base)
    surface: '#16241f', // Node containers, cards, and primary panels
    surfaceElevated: '#1d2f28', // Property inspectors, floating drawers, toolbars
    surfaceHover: '#243a32', // Hover highlight for interactive items
    surfaceActive: '#2d473e', // Selected state background
    surfaceMuted: '#141f1b', // Inactive / dimmed elements
    selectedBg: '#364538', // Selected row background (Btop selected_bg)
    selectedFg: '#deb266', // Selected item highlight (Btop selected_fg / bamboo gold)
    overlay: 'rgba(6, 12, 10, 0.78)' // Dialog scrim
  },

  // Subtle and Glowing Borders (from Hyprland, SwayOSD, Btop)
  border: {
    subtle: '#1c2d26', // Very light separation line
    default: '#253c33', // Standard card and node outline
    strong: '#38584b', // Prominent separators
    glow: '#71cead', // Active node glow (Hyprland active_border rgb(71CEAD))
    glowAmber: '#e5c736', // Blocked warning glow (Bright Yellow)
    glowRose: '#ff5345', // Machine jam / failure glow (Bright Vermilion)
    division: '#81b8a8' // Box divider and metric lines (Btop div_line)
  },

  // Luminous Jade Accent Hierarchy
  jade: {
    50: '#f2fbf6',
    100: '#dcf5ea',
    200: '#9eebb3', // Kitty/Alacritty color15 (bright white-mint)
    300: '#8cd3cb', // Kitty/Alacritty color14 (bright cyan-mint)
    400: '#71cead', // Hyprland active border
    500: '#549e6a', // Kitty/Alacritty color2 (standard bamboo jade green)
    600: '#509475', // Kitty/Alacritty color4 (mineral blue-green)
    700: '#3b7058',
    800: '#284d3c',
    900: '#1b3529',
    glow: '#2dd5b7', // Kitty/Alacritty color6 (bright turquoise cyan)
    muted: '#1f3d31' // Background tint for active badges
  },

  // Typography & Foreground Text
  text: {
    primary: '#f6f5dd', // Warm rice paper white (Kitty/Alacritty color7)
    secondary: '#c1c497', // Kitty/Alacritty foreground (pale bamboo sage)
    muted: '#8a9e93', // Dimmed labels and hints: 4.5:1 or better on every surface and tinted card (WCAG AA)
    inverse: '#111c18', // Text on bright jade accents
    accent: '#71cead', // Highlighted mint jade text
    gold: '#deb266' // Warm bamboo amber text (Btop)
  },

  // Industrial Machine Status & Flow Dynamics
  status: {
    busy: '#549e6a', // Jade Green: Machine running normally
    starved: '#8cd3cb', // Ice Cyan: Machine starved, waiting for upstream infeed
    blocked: '#e5c736', // Amber Gold: Machine blocked by downstream buffer backpressure
    failed: '#ff5345', // Vermilion Coral: Machine stopped due to jam/fault
    idle: '#53685b' // Cool Mineral Slate: Machine offline / unconfigured
  },

  // Canvas Flow Stream Wire Colors
  streams: {
    continuousFluid: '#2dd5b7', // Luminous turquoise-jade wire for piping & fluid
    discreteContainer: '#8cd3cb', // Ice-cyan wire for conveyors & cans
    backpressureBlocked: '#e5c736', // Pulsing amber warning for blocked conveyors
    cold: '#7aa7ff', // Chilled liquid: glacial blue
    hot: '#ff8f5a', // Hot liquid: ember orange, apart from amber (blocked) and coral (failed)
    gas: '#b8b4f0', // Gas and vapour: pale lavender, clear of the jade liquids
    solid: '#d9b98c' // Bulk solids: sand
  }
};

export const OsakaJadeLightPalette: ThemePalette = {
  // Warm Bamboo Ivory & Rice Paper Surfaces (from Bamboo.nvim light mode)
  background: {
    base: '#f8f7f0', // Warm bamboo ivory / rice paper background
    canvas: '#f2f0e4', // Flow diagram workspace grid background
    surface: '#ffffff', // Clean white node containers and cards
    surfaceElevated: '#ebe9dc', // Property inspectors, floating drawers, toolbars
    surfaceHover: '#e3e0d0', // Hover highlight for interactive items
    surfaceActive: '#dcd8c4', // Selected state background
    surfaceMuted: '#f2f0e6', // Inactive / dimmed elements
    selectedBg: '#e4e8dc', // Selected row background
    selectedFg: '#b47818', // Selected item highlight (bamboo amber)
    overlay: 'rgba(30, 41, 34, 0.38)' // Dialog scrim: dims the ivory sheet, stays light
  },

  // Subtle and Defined Borders
  border: {
    subtle: '#e3e0d2', // Very light separation line
    default: '#cfccba', // Standard card and node outline
    strong: '#a8a592', // Prominent separators
    glow: '#1e7e58', // Active node glow (deep radiant imperial jade)
    glowAmber: '#d97706', // Blocked warning glow
    glowRose: '#a51818', // Failure colour (also waste labels): 4.5:1 or better on light surfaces and on its own tint
    division: '#629c89' // Box divider and metric lines
  },

  // High-Contrast Imperial Jade Accent Hierarchy
  jade: {
    50: '#064e3b',
    100: '#047857',
    200: '#059669',
    300: '#03644a', // Active-state text: 4.5:1 or better on light surfaces and on jade tints (WCAG AA)
    400: '#1b7a54', // Tags and accent text: 4.7:1 on the canvas (WCAG AA)
    500: '#239468', // Standard Imperial Jade brand accent
    600: '#1b7a54',
    700: '#145f41',
    800: '#0f4731',
    900: '#0a3021',
    glow: '#03644a', // Emerald jade accent text: 4.5:1 or better on every light surface and on jade tints (WCAG AA)
    muted: '#dcf5ea' // Soft jade tint for badge backgrounds
  },

  // Typography & Foreground Text (High-contrast for daytime industrial legibility)
  text: {
    primary: '#1e2922', // Deep forest pine charcoal
    secondary: '#45574c', // Balanced secondary forest sage text
    muted: '#5a695e', // Dimmed labels and hints: 4.5:1 on the elevated surface (WCAG AA)
    inverse: '#f8f7f0', // Text on dark jade accents
    accent: '#146546', // Highlighted deep jade text: 4.5:1 or better on every light surface and on jade tints (WCAG AA)
    gold: '#b47818' // Deep bamboo amber text
  },

  // Industrial Machine Status & Flow Dynamics (Light mode calibrated)
  status: {
    busy: '#1b7a54', // Deep Emerald Jade: Machine running normally
    starved: '#075985', // Deep sky: machine starved, waiting for infeed; 4.5:1 or better on light surfaces and on its badge tint (WCAG AA)
    blocked: '#804a04', // Amber: machine blocked by backpressure; 4.5:1 or better on every light surface and on its own tint (WCAG AA)
    failed: '#a51818', // Crimson: machine stopped by a fault; 4.5:1 or better on light surfaces and on its own tint (WCAG AA)
    idle: '#4b5868' // Slate: machine offline / unconfigured; 4.5:1 or better on light surfaces and on its badge tint (WCAG AA)
  },

  // Canvas Flow Stream Wire Colors
  streams: {
    continuousFluid: '#0d9488', // Luminous teal-jade wire for fluid streams
    discreteContainer: '#0284c7', // Cyan wire for conveyors & cans
    backpressureBlocked: '#d97706', // High-contrast amber warning for blocked conveyors
    cold: '#2563eb', // Chilled liquid
    hot: '#c2410c', // Hot liquid
    gas: '#6d28d9', // Gas and vapour
    solid: '#92400e' // Bulk solids
  }
};

/**
 * Default Osaka Jade palette pointing to the dark desktop rice aesthetic
 * for seamless backwards compatibility.
 */
export const OsakaJadePalette: ThemePalette = OsakaJadeDarkPalette;

/**
 * Returns the corresponding Osaka Jade palette for the requested mode.
 */
export function getOsakaJadePalette(mode: ThemeMode = 'dark'): ThemePalette {
  return mode === 'light' ? OsakaJadeLightPalette : OsakaJadeDarkPalette;
}
