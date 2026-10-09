import React, { useEffect, useState } from 'react';
import type { ProcessNode } from '@process-forge/protocol';
import { Globe, ShieldCheck } from 'lucide-react';
import { draftingRadius } from '@process-forge/theme';
import { useTheme } from '../../hooks/useTheme.js';
import { Button, Modal } from '../../ui/index.js';
import { CommunityLibraryService, type CommunityUnitOpItem, type PublishResult } from '../../marketplace/communityLibraryClient.js';

export interface PublishSuggestion {
  description?: string;
  category?: CommunityUnitOpItem['category'];
  tags?: string[];
  releaseNotes?: string;
  /** An MCP client asked for this: the dialog says so. */
  requestedByClient?: boolean;
}

export interface PublishUnitOpDialogProps {
  /** The unit to publish; null closes the dialog. */
  node: ProcessNode | null;
  /** Details an MCP client suggested, to review before publishing. */
  suggestion?: PublishSuggestion;
  onClose: () => void;
}

type Category = CommunityUnitOpItem['category'];

const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'FLUID_PROCESSING', label: 'Fluid processing' },
  { id: 'PACKAGING', label: 'Packaging' },
  { id: 'MATERIAL_HANDLING', label: 'Material handling' },
  { id: 'QUALITY', label: 'Quality and in-line' }
];

/** A category from what the unit handles, as a starting point. */
export function guessCategory(n: ProcessNode): Category {
  if (n.kind === 'CONVEYOR' || n.kind === 'PALLETIZER') return 'MATERIAL_HANDLING';
  if (n.kind === 'ROTARY_FILLER' || n.kind === 'LABELER') return 'PACKAGING';
  const dims = [...n.inputs, ...n.outputs].map((p) => String(p.flowDimension));
  return dims.some((d) => d.startsWith('CONTINUOUS')) ? 'FLUID_PROCESSING' : 'MATERIAL_HANDLING';
}

/**
 * Publishing a unit to the community library: what will be public, the
 * details to publish it with, and -- when you have published one by this name
 * before -- the choice of a new version of it. Nothing is sent until you
 * confirm.
 */
export const PublishUnitOpDialog: React.FC<PublishUnitOpDialogProps> = ({ node, suggestion, onClose }) => {
  const { palette } = useTheme();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('FLUID_PROCESSING');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [mine, setMine] = useState<CommunityUnitOpItem[]>([]);
  const [target, setTarget] = useState<string>('new');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);
  const session = CommunityLibraryService.getSession();

  useEffect(() => {
    if (!node) return;
    const contract = (node.config as { contract?: { description?: string } }).contract;
    setName(node.name);
    setDescription(suggestion?.description || contract?.description || '');
    setCategory(suggestion?.category ?? guessCategory(node));
    setTags(suggestion?.tags?.join(', ') ?? '');
    setNotes(suggestion?.releaseNotes ?? '');
    setResult(null);
    setTarget('new');
    CommunityLibraryService.fetchMine().then(({ items }) => {
      setMine(items);
      const same = items.find((i) => i.name.trim().toLowerCase() === node.name.trim().toLowerCase());
      if (same) setTarget(same.id);
    });
  }, [node, suggestion]);

  if (!node) return null;
  const designed = Boolean((node.config as { contract?: unknown }).contract);
  const existing = mine.find((i) => i.id === target);
  const canPublish = Boolean(session) && name.trim() && description.trim() && !busy && !result?.success;

  const publish = async () => {
    setBusy(true);
    const meta = {
      name: name.trim(),
      category,
      description: description.trim(),
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      ...(notes.trim() ? { releaseNotes: notes.trim() } : {})
    };
    const r = existing ? await CommunityLibraryService.updateUnitOp(existing.id, node, meta) : await CommunityLibraryService.publishUnitOp(node, meta);
    setResult(r);
    setBusy(false);
  };

  const field: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    borderRadius: draftingRadius.soft,
    border: `1px solid ${palette.border.default}`,
    background: palette.background.canvas,
    color: palette.text.primary,
    fontSize: 13,
    fontFamily: 'inherit'
  };
  const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: palette.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block' };

  return (
    <Modal
      open={node !== null}
      onOpenChange={(o) => !o && onClose()}
      width={580}
      title="Publish to the community library"
      description={node ? node.name : undefined}
      footer={
        <>
          <Button onClick={onClose}>{result?.success ? 'Done' : 'Cancel'}</Button>
          {!result?.success && (
            <Button variant="primary" disabled={!canPublish} onClick={publish}>
              {busy ? 'Publishing…' : existing ? 'Publish new version' : 'Publish'}
            </Button>
          )}
        </>
      }
    >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {suggestion?.requestedByClient && (
            <div role="note" style={{ padding: '8px 10px', borderRadius: draftingRadius.soft, border: `1px solid ${palette.jade[600]}`, fontSize: 12, color: palette.text.primary, lineHeight: 1.5 }}>
              Your AI client asked to publish this unit and filled in the details below. Review them: nothing is published unless you click Publish.
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, fontSize: 12, lineHeight: 1.5, color: palette.text.secondary }}>
            <Globe size={16} color={palette.jade[400]} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              Public: anyone using ProcessForge can find this unit and add it to their flowsheets, with its settings
              {designed ? ', its design (parameters, physics and drawing)' : ''}, under your name
              {session ? ` (${session.displayName})` : ''}. You can publish new versions or unpublish it later.
            </span>
          </div>
          {designed && (
            <div style={{ display: 'flex', gap: 10, fontSize: 12, lineHeight: 1.5, color: palette.text.secondary }}>
              <ShieldCheck size={16} color={palette.jade[400]} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>The engine checks the design before it is published; a design that fails its checks is not published, and you are told why.</span>
            </div>
          )}

          {mine.length > 0 && (
            <label>
              <span style={label}>Publish as</span>
              <select value={target} onChange={(e) => setTarget(e.target.value)} className="pf-select">
                <option value="new">A new listing</option>
                {mine.map((i) => (
                  <option key={i.id} value={i.id}>
                    A new version of "{i.name}" (now v{i.version ?? '1.0.0'}{i.status === 'unpublished' ? ', unpublished' : ''})
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            <span style={label}>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} style={field} />
          </label>
          <label>
            <span style={label}>Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={4000}
              rows={4}
              placeholder="What it is, what it models, and what it assumes."
              style={{ ...field, resize: 'vertical' }}
            />
          </label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ flex: '1 1 200px' }}>
              <span style={label}>Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className="pf-select">
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ flex: '1 1 200px' }}>
              <span style={label}>Tags</span>
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="evaporator, juice, vacuum" style={field} />
            </label>
          </div>
          {existing && (
            <label>
              <span style={label}>What changed in this version</span>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="More steam; tighter pumpability check." style={field} />
            </label>
          )}

          {!session && <div style={{ fontSize: 12, color: palette.status.blocked }}>Sign in with Google (top right) to publish.</div>}
          {result && (
            <div role="status" style={{ fontSize: 13, color: result.success ? palette.jade[400] : palette.text.primary }}>
              {result.message}
              {result.success && result.version ? ` Version ${result.version}.` : ''}
              {result.success && result.engineChecked ? ' Engine-checked.' : ''}
            </div>
          )}
        </div>

    </Modal>
  );
};
