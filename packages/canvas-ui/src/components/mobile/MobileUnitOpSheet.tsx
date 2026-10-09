import React, { useState } from 'react';
import { useTheme } from '../../hooks/useTheme.js';
import type { ProcessGraph, ProcessNode, NozzleDressing } from '@process-forge/protocol';
import { Wrench, Workflow } from 'lucide-react';
import { draftingRadius, tint } from '@process-forge/theme';

import { Button, Sheet, TabStrip } from '../../ui/index.js';
import { UnitOverviewPanel } from '../studio/UnitOverviewPanel.js';
import { unitTag } from '../../model/unitTag.js';
import { X } from 'lucide-react';

export interface MobileUnitOpSheetProps {
  node: ProcessNode | null;
  isOpen: boolean;
  onClose: () => void;
  /** The line the unit is on: the overview reads its streams from a run of it. */
  graph?: ProcessGraph;
  onUpdateConfig?: (nodeId: string, config: any) => void;
  onUpdateDressing?: (nodeId: string, dressing: any) => void;
}

/** A unit on a phone: what flows through it (the studio's overview) and its nozzles. */
export const MobileUnitOpSheet: React.FC<MobileUnitOpSheetProps> = ({ node, isOpen, onClose, graph, onUpdateDressing }) => {
  const { palette } = useTheme();
  const OsakaJadePalette = palette;
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'DRESSING'>(graph ? 'OVERVIEW' : 'DRESSING');
  if (!node) return null;
  const dressing = node.dressing;
  const nozzles: NozzleDressing[] = dressing?.nozzles ?? [];
  const tag = unitTag(node.name);
  const shown = graph ? activeTab : 'DRESSING';

  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && onClose()} label={node.name}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px 10px 16px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {tag && (
            <span style={{ fontSize: 11, fontWeight: 700, color: palette.jade.glow, backgroundColor: tint(palette.jade[500], 0.15), padding: '2px 6px', borderRadius: draftingRadius.soft }}>{tag}</span>
          )}
          <div style={{ marginTop: tag ? 4 : 0, fontSize: 15, fontWeight: 700, color: palette.text.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</div>
        </div>
        <Button variant="ghost" iconOnly icon={<X size={16} />} aria-label="Close" onClick={onClose} />
      </div>
      {graph && (
        <TabStrip
          label="Unit"
          value={shown}
          onValueChange={setActiveTab}
          style={{ padding: '0 8px', flexShrink: 0 }}
          items={[
            { value: 'OVERVIEW' as const, icon: <Workflow size={14} />, label: 'Overview' },
            { value: 'DRESSING' as const, icon: <Wrench size={14} />, label: 'Nozzles' }
          ]}
        />
      )}
      <div style={{ padding: 16, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {shown === 'OVERVIEW' && graph && <UnitOverviewPanel node={node} graph={graph} />}
          {shown === 'DRESSING' && (
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
                            backgroundColor: tint(palette.jade[500], 0.12),
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

      </div>
    </Sheet>
  );
};
