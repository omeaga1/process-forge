import React, { useEffect } from 'react';
import { OsakaJadePalette } from '@process-forge/theme';
import type { NodeKind, UnitOpDressing } from '@process-forge/protocol';

export const EQUIPMENT_ANIM_CSS = `
  @keyframes pf-bubble-rise { 0%{transform:translateY(0);opacity:.85} 80%{opacity:.4} 100%{transform:translateY(-68px);opacity:0} }
  @keyframes pf-shimmer { 0%,100%{fill-opacity:.6} 50%{fill-opacity:.9} }
  @keyframes pf-vapor  { 0%,100%{fill-opacity:.12} 50%{fill-opacity:.26} }
  @keyframes pf-stir   { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  @keyframes pf-pulse  { 0%,100%{r:4px;opacity:.7} 50%{r:6px;opacity:1} }
  @keyframes pf-cold   { 0%{transform:translateY(0) rotate(0);opacity:.9} 100%{transform:translateY(34px) rotate(180deg);opacity:0} }
  @keyframes pf-spray-fall { 0%{transform:translateY(0);opacity:.9;r:3px} 50%{opacity:.6} 100%{transform:translateY(80px);opacity:0;r:1.5px} }
  @keyframes pf-flow   { 0%{stroke-dashoffset:60;opacity:.9} 100%{stroke-dashoffset:0;opacity:.5} }
  @keyframes pf-spin   { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  @keyframes pf-col-v  { 0%{cy:80px;opacity:.8;r:3px} 100%{cy:10px;opacity:0;r:5px} }
  @keyframes pf-fade   { 0%,100%{opacity:.3} 50%{opacity:1} }
  @keyframes pf-glow-pulse { 0%,100%{filter:drop-shadow(0 0 2px #10b981)} 50%{filter:drop-shadow(0 0 8px #2dd4bf)} }
`;

export function injectEquipmentCSS(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('pf-equipment-anim-css')) return;
  const s = document.createElement('style');
  s.id = 'pf-equipment-anim-css';
  s.textContent = EQUIPMENT_ANIM_CSS;
  document.head.appendChild(s);
}

// ── SepAnim: Flash Drum & Separator ───────────────────────────────────────────
export const SepAnim: React.FC<{ stroke?: string; bg?: string; isRunning?: boolean }> = ({
  stroke = OsakaJadePalette.jade[400],
  bg = 'rgba(16, 185, 129, 0.08)',
  isRunning = true
}) => {
  return (
    <svg viewBox="0 0 160 140" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}>
      {/* Outer Shell */}
      <rect x="35" y="18" width="90" height="98" rx="10" fill={bg} stroke={stroke} strokeWidth="2" />
      {/* Vapor Space */}
      <rect
        x="36"
        y="19"
        width="88"
        height="38"
        rx="10"
        fill="rgba(56, 189, 248, 0.15)"
        style={{ animation: isRunning ? 'pf-vapor 3s ease-in-out infinite' : 'none' }}
      />
      <line x1="35" y1="57" x2="125" y2="57" stroke={stroke} strokeWidth="1.5" strokeDasharray="6,3" opacity="0.4" />
      {/* Liquid Shimmer */}
      <rect
        x="36"
        y="57"
        width="88"
        height="58"
        rx="4"
        fill="rgba(16, 185, 129, 0.25)"
        style={{ animation: isRunning ? 'pf-shimmer 3.5s ease-in-out infinite' : 'none' }}
      />
      {/* Rising Bubbles */}
      {isRunning &&
        [{ cx: 60, cy: 100, r: 4, d: '0s' }, { cx: 80, cy: 105, r: 3, d: '.9s' }, { cx: 100, cy: 95, r: 5, d: '1.8s' }].map(
          (b, i) => (
            <circle
              key={i}
              cx={b.cx}
              cy={b.cy}
              r={b.r}
              fill="rgba(45, 212, 191, 0.6)"
              style={{ animation: `pf-bubble-rise 2.8s ease-in ${b.d} infinite` }}
            />
          )
        )}
      <text x="80" y="42" textAnchor="middle" fontSize="9" fill={OsakaJadePalette.text.muted} style={{ fontWeight: 600 }}>
        VAPOR
      </text>
      <text x="80" y="86" textAnchor="middle" fontSize="9" fill={OsakaJadePalette.jade[300]} style={{ fontWeight: 600 }}>
        LIQUID
      </text>
    </svg>
  );
};

