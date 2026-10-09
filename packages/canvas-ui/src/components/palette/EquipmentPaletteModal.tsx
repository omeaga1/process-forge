import React, { useState, useMemo, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme.js';
import type { ProcessNode } from '@process-forge/protocol';
import { EQUIPMENT_CATEGORIES, STANDARD_EQUIPMENT_CATALOG, createStandardUnitOp, type EquipmentPaletteItem } from '@process-forge/protocol';
import { TerminalArrow, terminalColor } from '../nodes/TerminalNode.js';
import { drawingToDressing } from '@process-forge/protocol';
import { useSavedUnitOps, removeSavedUnitOp, type SavedUnitOp } from '../../library/savedUnitOps.js';
import { useUnitOpSyncStatus } from '../../library/unitOpCloudSync.js';
import { contractToProcessNode } from '../../unitop/contractToNode.js';
import { describeUnitBehavior, formatRate } from '../../model/unitBehavior.js';
import { EquipmentFigure } from '../../nozzles/EquipmentFigure.js';
import { drawingSize } from '../../nozzles/nozzleLayout.js';

/** A figure's width in a tile: as wide as asked, or narrower so a tall drawing (a column, an evaporator) stays inside its 60 px box. */
function tileWidth(kind: string, dressing: Parameters<typeof drawingSize>[1], widest: number, tallest = 60): number {
  const d = drawingSize(kind, dressing);
  return d.width > 0 && d.height > 0 ? Math.min(widest, (tallest * d.width) / d.height) : widest;
}
import { Search, Plus, Layers, Check, Trash2, Bookmark, Sparkles } from 'lucide-react';
import { tint } from '@process-forge/theme';
import { Button, Modal } from '../../ui/index.js';

/** The catalog lives in the protocol package, so the MCP server lists the same units. */
export { STANDARD_EQUIPMENT_CATALOG, type EquipmentPaletteItem };

export interface EquipmentPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertNode: (node: ProcessNode) => void;
  /** Leaves the stock list for the Unit Op Creator. */
  onDesignNew?: () => void;
}

type Category = 'MINE' | 'ALL' | EquipmentPaletteItem['category'];

const matches = (item: EquipmentPaletteItem, q: string) =>
  !q ||
  item.title.toLowerCase().includes(q) ||
  item.subtitle.toLowerCase().includes(q) ||
  item.description.toLowerCase().includes(q) ||
  item.kind.toLowerCase().includes(q) ||
  item.tags.some((t) => t.includes(q));

/**
 * Add equipment: the stock units and the engineer's own designs, by
 * category, searchable. A tile is the add button; the dialog closes once the
 * unit is on the flowsheet.
 */
/** Closed, it renders nothing: the canvas re-renders on every edit, and a closed palette has nothing to show. */
export const EquipmentPaletteModal: React.FC<EquipmentPaletteModalProps> = (props) => (props.isOpen ? <OpenPalette {...props} /> : null);

