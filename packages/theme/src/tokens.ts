import { OsakaJadePalette } from './palette.js';

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
 * High-level visual tokens for rendering industrial process diagrams in Osaka Jade.
 */
export const OsakaJadeCanvasTokens: CanvasVisualTheme = {
  canvasBackground: OsakaJadePalette.background.canvas,
  gridLineColor: OsakaJadePalette.border.subtle,
  nodeBackground: OsakaJadePalette.background.surface,
  nodeSelectedBorder: OsakaJadePalette.border.glow,
  nodeBorderDefault: OsakaJadePalette.border.default,
  portFillContinuous: OsakaJadePalette.streams.continuousFluid,
  portFillDiscrete: OsakaJadePalette.streams.discreteContainer,
  streamWireContinuous: OsakaJadePalette.streams.continuousFluid,
  streamWireDiscrete: OsakaJadePalette.streams.discreteContainer,
  streamWireBlocked: OsakaJadePalette.streams.backpressureBlocked
};

export const MachineStateVisuals: Record<string, MachineStateVisualConfig> = {
  BUSY: {
    label: 'Operating',
    badgeBg: OsakaJadePalette.jade.muted,
    badgeText: OsakaJadePalette.jade.glow,
    indicatorGlow: '0 0 10px rgba(45, 212, 191, 0.6)'
  },
  STARVED: {
    label: 'Starved',
    badgeBg: 'rgba(56, 189, 248, 0.15)',
    badgeText: OsakaJadePalette.status.starved,
    indicatorGlow: '0 0 10px rgba(56, 189, 248, 0.5)'
  },
  BLOCKED: {
    label: 'Blocked (Backpressure)',
    badgeBg: 'rgba(245, 158, 11, 0.15)',
    badgeText: OsakaJadePalette.status.blocked,
    indicatorGlow: '0 0 10px rgba(245, 158, 11, 0.6)'
  },
  FAILED: {
    label: 'Machine Jam / Fault',
    badgeBg: 'rgba(244, 63, 94, 0.15)',
    badgeText: OsakaJadePalette.status.failed,
    indicatorGlow: '0 0 12px rgba(244, 63, 94, 0.7)'
  },
  IDLE: {
    label: 'Idle / Offline',
    badgeBg: 'rgba(100, 116, 139, 0.15)',
    badgeText: OsakaJadePalette.status.idle,
    indicatorGlow: 'none'
  }
};