// ── ReactorAnim: CSTR / Batch Reactor with Agitator & Jacket ──────────────────
export const ReactorAnim: React.FC<{
  stroke?: string;
  bg?: string;
  isRunning?: boolean;
  hasJacket?: boolean;
  agitatorType?: string;
}> = ({
  stroke = OsakaJadePalette.jade[400],
  bg = 'rgba(16, 185, 129, 0.08)',
  isRunning = true,
  hasJacket = true,
  agitatorType = 'pitched_blade'
}) => {
  return (
    <svg viewBox="0 0 160 160" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}>
      {/* External Heating/Cooling Jacket if dressed */}
      {hasJacket && (
        <path
          d="M 22 45 L 22 130 A 28 20 0 0 0 138 130 L 138 45"
          fill="none"
          stroke={OsakaJadePalette.status.blocked}
          strokeWidth="2.5"
          strokeDasharray="4,2"
          opacity="0.8"
        />
      )}

      {/* Main Vessel Body */}
      <rect x="30" y="25" width="100" height="105" rx="15" fill={bg} stroke={stroke} strokeWidth="2" />

      {/* Fluid level */}
      <rect x="32" y="65" width="96" height="62" rx="4" fill="rgba(16, 185, 129, 0.22)" />
      <path d="M 32 65 Q 80 58 128 65 Q 80 72 32 65" fill="rgba(45, 212, 191, 0.35)" />

      {/* Agitator Motor */}
      <rect x="65" y="5" width="30" height="20" rx="4" fill={OsakaJadePalette.background.surfaceElevated} stroke={stroke} strokeWidth="1.5" />
      <text x="80" y="19" textAnchor="middle" fontSize="10" fill={stroke} fontWeight="bold">
        M
      </text>

      {/* Agitator Shaft */}
      <line x1="80" y1="25" x2="80" y2="110" stroke={stroke} strokeWidth="3" strokeLinecap="round" />

      {/* Rotating Agitator Impeller */}
      {agitatorType !== 'none' && (
        <g style={{ transformOrigin: '80px 100px', animation: isRunning ? 'pf-stir 1.5s linear infinite' : 'none' }}>
          <line x1="48" y1="100" x2="112" y2="100" stroke={stroke} strokeWidth="4" strokeLinecap="round" />
          {agitatorType === 'rushton' ? (
            <>
              <rect x="46" y="94" width="6" height="12" fill={stroke} />
              <rect x="108" y="94" width="6" height="12" fill={stroke} />
              <rect x="77" y="94" width="6" height="12" fill={stroke} />
            </>
          ) : (
            <>
              <polygon points="48,100 58,92 58,100" fill={stroke} />
              <polygon points="112,100 102,108 102,100" fill={stroke} />
            </>
          )}
        </g>
      )}

      {/* Reaction / Nucleation Bubbles */}
      {isRunning &&
        [{ cx: 50, cy: 105, d: '0s', c: OsakaJadePalette.jade[400] }, { cx: 80, cy: 110, d: '.9s', c: OsakaJadePalette.jade[200] }, { cx: 110, cy: 102, d: '1.8s', c: OsakaJadePalette.jade[300] }].map((m, i) => (
          <circle
            key={i}
            cx={m.cx}
            cy={m.cy}
            r="4"
            fill={m.c}
            style={{
              animation: `pf-pulse 2.2s ease-in-out ${m.d} infinite`,
              transformOrigin: `${m.cx}px ${m.cy}px`
            }}
          />
        ))}
    </svg>
  );
};

