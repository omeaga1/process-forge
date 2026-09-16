import { OsakaJadeDarkPalette, OsakaJadeLightPalette, type ThemeMode } from './palette.js';

export interface CanvasVisualTheme {
  canvasBackground: string;
  gridLineColor: string;
  nodeBackground: string;
  nodeSelectedBorder: string;
  nodeBorderDefault: string;
  portFillContinuous: string;
  portFillDiscrete: string;
  streamWireContinuous: string;
  streamWireDiscrete: string;
  streamWireBlocked: string;
}

export interface MachineStateVisualConfig {
  label: string;
  badgeBg: string;
  badgeText: string;
  indicatorGlow: string;
}

/**
 * Visual tokens for rendering industrial process diagrams in Osaka Jade Dark.
 */
export const OsakaJadeDarkCanvasTokens: CanvasVisualTheme = {
  canvasBackground: OsakaJadeDarkPalette.background.canvas,
  gridLineColor: OsakaJadeDarkPalette.border.subtle,
  nodeBackground: OsakaJadeDarkPalette.background.surface,
  nodeSelectedBorder: OsakaJadeDarkPalette.border.glow,
  nodeBorderDefault: OsakaJadeDarkPalette.border.default,
  portFillContinuous: OsakaJadeDarkPalette.streams.continuousFluid,
  portFillDiscrete: OsakaJadeDarkPalette.streams.discreteContainer,
  streamWireContinuous: OsakaJadeDarkPalette.streams.continuousFluid,
  streamWireDiscrete: OsakaJadeDarkPalette.streams.discreteContainer,
  streamWireBlocked: OsakaJadeDarkPalette.streams.backpressureBlocked
};

/**
 * Visual tokens for rendering industrial process diagrams in Osaka Jade Light.
 */
export const OsakaJadeLightCanvasTokens: CanvasVisualTheme = {
  canvasBackground: OsakaJadeLightPalette.background.canvas,
  gridLineColor: OsakaJadeLightPalette.border.subtle,
  nodeBackground: OsakaJadeLightPalette.background.surface,
  nodeSelectedBorder: OsakaJadeLightPalette.border.glow,
  nodeBorderDefault: OsakaJadeLightPalette.border.default,
  portFillContinuous: OsakaJadeLightPalette.streams.continuousFluid,
  portFillDiscrete: OsakaJadeLightPalette.streams.discreteContainer,
  streamWireContinuous: OsakaJadeLightPalette.streams.continuousFluid,
  streamWireDiscrete: OsakaJadeLightPalette.streams.discreteContainer,
  streamWireBlocked: OsakaJadeLightPalette.streams.backpressureBlocked
};

/**
 * Default canvas tokens aliased to Dark theme for backwards compatibility.
 */
export const OsakaJadeCanvasTokens: CanvasVisualTheme = OsakaJadeDarkCanvasTokens;

/**
 * Returns canvas tokens for the specified theme mode.
 */
export function getCanvasTokens(mode: ThemeMode = 'dark'): CanvasVisualTheme {
  return mode === 'light' ? OsakaJadeLightCanvasTokens : OsakaJadeDarkCanvasTokens;
}

export const MachineStateVisualsDark: Record<string, MachineStateVisualConfig> = {
  BUSY: {
    label: 'Operating',
    badgeBg: OsakaJadeDarkPalette.jade.muted,
    badgeText: OsakaJadeDarkPalette.jade.glow,
    indicatorGlow: '0 0 10px rgba(45, 213, 183, 0.6)'
  },
  STARVED: {
    label: 'Starved',
    badgeBg: 'rgba(140, 211, 203, 0.15)',
    badgeText: OsakaJadeDarkPalette.status.starved,
    indicatorGlow: '0 0 10px rgba(140, 211, 203, 0.5)'
  },
  BLOCKED: {
    label: 'Blocked (Backpressure)',
    badgeBg: 'rgba(229, 199, 54, 0.15)',
    badgeText: OsakaJadeDarkPalette.status.blocked,
    indicatorGlow: '0 0 10px rgba(229, 199, 54, 0.6)'
  },
  FAILED: {
    label: 'Machine Jam / Fault',
    badgeBg: 'rgba(255, 83, 69, 0.15)',
    badgeText: OsakaJadeDarkPalette.status.failed,
    indicatorGlow: '0 0 12px rgba(255, 83, 69, 0.7)'
  },
  IDLE: {
    label: 'Standby',
    badgeBg: 'rgba(83, 104, 91, 0.15)',
    badgeText: OsakaJadeDarkPalette.status.idle,
    indicatorGlow: 'none'
  }
};

export const MachineStateVisualsLight: Record<string, MachineStateVisualConfig> = {
  BUSY: {
    label: 'Operating',
    badgeBg: OsakaJadeLightPalette.jade.muted,
    badgeText: OsakaJadeLightPalette.jade[600],
    indicatorGlow: '0 0 10px rgba(27, 122, 84, 0.4)'
  },
  STARVED: {
    label: 'Starved',
    badgeBg: 'rgba(2, 132, 199, 0.12)',
    badgeText: OsakaJadeLightPalette.status.starved,
    indicatorGlow: '0 0 10px rgba(2, 132, 199, 0.35)'
  },
  BLOCKED: {
    label: 'Blocked (Backpressure)',
    badgeBg: 'rgba(217, 119, 6, 0.12)',
    badgeText: OsakaJadeLightPalette.status.blocked,
    indicatorGlow: '0 0 10px rgba(217, 119, 6, 0.4)'
  },
  FAILED: {
    label: 'Machine Jam / Fault',
    badgeBg: 'rgba(220, 38, 38, 0.12)',
    badgeText: OsakaJadeLightPalette.status.failed,
    indicatorGlow: '0 0 12px rgba(220, 38, 38, 0.45)'
  },
  IDLE: {
    label: 'Standby',
    badgeBg: 'rgba(100, 116, 139, 0.12)',
    badgeText: OsakaJadeLightPalette.status.idle,
    indicatorGlow: 'none'
  }
};

/**
 * Default machine state visuals aliased to Dark theme for backwards compatibility.
 */
export const MachineStateVisuals: Record<string, MachineStateVisualConfig> = MachineStateVisualsDark;

/**
 * Returns machine state visuals for the specified theme mode.
 */
export function getMachineStateVisuals(mode: ThemeMode = 'dark'): Record<string, MachineStateVisualConfig> {
  return mode === 'light' ? MachineStateVisualsLight : MachineStateVisualsDark;
}
