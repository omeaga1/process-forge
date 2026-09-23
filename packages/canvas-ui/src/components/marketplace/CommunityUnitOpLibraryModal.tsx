import React, { useState, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme.js';
import { ProcessForgeEmblem } from '../brand/ProcessForgeLogo.js';
import type { ProcessNode } from '@process-forge/protocol';
import {
  X,
  Search,
  Plus,
  Cloud,
  WifiOff,
  UserCheck,
  Check
} from 'lucide-react';
import {
  CommunityLibraryService,
  type CommunityUnitOpItem,
  type CreatorSession
} from '../../marketplace/communityLibraryClient.js';
import { draftingRadius } from '@process-forge/theme';

export interface CommunityUnitOpLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertNode: (node: ProcessNode) => void;
}

export const CommunityUnitOpLibraryModal: React.FC<CommunityUnitOpLibraryModalProps> = ({
  isOpen,
  onClose,
  onInsertNode
}) => {
  const { palette, font, size, weight, space, radius: r, motion } = useTheme();
  const OsakaJadePalette = palette;
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [plugins, setPlugins] = useState<CommunityUnitOpItem[]>([]);
  const [isLiveApi, setIsLiveApi] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [creatorSession, setCreatorSession] = useState<CreatorSession | null>(null);
  const [insertError, setInsertError] = useState<string | null>(null);
  const [insertedId, setInsertedId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadLibraryData();
      setCreatorSession(CommunityLibraryService.getSession());
    }
  }, [isOpen, searchQuery, selectedCategory]);

  const loadLibraryData = async () => {
    setIsLoading(true);
    try {
      const { items, isLiveApi: live } = await CommunityLibraryService.fetchUnitOps(
        searchQuery,
        selectedCategory
      );
      setPlugins(items);
      setIsLiveApi(live);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  const handleInsert = async (plugin: CommunityUnitOpItem) => {
    setInsertError(null);
    // Listings do not carry the equipment definition; fetch it now.
    const template = plugin.nodeTemplate ?? (await CommunityLibraryService.fetchUnitOpTemplate(plugin.id));
    if (!template) {
      setInsertError(`Could not load "${plugin.name}" from the library.`);
      return;
    }
    const nodeInstance: ProcessNode = {
      ...template,
      id: `node-${template.kind.toLowerCase()}-${Date.now()}`,
      position: {
        x: (template.position?.x || 500) + Math.floor(Math.random() * 80) - 40,
        y: (template.position?.y || 350) + Math.floor(Math.random() * 80) - 40
      }
    };
    onInsertNode(nodeInstance);
    setInsertedId(plugin.id);
    setTimeout(() => {
      setInsertedId(null);
      onClose();
    }, 900);
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
    >
      <div
        style={{
          width: 880,
          maxWidth: '100%',
          maxHeight: '90vh',
          backgroundColor: OsakaJadePalette.background.surface,
          border: `1px solid ${OsakaJadePalette.border.default}`,
          borderRadius: draftingRadius.sharp,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: r.md,
                backgroundColor: `${OsakaJadePalette.jade[500]}1a`,
                border: `1px solid ${OsakaJadePalette.jade[500]}44`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <ProcessForgeEmblem size={26} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: size.lg, fontWeight: weight.bold, color: OsakaJadePalette.text.primary, letterSpacing: '-0.02em' }}>
                  Community library
                </h3>
                <span
                  style={{
                    fontSize: size['2xs'],
                    display: 'flex',
                    alignItems: 'center',
                    gap: space[1],
                    padding: `2px ${space[2]}px`,
                    borderRadius: r.full,
                    backgroundColor: isLiveApi ? `${OsakaJadePalette.jade.glow}26` : 'rgba(255, 255, 255, 0.06)',
                    color: isLiveApi ? OsakaJadePalette.jade[300] : OsakaJadePalette.text.secondary,
                    border: `1px solid ${isLiveApi ? OsakaJadePalette.jade[500] : OsakaJadePalette.border.default}`,
                    fontFamily: font.mono
                  }}
                >
                  {isLiveApi ? <Cloud size={11} /> : <WifiOff size={11} />}
                  {isLiveApi ? 'Online' : 'Offline'}
                </span>
              </div>
              <span style={{ fontSize: size.xs, color: OsakaJadePalette.text.secondary }}>
                Unit operations other engineers have published. Each is a contract the engine checks when you add it.
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: OsakaJadePalette.text.secondary, display: 'flex', alignItems: 'center', gap: 6 }}>
              <UserCheck size={14} color={creatorSession ? OsakaJadePalette.jade[400] : OsakaJadePalette.text.muted} />
              {creatorSession ? `Publishing as ${creatorSession.displayName}` : 'Sign in with Google to publish'}
            </span>

            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: OsakaJadePalette.text.muted,
                cursor: 'pointer',
                padding: 4
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {insertError && (
          <div role="alert" style={{ padding: '8px 24px', fontSize: 12, color: OsakaJadePalette.text.primary, borderBottom: `1px solid ${OsakaJadePalette.border.subtle}` }}>
            {insertError}
          </div>
        )}

        {/* Search & Category Filter Bar */}
        <div
          style={{
            padding: '14px 24px',
            backgroundColor: OsakaJadePalette.background.surface,
            borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap'
          }}
        >
          {/* Search Input */}
          <div
            style={{
              flex: 1,
              minWidth: 260,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              backgroundColor: OsakaJadePalette.background.canvas,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              borderRadius: draftingRadius.soft,
              padding: '7px 12px'
            }}
          >
            <Search size={14} color={OsakaJadePalette.text.secondary} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by equipment, author, ASME spec, or tag..."
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                color: OsakaJadePalette.text.primary,
                fontSize: 13,
                outline: 'none'
              }}
            />
          </div>

          {/* Categories */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
            {[
              { id: 'ALL', label: 'All UnitOps' },
              { id: 'PACKAGING', label: 'Packaging' },
              { id: 'FLUID_PROCESSING', label: 'Fluid Processing' },
              { id: 'MATERIAL_HANDLING', label: 'Material Handling' },
              { id: 'QUALITY', label: 'Quality & In-Line' }
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: draftingRadius.soft,
                  border: `1px solid ${selectedCategory === cat.id ? OsakaJadePalette.jade[500] : OsakaJadePalette.border.subtle}`,
                  backgroundColor:
                    selectedCategory === cat.id ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                  color:
                    selectedCategory === cat.id ? OsakaJadePalette.jade[300] : OsakaJadePalette.text.secondary,
                  fontSize: 12,
                  fontWeight: selectedCategory === cat.id ? 600 : 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Plugin Grid */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 14
          }}
        >
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: OsakaJadePalette.text.secondary, fontSize: 13 }}>
              Loading Community UnitOp Library...
            </div>
          ) : plugins.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: OsakaJadePalette.text.secondary, fontSize: 13 }}>
              No community UnitOps match your filter. Try searching for a different keyword or category.
            </div>
          ) : (
            plugins.map((plugin) => (
              <div
                key={plugin.id}
                style={{
                  padding: 16,
                  backgroundColor: OsakaJadePalette.background.canvas,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  borderRadius: draftingRadius.soft,
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 16,
                  transition: 'border-color 0.2s'
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                      {plugin.name}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '2px 6px',
                        borderRadius: draftingRadius.soft,
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        border: `1px solid ${OsakaJadePalette.border.subtle}`,
                        color: OsakaJadePalette.text.secondary
                      }}
                    >
                      {plugin.category.replace('_', ' ')}
                    </span>
                  </div>

                  <p style={{ margin: '0 0 10px 0', fontSize: 13, lineHeight: 1.5, color: OsakaJadePalette.text.secondary }}>
                    {plugin.description}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11, color: OsakaJadePalette.text.muted }}>
                    <span>Author: <strong style={{ color: OsakaJadePalette.text.primary }}>{plugin.author}</strong></span>
                  </div>
                </div>

                {/* 1-Click Insert Button */}
                <button
                  onClick={() => handleInsert(plugin)}
                  disabled={insertedId === plugin.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: space[1.5],
                    padding: `${space[2]}px ${space[4]}px`,
                    borderRadius: r.md,
                    backgroundColor: insertedId === plugin.id ? `${OsakaJadePalette.jade.glow}33` : OsakaJadePalette.jade[500],
                    border: insertedId === plugin.id ? `1px solid ${OsakaJadePalette.jade[500]}` : 'none',
                    color: insertedId === plugin.id ? OsakaJadePalette.jade[300] : OsakaJadePalette.text.inverse,
                    fontSize: size.base,
                    fontWeight: weight.bold,
                    cursor: insertedId === plugin.id ? 'default' : 'pointer',
                    flexShrink: 0,
                    transition: `all ${motion.fast}`
                  }}
                >
                  {insertedId === plugin.id ? <Check size={15} /> : <Plus size={15} />}
                  {insertedId === plugin.id ? 'Inserted' : 'Insert into Canvas'}
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 24px',
            backgroundColor: OsakaJadePalette.background.canvas,
            borderTop: `1px solid ${OsakaJadePalette.border.subtle}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 11,
            color: OsakaJadePalette.text.muted
          }}
        >
          <span>
            To publish your own, click a unit on the flowsheet and choose <strong>Publish to community library</strong> in its panel. You need to be signed in with Google.
          </span>
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px',
              backgroundColor: 'transparent',
              border: `1px solid ${OsakaJadePalette.border.default}`,
              borderRadius: draftingRadius.soft,
              color: OsakaJadePalette.text.secondary,
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
