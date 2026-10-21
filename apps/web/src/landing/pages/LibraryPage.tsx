import React from 'react';
import { SITE as D } from '../palette.js';
import { LibraryBrowser } from '../LibraryBrowser.js';
import { PageHeader, Section, Step, card, mono } from '../ui.js';

/**
 * The ProcessForge Library: units engineers designed and published, found
 * by the next engineer's AI before it designs one from scratch.
 */

const FLOW: { title: string; text: string }[] = [
  { title: 'Someone designs a unit', text: 'In the app or through Claude: a unit no simulator ships, checked by the engine until it holds.' },
  { title: 'They publish it', text: 'With its contract, drawing and panel. The listing records whether the engine accepted it when it was published.' },
  { title: 'The next engineer’s AI finds it', text: 'Before Claude designs anything, design_unit_op asks the library for units like it, and Claude offers them, by name and author.' }
];

const SEEN = `"fromTheLibrary": {
  "checked": true,
  "matches": [
    {
      "name": "Coffee freeze concentrator",
      "author": "…",
      "similarity": 0.67,
      "sharedWords": ["freeze", "concentrator", "coffee"],
      "engineChecked": true
    }
  ],
  "instruction": "Before you design, tell the engineer that the
    ProcessForge Library already has units like this … and ask
    whether to start from one."
}`;

export const LibraryPage: React.FC = () => (
  <>
    <PageHeader kicker="PROCESSFORGE LIBRARY" title="Start from a design someone already made.">
      Claude checks the library before designing, so the second freeze concentrator starts from the first.
    </PageHeader>

    <Section id="how" n="01" kicker="HOW IT WORKS" title="Designed once, found by the next engineer.">
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 12 }}>
        {FLOW.map((f, i) => (
          <li key={f.title} style={{ ...card, display: 'grid', gap: 6 }}>
            <span style={{ ...mono, fontSize: 12, color: D.jade.glow }}>{i + 1}</span>
            <span style={{ fontSize: 16, fontWeight: 650 }}>{f.title}</span>
            <span style={{ fontSize: 14, lineHeight: 1.55, color: D.text.secondary }}>{f.text}</span>
          </li>
        ))}
      </ol>
    </Section>

    <Section id="search" n="02" kicker="SEARCH IT" title="Describe the unit you need." note="Searched live, the same way Claude does: by the words a listing shares with your description, in its name, tags, description and the unit itself.">
      <LibraryBrowser />
    </Section>

    <Section id="claude" n="03" kicker="WHAT CLAUDE SEES" title="The check comes with every design brief.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 16, alignItems: 'start' }}>
        <div style={{ fontSize: 15, lineHeight: 1.65, color: D.text.secondary }}>
          <p style={{ margin: 0 }}>
            When you ask Claude for a unit, <code style={{ ...mono, color: D.jade.glow }}>design_unit_op</code> searches the library with your description and
            returns the closest matches alongside the brief. Claude shows you them before it writes anything: start from one with{' '}
            <code style={{ ...mono, color: D.jade.glow }}>add_community_unit_op</code> and set its operating conditions, or have it design a new one.
          </p>
          <p style={{ margin: '12px 0 0' }}>
            When nothing matches, Claude designs it, and once the engine accepts it, offers to publish it. You can also search yourself:{' '}
            <code style={{ ...mono, color: D.jade.glow }}>search_community_unit_ops</code> with <code style={mono}>similarTo</code>.
          </p>
        </div>
        <pre tabIndex={0} aria-label="What design_unit_op returns from the library" style={{ ...mono, margin: 0, padding: '14px 16px', borderRadius: 12, border: `1px solid ${D.border.default}`, background: D.background.base, fontSize: 12, lineHeight: 1.6, color: D.text.secondary, overflowX: 'auto' }}>
          {SEEN}
        </pre>
      </div>
    </Section>

    <Section id="publish" n="04" kicker="PUBLISH" title="Put your unit in the library.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 16, alignItems: 'start' }}>
        <div style={card}>
          <div style={{ fontSize: 16, fontWeight: 650 }}>From the app</div>
          <ol style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', display: 'grid', gap: 12 }}>
            <Step n={1} title="Sign in with Google">Publishing is under your name, so the library knows whose listing it is. Searching needs no account.</Step>
            <Step n={2} title="Open the unit">Double-click it on the canvas. Its panel opens.</Step>
            <Step n={3} title="More actions → Publish to the ProcessForge Library">
              Add a description and tags so others find it. Publish a new version whenever you change it, or unpublish it.
            </Step>
          </ol>
        </div>
        <div style={card}>
          <div style={{ fontSize: 16, fontWeight: 650 }}>From Claude</div>
          <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.6, color: D.text.secondary }}>
            Ask it to publish the unit. <code style={{ ...mono, color: D.jade.glow }}>publish_unit_op</code> opens the same dialog in the desktop app, filled in, and
            you confirm there: nothing is published without you.
          </p>
          <p style={{ margin: '12px 0 0', fontSize: 13, lineHeight: 1.6, color: D.text.muted }}>
            Listings are what their authors wrote. ProcessForge records whether the engine accepted a unit when it was published, but does not review or certify
            it; check a unit’s settings before you rely on its results.
          </p>
        </div>
      </div>
    </Section>
  </>
);
