import React, { useState, useMemo, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme.js';
import type { ProcessNode } from '@process-forge/protocol';
import { STANDARD_EQUIPMENT_CATALOG, createStandardUnitOp, type EquipmentPaletteItem } from '@process-forge/protocol';
import { TerminalArrow, terminalColor } from '../nodes/TerminalNode.js';
import { drawingToDressing } from '@process-forge/protocol';
import { useSavedUnitOps, removeSavedUnitOp, type SavedUnitOp } from '../../library/savedUnitOps.js';
import { contractToProcessNode } from '../../unitop/contractToNode.js';
import { describeUnitBehavior, formatRate } from '../../model/unitBehavior.js';
import { EquipmentFigure } from '../../nozzles/EquipmentFigure.js';
import {
  X,
  Search,
  Plus,
  Layers,
  Check,
  Trash2,
  Bookmark
} from 'lucide-react';
import { draftingRadius } from '@process-forge/theme';

/** The catalog lives in the protocol package, so the MCP server lists the same units. */
export { STANDARD_EQUIPMENT_CATALOG, type EquipmentPaletteItem };

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
  const [selectedCategory, setSelectedCategory] = useState<'MINE' | 'ALL' | EquipmentPaletteItem['category']>('ALL');
  const [justAddedKind, setJustAddedKind] = useState<string | null>(null);
  const saved = useSavedUnitOps();
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  // Open on your own designs when there are any: they are why you came.
  useEffect(() => {
    if (isOpen) {
      setSelectedCategory(saved.length > 0 ? 'MINE' : 'ALL');
      setConfirmRemove(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const savedShown = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return saved.filter(
      (i) => !q || i.contract.name.toLowerCase().includes(q) || (i.contract.description ?? '').toLowerCase().includes(q)
    );
  }, [saved, searchQuery]);

  const handleInsertSaved = (item: SavedUnitOp) => {
    onInsertNode(contractToProcessNode(item.contract));
    setJustAddedKind(item.id);
    setTimeout(() => {
      setJustAddedKind(null);
      onClose();
    }, 450);
  };

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return STANDARD_EQUIPMENT_CATALOG.filter((item) => {
      const matchesCat = selectedCategory === 'ALL' || selectedCategory === 'MINE' || item.category === selectedCategory;
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
    onInsertNode(createStandardUnitOp(item));
    setJustAddedKind(item.id);
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
                  {selectedCategory === 'MINE' ? 'Your designs' : 'Standard equipment'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: OsakaJadePalette.text.secondary, marginTop: 2 }}>
                {selectedCategory === 'MINE'
                  ? 'Unit ops you designed, or your MCP client added, ready to place again.'
                  : 'Stock units with ready-made models. For anything else, design it.'}
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
                Describe the equipment. Your AI model writes it as a contract, and the engine checks the physics before it goes on the flowsheet.
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
              placeholder="Search feeds, pumps, tanks, reactors, fillers..."
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
              { id: 'MINE', label: `My unit ops · ${saved.length}` },
              { id: 'ALL', label: 'All Equipment' },
              { id: 'FEEDS_OUTLETS', label: 'Feeds & outlets' },
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
          {selectedCategory === 'MINE' && savedShown.length === 0 && (
            <div style={{ gridColumn: '1 / -1', padding: '32px 12px', textAlign: 'center', color: OsakaJadePalette.text.muted, fontSize: 13, lineHeight: 1.6 }}>
              <Bookmark size={20} style={{ display: 'block', margin: '0 auto 8px' }} />
              {saved.length === 0
                ? 'Nothing saved yet. Every unit you design, or your MCP client adds, is kept here to use again in any project.'
                : `No saved unit op matches "${searchQuery}".`}
            </div>
          )}
          {selectedCategory === 'MINE' &&
            savedShown.map((item) => {
              const node = contractToProcessNode(item.contract);
              const b = describeUnitBehavior(node, { id: '', name: '', version: '', metadata: {}, nodes: [node], edges: [] });
              const rate = formatRate(b.capacityPerMin, b.rateUnit);
              const dressing = item.contract.drawing ? drawingToDressing(item.contract.drawing, item.contract.ports) : undefined;
              const isAdded = justAddedKind === item.id;
              return (
                <div
                  key={item.id}
                  style={{
                    backgroundColor: OsakaJadePalette.background.canvas,
                    border: `1px solid ${isAdded ? OsakaJadePalette.jade.glow : OsakaJadePalette.border.default}`,
                    borderRadius: draftingRadius.soft,
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10
                  }}
                >
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 72, height: 60, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <EquipmentFigure kind="CUSTOM_UNIT_OP" {...(dressing ? { dressing } : {})} width={64} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: OsakaJadePalette.text.primary }}>{item.contract.name}</div>
                      <div style={{ fontSize: 11, color: OsakaJadePalette.text.muted, marginTop: 2 }}>
                        {item.source === 'mcp' ? 'From your MCP client' : item.source === 'studio' ? 'Saved from a flowsheet' : 'Designed here'} ·{' '}
                        {new Date(item.savedAt).toLocaleDateString()}
                      </div>
                      {b.capacityPerMin !== null && (
                        <div style={{ fontSize: 12, fontWeight: 600, color: OsakaJadePalette.text.accent, marginTop: 4, fontFamily: 'monospace' }}>
                          {rate.value}
                          {rate.per}
                        </div>
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: OsakaJadePalette.text.secondary,
                      lineHeight: 1.45,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}
                  >
                    {item.contract.description || b.headline}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                    <button
                      type="button"
                      onClick={() => handleInsertSaved(item)}
                      style={{
                        flex: 1,
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
                        cursor: 'pointer'
                      }}
                    >
                      {isAdded ? <Check size={14} /> : <Plus size={14} />}
                      {isAdded ? 'Added' : 'Add to flowsheet'}
                    </button>
                    {confirmRemove === item.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          removeSavedUnitOp(item.id);
                          setConfirmRemove(null);
                        }}
                        style={{
                          padding: '8px 10px',
                          borderRadius: draftingRadius.soft,
                          border: 'none',
                          backgroundColor: '#dc2626',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Remove
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmRemove(item.id)}
                        title="Remove from My unit ops (units already on a flowsheet stay)"
                        aria-label={`Remove ${item.contract.name} from My unit ops`}
                        style={{
                          width: 34,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: draftingRadius.soft,
                          border: `1px solid ${OsakaJadePalette.border.default}`,
                          backgroundColor: 'transparent',
                          color: OsakaJadePalette.text.muted,
                          cursor: 'pointer'
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          {selectedCategory !== 'MINE' && filteredItems.map((item) => {
            const isAdded = justAddedKind === item.id;
            const role = item.terminalRole;
            return (
              <div
                key={item.id}
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
                      {role ? (role === 'feed' ? 'Stream in' : 'Stream out') : item.kind.replace(/_/g, ' ')}
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

                  {role && (
                    <div style={{ margin: '4px 0 10px' }}>
                      <TerminalArrow
                        role={role}
                        color={terminalColor(role, OsakaJadePalette)}
                        fill={`${terminalColor(role, OsakaJadePalette)}14`}
                        width={120}
                        height={30}
                      />
                    </div>
                  )}
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
