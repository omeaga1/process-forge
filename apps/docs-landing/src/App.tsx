import React, { useState, useEffect } from 'react';
import { OsakaJadePalette } from '@process-forge/theme';
import {
  ReactorAnim,
  TankAnim,
  PumpAnim,
  injectEquipmentCSS
} from '@process-forge/canvas-ui';
import {
  Download,
  Terminal,
  ShieldCheck,
  Sparkles,
  Play,
  Pause,
  ExternalLink,
  Bot,
  Copy,
  Check,
  X,
  Boxes,
  Zap,
  Activity,
  Layers,
  Cpu,
  CheckCircle2,
  Wrench,
  ChevronRight,
  Eye,
  FileCode
} from 'lucide-react';

// ── Injected Keyframes for Discrete Packaging & Piping Streams ────────────────
const EXTRA_ANIM_CSS = `
  @keyframes pf-carousel-spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  @keyframes pf-plunge {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(12px); }
  }
  @keyframes pf-robot-arm {
    0%, 100% { transform: rotate(-4deg); }
    50% { transform: rotate(18deg); }
  }
  @keyframes pf-stream-flow {
    0% { stroke-dashoffset: 32; }
    100% { stroke-dashoffset: 0; }
  }
  @keyframes pf-conveyor-belt {
    0% { stroke-dashoffset: 20; }
    100% { stroke-dashoffset: 0; }
  }
  @keyframes pf-drip {
    0% { transform: translateY(0); opacity: 0; }
    30% { opacity: 1; }
    90% { transform: translateY(18px); opacity: 1; }
    100% { transform: translateY(20px); opacity: 0; }
  }
`;

function injectAllLandingCSS(): void {
  if (typeof document === 'undefined') return;
  injectEquipmentCSS();
  if (!document.getElementById('pf-landing-extra-anim-css')) {
    const s = document.createElement('style');
    s.id = 'pf-landing-extra-anim-css';
    s.textContent = EXTRA_ANIM_CSS;
    document.head.appendChild(s);
  }
}

// ── Discrete Animation SVG: Rotary Indexing Can Filler ────────────────────────
const RotaryFillerAnim: React.FC<{ stroke?: string; bg?: string; isRunning?: boolean }> = ({
  stroke = OsakaJadePalette.jade[400],
  bg = 'rgba(16, 185, 129, 0.08)',
  isRunning = true
}) => {
  return (
    <svg viewBox="0 0 160 140" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}>
      <rect x="25" y="105" width="110" height="24" rx="4" fill="rgba(30, 41, 59, 0.6)" stroke={stroke} strokeWidth="1.5" />
      <line x1="30" y1="117" x2="130" y2="117" stroke={OsakaJadePalette.border.default} strokeWidth="1" strokeDasharray="4 2" />
      <circle cx="80" cy="62" r="38" fill={bg} stroke={stroke} strokeWidth="2" />
      <circle cx="80" cy="62" r="12" fill={OsakaJadePalette.background.surfaceElevated} stroke={stroke} strokeWidth="1.5" />
      <g style={{ transformOrigin: '80px 62px', animation: isRunning ? 'pf-carousel-spin 7s linear infinite' : 'none' }}>
        {[0, 60, 120, 180, 240, 300].map((deg, i) => {
          const rad = (deg * Math.PI) / 180;
          const cx = 80 + 26 * Math.cos(rad);
          const cy = 62 + 26 * Math.sin(rad);
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r="7" fill="rgba(56, 189, 248, 0.2)" stroke="#38bdf8" strokeWidth="1.2" />
              <circle cx={cx} cy={cy} r="3.5" fill={OsakaJadePalette.jade[400]} />
            </g>
          );
        })}
      </g>
      <path d="M 74 12 L 86 12 L 84 28 L 76 28 Z" fill={stroke} stroke={stroke} strokeWidth="1" />
      <line x1="80" y1="28" x2="80" y2="38" stroke={OsakaJadePalette.jade.glow} strokeWidth="2.5" strokeLinecap="round" />
      {isRunning && (
        <circle cx="80" cy="38" r="2.5" fill={OsakaJadePalette.jade[300]} style={{ animation: 'pf-drip 1.2s ease-in infinite' }} />
      )}
      <path d="M 25 62 Q 45 62 52 48" fill="none" stroke={stroke} strokeWidth="1.5" strokeDasharray="3 2" />
      <path d="M 135 62 Q 115 62 108 76" fill="none" stroke={stroke} strokeWidth="1.5" strokeDasharray="3 2" />
      <text x="80" y="121" textAnchor="middle" fontSize="8" fill={OsakaJadePalette.text.muted} style={{ fontWeight: 600 }}>
        ROTARY INDEXER
      </text>
    </svg>
  );
};

// ── Discrete Animation SVG: Vacuum Chuck Capper ───────────────────────────────
const CapperAnim: React.FC<{ stroke?: string; bg?: string; isRunning?: boolean }> = ({
  stroke = OsakaJadePalette.jade[400],
  bg = 'rgba(16, 185, 129, 0.08)',
  isRunning = true
}) => {
  return (
    <svg viewBox="0 0 160 140" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}>
      <rect x="35" y="15" width="10" height="110" fill={OsakaJadePalette.background.surfaceElevated} stroke={stroke} strokeWidth="1.5" />
      <rect x="25" y="120" width="110" height="12" rx="2" fill="rgba(30, 41, 59, 0.6)" stroke={stroke} strokeWidth="1.5" />
      <rect x="35" y="15" width="75" height="22" rx="4" fill={bg} stroke={stroke} strokeWidth="1.5" />
      <text x="72" y="29" textAnchor="middle" fontSize="7.5" fill={stroke} fontWeight="700">
        SERVO TORQUE
      </text>
      <g style={{ animation: isRunning ? 'pf-plunge 2s ease-in-out infinite' : 'none' }}>
        <rect x="67" y="37" width="8" height="24" fill={stroke} />
        <path d="M 57 61 L 85 61 L 80 73 L 62 73 Z" fill={OsakaJadePalette.jade[500]} stroke={stroke} strokeWidth="1.5" />
        <line x1="59" y1="73" x2="83" y2="73" stroke={OsakaJadePalette.jade.glow} strokeWidth="2" />
      </g>
      <rect x="61" y="86" width="20" height="34" rx="2" fill="rgba(56, 189, 248, 0.2)" stroke="#38bdf8" strokeWidth="1.5" />
      <line x1="61" y1="96" x2="81" y2="96" stroke="#38bdf8" strokeWidth="1" strokeDasharray="2 1" />
      <rect x="98" y="65" width="46" height="20" rx="3" fill={OsakaJadePalette.background.surfaceElevated} stroke={OsakaJadePalette.border.default} />
      <text x="121" y="78" textAnchor="middle" fontSize="7.5" fill={OsakaJadePalette.jade[300]} fontWeight="700">
        3.2 N·m
      </text>
      <text x="70" y="129" textAnchor="middle" fontSize="8" fill={OsakaJadePalette.text.muted} style={{ fontWeight: 600 }}>
        VACUUM CHUCK
      </text>
    </svg>
  );
};

// ── Discrete Animation SVG: Articulated Palletizer Robot ──────────────────────
const PalletizerAnim: React.FC<{ stroke?: string; bg?: string; isRunning?: boolean }> = ({
  stroke = OsakaJadePalette.jade[400],
  bg = 'rgba(16, 185, 129, 0.08)',
  isRunning = true
}) => {
  return (
    <svg viewBox="0 0 160 140" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}>
      <rect x="80" y="116" width="65" height="6" fill="#854d0e" stroke="#ca8a04" strokeWidth="1" rx="1" />
      <rect x="84" y="122" width="10" height="6" fill="#713f12" />
      <rect x="108" y="122" width="10" height="6" fill="#713f12" />
      <rect x="131" y="122" width="10" height="6" fill="#713f12" />
      <rect x="83" y="100" width="28" height="16" rx="2" fill="rgba(45, 212, 191, 0.25)" stroke={stroke} strokeWidth="1.2" />
      <rect x="114" y="100" width="28" height="16" rx="2" fill="rgba(45, 212, 191, 0.25)" stroke={stroke} strokeWidth="1.2" />
      <rect x="85" y="84" width="28" height="16" rx="2" fill="rgba(56, 189, 248, 0.25)" stroke="#38bdf8" strokeWidth="1.2" />
      <rect x="20" y="95" width="26" height="33" rx="4" fill={bg} stroke={stroke} strokeWidth="1.5" />
      <circle cx="33" cy="95" r="8" fill={stroke} />
      <g style={{ transformOrigin: '33px 95px', animation: isRunning ? 'pf-robot-arm 3.2s ease-in-out infinite' : 'none' }}>
        <line x1="33" y1="95" x2="48" y2="48" stroke={stroke} strokeWidth="5" strokeLinecap="round" />
        <circle cx="48" cy="48" r="6" fill={OsakaJadePalette.background.surfaceElevated} stroke={stroke} strokeWidth="2" />
        <line x1="48" y1="48" x2="88" y2="42" stroke={stroke} strokeWidth="4" strokeLinecap="round" />
        <circle cx="88" cy="42" r="5" fill={stroke} />
        <line x1="88" y1="42" x2="88" y2="56" stroke={stroke} strokeWidth="2.5" />
        <rect x="80" y="56" width="16" height="4" fill={OsakaJadePalette.status.busy} />
        <rect x="76" y="60" width="24" height="14" rx="2" fill="rgba(245, 158, 11, 0.3)" stroke={OsakaJadePalette.status.busy} strokeWidth="1.2" />
      </g>
      <text x="33" y="122" textAnchor="middle" fontSize="7" fill={OsakaJadePalette.text.muted} fontWeight="600">
        3-AXIS ARM
      </text>
    </svg>
  );
};

