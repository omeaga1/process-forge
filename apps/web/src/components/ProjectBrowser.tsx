import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createSimulationProject, type SimulationProject } from '@process-forge/protocol';
import { useTheme } from '@process-forge/canvas-ui';
import { draftingRadius } from '@process-forge/theme';
import {
  Search,
  X,
  Plus,
  Upload,
  Cloud,
  HardDrive,
  Pencil,
  Copy,
  Download,
  Trash2,
  Loader2,
  Check
} from 'lucide-react';
import { useAccount } from '../auth/useAccount.js';
import { hasCloudSession } from '../auth/accountManager.js';
import {
  listLocalProjects,
  loadLocalProject,
  saveLocalProject,
  deleteLocalProject,
  downloadProjectFile,
  type ProjectMetadataHeader
} from '../storage/localStorageAdapter.js';
import {
  listUserCloudProjects,
  resolveProjectBundle,
  deleteProjectFromCloud,
  type CloudProjectRecord
} from '../storage/cloudStorageAdapter.js';
import { PROJECT_TEMPLATES, uniqueName } from '../projects/templates.js';
import { FlowsheetThumbnail } from './FlowsheetThumbnail.js';

export interface ProjectBrowserProps {
  /** A dialog over the studio, or the body of the Studio Hub page. */
  variant: 'modal' | 'page';
  isOpen?: boolean;
  onClose?: () => void;
  currentProject: SimulationProject;
  onOpenProject: (project: SimulationProject) => void;
  onNewProject: (templateKey: string) => void;
  onImportFile: (file: File) => void;
  onRenameCurrent: (name: string) => void;
  onSignIn: () => void;
}

function relativeTime(iso: string | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return new Date(t).toLocaleDateString();
}

function counts(nodes: number, streams?: number): string {
  const u = `${nodes} unit${nodes === 1 ? '' : 's'}`;
  return streams === undefined ? u : `${u} · ${streams} stream${streams === 1 ? '' : 's'}`;
}

type Tab = 'device' | 'cloud';

/**
 * Every project in one place: start a new one (blank, from a template, or
 * from a file), and open, rename, duplicate, download or delete the ones on
 * this device and in the cloud. Projects save themselves as you edit, so
 * switching never loses work.
 */
