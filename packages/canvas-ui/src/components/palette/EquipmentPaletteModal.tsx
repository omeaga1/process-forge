import React, { useState, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme.js';
import type { NodeKind, ProcessNode } from '@process-forge/protocol';
import { createDefaultProcessNode } from '../../utils/nodeFactory.js';
import {
  X,
  Search,
  Plus,
  Layers,
  Check
} from 'lucide-react';
import { draftingRadius } from '@process-forge/theme';

export interface EquipmentPaletteItem {
  kind: NodeKind;
  category: 'FLUID_PROCESSING' | 'STORAGE_HEAT' | 'PACKAGING';
  title: string;
  subtitle: string;
  defaultFlowGpm?: number;
  description: string;
  tags: string[];
}

export const STANDARD_EQUIPMENT_CATALOG: EquipmentPaletteItem[] = [
  {
    kind: 'PUMP',
    category: 'FLUID_PROCESSING',
    title: 'Centrifugal Pump',
    subtitle: 'End-suction process fluid transfer pump',
    defaultFlowGpm: 100,
    description: 'Dynamic pressure head boost for liquid streams. Configurable TDH, motor horsepower, and suction/discharge pipe sizing.',
    tags: ['pump', 'fluid', 'pressure', 'transfer', 'impeller', 'continuous']
  },
  {
    kind: 'SURGE_TANK',
    category: 'STORAGE_HEAT',
    title: 'Surge Buffer Tank',
    subtitle: 'Atmospheric fluid accumulation and surge damping',
    defaultFlowGpm: 60,
    description: 'Dampens batch surges and flow oscillations. Includes level telemetry, high/low alarms, and bottom sump suction port.',
    tags: ['tank', 'vessel', 'buffer', 'storage', 'damping', 'fluid']
  },
  {
    kind: 'BATCH_REACTOR',
    category: 'FLUID_PROCESSING',
    title: 'CSTR / Batch Reactor',
    subtitle: 'Jacketed reaction vessel with mechanical agitation',
    defaultFlowGpm: 50,
    description: 'Models chemical synthesis, dispersion, and blending with turbine agitators, cooling/heating jackets, and reflux ports.',
    tags: ['reactor', 'cstr', 'batch', 'mixing', 'jacket', 'agitator', 'blending']
  },
  {
    kind: 'HEAT_EXCHANGER',
    category: 'STORAGE_HEAT',
    title: 'Shell & Tube Heat Exchanger',
    subtitle: 'Multi-pass industrial thermal conditioning',
    defaultFlowGpm: 80,
    description: 'Continuous thermal duty exchange between shell-side process fluid and tube-side cooling/heating utilities.',
    tags: ['exchanger', 'heat', 'thermal', 'cooling', 'heating', 'shell', 'tube']
  },
  {
    kind: 'SEPARATOR',
    category: 'FLUID_PROCESSING',
    title: 'Flash Separation Drum',
    subtitle: 'Two-phase vapor-liquid separation vessel',
    defaultFlowGpm: 75,
    description: 'Gravity-driven separation of mixed multiphase fluids into top vapor discharge and bottom liquid streams with demister pads.',
    tags: ['separator', 'flash', 'drum', 'vapor', 'liquid', 'multiphase']
  },
  {
    kind: 'ROTARY_FILLER',
    category: 'PACKAGING',
    title: 'Rotary Container Filler',
    subtitle: 'High-speed rotary piston liquid filling cell',
    defaultFlowGpm: 45,
    description: 'Phase transition interface converting continuous fluid infeed into discrete filled cans or bottles with reject telemetry.',
    tags: ['filler', 'packaging', 'rotary', 'liquid', 'bottling', 'canning', 'discrete']
  },
  {
    kind: 'CONVEYOR',
    category: 'PACKAGING',
    title: 'Accumulation Belt Conveyor',
    subtitle: 'Continuous discrete unit transport & queuing buffer',
    description: 'Transfers packaged containers between processing cells. Features item spacing, velocity control, and backpressure monitoring.',
    tags: ['conveyor', 'belt', 'accumulation', 'discrete', 'packaging', 'transport']
  },
  {
    kind: 'LABELER',
    category: 'PACKAGING',
    title: 'High-Speed Container Labeler',
    subtitle: 'Continuous optical inspection & rotary labeling station',
    description: 'High-cadence labeling cell with vision inspection cameras, defect detection, and pneumatic reject diverter chutes.',
    tags: ['labeler', 'optical', 'inspection', 'packaging', 'discrete', 'reject']
  },
  {
    kind: 'PALLETIZER',
    category: 'PACKAGING',
    title: 'Automated Palletizer Cell',
    subtitle: 'End-of-line robotic layer palletizing & skid staging',
    description: 'Packs finished containers into layer patterns and skids with changeover buffers and packaged throughput meters.',
    tags: ['palletizer', 'skid', 'end-of-line', 'layer', 'packaging', 'discrete']
  }
];

export interface EquipmentPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertNode: (node: ProcessNode) => void;
  /** Leaves the stock list for the Unit Op Creator. */
  onDesignNew?: () => void;
}

