import React, { useState, useEffect, useMemo } from 'react';
import { Modal, TabStrip } from '../../ui/index.js';
import { useTheme } from '../../hooks/useTheme.js';
import { ProcessForgeEmblem } from '../brand/ProcessForgeLogo.js';
import {
  CASE_PACKER_CONTRACT,
  CRYSTALLISER_CONTRACT,
  EVAPORATOR_CONTRACT,
  FDM_PRINTER_CONTRACT,
  JUICE_CONCENTRATOR_CONTRACT,
  NEUTRALISER_CONTRACT,
  WAX_COOLING_BELT_CONTRACT,
  type ProcessNode,
  type UnitOpContract
} from '@process-forge/protocol';
import { contractToProcessNode } from '../../unitop/contractToNode.js';
import {
  Search,
  Plus,
  Cloud,
  WifiOff,
  UserCheck,
  Check,
  ShieldCheck,
  EyeOff,
  Upload
} from 'lucide-react';
import {
  CommunityLibraryService,
  type CommunityUnitOpItem,
  type CreatorSession
} from '../../marketplace/communityLibraryClient.js';
import { draftingRadius, tint } from '@process-forge/theme';

export interface CommunityUnitOpLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertNode: (node: ProcessNode) => void;
}

type LibraryTab = 'community' | 'examples' | 'mine';

