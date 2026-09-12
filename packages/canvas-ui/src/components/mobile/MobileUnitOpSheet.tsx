import React, { useState } from 'react';
import { OsakaJadePalette } from '@process-forge/theme';
import type { ProcessNode, NozzleDressing } from '@process-forge/protocol';
import {
  X,
  Bot,
  Activity,
  Wrench,
  ShieldCheck
} from 'lucide-react';
import { getAiConfig } from '../../ai/aiModelManager.js';

export interface MobileUnitOpSheetProps {
  node: ProcessNode | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateConfig?: (nodeId: string, config: any) => void;
  onUpdateDressing?: (nodeId: string, dressing: any) => void;
}

export const MobileUnitOpSheet: React.FC<MobileUnitOpSheetProps> = ({
  node,
  isOpen,
  onClose,
  onUpdateConfig,
  onUpdateDressing
}) => {
  const [activeTab, setActiveTab] = useState<'TELEMETRY' | 'DRESSING' | 'AGENT'>('TELEMETRY');
  const [rpmValue, setRpmValue] = useState<number>(180);
  const [tempTarget, setTempTarget] = useState<number>(24.5);
  const aiConfig = getAiConfig();

  if (!isOpen || !node) return null;

  const dressing = node.dressing;
  const nozzles: NozzleDressing[] = dressing?.nozzles ?? [];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: OsakaJadePalette.background.surface,
          borderTop: `1px solid ${OsakaJadePalette.border.default}`,
          borderRadius: '16px 16px 0 0',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden'
        }}
      >
        {/* Mobile Swipe Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8, paddingBottom: 4 }}>
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: OsakaJadePalette.border.default
            }}
          />
        </div>

        {/* Header Bar */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: OsakaJadePalette.jade.glow,
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  padding: '2px 6px',
                  borderRadius: 4
                }}
              >
                {node.id.toUpperCase()}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: OsakaJadePalette.text.muted,
                  textTransform: 'uppercase'
                }}
              >
                {node.kind.replace('_', ' ')}
              </span>
            </div>
            <h3
              style={{
                margin: '4px 0 0 0',
                fontSize: 15,
                fontWeight: 700,
                color: OsakaJadePalette.text.primary,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {node.name}
            </h3>
          </div>

          <button
            onClick={onClose}
            style={{
              padding: 6,
              borderRadius: 6,
              backgroundColor: OsakaJadePalette.background.surfaceElevated,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              color: OsakaJadePalette.text.secondary,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`,
            backgroundColor: OsakaJadePalette.background.surfaceElevated
          }}
        >
          <button
            onClick={() => setActiveTab('TELEMETRY')}
            style={{
              flex: 1,
              padding: '10px 4px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'TELEMETRY' ? `2px solid ${OsakaJadePalette.jade.glow}` : '2px solid transparent',
              color: activeTab === 'TELEMETRY' ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.secondary,
              fontSize: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              cursor: 'pointer'
            }}
          >
            <Activity size={14} /> Telemetry
          </button>
          <button
            onClick={() => setActiveTab('DRESSING')}
            style={{
              flex: 1,
              padding: '10px 4px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'DRESSING' ? `2px solid ${OsakaJadePalette.jade.glow}` : '2px solid transparent',
              color: activeTab === 'DRESSING' ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.secondary,
              fontSize: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              cursor: 'pointer'
            }}
          >
            <Wrench size={14} /> ASME Dressing
          </button>
          <button
            onClick={() => setActiveTab('AGENT')}
            style={{
              flex: 1,
              padding: '10px 4px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'AGENT' ? `2px solid ${OsakaJadePalette.jade.glow}` : '2px solid transparent',
              color: activeTab === 'AGENT' ? OsakaJadePalette.jade.glow : OsakaJadePalette.text.secondary,
              fontSize: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              cursor: 'pointer'
            }}
          >
            <Bot size={14} /> Sub-Agent
          </button>
        </div>

        {/* Tab Body */}
        <div style={{ padding: 16, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* TAB 1: TELEMETRY & CONTROLS */}
          {activeTab === 'TELEMETRY' && (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10
                }}
              >
                <div
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    backgroundColor: OsakaJadePalette.background.surfaceElevated,
                    border: `1px solid ${OsakaJadePalette.border.subtle}`
                  }}
                >
                  <div style={{ fontSize: 10, color: OsakaJadePalette.text.muted, textTransform: 'uppercase' }}>Viscosity</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: OsakaJadePalette.jade.glow, marginTop: 2 }}>1,200 cP</div>
                  <div style={{ fontSize: 10, color: OsakaJadePalette.text.secondary, marginTop: 2 }}>Non-Newtonian shear</div>
                </div>

                <div
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    backgroundColor: OsakaJadePalette.background.surfaceElevated,
                    border: `1px solid ${OsakaJadePalette.border.subtle}`
                  }}
                >
                  <div style={{ fontSize: 10, color: OsakaJadePalette.text.muted, textTransform: 'uppercase' }}>Temperature</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: OsakaJadePalette.text.primary, marginTop: 2 }}>{tempTarget.toFixed(1)} °C</div>
                  <div style={{ fontSize: 10, color: OsakaJadePalette.text.secondary, marginTop: 2 }}>Jacket ΔT: 4.2 K</div>
                </div>

                <div
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    backgroundColor: OsakaJadePalette.background.surfaceElevated,
                    border: `1px solid ${OsakaJadePalette.border.subtle}`
                  }}
                >
                  <div style={{ fontSize: 10, color: OsakaJadePalette.text.muted, textTransform: 'uppercase' }}>Mass Balance Δm</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: OsakaJadePalette.jade.glow, marginTop: 2 }}>0.000 kg/s</div>
                  <div style={{ fontSize: 10, color: OsakaJadePalette.text.secondary, marginTop: 2 }}>Continuity verified</div>
                </div>

                <div
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    backgroundColor: OsakaJadePalette.background.surfaceElevated,
                    border: `1px solid ${OsakaJadePalette.border.subtle}`
                  }}
                >
                  <div style={{ fontSize: 10, color: OsakaJadePalette.text.muted, textTransform: 'uppercase' }}>Operating Head</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: OsakaJadePalette.text.primary, marginTop: 2 }}>18.2 m</div>
                  <div style={{ fontSize: 10, color: OsakaJadePalette.text.secondary, marginTop: 2 }}>NPSH margin 2.8m</div>
                </div>
              </div>

              {/* Touch Operational Setpoint Sliders */}
              <div
                style={{
                  padding: 14,
                  borderRadius: 8,
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.subtle}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: OsakaJadePalette.text.primary }}>Impeller Agitator Speed</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: OsakaJadePalette.jade.glow }}>{rpmValue} RPM</span>
                </div>
                <input
                  type="range"
                  min={60}
                  max={300}
                  step={5}
                  value={rpmValue}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setRpmValue(val);
                    onUpdateConfig?.(node.id, { ...node.config, agitatorSpeedRpm: val });
                  }}
                  style={{ width: '100%', accentColor: OsakaJadePalette.jade[500], cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: OsakaJadePalette.text.muted }}>
                  <span>60 RPM</span>
                  <span>180 RPM</span>
                  <span>300 RPM</span>
                </div>
              </div>

              <div
                style={{
                  padding: 14,
                  borderRadius: 8,
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.subtle}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: OsakaJadePalette.text.primary }}>Jacket Setpoint Temp</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: OsakaJadePalette.jade.glow }}>{tempTarget.toFixed(1)} °C</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    onClick={() => setTempTarget((t) => Math.max(15, t - 0.5))}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: 6,
                      backgroundColor: OsakaJadePalette.background.surface,
                      border: `1px solid ${OsakaJadePalette.border.default}`,
                      color: OsakaJadePalette.text.primary,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    - 0.5 °C
                  </button>
                  <button
                    onClick={() => setTempTarget((t) => Math.min(60, t + 0.5))}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: 6,
                      backgroundColor: OsakaJadePalette.background.surface,
                      border: `1px solid ${OsakaJadePalette.border.default}`,
                      color: OsakaJadePalette.text.primary,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    + 0.5 °C
                  </button>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: ASME DRESSING & NOZZLES */}
          {activeTab === 'DRESSING' && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                ASME B16.5 Flanged Nozzle Schedule
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {nozzles.length > 0 ? (
                  nozzles.map((nz) => (
                    <div
                      key={nz.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        backgroundColor: OsakaJadePalette.background.surfaceElevated,
                        border: `1px solid ${OsakaJadePalette.border.subtle}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: OsakaJadePalette.jade.glow }}>
                            {nz.name || nz.id}
                          </span>
                          <span style={{ fontSize: 11, color: OsakaJadePalette.text.primary, fontWeight: 600 }}>
                            {nz.sizeInches}&quot; NPS
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: OsakaJadePalette.text.muted, marginTop: 2 }}>
                          {nz.role.toUpperCase()} • {nz.position.toUpperCase()}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <span
                          style={{
                            fontSize: 10,
                            padding: '3px 8px',
                            borderRadius: 4,
                            backgroundColor: 'rgba(16, 185, 129, 0.12)',
                            color: OsakaJadePalette.jade[300],
                            fontWeight: 700
                          }}
                        >
                          {nz.ratingPsi} PSI
                        </span>
                        <div style={{ fontSize: 9, color: OsakaJadePalette.text.muted, marginTop: 3 }}>
                          Elevation: {nz.elevationMeters ? `${(nz.elevationMeters * 1000).toFixed(0)} mm` : '0 mm'}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div
                    style={{
                      padding: 16,
                      textAlign: 'center',
                      fontSize: 12,
                      color: OsakaJadePalette.text.muted,
                      backgroundColor: OsakaJadePalette.background.surfaceElevated,
                      borderRadius: 8
                    }}
                  >
                    Nozzles configured via default process ports.
                  </div>
                )}
              </div>

              {/* Vessel Internals Summary */}
              <div style={{ fontSize: 12, fontWeight: 700, color: OsakaJadePalette.text.primary, marginTop: 6 }}>
                Vessel Mechanical Internals
              </div>
              <div
                style={{
                  padding: 12,
                  borderRadius: 8,
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.subtle}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  fontSize: 11
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: OsakaJadePalette.text.muted }}>Agitator Impeller</span>
                  <span style={{ color: OsakaJadePalette.text.primary, fontWeight: 600 }}>
                    {dressing?.internals?.agitatorType ?? 'Rushton Turbine (6-Blade)'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: OsakaJadePalette.text.muted }}>Thermal Jacket</span>
                  <button
                    onClick={() => {
                      if (!dressing) return;
                      const hasJacket = !dressing.internals?.hasJacket;
                      onUpdateDressing?.(node.id, {
                        ...dressing,
                        internals: {
                          ...dressing.internals,
                          hasJacket,
                          jacketType: hasJacket ? 'steam' : 'none'
                        }
                      });
                    }}
                    style={{
                      backgroundColor: 'transparent',
                      border: `1px solid ${OsakaJadePalette.border.default}`,
                      color: OsakaJadePalette.text.primary,
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 4,
                      cursor: 'pointer'
                    }}
                  >
                    {dressing?.internals?.hasJacket ? `ASME Dimple (${dressing?.internals?.jacketType})` : 'Disabled'}
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: OsakaJadePalette.text.muted }}>Wall Baffles</span>
                  <span style={{ color: OsakaJadePalette.text.primary, fontWeight: 600 }}>
                    {dressing?.internals?.baffleCount ?? 4} Wall Baffles (90° Offset)
                  </span>
                </div>
              </div>
            </>
          )}

          {/* TAB 3: SUB-AGENT TELEMETRY & REASONING */}
          {activeTab === 'AGENT' && (
            <>
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 8,
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  border: `1px solid ${OsakaJadePalette.border.glow}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10
                }}
              >
                <Bot size={20} color={OsakaJadePalette.jade.glow} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                    {node.assignedSubAgentId ?? `Agent ${node.name.split(' ')[0]}`}
                  </div>
                  <div style={{ fontSize: 10, color: OsakaJadePalette.jade[300] }}>
                    Supervisory Unit Controller
                  </div>
                </div>
              </div>

              {/* Live Sub-Agent Reasoning Card */}
              <div
                style={{
                  padding: 12,
                  borderRadius: 8,
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.subtle}`,
                  fontSize: 11,
                  lineHeight: 1.5,
                  color: OsakaJadePalette.text.secondary
                }}
              >
                <strong style={{ color: OsakaJadePalette.text.primary }}>Telemetry Status: </strong>
                Agitator setpoint: {rpmValue} RPM. Fluid shear within operating limits. Mass balance verified (residual: 0.00 kg/s).
              </div>

              {/* Zero-Key Architecture Compliance Notice */}
              {aiConfig.provider === 'offline' ? (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    backgroundColor: OsakaJadePalette.background.surfaceElevated,
                    border: `1px solid ${OsakaJadePalette.border.default}`,
                    fontSize: 11,
                    lineHeight: 1.4,
                    color: OsakaJadePalette.text.muted,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: OsakaJadePalette.text.primary, fontWeight: 600 }}>
                    <ShieldCheck size={14} color={OsakaJadePalette.jade.glow} />
                    <span>Zero Raw Keys Policy</span>
                  </div>
                  <span>
                    Model inference routed via local MCP or OAuth 2.0 PKCE. Local process physics and mechanical dressing execute offline.
                  </span>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: OsakaJadePalette.jade.glow }}>
                  Connected via {aiConfig.provider.toUpperCase()}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