// ── DistAnim: Distillation Column with Sieve Trays ─────────────────────────────
export const DistAnim: React.FC<{ stroke?: string; bg?: string; isRunning?: boolean; trayCount?: number }> = ({
  stroke = OsakaJadePalette.jade[400],
  bg = 'rgba(16, 185, 129, 0.08)',
  isRunning = true,
  trayCount = 6
}) => {
  const trays = Array.from({ length: trayCount }, (_, i) => 25 + i * 16);
  return (
    <svg viewBox="0 0 160 150" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}>
      {/* Column Shell */}
      <rect x="55" y="8" width="50" height="124" rx="8" fill={bg} stroke={stroke} strokeWidth="2" />

      {/* Horizontal Tray Perforations */}
      {trays.map((y, i) => (
        <g key={i}>
          <line x1="56" y1={y} x2="104" y2={y} stroke={stroke} strokeWidth="1.5" opacity="0.4" />
          <rect x="57" y={y + 1} width="46" height="5" fill="rgba(16, 185, 129, 0.25)" rx="1" />
        </g>
      ))}

      {/* Rising Vapor Bubbles through Trays */}
      {isRunning &&
        [{ cx: 68, cy: 118, d: '0s' }, { cx: 82, cy: 118, d: '.6s' }, { cx: 95, cy: 118, d: '1.2s' }].map((b, i) => (
          <circle
            key={i}
            cx={b.cx}
            cy={b.cy}
            r="3"
            fill={OsakaJadePalette.jade.glow}
            style={{ animation: `pf-col-v 2.4s ease-in ${b.d} infinite` }}
          />
        ))}
    </svg>
  );
};

// ── SprayChamberAnim: Spray Chamber & Atomizer ─────────────────────────────────
export const SprayChamberAnim: React.FC<{ stroke?: string; bg?: string; isRunning?: boolean }> = ({
  stroke = OsakaJadePalette.jade[400],
  bg = 'rgba(16, 185, 129, 0.08)',
  isRunning = true
}) => {
  return (
    <svg viewBox="0 0 160 180" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}>
      <path
        d="M 25 28 A 55 18 0 0 1 135 28 L 135 83 L 95 158 L 65 158 L 25 83 Z"
        fill={bg}
        stroke={stroke}
        strokeWidth="2"
      />
      {/* Spray Header */}
      <line x1="25" y1="42" x2="135" y2="42" stroke={stroke} strokeWidth="1.5" strokeDasharray="6,3" opacity="0.5" />
      <polygon points="55,40 50,48 60,48" fill={stroke} />
      <polygon points="80,40 75,48 85,48" fill={stroke} />
      <polygon points="105,40 100,48 110,48" fill={stroke} />

      {/* Falling Atomized Droplets */}
      {isRunning &&
        [
          { cx: 55, cy: 52, d: '0s', dur: '2.2s' },
          { cx: 80, cy: 52, d: '0.4s', dur: '2.5s' },
          { cx: 105, cy: 52, d: '0.9s', dur: '2.2s' },
          { cx: 70, cy: 56, d: '1.4s', dur: '2.1s' },
          { cx: 90, cy: 56, d: '0.2s', dur: '2.3s' }
        ].map((drop, i) => (
          <circle
            key={i}
            cx={drop.cx}
            cy={drop.cy}
            r="2.5"
            fill={OsakaJadePalette.streams.discreteContainer}
            opacity="0.8"
            style={{ animation: `pf-spray-fall ${drop.dur} ease-in ${drop.d} infinite` }}
          />
        ))}

      {/* Collected Bottom Liquid */}
      <polygon points="40,110 120,110 92,152 68,152" fill="rgba(16, 185, 129, 0.3)" style={{ animation: 'pf-shimmer 3s infinite' }} />
    </svg>
  );
};

// ── PumpAnim: Centrifugal Pump with Spinning Impeller ─────────────────────────
export const PumpAnim: React.FC<{ stroke?: string; bg?: string; isRunning?: boolean }> = ({
  stroke = OsakaJadePalette.jade[400],
  bg = 'rgba(16, 185, 129, 0.08)',
  isRunning = true
}) => {
  return (
    <svg viewBox="0 0 120 120" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}>
      {/* Volute Casing */}
      <circle cx="55" cy="65" r="36" fill={bg} stroke={stroke} strokeWidth="2" />
      {/* Tangential Discharge */}
      <path d="M 55 29 L 95 29 L 95 45 L 80 45" fill={bg} stroke={stroke} strokeWidth="2" strokeLinejoin="round" />

      {/* Spinning Impeller Blades */}
      <g style={{ transformOrigin: '55px 65px', animation: isRunning ? 'pf-spin 1s linear infinite' : 'none' }}>
        <circle cx="55" cy="65" r="7" fill={stroke} />
        <path d="M 55 58 Q 50 48 45 42" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M 62 65 Q 72 60 78 55" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M 55 72 Q 60 82 65 88" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M 48 65 Q 38 70 32 75" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
      </g>
    </svg>
  );
};