/** The engine's worked examples: real, validated contracts, shown as examples and never as someone's listing. */
const EXAMPLES: { contract: UnitOpContract; category: CommunityUnitOpItem['category'] }[] = [
  { contract: EVAPORATOR_CONTRACT, category: 'FLUID_PROCESSING' },
  { contract: JUICE_CONCENTRATOR_CONTRACT, category: 'FLUID_PROCESSING' },
  { contract: NEUTRALISER_CONTRACT, category: 'FLUID_PROCESSING' },
  { contract: CRYSTALLISER_CONTRACT, category: 'FLUID_PROCESSING' },
  { contract: WAX_COOLING_BELT_CONTRACT, category: 'MATERIAL_HANDLING' },
  { contract: CASE_PACKER_CONTRACT, category: 'PACKAGING' },
  { contract: FDM_PRINTER_CONTRACT, category: 'MATERIAL_HANDLING' }
];

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
  const [tab, setTab] = useState<LibraryTab>('community');
  const [mine, setMine] = useState<CommunityUnitOpItem[]>([]);
  const [mineError, setMineError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadLibraryData();
      setCreatorSession(CommunityLibraryService.getSession());
    }
  }, [isOpen, searchQuery, selectedCategory]);

  useEffect(() => {
    if (isOpen && tab === 'mine') loadMine();
  }, [isOpen, tab]);

  const loadMine = async () => {
    const { items, error } = await CommunityLibraryService.fetchMine();
    setMine(items);
    setMineError(error ?? null);
  };

  const examples = useMemo<CommunityUnitOpItem[]>(
    () =>
      EXAMPLES.map(({ contract, category }) => ({
        id: `example:${contract.id}`,
        name: contract.name,
        author: 'ProcessForge example',
        category,
        description: contract.description,
        engineChecked: true,
        nodeTemplate: contractToProcessNode(contract)
      })).filter((e) => {
        const q = searchQuery.trim().toLowerCase();
        return (selectedCategory === 'ALL' || e.category === selectedCategory) && (!q || `${e.name} ${e.description}`.toLowerCase().includes(q));
      }),
    [searchQuery, selectedCategory]
  );

  const setListed = async (item: CommunityUnitOpItem, listed: boolean) => {
    const r = listed ? await CommunityLibraryService.updateUnitOp(item.id, null, {}) : await CommunityLibraryService.unpublishUnitOp(item.id);
    setNotice(r.message);
    await loadMine();
    await loadLibraryData();
  };

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

  return (
    <Modal
      open={isOpen}
      onOpenChange={(o) => !o && onClose()}
      width={920}
      flush
      icon={
        <div style={{ width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', backgroundColor: tint(palette.jade[500], 0.14) }}>
          <ProcessForgeEmblem size={22} />
        </div>
      }
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          Community library
          <span
            style={{
              fontSize: size['2xs'],
              display: 'inline-flex',
              alignItems: 'center',
              gap: space[1],
              padding: `2px ${space[2]}px`,
              borderRadius: r.full,
              fontWeight: 600,
              backgroundColor: isLiveApi ? tint(palette.jade[500], 0.16) : tint(palette.text.primary, 0.06),
              color: isLiveApi ? OsakaJadePalette.jade[300] : OsakaJadePalette.text.secondary,
              fontFamily: font.mono
            }}
          >
            {isLiveApi ? <Cloud size={11} /> : <WifiOff size={11} />}
            {isLiveApi ? 'Online' : 'Offline'}
          </span>
        </span>
      }
      description="Unit operations other engineers have published, and worked examples to start from."
      headerExtra={
        <span style={{ fontSize: 12, color: OsakaJadePalette.text.secondary, display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'center', whiteSpace: 'nowrap' }}>
          <UserCheck size={14} color={creatorSession ? OsakaJadePalette.jade[400] : OsakaJadePalette.text.muted} />
          {creatorSession ? `Publishing as ${creatorSession.displayName}` : 'Sign in with Google to publish'}
        </span>
      }
      footer={
        <span style={{ fontSize: 12, color: OsakaJadePalette.text.muted, marginRight: 'auto', lineHeight: 1.5 }}>
          To publish your own, or a new version of one you published, click the unit on the flowsheet and choose <strong>Publish to community library</strong>. You need to be signed in with Google.
        </span>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: 'min(640px, calc(100dvh - 240px))' }}>
        {insertError && (
          <div role="alert" style={{ padding: '8px 24px', fontSize: 12, color: OsakaJadePalette.text.primary, borderBottom: `1px solid ${OsakaJadePalette.border.subtle}` }}>
            {insertError}
          </div>
        )}

        {/* Which library */}
        <TabStrip
          label="Which library"
          value={tab}
          onValueChange={(id) => {
            setTab(id);
            setNotice(null);
          }}
          style={{ padding: '0 16px' }}
          items={[
            { value: 'community' as LibraryTab, label: 'Community' },
            { value: 'examples' as LibraryTab, label: 'Examples by ProcessForge' },
            { value: 'mine' as LibraryTab, label: 'Published by me' }
          ]}
        />

        {notice && (
          <div role="status" style={{ padding: '8px 24px', fontSize: 12, color: OsakaJadePalette.text.primary, borderBottom: `1px solid ${OsakaJadePalette.border.subtle}` }}>
            {notice}
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
              placeholder="Search by equipment, author, or tag..."
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
                    selectedCategory === cat.id ? tint(palette.jade[500], 0.15) : 'transparent',
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
          {tab === 'examples' && (
            <div style={{ fontSize: 12, color: OsakaJadePalette.text.secondary, lineHeight: 1.5 }}>
              Worked examples that ship with ProcessForge: complete designs the engine accepts, to use as they are or as a starting point. They are not listings by anyone.
            </div>
          )}
          {tab === 'mine' && mineError && (
            <div style={{ padding: 24, textAlign: 'center', color: OsakaJadePalette.text.secondary, fontSize: 13 }}>{mineError}</div>
          )}
          {tab === 'community' && isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: OsakaJadePalette.text.secondary, fontSize: 13 }}>
              Loading the community library...
            </div>
          ) : (tab === 'community' ? plugins : tab === 'examples' ? examples : mine).length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: OsakaJadePalette.text.secondary, fontSize: 13 }}>
              {tab === 'mine'
                ? mineError
                  ? ''
                  : 'You have not published anything yet. Click a unit on the flowsheet and choose Publish to community library.'
                : tab === 'community' && !searchQuery && selectedCategory === 'ALL'
                  ? 'Nothing has been published yet. Be the first: click a unit on the flowsheet and choose Publish to community library, or start from an example.'
                  : 'Nothing matches your filter. Try a different word or category.'}
            </div>
          ) : (
            (tab === 'community' ? plugins : tab === 'examples' ? examples : mine).map((plugin) => (
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
                    <span style={{ fontSize: 16, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                      {plugin.name}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '2px 6px',
                        borderRadius: draftingRadius.soft,
                        backgroundColor: tint(palette.text.primary, 0.05),
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

                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11, color: OsakaJadePalette.text.muted, flexWrap: 'wrap' }}>
                    <span>{tab === 'examples' ? 'From' : 'Author'}: <strong style={{ color: OsakaJadePalette.text.primary }}>{plugin.author}</strong></span>
                    {plugin.version && <span style={{ fontFamily: font.mono }}>v{plugin.version}</span>}
                    {plugin.engineChecked && (
                      <span
                        title="A designed unit whose contract passed the engine's checks (schema, references, physics, drawing) when it was published. It is not a review of the design."
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: OsakaJadePalette.jade[400] }}
                      >
                        <ShieldCheck size={12} /> Engine-checked
                      </span>
                    )}
                    {tab === 'mine' && plugin.status === 'unpublished' && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <EyeOff size={12} /> Unpublished
                      </span>
                    )}
                  </div>
                  {tab === 'community' && (
                    <div style={{ marginTop: 6, fontSize: 11, color: OsakaJadePalette.text.muted }}>
                      What its author wrote; ProcessForge does not review listings.
                    </div>
                  )}
                </div>

                {tab === 'mine' && (
                  <button
                    onClick={() => setListed(plugin, plugin.status === 'unpublished')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: `${space[2]}px ${space[3]}px`,
                      borderRadius: r.md,
                      background: 'transparent',
                      border: `1px solid ${OsakaJadePalette.border.default}`,
                      color: OsakaJadePalette.text.secondary,
                      fontSize: size.sm,
                      cursor: 'pointer',
                      flexShrink: 0
                    }}
                  >
                    {plugin.status === 'unpublished' ? <Upload size={14} /> : <EyeOff size={14} />}
                    {plugin.status === 'unpublished' ? 'Publish again' : 'Unpublish'}
                  </button>
                )}

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
      </div>
    </Modal>
  );
};
