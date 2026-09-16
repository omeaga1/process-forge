import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useTheme } from '../../hooks/useTheme.js';
import type { CanvasNodeData } from '../../types.js';
import { UnitAnim } from '../animations/EquipmentAnimations.js';

export const IndustrialNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const { palette, machineVisuals, elevation, font, size, weight, space, radius: r, motion } = useTheme();
  const OsakaJadePalette = palette;
  const nodeData = data as unknown as CanvasNodeData;
  const { processNode, state, unitsProduced, bufferLevel, instantaneousRate, onOpenPopOutStudio } =
    nodeData;

  const visualState = machineVisuals[state] ?? machineVisuals['IDLE']!;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenPopOutStudio) {
      onOpenPopOutStudio(id);
    }
  };

  const isBlocked = state === 'BLOCKED';

  return (
    <div
      onClick={handleClick}
      onDoubleClick={handleClick}
      title="Click to open Unit-Op Studio"
      style={{
        width: 260,
        position: 'relative',
        backgroundColor: OsakaJadePalette.background.surface,
        borderRadius: r.lg,
        border: selected
          ? `2px solid ${OsakaJadePalette.border.glow}`
          : isBlocked
            ? `2px solid ${OsakaJadePalette.status.blocked}`
            : `1px solid ${OsakaJadePalette.border.default}`,
        boxShadow: isBlocked
          ? elevation.glowWarning
          : selected
            ? elevation.glow
            : elevation.low,
        color: OsakaJadePalette.text.primary,
        fontFamily: font.sans,
        padding: `${space[3]}px`,
        cursor: 'pointer',
        transition: `all ${motion.normal}`,
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[2] }}>
        <span
          style={{
            fontSize: size['2xs'],
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: OsakaJadePalette.jade[400],
            fontWeight: weight.bold
          }}
        >
          {processNode.kind.replace(/_/g, ' ')}
        </span>

        {/* State Status Badge */}
        <span
          style={{
            fontSize: size['2xs'],
            fontWeight: weight.semibold,
            padding: `${space[0.5]}px ${space[1.5]}px`,
            borderRadius: r.full,
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
          fontSize: size.base,
          fontWeight: weight.semibold,
          color: OsakaJadePalette.text.primary,
          marginBottom: space[2],
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
          marginBottom: space[2],
          borderRadius: r.md,
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
              bottom: space[1],
              right: space[1.5],
              fontSize: size['2xs'],
              fontWeight: weight.bold,
              color: OsakaJadePalette.jade[300],
              backgroundColor: `${OsakaJadePalette.background.surfaceElevated}cc`,
              padding: `1px ${space[1]}px`,
              borderRadius: r.sm,
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
          gap: space[1.5],
          backgroundColor: OsakaJadePalette.background.surfaceElevated,
          padding: `${space[2]}px ${space[2.5]}px`,
          borderRadius: r.md,
          fontSize: size.xs,
          fontFamily: font.mono,
          border: `1px solid ${OsakaJadePalette.border.subtle}`
        }}
      >
        <div>
          <div style={{ color: OsakaJadePalette.text.muted, fontSize: size['2xs'] }}>RATE</div>
          <div style={{ fontWeight: weight.semibold, color: OsakaJadePalette.text.primary }}>
            {instantaneousRate > 0 ? `${Math.round(instantaneousRate)}/min` : '0/min'}
          </div>
        </div>

        <div>
          <div style={{ color: OsakaJadePalette.text.muted, fontSize: size['2xs'] }}>BUFFER / PACKED</div>
          <div style={{ fontWeight: weight.semibold, color: OsakaJadePalette.text.primary }}>
            {bufferLevel > 0 ? `${bufferLevel} in queue` : `${unitsProduced} units`}
          </div>
        </div>
      </div>

      {/* Industrial Unit Identifier & Port Metadata */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: space[2],
          fontSize: size['2xs'],
          color: OsakaJadePalette.text.muted,
          fontFamily: font.mono
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: space[1] }}>
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: r.full,
              backgroundColor: OsakaJadePalette.jade.glow
            }}
          />
          TAG: {processNode.id.toUpperCase()}
        </span>
        <span style={{ fontSize: size['2xs'], color: OsakaJadePalette.text.muted, letterSpacing: '0.04em' }}>
          {processNode.inputs.length + processNode.outputs.length} PORTS
        </span>
      </div>
    </div>
  );
};
