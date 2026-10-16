import React from 'react';
import { OsakaJadeDarkPalette as D } from '@process-forge/theme';
import { RELEASES_PAGE, formatSize, type DesktopOs } from '../../downloads/latestRelease.js';
import { COLD_BREW_PROMPT } from '../coldBrew.js';
import { OS_LABELS, useDownloads } from '../useDownloads.js';
import { CopyCommand, MCPB, MCP_CONFIG, PageHeader, Section, Step, card, mono, textLink } from '../ui.js';

/** Installing the desktop app and the MCP server, and what neither does yet. */

/** Clears the quarantine flag macOS puts on downloads, which is what blocks an app that is not notarized. */
const MAC_UNQUARANTINE = 'xattr -dr com.apple.quarantine /Applications/ProcessForge.app';

/** A platform's warning on first launch, and the way past it. */
function FirstRunNote({ os, children }: { os: string; children: React.ReactNode }) {
  return (
    <div style={{ borderLeft: `2px solid ${D.border.glowAmber}`, padding: '2px 0 2px 12px' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: D.text.primary }}>{os}</div>
      <div style={{ fontSize: 13, lineHeight: 1.6, color: D.text.secondary, marginTop: 2 }}>{children}</div>
    </div>
  );
}

const LIMITS: [string, string][] = [
  ['Pressure', "No pressure network: flow is capped by each unit's rated capacity."],
  ['Properties', 'IAPWS-IF97 for water and steam, ideal gas for gases. Other liquids use the density and heat capacity you give.'],
  ['Items', 'Whole items split evenly down each branch.'],
  ['The library', 'Engine-checked on publish, not reviewed by ProcessForge.'],
  ['Subscriptions', 'Claude Pro and ChatGPT Plus work through an MCP client. In-app AI is billed per use.'],
  ['The model matters', 'Smaller models write designs the engine rejects more often.']
];

