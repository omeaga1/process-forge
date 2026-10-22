import React from 'react';
import { SITE as D } from './palette.js';

/**
 * The site's backdrop, behind every page: a fine dot grid that fades toward
 * the edges, two washes of jade and bamboo that drift very slowly, and a few
 * hairline process lines with something always flowing through them. It
 * stays put while the page scrolls, and holds still for reduced motion.
 */

// Pipes, as a P&ID would run them: orthogonal, ending in a nozzle, and kept to the margins. In a 1440 x 900 box, scaled to cover the window.
const PIPES = [
  'M -20 200 H 84 Q 100 200 100 216 V 420 Q 100 436 116 436 H 150',
  'M 1460 150 H 1330 Q 1314 150 1314 166 V 330 Q 1314 346 1298 346 H 1270',
  'M 1460 620 H 1362 Q 1346 620 1346 636 V 800 Q 1346 816 1330 816 H 1290',
  'M -20 780 H 58 Q 74 780 74 764 V 600 Q 74 584 90 584 H 130'
];
const NOZZLES: [number, number][] = [
  [150, 436],
  [1270, 346],
  [1290, 816],
  [130, 584]
];

export const Backdrop: React.FC = () => (
  <div aria-hidden className="pf-site-backdrop" style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', overflow: 'hidden' }}>
    <style>{`
      @keyframes pf-drift-a { from { transform: translate3d(0, 0, 0) scale(1); } to { transform: translate3d(-6vw, 4vh, 0) scale(1.08); } }
      @keyframes pf-drift-b { from { transform: translate3d(0, 0, 0) scale(1.05); } to { transform: translate3d(5vw, -5vh, 0) scale(0.95); } }
      @keyframes pf-site-backdrop-flow { to { stroke-dashoffset: -160; } }
      .pf-site-backdrop .pf-wash-a { animation: pf-drift-a 38s ease-in-out infinite alternate; }
      .pf-site-backdrop .pf-wash-b { animation: pf-drift-b 46s ease-in-out infinite alternate; }
      .pf-site-backdrop .pf-pipe-flow { animation: pf-site-backdrop-flow 9s linear infinite; }
      @media (prefers-reduced-motion: reduce) { .pf-site-backdrop * { animation: none !important; } }
    `}</style>
    <div className="pf-wash-a" style={{ position: 'absolute', top: '-18vh', right: '-12vw', width: '62vw', height: '62vw', borderRadius: '50%', background: `radial-gradient(circle, ${D.jade.muted} 0%, ${D.jade.muted}00 62%)`, opacity: 0.85 }} />
    <div className="pf-wash-b" style={{ position: 'absolute', bottom: '-30vh', left: '-16vw', width: '58vw', height: '58vw', borderRadius: '50%', background: `radial-gradient(circle, ${D.text.gold}22 0%, ${D.text.gold}00 60%)` }} />
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `radial-gradient(circle, ${D.border.strong} 0.9px, transparent 1.3px)`,
        backgroundSize: '24px 24px',
        opacity: 0.45,
        WebkitMaskImage: 'radial-gradient(ellipse 75% 65% at 50% 35%, #000 20%, transparent 85%)',
        maskImage: 'radial-gradient(ellipse 75% 65% at 50% 35%, #000 20%, transparent 85%)'
      }}
    />
    <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      {PIPES.map((d) => (
        <g key={d}>
          <path d={d} fill="none" stroke={D.border.default} strokeWidth="1.25" />
          <path className="pf-pipe-flow" d={d} fill="none" stroke={D.jade[500]} strokeOpacity="0.32" strokeWidth="1.25" strokeDasharray="14 146" strokeLinecap="round" />
        </g>
      ))}
      {NOZZLES.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="3.5" fill={D.background.base} stroke={D.border.strong} strokeWidth="1.25" />
      ))}
    </svg>
  </div>
);
