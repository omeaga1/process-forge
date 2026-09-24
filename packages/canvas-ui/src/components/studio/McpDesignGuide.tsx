import React, { useEffect, useState } from 'react';
import { OsakaJadePalette as P, drafting, draftingRadius } from '@process-forge/theme';

const D = drafting('dark');

type Link = 'checking' | 'connected' | 'old-app' | 'browser';

/**
 * How a unit op gets built when an MCP client (Claude Desktop, Cursor) is the
 * assistant: the four tool calls it makes, and the checks the engine runs,
 * so it is clear the client cannot hand the canvas anything unchecked.
 */
export const McpDesignGuide: React.FC = () => {
  const [link, setLink] = useState<Link>('checking');
  useEffect(() => {
    const invoke = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: (c: string) => Promise<unknown> } }).__TAURI_INTERNALS__?.invoke;
    if (typeof invoke !== 'function') {
      setLink('browser');
      return;
    }
    invoke('bridge_status')
      .then(() => setLink('connected'))
      .catch(() => setLink('old-app'));
  }, []);

  const steps: { tool?: string; title: string; body: React.ReactNode }[] = [
    {
      title: 'You ask, in your MCP client',
      body: (
        <>
          Describe the equipment in Claude Desktop (or Cursor) and ask for it on your flowsheet, for example:
          <div
            style={{
              marginTop: 6,
              padding: '8px 10px',
              borderLeft: `2px solid ${P.jade[600]}`,
              background: P.background.surfaceMuted,
              color: P.text.primary,
              fontStyle: 'italic'
            }}
          >
            Design a vibrating fluid-bed cooler for 5 kg/s of salt from 90 °C to 40 °C, and add it to my ProcessForge flowsheet.
          </div>
        </>
      )
    },
    {
      tool: 'get_open_flowsheet · design_unit_op',
      title: 'It reads your flowsheet and the rules',
      body: 'It sees what the unit will connect to, and gets the format every unit op is written in: parameters with units and ranges, the equations that connect them, the limits that must hold, how it runs in the line, and a drawing with its nozzles.'
    },
    {
      tool: 'validate_unit_op',
      title: 'The engine checks it',
      body: (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '2px 0 6px' }}>
            {['Schema', 'References resolve', 'Physically valid', 'Drawn and pipeable'].map((g) => (
              <span
                key={g}
                style={{
                  padding: '2px 8px',
                  border: `1px solid ${D.semantic.ok}`,
                  color: D.semantic.ok,
                  borderRadius: draftingRadius.sharp,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  ...D.data
                }}
              >
                ✓ {g}
              </span>
            ))}
          </div>
          Anything that fails goes back to it with the reason and a hint, and it revises until all four pass. The
          numbers come from the engine evaluating the design, not from the model.
        </>
      )
    },
    {
      tool: 'add_unit_op_to_flowsheet',
      title: 'It lands on this canvas',
      body: 'The app checks it once more, then places it drawn with its nozzles, ready to pipe, and keeps it in My unit ops to use again in any project.'
    }
  ];

  const status =
    link === 'connected'
      ? { ok: true, text: 'This app is linked: your MCP client can place units here.' }
      : link === 'old-app'
        ? { ok: false, text: 'Update ProcessForge Desktop for the MCP link.' }
        : link === 'browser'
          ? { ok: false, text: 'MCP clients reach ProcessForge Desktop, not a browser tab. Here, paste the contract your client gives you below.' }
          : { ok: true, text: 'Checking the link to your MCP client…' };

  return (
    <div
      style={{
        background: P.background.surfaceElevated,
        border: D.rule,
        borderRadius: draftingRadius.sharp,
        padding: 14
      }}
    >
      <div style={{ ...D.label, marginBottom: 10 } as React.CSSProperties}>How your MCP client builds a unit op</div>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {steps.map((st, i) => (
          <li key={st.title} style={{ display: 'grid', gridTemplateColumns: '26px 1fr', gap: 10 }}>
            <span
              aria-hidden
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                border: `1px solid ${P.jade[500]}`,
                color: P.jade[300],
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.72rem',
                fontWeight: 700
              }}
            >
              {i + 1}
            </span>
            <div style={{ fontSize: '0.8rem', color: P.text.secondary, lineHeight: 1.5 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ color: P.text.primary, fontWeight: 700 }}>{st.title}</span>
                {st.tool && <code style={{ fontSize: '0.7rem', color: P.text.muted }}>{st.tool}</code>}
              </div>
              <div style={{ marginTop: 2 }}>{st.body}</div>
            </div>
          </li>
        ))}
      </ol>
      <div
        role="status"
        style={{
          marginTop: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '0.78rem',
          color: status.ok ? P.text.secondary : P.text.gold
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: status.ok ? P.jade[500] : P.text.gold, flexShrink: 0 }} />
        {status.text}
      </div>
    </div>
  );
};