export const ProjectBrowser: React.FC<ProjectBrowserProps> = ({
  variant,
  isOpen = true,
  onClose,
  currentProject,
  onOpenProject,
  onNewProject,
  onImportFile,
  onRenameCurrent,
  onSignIn
}) => {
  const { palette, font } = useTheme();
  const { user } = useAccount();
  const signedIn = hasCloudSession(user);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [tab, setTab] = useState<Tab>('device');
  const [query, setQuery] = useState('');
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [cloud, setCloud] = useState<{ loading: boolean; records: CloudProjectRecord[]; error?: string }>({
    loading: false,
    records: []
  });
  const [opening, setOpening] = useState<string | null>(null);

  // The open project is saved on every edit; list it from memory so its name
  // and counts are current.
  const local = useMemo(() => {
    if (!isOpen) return [] as ProjectMetadataHeader[];
    const list = listLocalProjects().filter((p) => p.id !== currentProject.id);
    const live: ProjectMetadataHeader = {
      id: currentProject.id,
      name: currentProject.name,
      description: currentProject.description,
      updatedAt: currentProject.updatedAt,
      isGuestProject: currentProject.isGuestProject,
      nodeCount: currentProject.graph.nodes.length,
      streamCount: currentProject.graph.edges.length
    };
    return [live, ...list];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, version, currentProject]);

  const graphs = useMemo(() => {
    const m = new Map<string, SimulationProject['graph']>();
    for (const p of local) {
      const g = p.id === currentProject.id ? currentProject.graph : loadLocalProject(p.id)?.graph;
      if (g) m.set(p.id, g);
    }
    return m;
  }, [local, currentProject]);

  useEffect(() => {
    if (!isOpen || !signedIn) return;
    let live = true;
    setCloud((c) => ({ ...c, loading: true }));
    listUserCloudProjects(user)
      .then((records) => live && setCloud({ loading: false, records: records.filter((r) => r.syncStatus === 'synced') }))
      .catch(() => live && setCloud({ loading: false, records: [], error: 'ProcessForge Cloud could not be reached.' }));
    return () => {
      live = false;
    };
  }, [isOpen, signedIn, user, version]);

  useEffect(() => {
    if (!isOpen) return;
    setConfirmDelete(null);
    setRenaming(null);
    if (variant === 'modal') setTimeout(() => searchRef.current?.focus(), 30);
  }, [isOpen, variant]);

  useEffect(() => {
    if (!isOpen || variant !== 'modal') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !renaming) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, variant, onClose, renaming]);

  const inCloud = useMemo(() => new Set(cloud.records.map((r) => r.id)), [cloud.records]);
  const q = query.trim().toLowerCase();
  const matches = (name: string, description?: string) =>
    !q || name.toLowerCase().includes(q) || (description ?? '').toLowerCase().includes(q);
  const localShown = local.filter((p) => matches(p.name, p.description));
  const cloudShown = cloud.records.filter((r) => matches(r.name, r.description));

  const openLocal = (id: string) => {
    if (id === currentProject.id) return onClose?.();
    const p = loadLocalProject(id);
    if (p) onOpenProject(p);
  };
  const openCloud = async (r: CloudProjectRecord) => {
    setOpening(r.id);
    const p = await resolveProjectBundle(r, user);
    setOpening(null);
    if (p) onOpenProject(p);
  };

  const commitRename = () => {
    if (!renaming) return;
    const name = renaming.name.trim();
    setRenaming(null);
    if (!name) return;
    if (renaming.id === currentProject.id) {
      onRenameCurrent(name);
    } else {
      const p = loadLocalProject(renaming.id);
      if (p) saveLocalProject({ ...p, name, updatedAt: new Date().toISOString() }, { makeCurrent: false });
      refresh();
    }
  };

  const duplicate = (id: string) => {
    const src = id === currentProject.id ? currentProject : loadLocalProject(id);
    if (!src) return;
    const copy = createSimulationProject(
      uniqueName(`${src.name.replace(/ \(copy\)$/, '')} (copy)`, local.map((p) => p.name)),
      structuredClone(src.graph),
      { description: src.description, isGuest: src.isGuestProject }
    );
    saveLocalProject(copy, { makeCurrent: false });
    refresh();
  };

  const download = (id: string) => {
    const p = id === currentProject.id ? currentProject : loadLocalProject(id);
    if (p) downloadProjectFile(p);
  };

  const remove = async (kind: Tab, id: string) => {
    setConfirmDelete(null);
    if (kind === 'device') deleteLocalProject(id);
    else await deleteProjectFromCloud(id, user);
    refresh();
  };

  // ---- styles ----------------------------------------------------------------
  const iconButton: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: draftingRadius.soft,
    border: 'none',
    background: 'transparent',
    color: palette.text.secondary,
    cursor: 'pointer'
  };
  const sectionLabel: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: palette.text.muted
  };

  // A plain function, not a component: a component declared in here would
  // remount on every render and drop the rename box's focus.
  const renderRow = ({
    id,
    name,
    detail,
    graph,
    badges,
    kind,
    onOpen
  }: {
    id: string;
    name: string;
    detail: string;
    graph?: SimulationProject['graph'] | null | undefined;
    badges: React.ReactNode;
    kind: Tab;
    onOpen: () => void;
  }) => {
    const isCurrent = kind === 'device' && id === currentProject.id;
    const isRenaming = renaming?.id === id && kind === 'device';
    const isConfirming = confirmDelete === `${kind}:${id}`;
    return (
      <div
        key={`${kind}:${id}`}
        role="button"
        tabIndex={0}
        onClick={() => !isRenaming && !isConfirming && onOpen()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !isRenaming && !isConfirming && e.target === e.currentTarget) onOpen();
        }}
        className="pf-project-row"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 10px',
          borderRadius: draftingRadius.soft,
          border: `1px solid ${isCurrent ? palette.jade[600] : 'transparent'}`,
          backgroundColor: isCurrent ? 'rgba(16, 185, 129, 0.06)' : 'transparent',
          cursor: 'pointer'
        }}
      >
        <FlowsheetThumbnail graph={graph ?? null} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {isRenaming ? (
            <input
              autoFocus
              value={renaming.name}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setRenaming({ id, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setRenaming(null);
              }}
              onBlur={commitRename}
              aria-label="Project name"
              style={{
                width: '100%',
                height: 28,
                boxSizing: 'border-box',
                padding: '0 8px',
                fontSize: 13,
                fontWeight: 600,
                borderRadius: draftingRadius.soft,
                border: `1px solid ${palette.jade[500]}`,
                background: palette.background.surface,
                color: palette.text.primary,
                outline: 'none'
              }}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: palette.text.primary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {name}
              </span>
              {badges}
            </div>
          )}
          <div style={{ fontSize: 12, color: palette.text.muted, marginTop: 2 }}>{detail}</div>
        </div>

        {isConfirming ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.stopPropagation()}>
            <span style={{ fontSize: 12, color: palette.text.secondary }}>
              {kind === 'device' ? 'Delete from this device?' : 'Delete from the cloud?'}
            </span>
            <button
              type="button"
              onClick={() => void remove(kind, id)}
              style={{
                height: 26,
                padding: '0 10px',
                borderRadius: draftingRadius.soft,
                border: 'none',
                backgroundColor: '#dc2626',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(null)}
              style={{
                height: 26,
                padding: '0 10px',
                borderRadius: draftingRadius.soft,
                border: `1px solid ${palette.border.default}`,
                background: 'transparent',
                color: palette.text.primary,
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="pf-row-actions" style={{ display: 'flex', gap: 2 }} onClick={(e) => e.stopPropagation()}>
            {kind === 'device' && (
              <>
                <button type="button" title="Rename" aria-label={`Rename ${name}`} style={iconButton} onClick={() => setRenaming({ id, name })}>
                  <Pencil size={14} />
                </button>
                <button type="button" title="Duplicate" aria-label={`Duplicate ${name}`} style={iconButton} onClick={() => duplicate(id)}>
                  <Copy size={14} />
                </button>
                <button type="button" title="Download as a .pfg.json file" aria-label={`Download ${name}`} style={iconButton} onClick={() => download(id)}>
                  <Download size={14} />
                </button>
              </>
            )}
            <button
              type="button"
              title={isCurrent ? 'This project is open. Open another one to delete it.' : kind === 'device' ? 'Delete from this device' : 'Delete from the cloud'}
              aria-label={`Delete ${name}`}
              disabled={isCurrent}
              style={{ ...iconButton, opacity: isCurrent ? 0.35 : 1, cursor: isCurrent ? 'default' : 'pointer' }}
              onClick={() => setConfirmDelete(`${kind}:${id}`)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
    );
  };

  const badge = (text: string, icon?: React.ReactNode) => (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        flexShrink: 0,
        padding: '1px 6px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 600,
        color: palette.text.accent,
        backgroundColor: 'rgba(16, 185, 129, 0.1)'
      }}
    >
      {icon}
      {text}
    </span>
  );

  const tabButton = (t: Tab, label: string, icon: React.ReactNode, n: number | null) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === t}
      onClick={() => setTab(t)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 34,
        padding: '0 4px',
        marginRight: 16,
        border: 'none',
        borderBottom: `2px solid ${tab === t ? palette.jade[500] : 'transparent'}`,
        background: 'transparent',
        color: tab === t ? palette.text.primary : palette.text.secondary,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer'
      }}
    >
      {icon}
      {label}
      {n !== null && <span style={{ color: palette.text.muted, fontWeight: 500 }}>{n}</span>}
    </button>
  );

  const body = (
    <div style={{ display: 'flex', minHeight: 0, flex: 1, flexWrap: 'wrap' }}>
      <input
        ref={fileRef}
        type="file"
        accept=".json,.pfg,.pfg.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImportFile(f);
          e.target.value = '';
        }}
      />

      {/* Start new */}
      <div
        style={{
          width: 280,
          flexGrow: 1,
          maxWidth: variant === 'page' ? 340 : 300,
          padding: 16,
          borderRight: `1px solid ${palette.border.subtle}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          boxSizing: 'border-box'
        }}
      >
        <div style={sectionLabel}>Start new</div>
        {PROJECT_TEMPLATES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onNewProject(t.key)}
            className="pf-project-row"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: 8,
              textAlign: 'left',
              borderRadius: draftingRadius.soft,
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.background.surface,
              cursor: 'pointer'
            }}
          >
            {t.key === 'blank' ? (
              <span
                style={{
                  width: 64,
                  height: 44,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 4,
                  border: `1px dashed ${palette.jade[500]}`,
                  color: palette.jade[500]
                }}
              >
                <Plus size={18} />
              </span>
            ) : (
              <FlowsheetThumbnail graph={t.graph} width={64} height={44} />
            )}
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.text.primary }}>{t.name}</span>
              <span style={{ display: 'block', fontSize: 12, color: palette.text.muted, lineHeight: 1.35, marginTop: 1 }}>
                {t.key === 'blank' ? 'Empty canvas' : counts(t.graph.nodes.length, t.graph.edges.length)}
              </span>
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 36,
            padding: '0 10px',
            marginTop: 4,
            borderRadius: draftingRadius.soft,
            border: `1px solid ${palette.border.default}`,
            background: 'transparent',
            color: palette.text.primary,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          <Upload size={14} /> Open a file (.pfg.json)
        </button>
        <div style={{ fontSize: 12, color: palette.text.muted, lineHeight: 1.45, marginTop: 'auto', paddingTop: 12 }}>
          Every change saves on this device as you work, so switching projects never loses anything.
        </div>
      </div>

      {/* Existing projects */}
      <div style={{ flex: '999 1 360px', minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '10px 16px 0', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div role="tablist" style={{ display: 'flex', flex: 1 }}>
            {tabButton('device', 'On this device', <HardDrive size={14} />, local.length)}
            {tabButton('cloud', 'Cloud', <Cloud size={14} />, signedIn ? cloud.records.length : null)}
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 32,
              padding: '0 10px',
              width: 220,
              boxSizing: 'border-box',
              borderRadius: draftingRadius.soft,
              border: `1px solid ${palette.border.default}`,
              backgroundColor: palette.background.surface
            }}
          >
            <Search size={14} color={palette.text.muted} />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects"
              aria-label="Search projects"
              style={{
                flex: 1,
                minWidth: 0,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: palette.text.primary,
                fontSize: 13
              }}
            />
          </label>
        </div>
        <div style={{ borderBottom: `1px solid ${palette.border.subtle}` }} />

        <div style={{ flex: 1, overflowY: 'auto', padding: 8, minHeight: 200 }}>
          {tab === 'device' &&
            (localShown.length === 0 ? (
              empty(q ? `No project on this device matches "${query}".` : 'No projects yet.')
            ) : (
              localShown.map((p) => (
                renderRow({
                  id: p.id,
                  kind: 'device',
                  name: p.name,
                  graph: graphs.get(p.id),
                  detail: `${counts(p.nodeCount, p.streamCount)} · edited ${relativeTime(p.updatedAt)}`,
                  badges: (
                    <>
                      {p.id === currentProject.id && badge('Open', <Check size={10} />)}
                      {inCloud.has(p.id) && badge('In cloud', <Cloud size={10} />)}
                    </>
                  ),
                  onOpen: () => openLocal(p.id)
                })
              ))
            ))}

          {tab === 'cloud' &&
            (!signedIn ? (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <Cloud size={22} color={palette.text.muted} />
                <div style={{ fontSize: 13, color: palette.text.secondary, margin: '8px 0 12px', lineHeight: 1.5 }}>
                  Sign in with Google to keep projects in ProcessForge Cloud and open them on any computer.
                </div>
                <button
                  type="button"
                  onClick={onSignIn}
                  style={{
                    height: 32,
                    padding: '0 14px',
                    borderRadius: draftingRadius.soft,
                    border: `1px solid ${palette.jade[600]}`,
                    backgroundColor: 'rgba(16, 185, 129, 0.12)',
                    color: palette.text.accent,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Sign in with Google
                </button>
              </div>
            ) : cloud.loading ? (
              empty('Loading your cloud projects…', true)
            ) : cloud.error ? (
              empty(cloud.error)
            ) : cloudShown.length === 0 ? (
              empty(q ? `No cloud project matches "${query}".` : 'Nothing in the cloud yet. Use Save to cloud in the studio.')
            ) : (
              cloudShown.map((r) => (
                renderRow({
                  id: r.id,
                  kind: 'cloud',
                  name: opening === r.id ? `${r.name} (opening…)` : r.name,
                  graph: r.bundle?.graph ?? (r.id === currentProject.id ? currentProject.graph : graphs.get(r.id)),
                  detail: `${counts(r.nodeCount, r.streamCount)} · saved ${relativeTime(r.updatedAt)}`,
                  badges: r.id === currentProject.id ? badge('Open', <Check size={10} />) : null,
                  onOpen: () => (r.id === currentProject.id ? onClose?.() : void openCloud(r))
                })
              ))
            ))}
        </div>
      </div>
    </div>
  );

  function empty(text: string, spinner?: boolean) {
    return (
      <div style={{ padding: 28, textAlign: 'center', fontSize: 13, color: palette.text.muted }}>
        {spinner && <Loader2 size={16} className="animate-spin" style={{ display: 'block', margin: '0 auto 8px' }} />}
        {text}
      </div>
    );
  }

  const hoverCss = (
    <style>{`
      .pf-project-row:hover { background-color: ${palette.background.canvas} !important; }
      .pf-project-row .pf-row-actions { opacity: 0.35; transition: opacity 0.12s ease; }
      .pf-project-row:hover .pf-row-actions, .pf-project-row:focus-within .pf-row-actions { opacity: 1; }
    `}</style>
  );

  if (variant === 'page') {
    return (
      <section
        aria-label="Projects"
        style={{
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: palette.background.surface,
          border: `1px solid ${palette.border.default}`,
          borderRadius: draftingRadius.soft,
          minHeight: 420,
          fontFamily: font.sans
        }}
      >
        {hoverCss}
        {body}
      </section>
    );
  }

  if (!isOpen) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Projects"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1500,
        backgroundColor: 'rgba(0, 0, 0, 0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        fontFamily: font.sans
      }}
    >
      {hoverCss}
      <div
        style={{
          width: 'min(980px, 100%)',
          height: 'min(640px, calc(100vh - 32px))',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: palette.background.surface,
          border: `1px solid ${palette.border.default}`,
          borderRadius: draftingRadius.soft,
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: `1px solid ${palette.border.subtle}`
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: palette.text.primary }}>Projects</div>
          <button type="button" aria-label="Close" onClick={onClose} style={iconButton}>
            <X size={16} />
          </button>
        </div>
        {body}
      </div>
    </div>
  );
};

/** Ctrl+O (Cmd+O) opens the project browser. */
export function useProjectBrowserShortcut(open: () => void, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, enabled]);
}
