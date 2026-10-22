import React from 'react';
import { SITE as D } from '../palette.js';
import { McpDemo } from '../McpDemo.js';
import { CopyCommand, MCPB, NPX, PageHeader, REPO, Section, card, textLink } from '../ui.js';
import { PageLink } from '../router.js';

/** Driving ProcessForge from Claude, or any MCP client, and from the app itself. */
export const ClaudePage: React.FC = () => (
  <>
    <PageHeader kicker="CLAUDE & MCP" title="Your AI designs the unit. The engine does the physics.">
      Claude checks the library, designs units nobody ships, places and pipes them, and simulates the line.
    </PageHeader>

    <Section id="session" n="01" kicker="A SESSION" title="What it looks like.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={card}>
            <div style={{ fontSize: 16, fontWeight: 650 }}>From Claude Desktop, Cursor, or any MCP client</div>
            <p style={{ margin: '8px 0 14px', fontSize: 14, lineHeight: 1.6, color: D.text.secondary }}>
              On the subscription you already have, working straight on your open canvas.
            </p>
            <a href={MCPB} className="pf-btn" data-variant="primary" data-size="md" style={{ textDecoration: 'none' }}>
              Add to Claude Desktop
            </a>
            <p style={{ margin: '8px 0 14px', fontSize: 13, lineHeight: 1.55, color: D.text.muted }}>
              One click to install, and it keeps itself up to date. For Cursor and other clients, add the server (Node.js 20 or later):
            </p>
            <CopyCommand text={NPX} />
            <p style={{ margin: '10px 0 0', fontSize: 13, color: D.text.muted }}>
              Step by step:{' '}
              <PageLink to="/download#mcp" style={textLink}>
                install guide
              </PageLink>{' '}
              ·{' '}
              <a href={`${REPO}/tree/main/packages/mcp-server#readme`} target="_blank" rel="noopener noreferrer" style={textLink}>
                every tool
              </a>
            </p>
          </div>
          <div style={card}>
            <div style={{ fontSize: 16, fontWeight: 650 }}>In the app, with OpenRouter</div>
            <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.6, color: D.text.secondary }}>
              Sign in once and chat with Claude, GPT, Gemini and others inside ProcessForge, paying as you go, with a spending limit you set at OpenRouter. Same
              tools, same engine.
            </p>
          </div>
        </div>
        <McpDemo />
      </div>
    </Section>

    <p style={{ maxWidth: 1120, margin: '0 auto', padding: `28px clamp(16px, 4vw, 32px) 0`, fontSize: 14, color: D.text.secondary }}>
      Every tool, grouped by what it does:{' '}
      <PageLink to="/docs#tools" style={textLink}>
        the docs
      </PageLink>
      .
    </p>
  </>
);