// ── ExchangerAnim: Heat Exchanger Multi-Pass Bundle ───────────────────────────
export const ExchangerAnim: React.FC<{ stroke?: string; bg?: string; isRunning?: boolean }> = ({
  stroke = OsakaJadePalette.jade[400],
  bg = 'rgba(16, 185, 129, 0.08)',
  isRunning = true
}) => {
  return (
    <svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}>
      <rect x="25" y="25" width="110" height="70" rx="8" fill={bg} stroke={stroke} strokeWidth="2" />
      {/* Hot Shell Tube Passes */}
      <line x1="26" y1="45" x2="134" y2="45" stroke={OsakaJadePalette.status.blocked} strokeWidth="2" strokeDasharray="4,2" />
      <line x1="26" y1="60" x2="134" y2="60" stroke={OsakaJadePalette.status.busy} strokeWidth="2" strokeDasharray="4,2" />
      <line x1="26" y1="75" x2="134" y2="75" stroke={OsakaJadePalette.status.starved} strokeWidth="2" strokeDasharray="4,2" />

      {/* Internal Baffles */}
      <line x1="55" y1="26" x2="55" y2="75" stroke={stroke} strokeWidth="1.5" opacity="0.6" />
      <line x1="85" y1="45" x2="85" y2="94" stroke={stroke} strokeWidth="1.5" opacity="0.6" />
      <line x1="115" y1="26" x2="115" y2="75" stroke={stroke} strokeWidth="1.5" opacity="0.6" />

      {isRunning && (
        <circle
          cx="28"
          cy="45"
          r="3"
          fill={OsakaJadePalette.status.blocked}
          style={{ animation: 'pf-pulse 1.8s infinite' }}
        />
      )}
    </svg>
  );
};

// ── TankAnim: Storage / Buffer Tank ───────────────────────────────────────────
export const TankAnim: React.FC<{ stroke?: string; bg?: string; isRunning?: boolean; levelPercent?: number }> = ({
  stroke = OsakaJadePalette.jade[400],
  bg = 'rgba(16, 185, 129, 0.08)',
  isRunning = true,
  levelPercent = 70
}) => {
  const liquidHeight = Math.max(10, Math.min(80, (levelPercent / 100) * 80));
  const liquidY = 105 - liquidHeight;

  return (
    <svg viewBox="0 0 160 140" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}>
      {/* Tank Shell */}
      <rect x="35" y="20" width="90" height="95" rx="8" fill={bg} stroke={stroke} strokeWidth="2" />
      {/* Fluid Volume */}
      <rect
        x="36"
        y={liquidY}
        width="88"
        height={liquidHeight}
        rx="4"
        fill="rgba(16, 185, 129, 0.28)"
        style={{ animation: isRunning ? 'pf-shimmer 3s ease-in-out infinite' : 'none' }}
      />
      {/* Liquid Top Wave Line */}
      <path
        d={`M 36 ${liquidY} Q 80 ${liquidY - 4} 124 ${liquidY}`}
        fill="none"
        stroke={OsakaJadePalette.jade.glow}
        strokeWidth="1.5"
      />
      <text x="80" y="70" textAnchor="middle" fontSize="11" fill={OsakaJadePalette.text.primary} fontWeight="bold">
        {levelPercent}%
      </text>
    </svg>
  );
};

// ── CustomEquipmentAnim: AI Forge SVG Shell & Details ─────────────────────────
export const CustomEquipmentAnim: React.FC<{
  shellSvg?: string;
  detailsSvg?: string;
  viewBox?: string;
  stroke?: string;
  bg?: string;
}> = ({
  shellSvg = '',
  detailsSvg = '',
  viewBox = '0 0 100 100',
  stroke = OsakaJadePalette.jade[400],
  bg = 'rgba(16, 185, 129, 0.08)'
}) => {
  const sanitize = (svg: string) =>
    svg.replace(/<(script|style|use|image|defs)[^>]*>.*?<\/\1>/gis, '').replace(/<(script|style|use|image)[^>]*\/>/gi, '');

  const cleanShell = sanitize(shellSvg);
  const cleanDetail = sanitize(detailsSvg);

  return (
    <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}>
      <g fill={bg} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: cleanShell }} />
      {cleanDetail && (
        <g fill="none" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" opacity="0.75" dangerouslySetInnerHTML={{ __html: cleanDetail }} />
      )}
    </svg>
  );
};

