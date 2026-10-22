import React from 'react';
import { DRAWING_KITS } from '@process-forge/protocol';
import { PageHeader, Section } from '../ui.js';
import { StudioFeatures } from '../StudioFeatures.js';
import { KitGallery } from '../KitGallery.js';

/**
 * The studio: what the canvas does, and how the units your AI designs are
 * drawn. The reference (every unit, every tool) is on the docs page.
 */
export const StudioPage: React.FC = () => (
  <>
    <PageHeader kicker="THE STUDIO" title="Build the line, run it, read it.">
      One canvas, in the desktop app or the same studio in the browser.
    </PageHeader>

    <Section id="canvas" n="01" kicker="ON THE CANVAS" title="From the first pipe to what limits the line.">
      <StudioFeatures />
    </Section>

    <Section
      id="drawings"
      n="02"
      kicker="DRAWN LIKE THE EQUIPMENT"
      title="Designed units look like the machines they model."
      note={`Every unit your AI designs is drawn from one of ${DRAWING_KITS.length} parametric kits, shaped by its own numbers. These are drawn by the engine, in this page.`}
    >
      <KitGallery />
    </Section>
  </>
);
