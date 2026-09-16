import React, { useState, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme.js';
import { ProcessForgeEmblem } from '../brand/ProcessForgeLogo.js';
import type { ProcessNode } from '@process-forge/protocol';
import {
  X,
  Search,
  Download,
  Star,
  ShieldCheck,
  Plus,
  Cloud,
  WifiOff,
  UserCheck,
  LogIn,
  Check
} from 'lucide-react';
import {
  CommunityLibraryService,
  type CommunityUnitOpItem,
  type CreatorSession
} from '../../marketplace/communityLibraryClient.js';

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
  const { palette, elevation, font, size, weight, space, radius: r, motion } = useTheme();
  const OsakaJadePalette = palette;
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [plugins, setPlugins] = useState<CommunityUnitOpItem[]>([]);
  const [isLiveApi, setIsLiveApi] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [creatorSession, setCreatorSession] = useState<CreatorSession | null>(null);
  const [showAuthCard, setShowAuthCard] = useState<boolean>(false);
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

  const handleLogin = async (provider: 'github' | 'google' | 'microsoft') => {
    const session = await CommunityLibraryService.loginCreator(provider);
    setCreatorSession(session);
    setShowAuthCard(false);
  };

  const handleLogout = () => {
    CommunityLibraryService.logoutCreator();
    setCreatorSession(null);
  };

  const handleInsert = (plugin: CommunityUnitOpItem) => {
    // Generate fresh instance of the node
    const nodeInstance: ProcessNode = {
      ...plugin.nodeTemplate,
      id: `node-${plugin.nodeTemplate.kind.toLowerCase()}-${Date.now()}`,
      position: {
        x: (plugin.nodeTemplate.position?.x || 500) + Math.floor(Math.random() * 80) - 40,
        y: (plugin.nodeTemplate.position?.y || 350) + Math.floor(Math.random() * 80) - 40
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
          borderRadius: 14,
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.85)',
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
                  ProcessForge Hub
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
                  {isLiveApi ? 'Cloud Registry Live' : 'Local Verified Cache'}
                </span>
              </div>
              <span style={{ fontSize: size.xs, color: OsakaJadePalette.text.secondary }}>
                Industrial Unit-Op marketplace • Validated physics models, ASME ratings, and sub-agent contracts
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {creatorSession ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 10px',
                  borderRadius: 6,
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  border: `1px solid ${OsakaJadePalette.jade[600]}`
                }}
              >
                <UserCheck size={14} color={OsakaJadePalette.jade[400]} />
                <span style={{ fontSize: 12, fontWeight: 600, color: OsakaJadePalette.text.primary }}>
                  {creatorSession.displayName}
                </span>
                <button
                  onClick={handleLogout}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: OsakaJadePalette.text.muted,
                    fontSize: 11,
                    cursor: 'pointer',
                    marginLeft: 4
                  }}
                >
                  (Sign Out)
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuthCard(!showAuthCard)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 6,
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  color: OsakaJadePalette.text.primary,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <LogIn size={13} />
                Creator Account
              </button>
            )}

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

        {/* Creator Account Modal Dropdown */}
        {showAuthCard && !creatorSession && (
          <div
            style={{
              padding: '14px 24px',
              backgroundColor: 'rgba(16, 185, 129, 0.05)',
              borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: OsakaJadePalette.text.primary }}>
                Connect Creator Account to Push Plugins
              </div>
              <div style={{ fontSize: 11, color: OsakaJadePalette.text.secondary }}>
                Claim your author badge and push custom unit operations to the community library.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => handleLogin('github')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  color: OsakaJadePalette.text.primary,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                GitHub
              </button>
              <button
                onClick={() => handleLogin('google')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  color: OsakaJadePalette.text.primary,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Google
              </button>
              <button
                onClick={() => handleLogin('microsoft')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  backgroundColor: OsakaJadePalette.background.surfaceElevated,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  color: OsakaJadePalette.text.primary,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Microsoft
              </button>
            </div>
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
              borderRadius: 6,
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
                  borderRadius: 6,
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
                  borderRadius: 10,
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
                        borderRadius: 4,
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        border: `1px solid ${OsakaJadePalette.border.subtle}`,
                        color: OsakaJadePalette.text.secondary
                      }}
                    >
                      {plugin.category.replace('_', ' ')}
                    </span>
                    {plugin.asmeRating && (
                      <span
                        style={{
                          fontSize: 11,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          color: OsakaJadePalette.jade[400]
                        }}
                      >
                        <ShieldCheck size={13} />
                        {plugin.asmeRating}
                      </span>
                    )}
                  </div>

                  <p style={{ margin: '0 0 10px 0', fontSize: 13, lineHeight: 1.5, color: OsakaJadePalette.text.secondary }}>
                    {plugin.description}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11, color: OsakaJadePalette.text.muted }}>
                    <span>Author: <strong style={{ color: OsakaJadePalette.text.primary }}>{plugin.author}</strong></span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: space[0.5] || 3, color: OsakaJadePalette.text.gold }}>
                      <Star size={12} fill={OsakaJadePalette.text.gold} />
                      {plugin.rating.toFixed(1)}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: space[1] }}>
                      <Download size={12} />
                      {plugin.downloadCount.toLocaleString()} pulls
                    </span>
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
                    boxShadow: insertedId === plugin.id ? 'none' : elevation.glow,
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
            Double-click any unit-op on your flowsheet to open the Machine Studio and click <strong>[Publish to Community Library]</strong>.
          </span>
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px',
              backgroundColor: 'transparent',
              border: `1px solid ${OsakaJadePalette.border.default}`,
              borderRadius: 6,
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
