import React from 'react';
import { useTheme } from '../../hooks/useTheme.js';

export interface ProcessForgeLogoProps {
  size?: number;
  className?: string;
  showWordmark?: boolean;
  wordmarkSize?: number;
  monochrome?: boolean;
  showSubtitle?: boolean;
  subtitle?: string;
}

/**
 * ProcessForge Emblem — Authentic Industrial Brand Mark
 *
 * Geometric Rationale:
 * 1. Anvil / Ingot base: Heavy geometric foundation representing industrial hardware & metallurgy.
 * 2. Hexagonal process reaction vessel core: Symbolizing containment, chemical synthesis & thermodynamics.
 * 3. Interlocking fluid stream circuits: Precision piping manifolds with dual directional flow chevrons.
 * 4. Crucible spark / nozzle discharge: Centered high-precision aperture aligned with the Osaka Jade colorway.
 *
 * Replaces generic AI-generated "sparkle/brain/layers" slop with a sharp, vector-accurate engineering insignia.
 */
export const ProcessForgeEmblem: React.FC<{ size?: number; color?: string; glow?: boolean }> = ({
  size = 28,
  color,
  glow = true
}) => {
  const { palette, theme } = useTheme();
  const jadeGlow = color || palette.jade.glow;
  const jadePrimary = color || palette.jade[500];
  const jadeDeep = palette.jade[700];
  const surfaceDark = palette.background.base;
  const borderDivision = palette.border.division;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        flexShrink: 0,
        filter: glow ? `drop-shadow(0 0 8px ${jadeGlow}55)` : 'none'
      }}
    >
      <defs>
        {/* Gradients tailored to Osaka Jade dual palette */}
        <linearGradient id="pf-anvil-grad" x1="4" y1="44" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={jadeDeep} />
          <stop offset="50%" stopColor={jadePrimary} />
          <stop offset="100%" stopColor={jadeDeep} />
        </linearGradient>

        <linearGradient id="pf-hex-grad" x1="12" y1="8" x2="36" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={jadeGlow} />
          <stop offset="100%" stopColor={jadePrimary} />
        </linearGradient>

        <linearGradient id="pf-stream-grad" x1="8" y1="20" x2="40" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={borderDivision} />
          <stop offset="50%" stopColor={jadeGlow} />
          <stop offset="100%" stopColor={borderDivision} />
        </linearGradient>
      </defs>

      {/* Industrial Crucible / Hexagonal Vessel Outer Profile */}
      <path
        d="M24 4 L40 13.5 V30.5 L24 40 L8 30.5 V13.5 Z"
        stroke="url(#pf-hex-grad)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        fill={theme === 'dark' ? `${surfaceDark}cc` : '#ffffffcc'}
      />

      {/* Inner Chamber Precision Grid Lines */}
      <path
        d="M24 4 V18 M40 13.5 L28 20.5 M8 13.5 L20 20.5"
        stroke={borderDivision}
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.6"
      />

      {/* Heavy Industrial Anvil Base Platform */}
      <path
        d="M10 40 L14 44 H34 L38 40 Z"
        fill="url(#pf-anvil-grad)"
        stroke={jadePrimary}
        strokeWidth="1"
      />

      {/* Horizontal Continuous Flow Stream Manifold */}
      <path
        d="M4 22 H14 M34 22 H44"
        stroke="url(#pf-stream-grad)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Left Infeed Port & Right Outfeed Port Flange Studs */}
      <circle cx="4" cy="22" r="2" fill={jadeGlow} />
      <circle cx="44" cy="22" r="2" fill={jadeGlow} />

      {/* Centered Reaction Core / Dynamic Aperture */}
      <polygon
        points="24,18 30,24 24,30 18,24"
        fill={jadeGlow}
        opacity="0.9"
      />
      <circle cx="24" cy="24" r="2" fill={theme === 'dark' ? surfaceDark : '#ffffff'} />
    </svg>
  );
};

export const ProcessForgeLogo: React.FC<ProcessForgeLogoProps> = ({
  size = 28,
  className,
  showWordmark = true,
  wordmarkSize = 16,
  monochrome = false,
  showSubtitle = false,
  subtitle
}) => {
  const { palette } = useTheme();
  const textColor = monochrome ? 'currentColor' : palette.text.primary;
  const accentColor = monochrome ? 'currentColor' : palette.jade.glow;

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        userSelect: 'none',
        lineHeight: 1
      }}
    >
      <ProcessForgeEmblem size={size} />
      {showWordmark && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <div
            style={{
              fontSize: wordmarkSize,
              fontWeight: 800,
              letterSpacing: '-0.035em',
              color: textColor,
              display: 'flex',
              alignItems: 'center',
              fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
            }}
          >
            <span>Process</span>
            <span style={{ color: accentColor, fontWeight: 800 }}>Forge</span>
          </div>
          {showSubtitle && subtitle && (
            <span
              style={{
                fontSize: Math.max(9, Math.round(wordmarkSize * 0.55)),
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: palette.text.muted,
                fontFamily: '"JetBrains Mono", monospace'
              }}
            >
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