const OpenPalette: React.FC<EquipmentPaletteModalProps> = ({ isOpen, onClose, onInsertNode, onDesignNew }) => {
  const { palette, font } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<Category>('ALL');
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const saved = useSavedUnitOps();
  const sync = useUnitOpSyncStatus();
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  // Open on your own designs when there are any: they are why you came.
  useEffect(() => {
    if (isOpen) {
      setCategory(saved.length > 0 ? 'MINE' : 'ALL');
      setConfirmRemove(null);
      setSearchQuery('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const q = searchQuery.toLowerCase().trim();
  const savedShown = useMemo(
    () => saved.filter((i) => !q || i.contract.name.toLowerCase().includes(q) || (i.contract.description ?? '').toLowerCase().includes(q)),
    [saved, q]
  );
  const found = useMemo(() => STANDARD_EQUIPMENT_CATALOG.filter((i) => matches(i, q)), [q]);
  // A search looks everywhere: the category only narrows an empty search.
  const shown = useMemo(() => (q || category === 'ALL' || category === 'MINE' ? found : found.filter((i) => i.category === category)), [found, category, q]);
  const countOf = (c: Category) => (c === 'MINE' ? savedShown.length : c === 'ALL' ? found.length : found.filter((i) => i.category === c).length);

  const added = (id: string, node: ProcessNode) => {
    onInsertNode(node);
    setJustAdded(id);
    setTimeout(() => {
      setJustAdded(null);
      onClose();
    }, 350);
  };

  const rail: { id: Category; label: string }[] = [
    { id: 'MINE', label: 'My unit ops' },
    { id: 'ALL', label: 'All equipment' },
    ...EQUIPMENT_CATEGORIES.map((c) => ({ id: c.id as Category, label: c.label }))
  ];
  const showMine = category === 'MINE' && !q;

  const tile = (key: string, isAdded: boolean, onAdd: () => void, figure: React.ReactNode, title: string, sub: React.ReactNode, meta?: React.ReactNode, extra?: React.ReactNode) => (
    <div key={key} style={{ position: 'relative' }}>
      <button
        type="button"
        className="pf-palette-tile pf-focus"
        onClick={onAdd}
        aria-label={`Add ${title} to the flowsheet`}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 8,
          padding: 12,
          textAlign: 'left',
          cursor: 'pointer',
          borderRadius: 8,
          border: `1px solid ${isAdded ? palette.jade.glow : palette.border.default}`,
          backgroundColor: isAdded ? tint(palette.jade[500], 0.12) : palette.background.canvas,
          color: palette.text.primary,
          fontFamily: font.sans
        }}
      >
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{figure}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 650, lineHeight: 1.3 }}>{title}</div>
          <div style={{ fontSize: 12, color: palette.text.muted, marginTop: 2, lineHeight: 1.35 }}>{sub}</div>
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, minHeight: 18 }}>
          <span style={{ fontSize: 11, color: palette.text.muted, fontFamily: font.mono }}>{meta}</span>
          <span className="pf-palette-add" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 650, color: palette.jade.glow }}>
            {isAdded ? <Check size={13} /> : <Plus size={13} />}
            {isAdded ? 'Added' : 'Add'}
          </span>
        </div>
      </button>
      {extra}
    </div>
  );

  return (
    <Modal
      open={isOpen}
      onOpenChange={(o) => !o && onClose()}
      width={980}
      flush
      icon={
        <div style={{ width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', backgroundColor: tint(palette.jade[500], 0.14), color: palette.jade.glow }}>
          <Layers size={17} />
        </div>
      }
      title="Add equipment"
      description="Stock units with ready-made models, and the unit ops you designed. Click one to place it."
      footer={
        onDesignNew ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 12 }}>
            <span style={{ fontSize: 13, color: palette.text.secondary }}>
              Not here? Describe it: your AI model writes the contract and the engine checks its physics.
            </span>
            <Button variant="primary" icon={<Sparkles size={14} />} onClick={onDesignNew}>
              Design a unit op
            </Button>
          </div>
        ) : undefined
      }
    >
      <style>{`.pf-palette-tile{transition:border-color 120ms ease,background-color 120ms ease}.pf-palette-tile:hover{border-color:var(--pf-border-strong)!important;background:var(--pf-bg-surface-hover)!important}.pf-palette-tile .pf-palette-add{opacity:.55;transition:opacity 120ms ease}.pf-palette-tile:hover .pf-palette-add,.pf-palette-tile:focus-visible .pf-palette-add{opacity:1}.pf-rail-item{transition:background-color 120ms ease,color 120ms ease}.pf-rail-item:hover{background:var(--pf-bg-surface-hover)!important;color:var(--pf-text-primary)!important}`}</style>
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', height: 'min(640px, calc(100dvh - 220px))' }}>
        {/* Categories */}
        <nav aria-label="Equipment categories" style={{ borderRight: `1px solid ${palette.border.subtle}`, padding: 10, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {rail.map((c, i) => {
            const active = !q && category === c.id;
            return (
              <React.Fragment key={c.id}>
                {i === 2 && <div style={{ height: 1, margin: '6px 4px', backgroundColor: palette.border.subtle }} />}
                <button
                  type="button"
                  className="pf-rail-item pf-focus"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => {
                    setCategory(c.id);
                    setSearchQuery('');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '7px 10px',
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: font.sans,
                    fontSize: 13,
                    fontWeight: active ? 650 : 500,
                    backgroundColor: active ? tint(palette.jade[500], 0.14) : 'transparent',
                    color: active ? palette.jade.glow : palette.text.secondary
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    {c.id === 'MINE' && <Bookmark size={13} />}
                    {c.label}
                  </span>
                  <span style={{ fontSize: 11, color: palette.text.muted, fontVariantNumeric: 'tabular-nums' }}>{countOf(c.id)}</span>
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        {/* Search and results */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${palette.border.subtle}`, position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 27, top: '50%', transform: 'translateY(-50%)', color: palette.text.muted, pointerEvents: 'none' }} />
            <input
              className="pf-input"
              type="search"
              autoFocus
              placeholder="Search everything: pumps, tanks, reactors, fillers…"
              aria-label="Search equipment"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: 34 }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {showMine && (
              <div role="status" style={{ fontSize: 12, marginBottom: 12, color: sync.kind === 'error' ? palette.status.blocked : palette.text.muted }}>
                {sync.kind === 'signed-out'
                  ? 'Kept on this device. Sign in with Google to have them on your other devices too.'
                  : sync.kind === 'syncing'
                    ? 'Syncing with your account…'
                    : sync.kind === 'synced'
                      ? 'Synced with your account: on every device you sign in on.'
                      : sync.message}
              </div>
            )}
            {showMine && savedShown.length === 0 && (
              <div style={{ padding: '48px 24px', textAlign: 'center', color: palette.text.muted, fontSize: 13, lineHeight: 1.6 }}>
                <Bookmark size={22} style={{ display: 'block', margin: '0 auto 10px' }} />
                Nothing saved yet. Every unit you design, or your MCP client adds, is kept here to use again in any project.
              </div>
            )}
            {!showMine && shown.length === 0 && (
              <div style={{ padding: '48px 24px', textAlign: 'center', color: palette.text.muted, fontSize: 13 }}>
                Nothing matches “{searchQuery}”. {onDesignNew && 'Design it instead: the button below.'}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(176px, 1fr))', gap: 10 }}>
              {showMine &&
                savedShown.map((item: SavedUnitOp) => {
                  const node = contractToProcessNode(item.contract);
                  const b = describeUnitBehavior(node, { id: '', name: '', version: '', metadata: {}, nodes: [node], edges: [] });
                  const rate = formatRate(b.capacityPerMin, b.rateUnit);
                  const dressing = item.contract.drawing ? drawingToDressing(item.contract.drawing, item.contract.ports) : undefined;
                  return tile(
                    item.id,
                    justAdded === item.id,
                    () => added(item.id, contractToProcessNode(item.contract)),
                    <EquipmentFigure kind="CUSTOM_UNIT_OP" {...(dressing ? { dressing } : {})} width={tileWidth('CUSTOM_UNIT_OP', dressing, 64)} />,
                    item.contract.name,
                    item.source === 'mcp' ? 'From your MCP client' : item.source === 'studio' ? 'Saved from a flowsheet' : 'Designed here',
                    b.capacityPerMin !== null ? `${rate.value}${rate.per}` : undefined,
                    <div style={{ position: 'absolute', top: 6, right: 6 }}>
                      {confirmRemove === item.id ? (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            removeSavedUnitOp(item.id);
                            setConfirmRemove(null);
                          }}
                        >
                          Remove
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" iconOnly icon={<Trash2 size={13} />} label={`Remove ${item.contract.name} from My unit ops (copies on flowsheets stay)`} onClick={() => setConfirmRemove(item.id)} />
                      )}
                    </div>
                  );
                })}
              {!showMine &&
                shown.map((item, index) => {
                  const role = item.terminalRole;
                  const cat = EQUIPMENT_CATEGORIES.find((c) => c.id === item.category);
                  const heading = (category === 'ALL' || q) && shown[index - 1]?.category !== item.category;
                  const dressing = item.contract?.drawing ? drawingToDressing(item.contract.drawing, item.contract.ports) : undefined;
                  return (
                    <React.Fragment key={item.id}>
                      {heading && (
                        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'baseline', gap: 10, marginTop: index === 0 ? 0 : 14 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: palette.text.primary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{cat?.label}</span>
                          <span style={{ fontSize: 12, color: palette.text.muted }}>{cat?.description}</span>
                        </div>
                      )}
                      {tile(
                        item.id,
                        justAdded === item.id,
                        () => added(item.id, createStandardUnitOp(item)),
                        role ? (
                          <TerminalArrow role={role} color={terminalColor(role, palette)} fill={`${terminalColor(role, palette)}14`} width={112} height={28} />
                        ) : (
                          <EquipmentFigure kind={item.kind} {...(dressing ? { dressing } : {})} width={tileWidth(item.kind, dressing, item.contract ? 68 : 60)} />
                        ),
                        item.title,
                        item.subtitle,
                        role ? (role === 'feed' ? 'stream in' : 'stream out') : item.defaultFlowGpm ? `~${item.defaultFlowGpm} gpm` : item.short
                      )}
                    </React.Fragment>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