export const DownloadPage: React.FC = () => {
  const { installers } = useDownloads();
  return (
    <>
      <PageHeader kicker="DOWNLOAD" title="Up and running in a few minutes.">
        Desktop app to build and simulate. MCP server to drive it from Claude. Free, open source, self-updating.
      </PageHeader>

      <Section id="install" kicker="INSTALL" title="The desktop app, and the MCP server.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 16, alignItems: 'start' }}>
          <div style={card}>
            <div style={{ ...mono, fontSize: 11, letterSpacing: '0.12em', color: D.jade.glow }}>DESKTOP APP</div>
            <div style={{ fontSize: 16, fontWeight: 650, marginTop: 6 }}>Windows, macOS and Linux</div>
            <ol style={{ listStyle: 'none', padding: 0, margin: '16px 0 0', display: 'grid', gap: 14 }}>
              <Step n={1} title="Download the installer">
                <span style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                  {(Object.keys(OS_LABELS) as DesktopOs[]).map((os) => {
                    const hit = installers[os];
                    return (
                      <a
                        key={os}
                        className="pf-cta-secondary"
                        href={hit?.url ?? RELEASES_PAGE}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 12px', borderRadius: 8, border: `1px solid ${D.border.strong}`, color: D.text.primary, textDecoration: 'none', fontSize: 13 }}
                      >
                        <span style={{ fontWeight: 600 }}>{OS_LABELS[os].name}</span>
                        <span style={{ ...mono, fontSize: 11, color: D.text.muted }}>
                          {OS_LABELS[os].file}
                          {hit ? ` · ${hit.version} · ${formatSize(hit.sizeBytes)}` : ''}
                        </span>
                      </a>
                    );
                  })}
                </span>
                <span style={{ display: 'block', marginTop: 6 }}>
                  The macOS build is for Apple silicon (M1 and later). Every file, including the .deb, is on the{' '}
                  <a href={RELEASES_PAGE} target="_blank" rel="noopener noreferrer" style={textLink}>
                    latest release
                  </a>
                  .
                </span>
              </Step>
              <Step n={2} title="Run it, and get past the first-run warning">
                The installers are not code-signed yet, so your system asks once before it opens them.
                <span style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                  <FirstRunNote os="Windows">
                    SmartScreen shows “Windows protected your PC”. Click <b>More info</b>, then <b>Run anyway</b>. The installer sets up for your user only and needs
                    no admin rights.{' '}
                    <a href="/code-signing.html" target="_blank" rel="noopener noreferrer" style={textLink}>
                      Our code signing policy
                    </a>
                  </FirstRunNote>
                  <FirstRunNote os="macOS">
                    Open the .dmg and drag ProcessForge to Applications, then open it once. When macOS says it cannot verify the app, open{' '}
                    <b>System Settings → Privacy &amp; Security</b>, scroll down and click <b>Open Anyway</b>. If it says the app “is damaged and can’t be opened”
                    instead, the file is fine: macOS says that about apps from outside the App Store that are not notarized. Run this in Terminal, then open it
                    again:
                    <span style={{ display: 'block', marginTop: 8 }}>
                      <CopyCommand text={MAC_UNQUARANTINE} />
                    </span>
                  </FirstRunNote>
                  <FirstRunNote os="Linux">
                    Make the AppImage executable (<code style={mono}>chmod +x ProcessForge_*.AppImage</code>) and run it, or install the .deb.
                  </FirstRunNote>
                </span>
              </Step>
              <Step n={3} title="Updates arrive on their own">
                The app checks for a new release each time it starts.
              </Step>
            </ol>
          </div>

          <div id="mcp" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={card}>
              <div style={{ ...mono, fontSize: 11, letterSpacing: '0.12em', color: D.jade.glow }}>MCP · CLAUDE DESKTOP</div>
              <div style={{ fontSize: 16, fontWeight: 650, marginTop: 6 }}>One-click extension</div>
              <ol style={{ listStyle: 'none', padding: 0, margin: '16px 0 0', display: 'grid', gap: 14 }}>
                <Step n={1} title="Download the extension">
                  <a href={MCPB} style={textLink}>
                    process-forge.mcpb
                  </a>
                  , from the latest release.
                </Step>
                <Step n={2} title="Open it">
                  Double-click the file, or drag it onto Claude Desktop, and click <b>Install</b>. Nothing else to set up: Claude Desktop runs it on its built-in Node.js,
                  and it keeps itself up to date.
                </Step>
                <Step n={3} title="Ask Claude">
                  Start a new chat and try:
                  <span style={{ display: 'block', marginTop: 8 }}>
                    <CopyCommand text={COLD_BREW_PROMPT} prompt={null} />
                  </span>
                  <span style={{ display: 'block', marginTop: 8 }}>Keep the desktop app open and Claude puts the unit on your canvas, where you can run it.</span>
                </Step>
              </ol>
            </div>
            <div style={card}>
              <div style={{ ...mono, fontSize: 11, letterSpacing: '0.12em', color: D.jade.glow }}>MCP · CURSOR AND OTHER CLIENTS</div>
              <div style={{ fontSize: 16, fontWeight: 650, marginTop: 6 }}>Add the server to your config</div>
              <p style={{ margin: '8px 0 12px', fontSize: 13, lineHeight: 1.6, color: D.text.secondary }}>
                Needs Node.js 20 or later. Add this to your client’s MCP configuration (for Cursor, <code style={mono}>.cursor/mcp.json</code>) and restart it:
              </p>
              <CopyCommand text={MCP_CONFIG} prompt={null} />
              <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.6, color: D.text.muted }}>
                The package is{' '}
                <a href="https://www.npmjs.com/package/@process-forge/mcp-server" target="_blank" rel="noopener noreferrer" style={textLink}>
                  @process-forge/mcp-server
                </a>{' '}
                on npm.
              </p>
            </div>
          </div>
        </div>
      </Section>

      <Section id="limits" kicker="HONESTLY" title="What it does not do yet.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 10 }}>
          {LIMITS.map(([k, t]) => (
            <div key={k} style={{ border: `1px solid ${D.border.subtle}`, borderRadius: 10, padding: '12px 14px', background: `${D.background.surface}99` }}>
              <div style={{ fontSize: 13, fontWeight: 650, color: D.text.primary }}>{k}</div>
              <div style={{ fontSize: 13, lineHeight: 1.55, color: D.text.secondary, marginTop: 4 }}>{t}</div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
};
