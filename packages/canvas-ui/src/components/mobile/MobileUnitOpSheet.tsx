import React, { useState } from 'react';
import { useTheme } from '../../hooks/useTheme.js';
import type { ProcessNode, NozzleDressing } from '@process-forge/protocol';
import {
  X,
  Bot,
  Activity,
  Wrench
} from 'lucide-react';
import { draftingRadius } from '@process-forge/theme';

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
  onUpdateDressing
}) => {
  const { palette } = useTheme();
  const OsakaJadePalette = palette;
  const [activeTab, setActiveTab] = useState<'TELEMETRY' | 'DRESSING' | 'AGENT'>('TELEMETRY');

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
          borderRadius: draftingRadius.sharp,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Mobile Swipe Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8, paddingBottom: 4 }}>
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: draftingRadius.soft,
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
                  borderRadius: draftingRadius.soft
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
              borderRadius: draftingRadius.soft,
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
            <Wrench size={14} /> Nozzles
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
            <Bot size={14} /> Definition
          </button>
        </div>

        {/* Tab Body */}
        <div style={{ padding: 16, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* TAB 1: TELEMETRY & CONTROLS */}
          {activeTab === 'TELEMETRY' && (
            <>
              <div style={{ fontSize: 11, color: OsakaJadePalette.text.muted }}>
                Configured values. Run the simulation on the full studio to see results.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {Object.entries(node.config as Record<string, unknown>)
                  .filter(([k, v]) => typeof v === 'number' && k !== 'meanTimeBetweenFailuresMinutes' && k !== 'meanTimeToRepairMinutes')
                  .slice(0, 8)
                  .map(([k, v]) => (
                    <div
                      key={k}
                      style={{
                        padding: 12,
                        borderRadius: draftingRadius.soft,
                        backgroundColor: OsakaJadePalette.background.surfaceElevated,
                        border: `1px solid ${OsakaJadePalette.border.subtle}`
                      }}
                    >
                      <div style={{ fontSize: 10, color: OsakaJadePalette.text.muted }}>
                        {k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: OsakaJadePalette.text.primary, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                        {(v as number).toLocaleString()}
                      </div>
                    </div>
                  ))}
              </div>
            </>
          )}

          {/* TAB 2: NOZZLES */}
          {activeTab === 'DRESSING' && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                Nozzle schedule
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {nozzles.length > 0 ? (
                  nozzles.map((nz) => (
                    <div
                      key={nz.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: draftingRadius.soft,
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
                            borderRadius: draftingRadius.soft,
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
                      borderRadius: draftingRadius.soft
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
                  borderRadius: draftingRadius.soft,
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
                    {dressing?.internals?.agitatorType ?? 'None'}
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
                      borderRadius: draftingRadius.soft,
                      cursor: 'pointer'
                    }}
                  >
                    {dressing?.internals?.hasJacket ? `Dimple (${dressing?.internals?.jacketType})` : 'Disabled'}
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: OsakaJadePalette.text.muted }}>Wall Baffles</span>
                  <span style={{ color: OsakaJadePalette.text.primary, fontWeight: 600 }}>
                    {dressing?.internals?.baffleCount ?? 0} baffles
                  </span>
                </div>
              </div>
            </>
          )}

          {/* TAB 3: UNIT-OP SOFTWARE DEFINITION & CAD SPEC */}
          {activeTab === 'AGENT' && (
            <>
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: draftingRadius.soft,
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
                    Unit-Op Software Definition
                  </div>
                  <div style={{ fontSize: 10, color: OsakaJadePalette.jade[300] }}>
                    Generated Equipment & Port Schedule
                  </div>
                </div>
              </div>

              {/* Unit-Op Software Specification Card */}
              <div
                style={{
                  padding: 12,
                  borderRadius: draftingRadius.soft,
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.subtle}`,
                  fontSize: 11,
                  lineHeight: 1.5,
                  color: OsakaJadePalette.text.secondary
                }}
              >
                <strong style={{ color: OsakaJadePalette.text.primary }}>Equipment Status: </strong>
                Symbol: {dressing?.customSvgShell ? 'custom drawing' : 'standard symbol'}. {nozzles.length} nozzle{nozzles.length === 1 ? '' : 's'} defined.
              </div>

            </>
          )}
        </div>
      </div>
    </div>
  );
};
