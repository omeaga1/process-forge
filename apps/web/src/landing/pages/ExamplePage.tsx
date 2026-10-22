import React from 'react';
import { WorkedExample } from '../WorkedExample.js';
import { ControlDemo } from '../ControlDemo.js';
import { PageHeader, Section } from '../ui.js';

/**
 * One unit nobody ships, end to end: the loop as it ran, then its operating
 * conditions to set yourself.
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

  </>
);