export const EquipmentPaletteModal: React.FC<EquipmentPaletteModalProps> = ({
  isOpen,
  onClose,
  onInsertNode,
  onDesignNew
}) => {
  const { palette, radius: r } = useTheme();
  const OsakaJadePalette = palette;
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'FLUID_PROCESSING' | 'STORAGE_HEAT' | 'PACKAGING'>('ALL');
  const [justAddedKind, setJustAddedKind] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return STANDARD_EQUIPMENT_CATALOG.filter((item) => {
      const matchesCat = selectedCategory === 'ALL' || item.category === selectedCategory;
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.kind.toLowerCase().includes(q) ||
        item.tags.some((t) => t.includes(q))
      );
    });
  }, [searchQuery, selectedCategory]);

  const handleInsert = (item: EquipmentPaletteItem) => {
    const newNode = createDefaultProcessNode(item.kind, {
      flowRateGpm: item.defaultFlowGpm
    });
    onInsertNode(newNode);
    setJustAddedKind(item.kind);
    setTimeout(() => {
      setJustAddedKind(null);
      onClose();
    }, 450);
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 10, 12, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 860,
          maxWidth: '100%',
          maxHeight: '90vh',
          backgroundColor: OsakaJadePalette.background.surface,
          border: `1px solid ${OsakaJadePalette.border.default}`,
          borderRadius: draftingRadius.sharp,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 24px',
            backgroundColor: OsakaJadePalette.background.canvas,
            borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: r.md,
                backgroundColor: `${OsakaJadePalette.jade[500]}1a`,
                border: `1px solid ${OsakaJadePalette.jade[500]}44`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: OsakaJadePalette.jade.glow
              }}
            >
              <Layers size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                  Add Unit Operation
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    padding: '2px 8px',
                    borderRadius: r.full,
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    color: OsakaJadePalette.jade.glow,
                    border: `1px solid ${OsakaJadePalette.jade[600]}40`
                  }}
                >
                  Standard equipment
                </span>
              </div>
              <div style={{ fontSize: 12, color: OsakaJadePalette.text.secondary, marginTop: 2 }}>
                Stock units with ready-made models. For anything else, design it.
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: r.md,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'transparent',
              border: `1px solid ${OsakaJadePalette.border.subtle}`,
              color: OsakaJadePalette.text.muted,
              cursor: 'pointer'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Designing is the point; the stock list is the shortcut. */}
        {onDesignNew && (
          <button
            type="button"
            onClick={onDesignNew}
            style={{
              margin: '12px 24px 0',
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              textAlign: 'left',
              borderRadius: draftingRadius.soft,
              border: `1px solid ${OsakaJadePalette.jade[600]}`,
              backgroundColor: 'rgba(16, 185, 129, 0.08)',
              color: OsakaJadePalette.text.primary,
              cursor: 'pointer'
            }}
          >
            <span>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>Not in this list? Design it.</span>
              <span style={{ display: 'block', fontSize: 12, color: OsakaJadePalette.text.secondary, marginTop: 2 }}>
                Describe the equipment. Claude writes it as a contract, and the engine checks the physics before it goes on the flowsheet.
              </span>
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: OsakaJadePalette.jade.glow, whiteSpace: 'nowrap' }}>Design a unit op →</span>
          </button>
        )}

        {/* Search & Category Filter Bar */}
        <div
          style={{
            padding: '14px 24px',
            backgroundColor: OsakaJadePalette.background.surface,
            borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap'
          }}
        >
          {/* Search Box */}
          <div
            style={{
              position: 'relative',
              flex: '1 1 240px',
              minWidth: 200
            }}
          >
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: OsakaJadePalette.text.muted,
                pointerEvents: 'none'
              }}
            />
            <input
              type="text"
              placeholder="Search pumps, tanks, reactors, fillers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                borderRadius: r.md,
                backgroundColor: OsakaJadePalette.background.canvas,
                border: `1px solid ${OsakaJadePalette.border.default}`,
                color: OsakaJadePalette.text.primary,
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Category Tabs */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { id: 'ALL', label: 'All Equipment' },
              { id: 'FLUID_PROCESSING', label: 'Fluid & Pumping' },
              { id: 'STORAGE_HEAT', label: 'Storage & Thermal' },
              { id: 'PACKAGING', label: 'Packaging & Conveying' }
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id as any)}
                style={{
                  padding: '6px 12px',
                  borderRadius: r.md,
                  fontSize: 12,
                  fontWeight: selectedCategory === cat.id ? 700 : 500,
                  backgroundColor:
                    selectedCategory === cat.id
                      ? `${OsakaJadePalette.jade[500]}22`
                      : OsakaJadePalette.background.canvas,
                  border: `1px solid ${
                    selectedCategory === cat.id
                      ? OsakaJadePalette.jade[500]
                      : OsakaJadePalette.border.subtle
                  }`,
                  color:
                    selectedCategory === cat.id
                      ? OsakaJadePalette.jade.glow
                      : OsakaJadePalette.text.secondary,
                  cursor: 'pointer'
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Equipment Catalog Grid */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 24,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
            gap: 16
          }}
        >
          {filteredItems.map((item) => {
            const isAdded = justAddedKind === item.kind;
            return (
              <div
                key={item.kind}
                style={{
                  backgroundColor: OsakaJadePalette.background.canvas,
                  border: `1px solid ${isAdded ? OsakaJadePalette.jade.glow : OsakaJadePalette.border.default}`,
                  borderRadius: draftingRadius.soft,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  transition: 'all 0.15s ease',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: OsakaJadePalette.jade[400]
                      }}
                    >
                      {item.kind.replace(/_/g, ' ')}
                    </span>
                    {item.defaultFlowGpm && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: OsakaJadePalette.text.muted,
                          fontFamily: 'monospace'
                        }}
                      >
                        ~{item.defaultFlowGpm} GPM
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: 14, fontWeight: 700, color: OsakaJadePalette.text.primary, marginBottom: 4 }}>
                    {item.title}
                  </div>

                  <div style={{ fontSize: 11, color: OsakaJadePalette.text.muted, marginBottom: 10 }}>
                    {item.subtitle}
                  </div>

                  <div style={{ fontSize: 12, color: OsakaJadePalette.text.secondary, lineHeight: 1.4, marginBottom: 14 }}>
                    {item.description}
                  </div>
                </div>

                <button
                  onClick={() => handleInsert(item)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '8px 12px',
                    borderRadius: draftingRadius.soft,
                    backgroundColor: isAdded ? OsakaJadePalette.jade.glow : 'rgba(16, 185, 129, 0.15)',
                    border: `1px solid ${OsakaJadePalette.jade[600]}`,
                    color: isAdded ? OsakaJadePalette.background.base : OsakaJadePalette.jade.glow,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {isAdded ? (
                    <>
                      <Check size={14} />
                      <span>Added to Flowsheet!</span>
                    </>
                  ) : (
                    <>
                      <Plus size={14} />
                      <span>Add to Flowsheet</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
