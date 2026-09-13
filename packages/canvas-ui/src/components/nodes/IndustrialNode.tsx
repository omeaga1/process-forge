import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { OsakaJadePalette, MachineStateVisuals } from '@process-forge/theme';
import type { CanvasNodeData } from '../../types.js';
import { UnitAnim } from '../animations/EquipmentAnimations.js';

export const IndustrialNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as CanvasNodeData;
  const { processNode, state, unitsProduced, bufferLevel, instantaneousRate, onOpenPopOutStudio } =
    nodeData;

  const visualState = MachineStateVisuals[state] ?? MachineStateVisuals['IDLE']!;

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenPopOutStudio) {
      onOpenPopOutStudio(id);
    }
  };

  const isBlocked = state === 'BLOCKED';

  return (
    <div
      onDoubleClick={handleDoubleClick}
      title="Double-click to open Unit-Op Studio"
      style={{
        width: 260,
        position: 'relative',
        backgroundColor: OsakaJadePalette.background.surface,
        borderRadius: 10,
        border: selected
          ? `2px solid ${OsakaJadePalette.border.glow}`
          : isBlocked
            ? `2px solid ${OsakaJadePalette.status.blocked}`
            : `1px solid ${OsakaJadePalette.border.default}`,
        boxShadow: isBlocked
          ? '0 0 16px rgba(245, 158, 11, 0.5)'
          : selected
            ? '0 0 18px rgba(45, 212, 191, 0.45)'
            : '0 4px 12px rgba(0, 0, 0, 0.4)',
        color: OsakaJadePalette.text.primary,
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '12px 14px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        userSelect: 'none'
      }}
    >
      {/* Input Ports (Left) */}
      {processNode.inputs.map((port, idx) => {
        const topPercent = ((idx + 1) / (processNode.inputs.length + 1)) * 100;
        const isFluid = port.flowDimension === 'CONTINUOUS_VOLUME';
        return (
          <Handle
            key={port.id}
            type="target"
            position={Position.Left}
            id={port.id}
            style={{
              top: `${topPercent}%`,
              width: 10,
              height: 10,
              backgroundColor: isFluid
                ? OsakaJadePalette.streams.continuousFluid
                : OsakaJadePalette.streams.discreteContainer,
              border: `2px solid ${OsakaJadePalette.background.base}`,
              borderRadius: isFluid ? '50%' : 2
            }}
          />
        );
      })}

      {/* Output Ports (Right) */}
      {processNode.outputs.map((port, idx) => {
        const topPercent = ((idx + 1) / (processNode.outputs.length + 1)) * 100;
        const isFluid = port.flowDimension === 'CONTINUOUS_VOLUME';
        return (
          <Handle
            key={port.id}
            type="source"
            position={Position.Right}
            id={port.id}
            style={{
              top: `${topPercent}%`,
              width: 10,
              height: 10,
              backgroundColor: isFluid
                ? OsakaJadePalette.streams.continuousFluid
                : OsakaJadePalette.streams.discreteContainer,
              border: `2px solid ${OsakaJadePalette.background.base}`,
              borderRadius: isFluid ? '50%' : 2
            }}
          />
        );
      })}

      {/* Node Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span
          style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: OsakaJadePalette.jade[400],
            fontWeight: 700
          }}
        >
          {processNode.kind.replace(/_/g, ' ')}
        </span>

        {/* State Status Badge */}
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: '2px 7px',
            borderRadius: 12,
            backgroundColor: visualState.badgeBg,
            color: visualState.badgeText,
            border: `1px solid ${visualState.badgeText}40`
          }}
        >
          {visualState.label}
        </span>
      </div>

      {/* Machine Title */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: OsakaJadePalette.text.primary,
          marginBottom: 8,
          lineHeight: '1.3'
        }}
      >
        {processNode.name}
      </div>

      {/* Live Animated Machine Visual & Physical Dressing */}
      <div
        style={{
          width: '100%',
          height: 90,
          marginBottom: 8,
          borderRadius: 6,
          backgroundColor: OsakaJadePalette.background.canvas,
          border: `1px solid ${OsakaJadePalette.border.subtle}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div style={{ width: 80, height: 80, position: 'relative' }}>
          <UnitAnim
            kind={processNode.kind}
            dressing={processNode.dressing}
            isRunning={state === 'BUSY'}
          />
        </div>

        {/* Dressed Nozzle Badges (if configured) */}
        {processNode.dressing?.nozzles?.length ? (
          <div
            style={{
              position: 'absolute',
              bottom: 4,
              right: 6,
              fontSize: 8,
              fontWeight: 700,
              color: OsakaJadePalette.jade[300],
              backgroundColor: `${OsakaJadePalette.background.surfaceElevated}cc`,
              padding: '1px 5px',
              borderRadius: 3,
              border: `1px solid ${OsakaJadePalette.border.subtle}`
            }}
          >
            {processNode.dressing.nozzles.length} NOZZLES
          </div>
        ) : null}
      </div>

      {/* Telemetry Readout Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 6,
          backgroundColor: OsakaJadePalette.background.surfaceElevated,
          padding: '8px 10px',
          borderRadius: 6,
          fontSize: 11,
          border: `1px solid ${OsakaJadePalette.border.subtle}`
        }}
      >
        <div>
          <div style={{ color: OsakaJadePalette.text.muted, fontSize: 9 }}>RATE</div>
          <div style={{ fontWeight: 600, color: OsakaJadePalette.text.primary }}>
            {instantaneousRate > 0 ? `${Math.round(instantaneousRate)}/min` : '0/min'}
          </div>
        </div>

        <div>
          <div style={{ color: OsakaJadePalette.text.muted, fontSize: 9 }}>BUFFER / PACKED</div>
          <div style={{ fontWeight: 600, color: OsakaJadePalette.text.primary }}>
            {bufferLevel > 0 ? `${bufferLevel} in queue` : `${unitsProduced} units`}
          </div>
        </div>
      </div>

      {/* Sub-Agent Indicator Footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 8,
          fontSize: 10,
          color: OsakaJadePalette.text.muted
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: OsakaJadePalette.jade.glow
            }}
          />
          Forge Ready
        </span>
        <span style={{ fontStyle: 'italic', fontSize: 9, color: OsakaJadePalette.text.secondary }}>
          Double-click to open studio
        </span>
      </div>
    </div>
  );
};