// ── Unit Operation Data Model for Interactive Flowsheet ───────────────────────
interface FlowsheetUnitOp {
  id: string;
  tag: string;
  name: string;
  category: 'Continuous' | 'Surge' | 'Discrete';
  subAgentName: string;
  subAgentRole: string;
  statusBadge: string;
  statusType: 'healthy' | 'alert' | 'tuning';
  metrics: { label: string; value: string }[];
  nozzles: { tag: string; size: string; rating: string; service: string }[];
  internals: string;
  agentLog: string;
  formula: string;
}

const FLOWSHEET_UNITS: FlowsheetUnitOp[] = [
  {
    id: 'rx101',
    tag: 'RX-101',
    name: 'Mixer / Reactor 01',
    category: 'Continuous',
    subAgentName: 'Agent RheoBot',
    subAgentRole: 'Continuous Rheology & Reaction Kinetics',
    statusBadge: 'Active (Viscosity Tuning)',
    statusType: 'tuning',
    metrics: [
      { label: 'Viscosity', value: '1,200 cP' },
      { label: 'Temperature', value: '24.5 °C' },
      { label: 'Impeller Speed', value: '180 RPM' }
    ],
    nozzles: [
      { tag: 'N1', size: '3" NPS', rating: 'ASME 150# RF', service: 'Feed Slurry Infeed' },
      { tag: 'N2', size: '2" NPS', rating: 'ASME 150# RF', service: 'Discharge to Pump' },
      { tag: 'N3', size: '1" NPS', rating: 'ASME 300# RTJ', service: 'Steam Jacket Supply' },
      { tag: 'N4', size: '1" NPS', rating: 'ASME 300# RTJ', service: 'Jacket Condensate' }
    ],
    internals: 'Rushton Turbine (6-Blade) • Full ASME Steam Heating Jacket • 4 Wall Baffles',
    agentLog: 'Calibrated Rushton turbine to 180 RPM. Shear rate maintains uniform pigment suspension without thermal polymer degradation. Mass balance Δm = 0.000 kg/s.',
    formula: 'dC_A/dt = (C_Ain - C_A)/τ - k·C_A²  |  μ = μ₀·exp(E_a/RT)'
  },
  {
    id: 'p101',
    tag: 'P-101',
    name: 'Slurry Transfer Pump 01',
    category: 'Continuous',
    subAgentName: 'Agent HydraPump',
    subAgentRole: 'Centrifugal Hydraulics & NPSH Supervisor',
    statusBadge: 'Nominal (NPSH Margin 2.8m)',
    statusType: 'healthy',
    metrics: [
      { label: 'Flow Rate', value: '45.2 L/min' },
      { label: 'Total Head', value: '18.2 m' },
      { label: 'Shaft Power', value: '3.4 kW (88%)' }
    ],
    nozzles: [
      { tag: 'Suction', size: '3" NPS', rating: 'ASME 150# RF', service: 'Infeed from RX-101' },
      { tag: 'Discharge', size: '2" NPS', rating: 'ASME 150# RF', service: 'Header to Surge Tank' }
    ],
    internals: 'Semi-Open Impeller for High-Solids Slurry • Mechanical Seal Flush Plan 11',
    agentLog: 'Monitoring suction head. Available NPSH = 4.6 m vs required 1.8 m. Cavitation probability: 0.0%. Dynamic VFD adjusted to buffer inflow demand.',
    formula: 'H = H_shutoff - k_loss·Q²  |  NPSH_avail = (P_suction - P_vap)/(ρ·g)'
  },
  {
    id: 'tk102',
    tag: 'TK-102',
    name: 'Surge / Buffer Tank 01',
    category: 'Surge',
    subAgentName: 'Agent BufferMaster',
    subAgentRole: 'Continuous-to-Discrete Decoupling',
    statusBadge: 'Damped (Dynamic Level 74%)',
    statusType: 'healthy',
    metrics: [
      { label: 'Vessel Volume', value: '2,500 L' },
      { label: 'Current Level', value: '74.2% (1,855 L)' },
      { label: 'Static Head', value: '1.85 m' }
    ],
    nozzles: [
      { tag: 'N1', size: '2" NPS', rating: 'ASME 150# RF', service: 'Pump Discharge Infeed' },
      { tag: 'N2', size: '2" NPS', rating: 'ASME 150# RF', service: 'Bottom Outlet to Filler' },
      { tag: 'N3', size: '1.5" NPS', rating: 'Atmospheric Vent', service: 'HEPA Sterile Breather' }
    ],
    internals: 'Vortex Breaker Plate on Bottom Nozzle • Guided Wave Radar Level Sensor',
    agentLog: 'Buffer dampening active: Absorbs up to 14.8 minutes of packaging downtime before requiring upstream reactor throttling. Feed control valve steady at 68%.',
    formula: 'dh/dt = (Q_in - Q_out) / A_tank  |  P_hydrostatic = ρ·g·h'
  },
  {
    id: 'fl201',
    tag: 'FL-201',
    name: 'Rotary Filler 01',
    category: 'Discrete',
    subAgentName: 'Agent FillOptima',
    subAgentRole: 'Discrete Gravimetric Indexing',
    statusBadge: 'Bottleneck (91% Backpressure)',
    statusType: 'alert',
    metrics: [
      { label: 'Production Rate', value: '180 cans/min' },
      { label: 'Fill Accuracy', value: '±0.5 g' },
      { label: 'Backpressure', value: '91% (Critical)' }
    ],
    nozzles: [
      { tag: 'Infeed', size: '2" NPS', rating: 'Sanitary Tri-Clamp', service: 'Pressurized Liquid Supply' },
      { tag: 'Nozzles 1-6', size: '0.75" OD', rating: 'Diving Cutoff', service: 'Anti-Drip Fill Heads' }
    ],
    internals: '6-Station Servo Rotary Carousel • Diving Nozzles with Bottom-Up Fill Profile',
    agentLog: 'Identified downstream accumulation queue at Vacuum Capper. Backpressure exceeds 90%. Recommended accelerating capper conveyor by 8% or staggering infeed.',
    formula: 'T_cycle = t_index + t_tare + t_fill + t_cutoff  |  λ_Poisson = 3.0 cans/s'
  },
  {
    id: 'cp202',
    tag: 'CP-202',
    name: 'Vacuum Capper 01',
    category: 'Discrete',
    subAgentName: 'Agent TorqueGuard',
    subAgentRole: 'Hermetic Crimp & Vacuum Verification',
    statusBadge: 'Nominal (99.85% Integrity)',
    statusType: 'healthy',
    metrics: [
      { label: 'Applied Torque', value: '3.2 N·m' },
      { label: 'Chamber Vacuum', value: '-0.68 bar' },
      { label: 'Seal Integrity', value: '99.85%' }
    ],
    nozzles: [
      { tag: 'Vacuum Port', size: '1" NPT', rating: 'Vacuum Rated', service: 'Headspace Evacuation' },
      { tag: 'N2 Flush', size: '0.5" Swagelok', rating: 'Double-Ferrule', service: 'Inert Headspace Blanketing' }
    ],
    internals: 'Magnetic Clutch Chuck Head • Piezoelectric Strain Gauge Torque Transducer',
    agentLog: 'Real-time torque verified against ASTM D3198. Mean torque 3.21 N·m (σ = 0.04). 0 crimp rejects in past 1,000 cycles. Synchronized with starwheel outfeed.',
    formula: 'τ_seal = μ_thread·F_crimp·r_mean  |  P_residual = P_atm - ΔP_vac'
  },
  {
    id: 'pl301',
    tag: 'PL-301',
    name: 'Robot Palletizer 01',
    category: 'Discrete',
    subAgentName: 'Agent StackPlanner',
    subAgentRole: 'End-of-Line Discrete Pallet Logistics',
    statusBadge: 'Active (Tier 3/5 Interlock)',
    statusType: 'healthy',
    metrics: [
      { label: 'Cycle Time', value: '4.8 s / pail' },
      { label: 'Stack Pattern', value: '5-Tier Interlock' },
      { label: 'Completed Pallets', value: '14 units' }
    ],
    nozzles: [
      { tag: 'Pneumatics', size: '0.5" BSPP', rating: '100 PSI Dry Air', service: 'Vacuum Venturi Gripper' }
    ],
    internals: '3-Axis Articulated Arm • Multi-Zone Vacuum Sponge Tooling • Slip-Sheet Feeder',
    agentLog: 'Pallet stack stability index: 98.4%. Interlocking tier pattern active. Auto-dispensing corrugate slip-sheet at tier 4 completion. Outfeed conveyor clear.',
    formula: 'COG_stack = Σ(m_i·z_i)/Σ(m_i)  |  Throughput = 750 pails/hr'
  }
];

