import React from 'react';
import { SITE as D } from '../palette.js';
import { WorkedExample } from '../WorkedExample.js';
import { ControlDemo } from '../ControlDemo.js';
import { CLIPS, Clip, PageHeader, Section } from '../ui.js';

/**
 * One unit nobody ships, end to end: the loop as it ran, its operating
 * conditions to set, and the same line in the desktop app.
 */
export const ExamplePage: React.FC = () => (
  <>
    <PageHeader kicker="WORKED EXAMPLE" title="Cold brew, freeze-concentrated: from one sentence to a simulated line.">
      No simulator ships this unit. Here is the whole loop as it ran; every number is the engine’s.
    </PageHeader>

    <Section id="walkthrough" n="01" kicker="THE LOOP" title="Six steps, as they ran.">
      <WorkedExample />
    </Section>

    <Section
      id="control"
      n="02"
      kicker="YOUR NUMBERS"
      title="Then set the conditions yourself."
      note="Operating conditions are inputs, not guesses. Change one and the engine re-checks the design and runs an hour of the line again. Try 6 gal/min of feed."
    >
      <ControlDemo />
    </Section>

    <Section id="app" n="03" kicker="IN THE APP" title="The same line, in the desktop app." note="Recorded from the current build.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 20 }}>
        {CLIPS.map((c) => (
          <figure key={c.src} style={{ margin: 0 }}>
            <Clip src={c.src} title={c.title} />
            <figcaption style={{ marginTop: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 650 }}>{c.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.55, color: D.text.secondary, marginTop: 4 }}>{c.text}</div>
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  </>
);
