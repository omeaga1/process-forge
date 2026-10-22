import React from 'react';
import { SITE as D } from '../palette.js';
import { LibraryBrowser } from '../LibraryBrowser.js';
import { PageHeader, Section, card, mono, textLink } from '../ui.js';
import { PageLink } from '../router.js';

/**
 * The ProcessForge Library: units engineers designed and published, found
 * by the next engineer's AI before it designs one from scratch.
 */

const FLOW: { title: string; text: string }[] = [
  { title: 'Someone designs a unit', text: 'In the app or through Claude: a unit no simulator ships, checked by the engine until it holds.' },
  { title: 'They publish it', text: 'With its contract, drawing and panel. The listing records whether the engine accepted it when it was published.' },
  { title: 'The next engineer’s AI finds it', text: 'Before Claude designs anything, design_unit_op asks the library for units like it, and Claude offers them, by name and author.' }
];

export const LibraryPage: React.FC = () => (
  <>
    <PageHeader kicker="PROCESSFORGE LIBRARY" title="Start from a design someone already made.">
      Claude checks the library before designing, so the second freeze concentrator starts from the first.
    </PageHeader>

    <Section id="search" n="01" kicker="SEARCH IT" title="Describe the unit you need." note="Searched live, the same way Claude does: by the words a listing shares with your description, in its name, tags, description and the unit itself.">
      <LibraryBrowser />
    </Section>

    <Section id="how" n="02" kicker="HOW IT WORKS" title="Designed once, found by the next engineer.">
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

    <p style={{ maxWidth: 1120, margin: '0 auto', padding: `28px clamp(16px, 4vw, 32px) 0`, fontSize: 14, color: D.text.secondary }}>
      Publishing a unit, and what Claude sees from the library:{' '}
      <PageLink to="/docs#library" style={textLink}>
        the docs
      </PageLink>
      .
    </p>
  </>
);
