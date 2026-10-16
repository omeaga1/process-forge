import React, { useEffect, useState } from 'react';
import { OsakaJadeDarkPalette as D } from '@process-forge/theme';
import { Brief, communityApiUrl } from '@process-forge/canvas-ui';
import { mono } from './ui.js';

/**
 * The ProcessForge Library, searched live: the same public API the app and
 * the MCP server use. Describe a unit in plain words and get the published
 * units most like it, the way design_unit_op checks before Claude designs.
 */

interface Listing {
  id: string;
  name: string;
  author_name: string;
  description: string;
  version: string;
  category: string;
  engine_checked?: number;
  download_count?: number;
  similarity?: number;
  matched?: string[];
}

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'done'; listings: Listing[]; total?: number };

const SUGGESTIONS = ['freeze concentrator for coffee', 'spray dryer for milk powder', 'pastillation belt for wax', 'scrubber for an acid vent'];

export const LibraryBrowser: React.FC = () => {
  const [text, setText] = useState('');
  const [asked, setAsked] = useState('');
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let live = true;
    setState({ kind: 'loading' });
    const url = asked.trim() ? communityApiUrl(`/unitops?${new URLSearchParams({ similar: asked.trim(), limit: '12' })}`) : communityApiUrl('/unitops?limit=12');
    fetch(url, { signal: AbortSignal.timeout(8000) })
      .then((r) => r.json())
      .then((body) => {
        if (!live) return;
        if (!body?.success || !Array.isArray(body.unitops)) setState({ kind: 'error' });
        else setState({ kind: 'done', listings: body.unitops });
      })
      .catch(() => live && setState({ kind: 'error' }));
    return () => {
      live = false;
    };
  }, [asked]);

  return (
    <div style={{ border: `1px solid ${D.border.default}`, borderRadius: 14, background: D.background.surface, padding: 18 }}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setAsked(text);
        }}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
      >
        <label htmlFor="pf-library-q" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          Describe the unit you need
        </label>
        <input
          id="pf-library-q"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe the unit you need, e.g. a freeze concentrator for coffee"
          style={{ flex: '1 1 260px', minWidth: 0, padding: '10px 12px', borderRadius: 8, border: `1px solid ${D.border.strong}`, background: D.background.base, color: D.text.primary, fontSize: 14 }}
        />
        <button type="submit" className="pf-cta-secondary" style={{ padding: '10px 16px', borderRadius: 8, border: `1px solid ${D.jade.glow}`, background: 'transparent', color: D.jade.glow, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
          Find similar units
        </button>
      </form>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            className="pf-tile"
            onClick={() => {
              setText(s);
              setAsked(s);
            }}
            style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, border: `1px solid ${D.border.subtle}`, background: 'transparent', color: D.text.secondary, cursor: 'pointer' }}
          >
            {s}
          </button>
        ))}
      </div>

      <div role="status" aria-live="polite" style={{ marginTop: 16 }}>
        {state.kind === 'loading' && <p style={{ margin: 0, fontSize: 13, color: D.text.muted }}>Searching the library…</p>}
        {state.kind === 'error' && <p style={{ margin: 0, fontSize: 13, color: D.text.gold }}>The library could not be reached just now. Try again in a moment.</p>}
        {state.kind === 'done' && !state.listings.length && (
          <div style={{ fontSize: 14, lineHeight: 1.6, color: D.text.secondary }}>
            {asked.trim() ? (
              <>
                No <b style={{ color: D.text.primary }}>“{asked.trim()}”</b> yet. Claude can design one, and publish it for the next engineer.
              </>
            ) : (
              <>
                Nothing published yet. Your first design could be the one others start from.
              </>
            )}
          </div>
        )}
        {state.kind === 'done' && state.listings.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 10 }}>
            {state.listings.map((u) => (
              <li key={u.id} style={{ border: `1px solid ${D.border.subtle}`, borderRadius: 12, padding: '12px 14px', background: D.background.base }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 14, fontWeight: 650, color: D.text.primary }}>{u.name}</span>
                  {typeof u.similarity === 'number' && <span style={{ ...mono, fontSize: 11, color: D.jade.glow }}>{Math.round(u.similarity * 100)}% alike</span>}
                </div>
                <div style={{ fontSize: 12, color: D.text.muted, marginTop: 2 }}>
                  by {u.author_name} · v{u.version}
                  {u.engine_checked ? ' · engine-checked when published' : ''}
                </div>
                <Brief text={u.description} style={{ marginTop: 6, color: D.text.secondary }} />
                {u.matched?.length ? <div style={{ ...mono, fontSize: 11, color: D.text.muted, marginTop: 6 }}>shares: {u.matched.join(', ')}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p style={{ margin: '14px 0 0', fontSize: 12, color: D.text.muted }}>Live from the ProcessForge Library · written by authors, not reviewed.</p>
    </div>
  );
};
