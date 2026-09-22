import React, { useState, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme.js';
import {
  type ProcessNode,
  type UnitOpDressing,
  type NozzleDressing,
  type InternalsDressing,
  type TemplateFamily,
  type TemplateRouting,
  synthesizeEquipmentDrawing
} from '@process-forge/protocol';
import { TemplateChoice } from './TemplateChoice.js';
import { UnitAnim } from '../animations/EquipmentAnimations.js';
import { Plus, Trash2, Sliders, Eye, Sparkles, Check, RotateCcw } from 'lucide-react';

interface UnitOpDressingTabProps {
  node: ProcessNode;
  onUpdateDressing: (updatedDressing: UnitOpDressing) => void;
}

export const UnitOpDressingTab: React.FC<UnitOpDressingTabProps> = ({ node, onUpdateDressing }) => {
  const { palette, size, weight, space, radius: r } = useTheme();
  const OsakaJadePalette = palette;
  const defaultInternals = {
    agitatorType: node.kind === 'BATCH_REACTOR' ? ('pitched_blade' as const) : ('none' as const),
    hasJacket: node.kind === 'BATCH_REACTOR',
    jacketType: 'steam' as const,
    baffleCount: 4,
    packingType: 'none' as const,
    hasDemister: false,
    hasSprayHeader: false
  };

  const initialDressing: UnitOpDressing = {
    ...node.dressing,
    nozzles: node.dressing?.nozzles || [
      {
        id: 'N1',
        name: 'Primary Infeed',
        role: 'inlet',
        x: 15,
        y: 20,
        position: 'top',
        sizeInches: 3,
        ratingPsi: 150
      },
      {
        id: 'N2',
        name: 'Discharge Drain',
        role: 'outlet',
        x: 50,
        y: 95,
        position: 'bottom',
        sizeInches: 2,
        ratingPsi: 150
      }
    ],
    internals: {
      ...defaultInternals,
      ...(node.dressing?.internals || {})
    }
  };

  const [dressing, setDressing] = useState<UnitOpDressing>(initialDressing);
  const [selectedNozzleId, setSelectedNozzleId] = useState<string | null>(
    initialDressing.nozzles[0]?.id || null
  );
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [lastForge, setLastForge] = useState<{
    prompt: string;
    routing: TemplateRouting;
    current: TemplateFamily;
  } | null>(null);
  const [isForging, setIsForging] = useState<boolean>(false);

  useEffect(() => {
    if (node.dressing) {
      setDressing({
        ...node.dressing,
        nozzles: node.dressing.nozzles || [],
        internals: {
          ...defaultInternals,
          ...(node.dressing.internals || {})
        }
      });
    }
  }, [node.id, node.dressing]);

  const handleForgeDrawing = (promptToUse?: string, family?: TemplateFamily) => {
    const text = promptToUse || aiPrompt;
    if (!text.trim()) return;
    setIsForging(true);
    setTimeout(() => {
      const context = { kind: node.kind, machineName: node.name };
      // The description's own routing is kept even after a pick, so the
      // choice stays on offer and a second pick can undo the first.
      const auto = synthesizeEquipmentDrawing(text, context);
      const dwg = family ? synthesizeEquipmentDrawing(text, { ...context, family }) : auto;
      setLastForge({ prompt: text, routing: auto.routing, current: family ?? auto.routing.family });
      const updated: UnitOpDressing = {
        ...dressing,
        customSvgShell: dwg.svgShell,
        customSvgDetails: dwg.svgDetails,
        viewBox: dwg.viewBox,
        defaultSize: dwg.defaultSize,
        drawingPrompt: text,
        generatedBySubAgent: true,
        nozzles: dwg.nozzles,
        internals: {
          agitatorType: dwg.internals.agitatorType ?? dressing.internals.agitatorType ?? 'none',
          hasJacket: dwg.internals.hasJacket ?? dressing.internals.hasJacket ?? false,
          jacketType: dwg.internals.jacketType ?? dressing.internals.jacketType ?? 'none',
          baffleCount: dwg.internals.baffleCount ?? dressing.internals.baffleCount ?? 0,
          packingType: dwg.internals.packingType ?? dressing.internals.packingType ?? 'none',
          hasDemister: dwg.internals.hasDemister ?? dressing.internals.hasDemister ?? false,
          hasSprayHeader: dwg.internals.hasSprayHeader ?? dressing.internals.hasSprayHeader ?? false,
          trayCount: dwg.internals.trayCount ?? dressing.internals.trayCount
        }
      };
      setDressing(updated);
      setSelectedNozzleId(dwg.nozzles[0]?.id || null);
      onUpdateDressing(updated);
      setIsForging(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    }, 400);
  };

  const handleResetToStandard = () => {
    const updated: UnitOpDressing = {
      ...dressing,
      customSvgShell: undefined,
      customSvgDetails: undefined,
      viewBox: undefined,
      defaultSize: undefined,
      drawingPrompt: undefined,
      generatedBySubAgent: false
    };
    setDressing(updated);
    onUpdateDressing(updated);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleUpdateInternals = (updates: Partial<InternalsDressing>) => {
    const updated: UnitOpDressing = {
      ...dressing,
      internals: {
        ...dressing.internals,
        ...updates
      }
    };
    setDressing(updated);
    onUpdateDressing(updated);
  };

  const handleAddNozzle = (presetRole: 'inlet' | 'outlet' | 'vent' | 'drain' | 'utility') => {
    const newIndex = dressing.nozzles.length + 1;
    const newNozzle: NozzleDressing = {
      id: `N${newIndex}`,
      name: `Nozzle ${newIndex} (${presetRole.toUpperCase()})`,
      role: presetRole,
      x: presetRole === 'vent' ? 50 : presetRole === 'drain' ? 50 : 20,
      y: presetRole === 'vent' ? 5 : presetRole === 'drain' ? 95 : 50,
      position: presetRole === 'vent' ? 'top' : presetRole === 'drain' ? 'bottom' : 'left',
      sizeInches: 2,
      ratingPsi: 150
    };
    const updated: UnitOpDressing = {
      ...dressing,
      nozzles: [...dressing.nozzles, newNozzle]
    };
    setDressing(updated);
    setSelectedNozzleId(newNozzle.id);
    onUpdateDressing(updated);
  };

  const handleUpdateSelectedNozzle = (updates: Partial<NozzleDressing>) => {
    if (!selectedNozzleId) return;
    const updatedNozzles = dressing.nozzles.map((n) => (n.id === selectedNozzleId ? { ...n, ...updates } : n));
    const updated: UnitOpDressing = { ...dressing, nozzles: updatedNozzles };
    setDressing(updated);
    onUpdateDressing(updated);
  };

  const handleDeleteNozzle = (id: string) => {
    const updatedNozzles = dressing.nozzles.filter((n) => n.id !== id);
    const updated: UnitOpDressing = { ...dressing, nozzles: updatedNozzles };
    setDressing(updated);
    if (selectedNozzleId === id) {
      setSelectedNozzleId(updatedNozzles[0]?.id || null);
    }
    onUpdateDressing(updated);
  };

  const handleSaveExplicit = () => {
    onUpdateDressing(dressing);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const selectedNozzle = dressing.nozzles.find((n) => n.id === selectedNozzleId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', overflowY: 'auto', padding: '16px' }}>
      {/* AI Vector CAD Synthesis Section */}
      <div
        style={{
          padding: '14px 16px',
          backgroundColor: OsakaJadePalette.background.surfaceElevated,
          borderRadius: '8px',
          border: `1px solid ${OsakaJadePalette.border.default}`,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={15} color={OsakaJadePalette.jade[400]} />
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: OsakaJadePalette.text.primary, letterSpacing: '-0.01em' }}>
              Unit-Op CAD Geometry
            </span>
          </div>

          {dressing.customSvgShell && (
            <button
              onClick={handleResetToStandard}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '0.72rem',
                fontWeight: 600,
                padding: '3px 8px',
                backgroundColor: OsakaJadePalette.background.surface,
                border: `1px solid ${OsakaJadePalette.border.strong}`,
                borderRadius: '4px',
                color: OsakaJadePalette.text.secondary,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Reset CAD geometry to standard dynamic animated shell"
            >
              <RotateCcw size={11} />
              <span>Reset to Standard</span>
            </button>
          )}
        </div>

        {/* CAD Preset Selection & Synthesis Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* Clean Dropdown for Presets */}
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  setAiPrompt(e.target.value);
                  handleForgeDrawing(e.target.value);
                }
              }}
              style={{
                backgroundColor: OsakaJadePalette.background.surface,
                border: `1px solid ${OsakaJadePalette.border.default}`,
                borderRadius: '6px',
                padding: '7px 10px',
                color: OsakaJadePalette.text.primary,
                fontSize: '0.8rem',
                outline: 'none',
                minWidth: '170px',
                cursor: 'pointer'
              }}
            >
              <option value="">Load CAD Preset...</option>
              <option value="Jacketed CSTR with Rushton turbine and relief vent">Jacketed CSTR</option>
              <option value="Vertical distillation tower with 6 sieve trays and top reflux nozzle">Distillation Tower</option>
              <option value="Spherical LPG storage vessel with relief nozzle on support legs">Spherical LPG Tank</option>
              <option value="Cyclone separator for vapor-solid particulate separation">Cyclone Separator</option>
              <option value="Horizontal shell and tube heat exchanger with baffles">Shell & Tube Exchanger</option>
              <option value="Twin-fluid spray atomizer with conical droplet dispersion">Spray Atomizer</option>
            </select>

            {/* Prompt Input */}
            <input
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleForgeDrawing();
              }}
              placeholder="Or describe custom geometry (e.g. 'Fractionation column with 12 trays')..."
              style={{
                flex: 1,
                backgroundColor: OsakaJadePalette.background.surface,
                border: `1px solid ${OsakaJadePalette.border.default}`,
                borderRadius: '6px',
                padding: '7px 12px',
                color: OsakaJadePalette.text.primary,
                fontSize: '0.8rem',
                outline: 'none'
              }}
            />

            {/* Action Button */}
            <button
              onClick={() => handleForgeDrawing()}
              disabled={isForging || !aiPrompt.trim()}
              style={{
                padding: '7px 14px',
                backgroundColor: isForging || !aiPrompt.trim() ? OsakaJadePalette.background.surface : OsakaJadePalette.jade[500],
                color: isForging || !aiPrompt.trim() ? OsakaJadePalette.text.muted : OsakaJadePalette.text.inverse,
                border: `1px solid ${isForging || !aiPrompt.trim() ? OsakaJadePalette.border.default : OsakaJadePalette.jade[400]}`,
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: isForging || !aiPrompt.trim() ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap'
              }}
            >
              <Sparkles size={13} />
              <span>{isForging ? 'Synthesizing...' : 'Forge CAD'}</span>
            </button>
          </div>
          {lastForge && (
            <TemplateChoice
              routing={lastForge.routing}
              current={lastForge.current}
              onPick={(family) => handleForgeDrawing(lastForge.prompt, family)}
            />
          )}
        </div>
      </div>

      {/* CAD Dressing Studio Sections - Vertically stacked for clean drawer layout */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
        {/* Card 1: Live Animated SVG Preview with Interactive Nozzle Pins */}
        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: OsakaJadePalette.background.surfaceElevated,
            borderRadius: '10px',
            border: `1px solid ${OsakaJadePalette.border.default}`,
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: OsakaJadePalette.background.surface,
              borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Eye size={16} color={OsakaJadePalette.jade[400]} />
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                Dressed Unit Preview ({node.name})
              </span>
            </div>
            <span
              style={{
                fontSize: '0.7rem',
                color: OsakaJadePalette.jade[300],
                padding: '2px 8px',
                borderRadius: '4px',
                backgroundColor: OsakaJadePalette.jade.muted,
                border: `1px solid ${OsakaJadePalette.jade[700]}`
              }}
            >
              {dressing.nozzles.length} Nozzles Attached
            </span>
          </div>

          {/* Viewport Canvas with Nozzle Markers */}
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
              backgroundColor: OsakaJadePalette.background.canvas,
              minHeight: '260px'
            }}
          >
            {/* Machine Animated Illustration */}
            <div style={{ width: '220px', height: '220px', position: 'relative' }}>
              <UnitAnim kind={node.kind} dressing={dressing} isRunning={true} />

              {/* Render Nozzle Pins around perimeter */}
              {dressing.nozzles.map((nozzle) => {
                const isSelected = nozzle.id === selectedNozzleId;
                return (
                  <div
                    key={nozzle.id}
                    onClick={() => setSelectedNozzleId(nozzle.id)}
                    style={{
                      position: 'absolute',
                      left: `${nozzle.x}%`,
                      top: `${nozzle.y}%`,
                      transform: 'translate(-50%, -50%)',
                      cursor: 'pointer',
                      zIndex: 20
                    }}
                    title={`${nozzle.name} [${nozzle.sizeInches}" / ${nozzle.ratingPsi}#]`}
                  >
                    <div
                      style={{
                        padding: '3px 6px',
                        borderRadius: '4px',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        backgroundColor: isSelected ? OsakaJadePalette.jade[500] : OsakaJadePalette.background.surface,
                        color: isSelected ? OsakaJadePalette.text.inverse : OsakaJadePalette.text.primary,
                        border: `1px solid ${isSelected ? OsakaJadePalette.jade.glow : OsakaJadePalette.border.default}`,
                        boxShadow: isSelected ? `0 0 10px ${OsakaJadePalette.jade.glow}` : 'none',
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <span style={{ width: '6px', height: '6px', borderRadius: r.full, backgroundColor: nozzle.role === 'inlet' ? OsakaJadePalette.status.starved : nozzle.role === 'outlet' ? OsakaJadePalette.jade.glow : OsakaJadePalette.status.blocked }} />
                      {nozzle.id}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Dressing Summary Banner */}
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: OsakaJadePalette.background.surface,
              borderTop: `1px solid ${OsakaJadePalette.border.subtle}`,
              fontSize: '0.78rem',
              color: OsakaJadePalette.text.secondary,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <div>
              Agitator: <strong style={{ color: OsakaJadePalette.text.primary }}>{dressing.internals.agitatorType}</strong> • Jacket:{' '}
              <strong style={{ color: OsakaJadePalette.text.primary }}>{dressing.internals.hasJacket ? dressing.internals.jacketType : 'None'}</strong>
            </div>
            <button
              onClick={handleSaveExplicit}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '4px',
                backgroundColor: OsakaJadePalette.jade[500],
                color: OsakaJadePalette.text.inverse,
                border: 'none',
                fontWeight: 700,
                fontSize: '0.75rem',
                cursor: 'pointer'
              }}
            >
              {saveSuccess ? <Check size={12} /> : <Sparkles size={12} />}
              {saveSuccess ? 'Saved!' : 'Apply Dressing'}
            </button>
          </div>
        </div>

        {/* Card 2: Vessel Internals & Jacket Dressing */}
        <div
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '8px',
            backgroundColor: OsakaJadePalette.background.surface,
            border: `1px solid ${OsakaJadePalette.border.default}`
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Sliders size={16} color={OsakaJadePalette.jade[400]} />
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: OsakaJadePalette.text.primary }}>
              Vessel Internals & Mechanical Dressing
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            {/* Agitator Selection */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: OsakaJadePalette.text.muted, marginBottom: '4px' }}>
                Agitator Impeller
              </label>
              <select
                value={dressing.internals.agitatorType}
                onChange={(e) => handleUpdateInternals({ agitatorType: e.target.value as any })}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.subtle}`,
                  color: OsakaJadePalette.text.primary,
                  fontSize: '0.8rem'
                }}
              >
                <option value="none">None (Static Vessel)</option>
                <option value="pitched_blade">Pitched Blade Turbine (45° Axial)</option>
                <option value="rushton">Rushton Turbine (Radial High-Shear)</option>
                <option value="anchor">Anchor Impeller (High-Viscosity)</option>
                <option value="propeller">Marine Propeller (Low-Viscosity Blending)</option>
              </select>
            </div>

            {/* Utility Jacket Toggle */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: OsakaJadePalette.text.muted, marginBottom: '4px' }}>
                Thermal Jacket
              </label>
              <select
                value={dressing.internals.hasJacket ? dressing.internals.jacketType : 'none'}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'none') {
                    handleUpdateInternals({ hasJacket: false, jacketType: 'none' });
                  } else {
                    handleUpdateInternals({ hasJacket: true, jacketType: val as any });
                  }
                }}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.subtle}`,
                  color: OsakaJadePalette.text.primary,
                  fontSize: '0.8rem'
                }}
              >
                <option value="none">No Jacket (Bare Shell)</option>
                <option value="steam">Steam Heating Jacket (150 psi)</option>
                <option value="water">Chilled Water Cooling Jacket</option>
                <option value="glycol">Refrigerated Glycol Jacket (-10°C)</option>
                <option value="electric">Electric Resistance Heating Trace</option>
              </select>
            </div>

            {/* Wall Baffles */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: OsakaJadePalette.text.muted, marginBottom: '4px' }}>
                Anti-Swirl Wall Baffles
              </label>
              <select
                value={dressing.internals.baffleCount}
                onChange={(e) => handleUpdateInternals({ baffleCount: parseInt(e.target.value, 10) })}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.subtle}`,
                  color: OsakaJadePalette.text.primary,
                  fontSize: '0.8rem'
                }}
              >
                <option value="0">0 Baffles (Unbaffled)</option>
                <option value="2">2 Standard Wall Baffles (180°)</option>
                <option value="4">4 Standard ASME Baffles (90°)</option>
              </select>
            </div>

            {/* Demister Pad */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: OsakaJadePalette.text.muted, marginBottom: '4px' }}>
                Demister / Mist Eliminator
              </label>
              <select
                value={dressing.internals.hasDemister ? 'yes' : 'no'}
                onChange={(e) => handleUpdateInternals({ hasDemister: e.target.value === 'yes' })}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.subtle}`,
                  color: OsakaJadePalette.text.primary,
                  fontSize: '0.8rem'
                }}
              >
                <option value="no">None</option>
                <option value="yes">Wire Mesh Demister Pad</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 2: Nozzle Dressing Manager */}
        <div
          style={{
            padding: '16px',
            borderRadius: '8px',
            backgroundColor: OsakaJadePalette.background.surface,
            border: `1px solid ${OsakaJadePalette.border.default}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: OsakaJadePalette.text.primary }}>
              Nozzle Ports & Flanges
            </span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button
                onClick={() => handleAddNozzle('inlet')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: space[1],
                  padding: `${space[1]}px ${space[2]}px`,
                  borderRadius: r.md,
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.subtle}`,
                  color: OsakaJadePalette.status.starved,
                  fontSize: size.xs,
                  fontWeight: weight.semibold,
                  cursor: 'pointer'
                }}
              >
                <Plus size={11} /> + Inlet
              </button>
              <button
                onClick={() => handleAddNozzle('outlet')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: space[1],
                  padding: `${space[1]}px ${space[2]}px`,
                  borderRadius: r.md,
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.subtle}`,
                  color: OsakaJadePalette.jade.glow,
                  fontSize: size.xs,
                  fontWeight: weight.semibold,
                  cursor: 'pointer'
                }}
              >
                <Plus size={11} /> + Outlet
              </button>
              <button
                onClick={() => handleAddNozzle('vent')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: space[1],
                  padding: `${space[1]}px ${space[2]}px`,
                  borderRadius: r.md,
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.subtle}`,
                  color: OsakaJadePalette.status.blocked,
                  fontSize: size.xs,
                  fontWeight: weight.semibold,
                  cursor: 'pointer'
                }}
              >
                <Plus size={11} /> + Vent
              </button>
              <button
                onClick={() => handleAddNozzle('drain')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: space[1],
                  padding: `${space[1]}px ${space[2]}px`,
                  borderRadius: r.md,
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.subtle}`,
                  color: OsakaJadePalette.status.failed,
                  fontSize: size.xs,
                  fontWeight: weight.semibold,
                  cursor: 'pointer'
                }}
              >
                <Plus size={11} /> + Drain
              </button>
            </div>
          </div>

          {/* Nozzle Chips List */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {dressing.nozzles.map((nozzle) => {
              const isSelected = nozzle.id === selectedNozzleId;
              return (
                <div
                  key={nozzle.id}
                  onClick={() => setSelectedNozzleId(nozzle.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    backgroundColor: isSelected ? OsakaJadePalette.background.surfaceActive : OsakaJadePalette.background.surfaceElevated,
                    border: `1px solid ${isSelected ? OsakaJadePalette.jade.glow : OsakaJadePalette.border.subtle}`,
                    cursor: 'pointer',
                    fontSize: '0.78rem'
                  }}
                >
                  <span style={{ fontWeight: 700, color: isSelected ? OsakaJadePalette.jade[300] : OsakaJadePalette.text.primary }}>
                    {nozzle.id}
                  </span>
                  <span style={{ color: OsakaJadePalette.text.muted, fontSize: '0.72rem' }}>
                    {nozzle.sizeInches}&quot; {nozzle.role}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteNozzle(nozzle.id);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: OsakaJadePalette.text.muted,
                      cursor: 'pointer',
                      padding: '2px',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Selected Nozzle Configuration Properties */}
          {selectedNozzle && (
            <div
              style={{
                marginTop: '8px',
                padding: '14px',
                borderRadius: '6px',
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                border: `1px solid ${OsakaJadePalette.border.subtle}`,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px'
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: OsakaJadePalette.text.muted, marginBottom: '2px' }}>
                  Nozzle Label / Name
                </label>
                <input
                  type="text"
                  value={selectedNozzle.name}
                  onChange={(e) => handleUpdateSelectedNozzle({ name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    backgroundColor: OsakaJadePalette.background.surface,
                    border: `1px solid ${OsakaJadePalette.border.subtle}`,
                    color: OsakaJadePalette.text.primary,
                    fontSize: '0.8rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: OsakaJadePalette.text.muted, marginBottom: '2px' }}>
                  Process Role
                </label>
                <select
                  value={selectedNozzle.role}
                  onChange={(e) => handleUpdateSelectedNozzle({ role: e.target.value as any })}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    backgroundColor: OsakaJadePalette.background.surface,
                    border: `1px solid ${OsakaJadePalette.border.subtle}`,
                    color: OsakaJadePalette.text.primary,
                    fontSize: '0.8rem'
                  }}
                >
                  <option value="inlet">Inlet (Feed Stream)</option>
                  <option value="outlet">Outlet (Product Stream)</option>
                  <option value="vent">Vent (Top Vapor / Off-gas)</option>
                  <option value="drain">Drain (Bottom Slurry / Liquid)</option>
                  <option value="utility">Utility (Steam / Cooling)</option>
                  <option value="relief">Relief (PSV / Rupture Disc)</option>
                  <option value="tap">Tap (Sensor / Sample Port)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: OsakaJadePalette.text.muted, marginBottom: '2px' }}>
                  Nominal Pipe Diameter
                </label>
                <select
                  value={selectedNozzle.sizeInches}
                  onChange={(e) => handleUpdateSelectedNozzle({ sizeInches: parseFloat(e.target.value) })}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    backgroundColor: OsakaJadePalette.background.surface,
                    border: `1px solid ${OsakaJadePalette.border.subtle}`,
                    color: OsakaJadePalette.text.primary,
                    fontSize: '0.8rem'
                  }}
                >
                  <option value="1">1.0&quot; (DN25)</option>
                  <option value="1.5">1.5&quot; (DN40)</option>
                  <option value="2">2.0&quot; (DN50)</option>
                  <option value="3">3.0&quot; (DN80)</option>
                  <option value="4">4.0&quot; (DN100)</option>
                  <option value="6">6.0&quot; (DN150)</option>
                  <option value="8">8.0&quot; (DN200)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: OsakaJadePalette.text.muted, marginBottom: '2px' }}>
                  ASME Flange Class
                </label>
                <select
                  value={selectedNozzle.ratingPsi}
                  onChange={(e) => handleUpdateSelectedNozzle({ ratingPsi: parseInt(e.target.value, 10) })}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    backgroundColor: OsakaJadePalette.background.surface,
                    border: `1px solid ${OsakaJadePalette.border.subtle}`,
                    color: OsakaJadePalette.text.primary,
                    fontSize: '0.8rem'
                  }}
                >
                  <option value="150">Class 150# (PN20)</option>
                  <option value="300">Class 300# (PN50)</option>
                  <option value="600">Class 600# (PN100)</option>
                </select>
              </div>

              {/* X / Y Position Sliders */}
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: OsakaJadePalette.text.muted, marginBottom: '2px' }}>
                  Position X ({selectedNozzle.x}%)
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={selectedNozzle.x}
                  onChange={(e) => handleUpdateSelectedNozzle({ x: parseInt(e.target.value, 10) })}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: OsakaJadePalette.text.muted, marginBottom: '2px' }}>
                  Position Y ({selectedNozzle.y}%)
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={selectedNozzle.y}
                  onChange={(e) => handleUpdateSelectedNozzle({ y: parseInt(e.target.value, 10) })}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UnitOpDressingTab;