interface PlatformInfo {
  name: string;
  os: 'windows' | 'macos' | 'linux' | 'unknown';
  extension: string;
  filename: string;
  downloadUrl: string;
  instruction: string;
}

export const App: React.FC = () => {
  const [platform, setPlatform] = useState<PlatformInfo>({
    name: 'Windows',
    os: 'windows',
    extension: '.zip / .msi',
    filename: 'process-forge-windows-portable-x64.zip',
    downloadUrl: 'https://github.com/omeaga1/process-forge/releases/download/v0.1.0/process-forge-windows-portable-x64.zip',
    instruction: 'Windows 10 / 11 (64-bit Portable x64 & MSI)'
  });

  const [isOtherModalOpen, setIsOtherModalOpen] = useState<boolean>(false);
  const [copiedSnippet, setCopiedSnippet] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'claude' | 'gemini'>('claude');

  // Interactive Flowsheet State
  const [selectedUnitId, setSelectedUnitId] = useState<string>('rx101');
  const [isSimRunning, setIsSimRunning] = useState<boolean>(true);
  const [clockSeconds, setClockSeconds] = useState<number>(252.4);

  // Interactive Sub-Agent CAD Showcase Tab State
  const [cadStudioTab, setCadStudioTab] = useState<'rx101' | 'tk102' | 'fl201'>('rx101');
  const [cadViewMode, setCadViewMode] = useState<'visual' | 'code'>('visual');

  useEffect(() => {
    injectAllLandingCSS();

    const userAgent = window.navigator.userAgent.toLowerCase();
    const platformStr = window.navigator.platform?.toLowerCase() || '';

    if (platformStr.includes('mac') || userAgent.includes('macintosh') || userAgent.includes('mac os x')) {
      setPlatform({
        name: 'macOS',
        os: 'macos',
        extension: '.dmg',
        filename: 'ProcessForge_0.1.0_universal.dmg',
        downloadUrl: 'https://github.com/omeaga1/process-forge/releases/tag/v0.1.0',
        instruction: 'macOS 12+ (Apple Silicon & Intel DMG)'
      });
    } else if (platformStr.includes('linux') || userAgent.includes('linux')) {
      setPlatform({
        name: 'Linux',
        os: 'linux',
        extension: '.AppImage',
        filename: 'ProcessForge_0.1.0_amd64.AppImage',
        downloadUrl: 'https://github.com/omeaga1/process-forge/releases/tag/v0.1.0',
        instruction: 'Linux x86_64 AppImage (Ubuntu / Debian / Fedora / Arch)'
      });
    } else {
      // Default to Windows
      setPlatform({
        name: 'Windows',
        os: 'windows',
        extension: '.zip / .msi',
        filename: 'process-forge-windows-portable-x64.zip',
        downloadUrl: 'https://github.com/omeaga1/process-forge/releases/download/v0.1.0/process-forge-windows-portable-x64.zip',
        instruction: 'Windows 10 / 11 (64-bit Portable x64 & MSI)'
      });
    }
  }, []);

  // Clock ticker for live simulation feeling
  useEffect(() => {
    if (!isSimRunning) return;
    const interval = setInterval(() => {
      setClockSeconds((prev) => prev + 0.1);
    }, 100);
    return () => clearInterval(interval);
  }, [isSimRunning]);

  const formatClock = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  };

  const selectedUnit: FlowsheetUnitOp = FLOWSHEET_UNITS.find((u) => u.id === selectedUnitId) ?? FLOWSHEET_UNITS[0]!;

  const claudeConfigSnippet = `{
  "mcpServers": {
    "process-forge": {
      "command": "npx",
      "args": ["-y", "@process-forge/mcp-server"]
    }
  }
}`;

  const geminiConfigSnippet = `# Add ProcessForge to Gemini CLI or local agent stdio:
gemini mcp add process-forge -- npx -y @process-forge/mcp-server`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: OsakaJadePalette.background.base,
        color: OsakaJadePalette.text.primary,
        fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Top Header Navigation */}
      <header
        style={{
          borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`,
          backgroundColor: `${OsakaJadePalette.background.surface}cc`,
          backdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          padding: '14px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: `linear-gradient(135deg, ${OsakaJadePalette.jade[400]}, ${OsakaJadePalette.jade[600]})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 0 16px ${OsakaJadePalette.jade.glow}44`
            }}
          >
            <Boxes size={18} color="#0c1214" />
          </div>
          <div>
            <span style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.02em', color: OsakaJadePalette.text.primary }}>
              PROCESS<span style={{ color: OsakaJadePalette.jade[400] }}>FORGE</span>
            </span>
            <span
              style={{
                marginLeft: '8px',
                fontSize: '0.68rem',
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: `${OsakaJadePalette.jade.muted}`,
                color: OsakaJadePalette.jade[300],
                border: `1px solid ${OsakaJadePalette.jade[700]}`
              }}
            >
              v0.1.0-alpha
            </span>
          </div>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <a
            href="#features"
            style={{ color: OsakaJadePalette.text.secondary, textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}
          >
            Features
          </a>
          <a
            href="#mcp"
            style={{ color: OsakaJadePalette.text.secondary, textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}
          >
            MCP Protocol
          </a>
          <a
            href="#architecture"
            style={{ color: OsakaJadePalette.text.secondary, textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}
          >
            Architecture
          </a>
          <a
            href="https://github.com/omeaga1/process-forge"
            target="_blank"
            rel="noreferrer"
            style={{
              color: OsakaJadePalette.text.secondary,
              textDecoration: 'none',
              fontSize: '0.9rem',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            GitHub <ExternalLink size={13} />
          </a>

          <a
            href="./studio/"
            onClick={(e) => {
              // Graceful fallback for local development or subpath hosting
              if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                e.preventDefault();
                window.location.href = 'http://localhost:3000';
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '6px',
              backgroundColor: OsakaJadePalette.background.surfaceHover,
              color: OsakaJadePalette.jade[300],
              border: `1px solid ${OsakaJadePalette.jade[700]}`,
              textDecoration: 'none',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Play size={14} />
            Web Studio (Guest)
          </a>
        </nav>
      </header>

      {/* Hero Showcase Section */}
      <section
        style={{
          position: 'relative',
          padding: '80px 24px 60px',
          textAlign: 'center',
          maxWidth: '1200px',
          margin: '0 auto',
          width: '100%'
        }}
      >
        {/* Glow ambient circle */}
        <div
          style={{
            position: 'absolute',
            top: '40px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '600px',
            height: '240px',
            background: `radial-gradient(ellipse at center, ${OsakaJadePalette.jade[500]}22 0%, transparent 70%)`,
            pointerEvents: 'none',
            zIndex: 0
          }}
        />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '20px',
              backgroundColor: `${OsakaJadePalette.background.surfaceElevated}`,
              border: `1px solid ${OsakaJadePalette.border.glow}55`,
              color: OsakaJadePalette.jade[300],
              fontSize: '0.8rem',
              fontWeight: 600,
              marginBottom: '24px'
            }}
          >
            <Sparkles size={14} color={OsakaJadePalette.jade[400]} />
            The AI Software Engineer for Physical Process Simulation
          </div>

          <h1
            style={{
              fontSize: 'clamp(2.5rem, 5vw, 4.2rem)',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              lineHeight: 1.15,
              marginBottom: '24px',
              maxWidth: '960px',
              margin: '0 auto 24px'
            }}
          >
            Design, Simulate, and Optimize{' '}
            <span
              style={{
                background: `linear-gradient(135deg, ${OsakaJadePalette.jade[300]} 0%, ${OsakaJadePalette.jade[500]} 100%)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}
            >
              Industrial Twins
            </span>{' '}
            with Autonomous Agents
          </h1>

          <p
            style={{
              fontSize: '1.15rem',
              color: OsakaJadePalette.text.secondary,
              lineHeight: 1.6,
              maxWidth: '780px',
              margin: '0 auto 40px',
              fontWeight: 400
            }}
          >
            Process engineers shouldn't have to write Python glue code or struggle with brittle legacy software.
            ProcessForge combines continuous and discrete-event simulation with an AI agent in every machine,
            backed by local Model Context Protocol (MCP) orchestration.
          </p>

          {/* Download & Launch Call to Actions */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              marginBottom: '16px'
            }}
          >
            {/* Primary OS Detected Download Button */}
            <a
              href={platform.downloadUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px 28px',
                borderRadius: '8px',
                background: `linear-gradient(135deg, ${OsakaJadePalette.jade[500]}, ${OsakaJadePalette.jade[600]})`,
                color: OsakaJadePalette.text.inverse,
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '1rem',
                boxShadow: `0 4px 20px ${OsakaJadePalette.jade[500]}44`,
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                cursor: 'pointer'
              }}
            >
              <Download size={20} color={OsakaJadePalette.text.inverse} />
              <div style={{ textAlign: 'left' }}>
                <div>Download for {platform.name} ({platform.extension})</div>
                <div style={{ fontSize: '0.72rem', opacity: 0.85, fontWeight: 500 }}>{platform.instruction}</div>
              </div>
            </a>

            {/* Direct Web Studio Guest Launcher */}
            <a
              href="./studio/"
              onClick={(e) => {
                if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                  e.preventDefault();
                  window.location.href = 'http://localhost:3000';
                }
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                padding: '14px 24px',
                borderRadius: '8px',
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                border: `1px solid ${OsakaJadePalette.border.default}`,
                color: OsakaJadePalette.text.primary,
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '0.98rem',
                cursor: 'pointer'
              }}
            >
              <Play size={18} color={OsakaJadePalette.jade[400]} />
              Launch Web Studio (Guest Mode)
            </a>
          </div>

          {/* Quick Direct Platform Download Chips */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              marginTop: '8px',
              marginBottom: '16px'
            }}
          >
            <span style={{ fontSize: '0.78rem', color: OsakaJadePalette.text.muted }}>Direct Native Downloads:</span>
            <a
              href="https://github.com/omeaga1/process-forge/releases/download/v0.1.0/process-forge-windows-portable-x64.zip"
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '6px',
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                border: `1px solid ${OsakaJadePalette.jade[600]}`,
                color: OsakaJadePalette.jade[300],
                fontSize: '0.78rem',
                fontWeight: 700,
                textDecoration: 'none',
                boxShadow: `0 0 10px ${OsakaJadePalette.jade.glow}22`
              }}
            >
              <Download size={13} color={OsakaJadePalette.jade[400]} /> Windows (.zip Portable)
            </a>
            <a
              href="https://github.com/omeaga1/process-forge/releases/tag/v0.1.0"
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '6px',
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                border: `1px solid ${OsakaJadePalette.border.default}`,
                color: OsakaJadePalette.text.secondary,
                fontSize: '0.78rem',
                fontWeight: 500,
                textDecoration: 'none'
              }}
            >
              <Download size={13} /> Windows MSI & Native Installers
            </a>
            <a
              href="https://github.com/omeaga1/process-forge/releases/tag/v0.1.0"
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '6px',
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                border: `1px solid ${OsakaJadePalette.border.default}`,
                color: OsakaJadePalette.text.secondary,
                fontSize: '0.78rem',
                fontWeight: 500,
                textDecoration: 'none'
              }}
            >
              <Download size={13} /> macOS (.dmg) & Linux
            </a>
          </div>

          {/* Platform Switcher & Version Meta */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              fontSize: '0.82rem',
              color: OsakaJadePalette.text.muted
            }}
          >
            <span>v0.1.0 • Free & Open Source (Apache 2.0)</span>
            <span>•</span>
            <button
              onClick={() => setIsOtherModalOpen(true)}
              style={{
                background: 'none',
                border: 'none',
                color: OsakaJadePalette.jade[400],
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0,
                font: 'inherit',
                fontSize: '0.82rem'
              }}
            >
              View all checksums & packages
            </button>
            <span>•</span>
            <span>Zero login required to test</span>
          </div>
        </div>

        {/* ── LIVE ANIMATED PFD FLOWSHEET SHOWCASE ─────────────────────────── */}
        <div
          id="flowsheet"
          style={{
            marginTop: '50px',
            borderRadius: '12px',
            border: `1px solid ${OsakaJadePalette.border.default}`,
            backgroundColor: OsakaJadePalette.background.canvas,
            overflow: 'hidden',
            boxShadow: `0 24px 48px rgba(0,0,0,0.5), 0 0 24px ${OsakaJadePalette.jade.glow}18`,
            position: 'relative'
          }}
        >
          {/* Flowsheet Top Studio Bar */}
          <div
            style={{
              padding: '12px 20px',
              backgroundColor: OsakaJadePalette.background.surface,
              borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f43f5e' }} />
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10b981' }} />
              </div>
              <span style={{ fontSize: '0.82rem', color: OsakaJadePalette.text.primary, fontWeight: 700, marginLeft: '6px' }}>
                Industrial Paint Canning Flowsheet (PFD)
              </span>
              <span
                style={{
                  fontSize: '0.7rem',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  color: OsakaJadePalette.jade[400],
                  border: `1px solid ${OsakaJadePalette.border.default}`
                }}
              >
                Hybrid Continuous ODE & Discrete DES
              </span>
            </div>

            {/* Simulation Controls & Live DES Clock */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <button
                onClick={() => setIsSimRunning(!isSimRunning)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  backgroundColor: isSimRunning ? OsakaJadePalette.background.surfaceElevated : OsakaJadePalette.jade[500],
                  color: isSimRunning ? OsakaJadePalette.jade[300] : '#000',
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {isSimRunning ? <Pause size={12} /> : <Play size={12} />}
                {isSimRunning ? 'Pause Sim' : 'Resume Sim'}
              </button>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.75rem',
                  color: OsakaJadePalette.jade[400]
                }}
              >
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: isSimRunning ? OsakaJadePalette.jade[400] : OsakaJadePalette.status.starved }} />
                DES Clock: {formatClock(clockSeconds)}
              </div>

              <span style={{ fontSize: '0.72rem', color: OsakaJadePalette.text.muted }}>
                Click any vessel to inspect Sub-Agent CAD
              </span>
            </div>
          </div>

          {/* Process Flow Diagram Canvas */}
          <div
            style={{
              padding: '30px 20px 20px',
              position: 'relative',
              overflowX: 'auto'
            }}
          >
            {/* Grid Dots */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `radial-gradient(${OsakaJadePalette.border.default} 1px, transparent 1px)`,
                backgroundSize: '24px 24px',
                opacity: 0.45,
                pointerEvents: 'none'
              }}
            />

            {/* Animated Flow Layout */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                minWidth: '980px',
                gap: '8px',
                position: 'relative',
                zIndex: 1
              }}
            >
              {FLOWSHEET_UNITS.map((unit, index) => {
                const isSelected = unit.id === selectedUnitId;
                const isBottleneck = unit.statusType === 'alert';

                // Choose the right physical SVG component
                let animComp: React.ReactNode;
                if (unit.id === 'rx101') {
                  animComp = <ReactorAnim isRunning={isSimRunning} hasJacket={true} agitatorType="rushton" />;
                } else if (unit.id === 'p101') {
                  animComp = <PumpAnim isRunning={isSimRunning} />;
                } else if (unit.id === 'tk102') {
                  animComp = <TankAnim isRunning={isSimRunning} levelPercent={74} />;
                } else if (unit.id === 'fl201') {
                  animComp = <RotaryFillerAnim isRunning={isSimRunning} />;
                } else if (unit.id === 'cp202') {
                  animComp = <CapperAnim isRunning={isSimRunning} />;
                } else {
                  animComp = <PalletizerAnim isRunning={isSimRunning} />;
                }

                return (
                  <React.Fragment key={unit.id}>
                    {/* Unit Op Vessel Card */}
                    <div
                      onClick={() => setSelectedUnitId(unit.id)}
                      style={{
                        flex: '1 1 145px',
                        maxWidth: '170px',
                        backgroundColor: isSelected ? OsakaJadePalette.background.surfaceElevated : OsakaJadePalette.background.surface,
                        border: isSelected
                          ? `2px solid ${OsakaJadePalette.jade[400]}`
                          : isBottleneck
                          ? `1px solid ${OsakaJadePalette.status.blocked}`
                          : `1px solid ${OsakaJadePalette.border.default}`,
                        borderRadius: '10px',
                        padding: '12px 10px',
                        textAlign: 'center',
                        cursor: 'pointer',
                        boxShadow: isSelected
                          ? `0 0 20px ${OsakaJadePalette.jade.glow}33`
                          : isBottleneck
                          ? `0 0 14px ${OsakaJadePalette.status.blocked}22`
                          : 'none',
                        transition: 'all 0.2s ease',
                        position: 'relative'
                      }}
                    >
                      {/* Top Category Badge */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span
                          style={{
                            fontSize: '0.62rem',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            color: unit.category === 'Continuous'
                              ? OsakaJadePalette.jade[400]
                              : unit.category === 'Surge'
                              ? '#38bdf8'
                              : isBottleneck
                              ? OsakaJadePalette.status.blocked
                              : OsakaJadePalette.jade[300]
                          }}
                        >
                          {unit.tag}
                        </span>
                        <span
                          style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            backgroundColor: isBottleneck
                              ? OsakaJadePalette.status.blocked
                              : unit.statusType === 'tuning'
                              ? OsakaJadePalette.jade[400]
                              : OsakaJadePalette.status.busy
                          }}
                        />
                      </div>

                      {/* Equipment Physical SVG Animation */}
                      <div
                        style={{
                          height: '92px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          margin: '4px 0'
                        }}
                      >
                        {animComp}
                      </div>

                      {/* Name & Primary Telemetry */}
                      <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: '2px', color: OsakaJadePalette.text.primary }}>
                        {unit.name}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: OsakaJadePalette.text.secondary }}>
                        {unit.metrics[0]?.value ?? ''}
                      </div>

                      {/* Sub-Agent Chip */}
                      <div
                        style={{
                          marginTop: '8px',
                          fontSize: '0.64rem',
                          fontWeight: 600,
                          padding: '3px 6px',
                          borderRadius: '4px',
                          backgroundColor: isSelected ? `${OsakaJadePalette.jade.muted}` : OsakaJadePalette.background.base,
                          color: isSelected ? OsakaJadePalette.jade[300] : OsakaJadePalette.text.muted,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px'
                        }}
                      >
                        <Bot size={11} /> {unit.subAgentName}
                      </div>
                    </div>

                    {/* Animated Stream Connector between Units */}
                    {index < FLOWSHEET_UNITS.length - 1 && (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '32px',
                          flexShrink: 0
                        }}
                      >
                        <svg width="32" height="24" viewBox="0 0 32 24">
                          <line
                            x1="0"
                            y1="12"
                            x2="26"
                            y2="12"
                            stroke={index < 3 ? OsakaJadePalette.streams.continuousFluid : OsakaJadePalette.streams.discreteContainer}
                            strokeWidth="2"
                            strokeDasharray={index < 3 ? '6 3' : '3 3'}
                            style={{
                              animation: isSimRunning
                                ? index < 3
                                  ? 'pf-stream-flow 1.5s linear infinite'
                                  : 'pf-conveyor-belt 1.2s linear infinite'
                                : 'none'
                            }}
                          />
                          <polygon
                            points="26,8 32,12 26,16"
                            fill={index < 3 ? OsakaJadePalette.streams.continuousFluid : OsakaJadePalette.streams.discreteContainer}
                          />
                        </svg>
                        <span style={{ fontSize: '0.55rem', color: OsakaJadePalette.text.muted, marginTop: '2px', whiteSpace: 'nowrap' }}>
                          {index < 2 ? 'Slurry' : index === 2 ? 'Feed' : 'Cans'}
                        </span>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* ── SUB-AGENT TELEMETRY & CAD DRESSING DRAWER ─────────────────── */}
            <div
              style={{
                marginTop: '24px',
                borderRadius: '8px',
                backgroundColor: OsakaJadePalette.background.surface,
                border: `1px solid ${OsakaJadePalette.jade[600]}88`,
                padding: '18px 20px',
                textAlign: 'left',
                boxShadow: `0 8px 24px rgba(0,0,0,0.4)`
              }}
            >
              {/* Drawer Header */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`,
                  paddingBottom: '12px',
                  marginBottom: '16px',
                  gap: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      backgroundColor: OsakaJadePalette.background.surfaceElevated,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: OsakaJadePalette.jade[400]
                    }}
                  >
                    <Bot size={18} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.98rem' }}>{selectedUnit.name}</span>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: selectedUnit.statusType === 'alert' ? '#ef444422' : `${OsakaJadePalette.jade.muted}`,
                          color: selectedUnit.statusType === 'alert' ? OsakaJadePalette.status.blocked : OsakaJadePalette.jade[300],
                          border: `1px solid ${selectedUnit.statusType === 'alert' ? OsakaJadePalette.status.blocked : OsakaJadePalette.jade[700]}`
                        }}
                      >
                        {selectedUnit.statusBadge}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: OsakaJadePalette.text.secondary }}>
                      {selectedUnit.subAgentName} • {selectedUnit.subAgentRole}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontFamily: "'JetBrains Mono', monospace",
                      color: OsakaJadePalette.jade[400],
                      backgroundColor: OsakaJadePalette.background.base,
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: `1px solid ${OsakaJadePalette.border.default}`
                    }}
                  >
                    OAuth 2.0 PKCE • Zero Raw Keys
                  </span>
                  <a
                    href="./studio/"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      backgroundColor: OsakaJadePalette.jade[500],
                      color: OsakaJadePalette.text.inverse,
                      textDecoration: 'none',
                      fontSize: '0.78rem',
                      fontWeight: 700
                    }}
                  >
                    Open Machine Pop-Out Studio <ChevronRight size={14} />
                  </a>
                </div>
              </div>

              {/* 3-Column Telemetry & Dressing Layout */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '18px'
                }}
              >
                {/* Column 1: Live Physics Telemetry */}
                <div
                  style={{
                    backgroundColor: OsakaJadePalette.background.surfaceElevated,
                    borderRadius: '6px',
                    padding: '14px',
                    border: `1px solid ${OsakaJadePalette.border.default}`
                  }}
                >
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: OsakaJadePalette.jade[400], marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Activity size={13} /> LIVE PHYSICAL TELEMETRY
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                    {selectedUnit.metrics.map((m, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                        <span style={{ color: OsakaJadePalette.text.secondary }}>{m.label}:</span>
                        <span style={{ fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: OsakaJadePalette.text.primary }}>
                          {m.value}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: '0.68rem', fontFamily: "'JetBrains Mono', monospace", color: OsakaJadePalette.text.muted, borderTop: `1px solid ${OsakaJadePalette.border.subtle}`, paddingTop: '8px' }}>
                    Gov. ODE: <span style={{ color: OsakaJadePalette.jade[300] }}>{selectedUnit.formula}</span>
                  </div>
                </div>

                {/* Column 2: ASME B16.5 Nozzle Dressing */}
                <div
                  style={{
                    backgroundColor: OsakaJadePalette.background.surfaceElevated,
                    borderRadius: '6px',
                    padding: '14px',
                    border: `1px solid ${OsakaJadePalette.border.default}`
                  }}
                >
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: OsakaJadePalette.jade[400], marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Layers size={13} /> ASME B16.5 NOZZLE DRESSING
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                    {selectedUnit.nozzles.map((noz, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '0.74rem',
                          backgroundColor: OsakaJadePalette.background.base,
                          padding: '4px 8px',
                          borderRadius: '4px'
                        }}
                      >
                        <span style={{ fontWeight: 700, color: OsakaJadePalette.jade[300] }}>{noz.tag}</span>
                        <span style={{ color: OsakaJadePalette.text.secondary }}>{noz.size}</span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem', color: '#38bdf8' }}>
                          {noz.rating}
                        </span>
                        <span style={{ fontSize: '0.68rem', color: OsakaJadePalette.text.muted }}>{noz.service}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: OsakaJadePalette.text.muted, marginTop: '6px' }}>
                    Internals: <span style={{ color: OsakaJadePalette.text.secondary }}>{selectedUnit.internals}</span>
                  </div>
                </div>

                {/* Column 3: Sub-Agent Reasoning & Optimization Log */}
                <div
                  style={{
                    backgroundColor: OsakaJadePalette.background.surfaceElevated,
                    borderRadius: '6px',
                    padding: '14px',
                    border: `1px solid ${OsakaJadePalette.border.default}`
                  }}
                >
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: OsakaJadePalette.jade[400], marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Cpu size={13} /> SUB-AGENT AUTONOMOUS REASONING
                  </div>
                  <p style={{ fontSize: '0.78rem', color: OsakaJadePalette.text.secondary, lineHeight: 1.5, margin: 0, marginBottom: '10px' }}>
                    "{selectedUnit.agentLog}"
                  </p>
                  <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                    <button
                      onClick={() => alert(`Sub-Agent ${selectedUnit.subAgentName}: Recalibrated mass conservation PID loop for ${selectedUnit.name}.`)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        backgroundColor: OsakaJadePalette.background.surfaceHover,
                        border: `1px solid ${OsakaJadePalette.border.default}`,
                        color: OsakaJadePalette.jade[300],
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      Trigger Re-Tuning
                    </button>
                    <button
                      onClick={() => alert(`Sub-Agent ${selectedUnit.subAgentName}: Exported ASME B16.5 mechanical CAD specification.`)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        backgroundColor: OsakaJadePalette.background.surfaceHover,
                        border: `1px solid ${OsakaJadePalette.border.default}`,
                        color: OsakaJadePalette.text.secondary,
                        fontSize: '0.7rem',
                        cursor: 'pointer'
                      }}
                    >
                      Export Vector CAD
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Master Orchestrator Real-Time Banner */}
            <div
              style={{
                marginTop: '16px',
                padding: '10px 16px',
                borderRadius: '6px',
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                border: `1px solid ${OsakaJadePalette.jade[700]}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                textAlign: 'left'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Sparkles size={16} color={OsakaJadePalette.jade[400]} />
                <span style={{ fontSize: '0.82rem', color: OsakaJadePalette.text.primary, fontWeight: 600 }}>
                  Master Orchestrator:
                </span>
                <span style={{ fontSize: '0.82rem', color: OsakaJadePalette.text.secondary }}>
                  Continuous-to-discrete coupling balanced. TK-102 buffer level absorbs downstream canning delays while RX-101 operates at steady-state 180 RPM.
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: OsakaJadePalette.jade[300],
                  padding: '3px 8px',
                  borderRadius: '4px',
                  backgroundColor: OsakaJadePalette.jade.muted
                }}
              >
                MCP Multi-Agent Mesh Active
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── CORE FEATURES: 6 CRISP ENGINEERING PILLARS ───────────────────── */}
      <section
        id="features"
        style={{
          padding: '80px 24px 60px',
          maxWidth: '1240px',
          margin: '0 auto',
          width: '100%'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '50px' }}>
          <h2 style={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '12px' }}>
            Engineered for Chemical & Mechanical Systems
          </h2>
          <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '1.05rem', maxWidth: '680px', margin: '0 auto' }}>
            Not an LLM chatbot wrapper. ProcessForge is a high-performance simulation engine where autonomous agents function as software and process engineers.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: '24px'
          }}
        >
          {/* Pillar 1 */}
          <div
            style={{
              padding: '28px',
              borderRadius: '10px',
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`
            }}
          >
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '8px',
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '18px',
                color: OsakaJadePalette.jade[400]
              }}
            >
              <Cpu size={24} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '10px' }}>
              Dual Continuous & Discrete Solver
            </h3>
            <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '0.92rem', lineHeight: 1.6 }}>
              Run Runge-Kutta differential equations (ODEs for chemical kinetics, thermodynamics, and fluid rheology) on the exact same timeline as Poisson discrete-event simulation (conveyor queues, indexing starwheels, and robotic packaging).
            </p>
          </div>

          {/* Pillar 2 */}
          <div
            style={{
              padding: '28px',
              borderRadius: '10px',
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`
            }}
          >
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '8px',
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '18px',
                color: OsakaJadePalette.jade[400]
              }}
            >
              <Bot size={24} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '10px' }}>
              Autonomous Machine Sub-Agents
            </h3>
            <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '0.92rem', lineHeight: 1.6 }}>
              Every unit operation has its own embedded sub-agent pop-out studio. Sub-agents analyze mass and energy balances, calibrate PID loops, detect upstream bottlenecks, and coordinate with the plant-wide Master Orchestrator.
            </p>
          </div>

          {/* Pillar 3 */}
          <div
            style={{
              padding: '28px',
              borderRadius: '10px',
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`
            }}
          >
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '8px',
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '18px',
                color: OsakaJadePalette.jade[400]
              }}
            >
              <Layers size={24} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '10px' }}>
              Parametric ASME Dressing & CAD Synthesis
            </h3>
            <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '0.92rem', lineHeight: 1.6 }}>
              Dress physical equipment with real engineering specifications: ASME B16.5 flange ratings (150#, 300#, 600#), pipe diameters, internal baffles, and thermal jackets. Sub-agents synthesize production-ready vector CAD equipment drawings directly via OAuth/MCP without raw API keys.
            </p>
          </div>

          {/* Pillar 4 */}
          <div
            style={{
              padding: '28px',
              borderRadius: '10px',
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`
            }}
          >
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '8px',
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '18px',
                color: OsakaJadePalette.jade[400]
              }}
            >
              <Terminal size={24} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '10px' }}>
              Native Stdio Model Context Protocol (MCP)
            </h3>
            <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '0.92rem', lineHeight: 1.6 }}>
              Full stdio MCP server support. Connect Claude Desktop, Gemini CLI, Cursor, or local LLMs to query simulation telemetry, evaluate unit operations, and autogenerate industrial twins via natural language without vendor lock-in.
            </p>
          </div>

          {/* Pillar 5 */}
          <div
            style={{
              padding: '28px',
              borderRadius: '10px',
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`
            }}
          >
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '8px',
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '18px',
                color: OsakaJadePalette.jade[400]
              }}
            >
              <ShieldCheck size={24} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '10px' }}>
              Zero Plaintext Secrets & 100% Local Privacy
            </h3>
            <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '0.92rem', lineHeight: 1.6 }}>
              All simulation math executes locally via Rust and WebAssembly. AI integrations use secure OAuth 2.0 PKCE and native OS credential vaults (Windows DPAPI, macOS Keychain). Zero plaintext secrets, zero cloud telemetry, zero remote tracking.
            </p>
          </div>

          {/* Pillar 6 */}
          <div
            style={{
              padding: '28px',
              borderRadius: '10px',
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`
            }}
          >
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '8px',
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '18px',
                color: OsakaJadePalette.jade[400]
              }}
            >
              <Zap size={24} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '10px' }}>
              Native Tauri v2 Desktop & Instant Web Twin
            </h3>
            <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '0.92rem', lineHeight: 1.6 }}>
              Jump straight into the web studio as a guest in one click with zero paywalls. Download signed native desktop installers for Windows (MSI/EXE), macOS (DMG), and Linux (AppImage) with automatic background update detection.
            </p>
          </div>
        </div>
      </section>

      {/* ── INTERACTIVE SUB-AGENT POP-OUT CAD STUDIO SHOWCASE ─────────────── */}
      <section
        id="cad-studio"
        style={{
          padding: '60px 24px',
          backgroundColor: OsakaJadePalette.background.surface,
          borderTop: `1px solid ${OsakaJadePalette.border.subtle}`,
          borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`
        }}
      >
        <div style={{ maxWidth: '1240px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: '16px',
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                color: OsakaJadePalette.jade[400],
                fontSize: '0.78rem',
                fontWeight: 600,
                marginBottom: '16px'
              }}
            >
              <Wrench size={14} /> Sub-Agent Pop-Out Studio
            </div>
            <h2 style={{ fontSize: '2.1rem', fontWeight: 800, marginBottom: '12px' }}>
              Vector CAD Drawing Synthesis & Mechanical Dressing
            </h2>
            <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '1rem', maxWidth: '680px', margin: '0 auto' }}>
              Every machine on the flowsheet can be opened into a dedicated engineering studio. Sub-agents synthesize vector equipment drawings, calculate ASME nozzle schedules, and tune physical parameters in real time.
            </p>
          </div>

          {/* Machine Selection Tabs */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '24px' }}>
            {[
              { id: 'rx101', name: 'Continuous CSTR Reactor (RX-101)' },
              { id: 'tk102', name: 'Pressurized Surge Vessel (TK-102)' },
              { id: 'fl201', name: 'Rotary Canning Filler (FL-201)' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setCadStudioTab(tab.id as any)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: `1px solid ${cadStudioTab === tab.id ? OsakaJadePalette.jade[500] : OsakaJadePalette.border.default}`,
                  backgroundColor: cadStudioTab === tab.id ? OsakaJadePalette.background.surfaceElevated : 'transparent',
                  color: cadStudioTab === tab.id ? OsakaJadePalette.jade[300] : OsakaJadePalette.text.secondary,
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                {tab.name}
              </button>
            ))}
          </div>

          {/* Dual-Pane Studio Showcase Box */}
          <div
            style={{
              borderRadius: '10px',
              backgroundColor: OsakaJadePalette.background.canvas,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              overflow: 'hidden',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
            }}
          >
            {/* Left Pane: Sub-Agent Interactive Chat & Reasoning */}
            <div
              style={{
                padding: '24px',
                borderRight: `1px solid ${OsakaJadePalette.border.subtle}`,
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Bot size={18} color={OsakaJadePalette.jade[400]} />
                  <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                    Sub-Agent Conversation ({cadStudioTab.toUpperCase()})
                  </span>
                </div>
                <span style={{ fontSize: '0.7rem', color: OsakaJadePalette.jade[400], fontFamily: "'JetBrains Mono', monospace" }}>
                  MCP Stdio • Zero Raw Keys
                </span>
              </div>

              {/* Chat Log History */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                {/* User Message */}
                <div
                  style={{
                    backgroundColor: OsakaJadePalette.background.surfaceElevated,
                    borderRadius: '8px',
                    padding: '10px 14px',
                    fontSize: '0.82rem',
                    color: OsakaJadePalette.text.primary,
                    borderLeft: `3px solid ${OsakaJadePalette.jade[400]}`
                  }}
                >
                  <div style={{ fontSize: '0.7rem', color: OsakaJadePalette.text.muted, marginBottom: '2px' }}>Process Engineer</div>
                  {cadStudioTab === 'rx101' && 'Add an ASME 3-inch 150# RF infeed nozzle at top perimeter, full steam jacket at 150 PSI, and fit a Rushton impeller for high shear dispersion.'}
                  {cadStudioTab === 'tk102' && 'Equip this surge vessel with an atmospheric HEPA breather vent (N3), 2-inch bottom drain nozzle, and internal vortex breaker plate.'}
                  {cadStudioTab === 'fl201' && 'Synthesize CAD drawing for a 6-station rotary indexing carousel with 0.75-inch anti-drip diving cutoff nozzles and sanitary Tri-Clamp infeed.'}
                </div>

                {/* Sub-Agent Response */}
                <div
                  style={{
                    backgroundColor: OsakaJadePalette.background.surface,
                    borderRadius: '8px',
                    padding: '12px 14px',
                    fontSize: '0.82rem',
                    color: OsakaJadePalette.text.secondary,
                    border: `1px solid ${OsakaJadePalette.border.default}`
                  }}
                >
                  <div style={{ fontSize: '0.7rem', color: OsakaJadePalette.jade[400], fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Bot size={12} /> Autonomous Sub-Agent
                  </div>
                  {cadStudioTab === 'rx101' && (
                    <>
                      Validated ASME B16.5 flange schedule: N1 (3" NPS 150# RF, bolt circle 6.00"), N3/N4 jacket flanges (1" 300# RTJ).
                      Configured 6-blade Rushton turbine. Synthesized parametric SVG CAD drawing and updated dynamic viscosity kinetics model.
                    </>
                  )}
                  {cadStudioTab === 'tk102' && (
                    <>
                      ASME Section VIII Div 1 rules verified for atmospheric buffer vessel. Placed 2" 150# RF inlet/outlet nozzles and 1.5" HEPA vent.
                      Hydrostatic head equation updated: P = ρ·g·h. Vortex breaker anti-cavitation baffle integrated.
                    </>
                  )}
                  {cadStudioTab === 'fl201' && (
                    <>
                      Indexed starwheel kinematic profile generated for 6 pocket stations. Applied sanitary Tri-Clamp connection (3A Sanitary Standard 63-04).
                      Diving nozzle stroke distance set to 45 mm with anti-drip pneumatic cutoff.
                    </>
                  )}
                </div>

                {/* Verification Status */}
                <div
                  style={{
                    marginTop: 'auto',
                    padding: '10px',
                    borderRadius: '6px',
                    backgroundColor: OsakaJadePalette.background.surfaceElevated,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.75rem',
                    color: OsakaJadePalette.jade[300]
                  }}
                >
                  <CheckCircle2 size={16} color={OsakaJadePalette.jade[400]} />
                  ASME B16.5 & P&ID Drawing Constraints Validated
                </div>
              </div>
            </div>

            {/* Right Pane: Live Visual CAD & Parametric Nozzle Preview */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setCadViewMode('visual')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: 'none',
                      backgroundColor: cadViewMode === 'visual' ? OsakaJadePalette.background.surfaceHover : 'transparent',
                      color: cadViewMode === 'visual' ? OsakaJadePalette.jade[400] : OsakaJadePalette.text.muted,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <Eye size={12} /> CAD Visual Preview
                  </button>
                  <button
                    onClick={() => setCadViewMode('code')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: 'none',
                      backgroundColor: cadViewMode === 'code' ? OsakaJadePalette.background.surfaceHover : 'transparent',
                      color: cadViewMode === 'code' ? OsakaJadePalette.jade[400] : OsakaJadePalette.text.muted,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <FileCode size={12} /> Digital Twin JSON Schema
                  </button>
                </div>
                <span style={{ fontSize: '0.72rem', color: OsakaJadePalette.text.muted }}>Scale: 1:1 Vector</span>
              </div>

              {cadViewMode === 'visual' ? (
                <div
                  style={{
                    flex: 1,
                    backgroundColor: OsakaJadePalette.background.surface,
                    borderRadius: '8px',
                    border: `1px solid ${OsakaJadePalette.border.default}`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px',
                    position: 'relative'
                  }}
                >
                  {/* Drawing Visual */}
                  <div style={{ width: '180px', height: '180px' }}>
                    {cadStudioTab === 'rx101' && <ReactorAnim isRunning={true} hasJacket={true} agitatorType="rushton" />}
                    {cadStudioTab === 'tk102' && <TankAnim isRunning={true} levelPercent={74} />}
                    {cadStudioTab === 'fl201' && <RotaryFillerAnim isRunning={true} />}
                  </div>

                  {/* Nozzle Callout Badges */}
                  <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                    {cadStudioTab === 'rx101' && (
                      <>
                        <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: OsakaJadePalette.background.surfaceElevated, border: `1px solid ${OsakaJadePalette.jade[700]}`, color: OsakaJadePalette.jade[300] }}>
                          N1: 3" NPS 150# RF Infeed
                        </span>
                        <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: OsakaJadePalette.background.surfaceElevated, border: `1px solid ${OsakaJadePalette.jade[700]}`, color: OsakaJadePalette.jade[300] }}>
                          N2: 2" NPS 150# RF Drain
                        </span>
                        <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: OsakaJadePalette.background.surfaceElevated, border: `1px solid ${OsakaJadePalette.jade[700]}`, color: OsakaJadePalette.jade[300] }}>
                          N3/N4: 1" 300# RTJ Steam
                        </span>
                      </>
                    )}
                    {cadStudioTab === 'tk102' && (
                      <>
                        <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: OsakaJadePalette.background.surfaceElevated, border: `1px solid ${OsakaJadePalette.jade[700]}`, color: OsakaJadePalette.jade[300] }}>
                          N1: 2" NPS 150# RF Inlet
                        </span>
                        <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: OsakaJadePalette.background.surfaceElevated, border: `1px solid ${OsakaJadePalette.jade[700]}`, color: OsakaJadePalette.jade[300] }}>
                          N2: 2" NPS 150# RF Bottom Outlet
                        </span>
                        <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: OsakaJadePalette.background.surfaceElevated, border: `1px solid ${OsakaJadePalette.jade[700]}`, color: OsakaJadePalette.jade[300] }}>
                          N3: 1.5" Atmospheric HEPA
                        </span>
                      </>
                    )}
                    {cadStudioTab === 'fl201' && (
                      <>
                        <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: OsakaJadePalette.background.surfaceElevated, border: `1px solid ${OsakaJadePalette.jade[700]}`, color: OsakaJadePalette.jade[300] }}>
                          Feed: 2" Tri-Clamp Sanitary
                        </span>
                        <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: OsakaJadePalette.background.surfaceElevated, border: `1px solid ${OsakaJadePalette.jade[700]}`, color: OsakaJadePalette.jade[300] }}>
                          6x 0.75" Diving Cutoff Nozzles
                        </span>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <pre
                  style={{
                    flex: 1,
                    margin: 0,
                    padding: '16px',
                    borderRadius: '8px',
                    backgroundColor: OsakaJadePalette.background.surface,
                    border: `1px solid ${OsakaJadePalette.border.default}`,
                    fontSize: '0.75rem',
                    color: OsakaJadePalette.jade[300],
                    fontFamily: "'JetBrains Mono', monospace",
                    overflowX: 'auto',
                    lineHeight: 1.5
                  }}
                >
                  <code>{JSON.stringify({
                    unitOpId: cadStudioTab,
                    type: cadStudioTab === 'rx101' ? 'continuous_cstr' : cadStudioTab === 'tk102' ? 'buffer_vessel' : 'discrete_rotary_filler',
                    mechanicalDressing: {
                      asmeStandard: 'B16.5-2020',
                      material: '316L Stainless Steel',
                      designPressure_psi: cadStudioTab === 'rx101' ? 150 : 50,
                      designTemp_C: cadStudioTab === 'rx101' ? 120 : 60,
                      nozzleSchedule: FLOWSHEET_UNITS.find(u => u.id === cadStudioTab)?.nozzles
                    },
                    subAgentConfig: {
                      agentName: FLOWSHEET_UNITS.find(u => u.id === cadStudioTab)?.subAgentName,
                      authType: 'oauth_pkce_zero_key',
                      activePID: true
                    }
                  }, null, 2)}</code>
                </pre>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* MCP Quick Start Section */}
      <section
        id="mcp"
        style={{
          padding: '60px 24px',
          backgroundColor: OsakaJadePalette.background.surface,
          borderTop: `1px solid ${OsakaJadePalette.border.subtle}`,
          borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`
        }}
      >
        <div style={{ maxWidth: '960px', margin: '0 auto', textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '16px',
              backgroundColor: OsakaJadePalette.background.surfaceElevated,
              color: OsakaJadePalette.jade[400],
              fontSize: '0.78rem',
              fontWeight: 600,
              marginBottom: '16px'
            }}
          >
            <Terminal size={14} /> Model Context Protocol (MCP) Integration
          </div>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '14px' }}>
            Plug ProcessForge into Claude Desktop & Gemini CLI
          </h2>
          <p style={{ color: OsakaJadePalette.text.secondary, fontSize: '0.98rem', marginBottom: '32px', maxWidth: '640px', margin: '0 auto 32px' }}>
            Give your favorite AI coding assistant direct, programmatic control over process simulations, unit operation parameters, and digital twin exports.
          </p>

          <div
            style={{
              borderRadius: '8px',
              backgroundColor: OsakaJadePalette.background.canvas,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              overflow: 'hidden',
              textAlign: 'left'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`
              }}
            >
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setActiveTab('claude')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '4px',
                    border: 'none',
                    backgroundColor: activeTab === 'claude' ? OsakaJadePalette.background.surfaceHover : 'transparent',
                    color: activeTab === 'claude' ? OsakaJadePalette.jade[400] : OsakaJadePalette.text.muted,
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Claude Desktop Config
                </button>
                <button
                  onClick={() => setActiveTab('gemini')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '4px',
                    border: 'none',
                    backgroundColor: activeTab === 'gemini' ? OsakaJadePalette.background.surfaceHover : 'transparent',
                    color: activeTab === 'gemini' ? OsakaJadePalette.jade[400] : OsakaJadePalette.text.muted,
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Gemini CLI Command
                </button>
              </div>
              <button
                onClick={() => copyToClipboard(activeTab === 'claude' ? claudeConfigSnippet : geminiConfigSnippet)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  backgroundColor: OsakaJadePalette.background.surface,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  color: OsakaJadePalette.text.secondary,
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                {copiedSnippet ? <Check size={13} color={OsakaJadePalette.jade[400]} /> : <Copy size={13} />}
                {copiedSnippet ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <pre
              style={{
                margin: 0,
                padding: '18px',
                fontSize: '0.85rem',
                color: OsakaJadePalette.jade[300],
                overflowX: 'auto',
                lineHeight: 1.5
              }}
            >
              <code>{activeTab === 'claude' ? claudeConfigSnippet : geminiConfigSnippet}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          marginTop: 'auto',
          borderTop: `1px solid ${OsakaJadePalette.border.subtle}`,
          padding: '40px 24px',
          backgroundColor: OsakaJadePalette.background.base,
          textAlign: 'center'
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '20px'
          }}
        >
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: OsakaJadePalette.text.primary, marginBottom: '4px' }}>
              PROCESS<span style={{ color: OsakaJadePalette.jade[400] }}>FORGE</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: OsakaJadePalette.text.muted }}>
              Next-generation hybrid process simulation with hierarchical agent orchestration.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', fontSize: '0.85rem' }}>
            <a
              href="https://github.com/omeaga1/process-forge"
              target="_blank"
              rel="noreferrer"
              style={{ color: OsakaJadePalette.text.secondary, textDecoration: 'none' }}
            >
              GitHub Repository
            </a>
            <a
              href="https://github.com/omeaga1/process-forge/releases"
              target="_blank"
              rel="noreferrer"
              style={{ color: OsakaJadePalette.text.secondary, textDecoration: 'none' }}
            >
              Release Downloads
            </a>
            <a
              href="https://github.com/omeaga1/process-forge/blob/main/LICENSE"
              target="_blank"
              rel="noreferrer"
              style={{ color: OsakaJadePalette.text.secondary, textDecoration: 'none' }}
            >
              Apache-2.0 License
            </a>
          </div>
        </div>
        <div style={{ marginTop: '24px', fontSize: '0.75rem', color: OsakaJadePalette.text.muted }}>
          Hosted on GitHub Pages with $0 cloud footprint. No telemetry tracking or personal data collection.
        </div>
      </footer>

      {/* Other Platforms Modal */}
      {isOtherModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px'
          }}
          onClick={() => setIsOtherModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '560px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Download size={20} color={OsakaJadePalette.jade[400]} />
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>All Platform Installers</h3>
              </div>
              <button
                onClick={() => setIsOtherModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: OsakaJadePalette.text.muted,
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '0.88rem', color: OsakaJadePalette.text.secondary, marginBottom: '20px' }}>
              All binaries are signed and built automatically from open-source GitHub Actions CI. Select your target architecture:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              {/* Windows Portable */}
              <a
                href="https://github.com/omeaga1/process-forge/releases/download/v0.1.0/process-forge-windows-portable-x64.zip"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: '6px',
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.jade[600]}`,
                  color: OsakaJadePalette.text.primary,
                  textDecoration: 'none'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: OsakaJadePalette.jade[300] }}>Windows Portable (.zip — Zero Install)</div>
                  <div style={{ fontSize: '0.75rem', color: OsakaJadePalette.text.muted }}>process-forge-windows-portable-x64.zip (Instant run)</div>
                </div>
                <Download size={16} color={OsakaJadePalette.jade[400]} />
              </a>

              {/* Windows MSI */}
              <a
                href="https://github.com/omeaga1/process-forge/releases/tag/v0.1.0"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: '6px',
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.subtle}`,
                  color: OsakaJadePalette.text.primary,
                  textDecoration: 'none'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Windows Native Installer (.msi / .exe)</div>
                  <div style={{ fontSize: '0.75rem', color: OsakaJadePalette.text.muted }}>GitHub Release v0.1.0 Tauri v2 Bundle</div>
                </div>
                <Download size={16} color={OsakaJadePalette.jade[400]} />
              </a>

              {/* macOS DMG */}
              <a
                href="https://github.com/omeaga1/process-forge/releases/tag/v0.1.0"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: '6px',
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.subtle}`,
                  color: OsakaJadePalette.text.primary,
                  textDecoration: 'none'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>macOS Universal DMG</div>
                  <div style={{ fontSize: '0.75rem', color: OsakaJadePalette.text.muted }}>Apple Silicon (M1/M2/M3/M4) & Intel x86_64</div>
                </div>
                <Download size={16} color={OsakaJadePalette.jade[400]} />
              </a>

              {/* Linux AppImage & DEB */}
              <a
                href="https://github.com/omeaga1/process-forge/releases/tag/v0.1.0"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: '6px',
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.subtle}`,
                  color: OsakaJadePalette.text.primary,
                  textDecoration: 'none'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Linux AppImage & Debian (.deb)</div>
                  <div style={{ fontSize: '0.75rem', color: OsakaJadePalette.text.muted }}>Ubuntu, Debian, Fedora, Arch</div>
                </div>
                <Download size={16} color={OsakaJadePalette.jade[400]} />
              </a>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setIsOtherModalOpen(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  color: OsakaJadePalette.text.primary,
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