// ── UnitAnim: Master Dispatcher ───────────────────────────────────────────────
export interface UnitAnimProps {
  kind: NodeKind | string;
  dressing?: UnitOpDressing;
  isRunning?: boolean;
  colorAccent?: string;
}

export const UnitAnim: React.FC<UnitAnimProps> = ({ kind, dressing, isRunning = true, colorAccent }) => {
  useEffect(() => {
    injectEquipmentCSS();
  }, []);

  const stroke = colorAccent || OsakaJadePalette.jade[400];
  const internals = dressing?.internals;

  if (dressing?.customSvgShell) {
    return (
      <CustomEquipmentAnim
        shellSvg={dressing.customSvgShell}
        detailsSvg={dressing.customSvgDetails}
        viewBox={dressing.viewBox}
        stroke={stroke}
      />
    );
  }

  switch (kind) {
    case 'BATCH_REACTOR':
    case 'reactor':
      return (
        <ReactorAnim
          stroke={stroke}
          isRunning={isRunning}
          hasJacket={internals?.hasJacket ?? true}
          agitatorType={internals?.agitatorType ?? 'pitched_blade'}
        />
      );

    case 'SURGE_TANK':
    case 'tank':
      return <TankAnim stroke={stroke} isRunning={isRunning} levelPercent={74} />;

    case 'SEPARATOR':
    case 'separator':
      return <SepAnim stroke={stroke} isRunning={isRunning} />;

    case 'DISTILLATION_COLUMN':
    case 'distillation':
      return <DistAnim stroke={stroke} isRunning={isRunning} trayCount={internals?.trayCount ?? 6} />;

    case 'SPRAY_CHAMBER':
    case 'spray_chamber':
      return <SprayChamberAnim stroke={stroke} isRunning={isRunning} />;

    case 'HEAT_EXCHANGER':
    case 'exchanger':
      return <ExchangerAnim stroke={stroke} isRunning={isRunning} />;

    case 'PUMP':
    case 'pump':
      return <PumpAnim stroke={stroke} isRunning={isRunning} />;

    case 'MIXER':
    case 'mixer':
      return (
        <ReactorAnim
          stroke={stroke}
          isRunning={isRunning}
          hasJacket={false}
          agitatorType="rushton"
        />
      );

    case 'ROTARY_FILLER':
      return (
        <svg viewBox="0 0 140 140" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}>
          {/* Rotary Carousel */}
          <circle cx="70" cy="70" r="45" fill="rgba(16, 185, 129, 0.08)" stroke={stroke} strokeWidth="2" />
          <g style={{ transformOrigin: '70px 70px', animation: isRunning ? 'pf-spin 3s linear infinite' : 'none' }}>
            {[0, 45, 90, 135, 180, 225, 270, 315].map((ang, i) => {
              const rad = (ang * Math.PI) / 180;
              const x = 70 + 35 * Math.cos(rad);
              const y = 70 + 35 * Math.sin(rad);
              return <circle key={i} cx={x} cy={y} r="5" fill={OsakaJadePalette.jade[500]} stroke={stroke} strokeWidth="1" />;
            })}
            <line x1="70" y1="35" x2="70" y2="105" stroke={stroke} strokeWidth="1.5" />
            <line x1="35" y1="70" x2="105" y2="70" stroke={stroke} strokeWidth="1.5" />
          </g>
          <circle cx="70" cy="70" r="10" fill={OsakaJadePalette.background.surfaceElevated} stroke={stroke} strokeWidth="1.5" />
        </svg>
      );

    case 'LABELER':
    case 'CONVEYOR':
    case 'PALLETIZER':
    default:
      return <TankAnim stroke={stroke} isRunning={isRunning} levelPercent={60} />;
  }
};

export default UnitAnim;
