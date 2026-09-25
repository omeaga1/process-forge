import type { ProcessNode } from '@process-forge/protocol';

/** What to change when this unit is what limits the line. */
export function bottleneckAdvice(node: ProcessNode | undefined, unitsPerMin: number): string {
  if (!node) return 'No unit limits the line in the static analysis.';
  const rate = Math.round(unitsPerMin * 10) / 10;
  const who = `"${node.name}" limits the line at about ${rate} units/min.`;
  switch (node.kind) {
    case 'BATCH_REACTOR':
      return `${who} A batch reactor delivers one batch per fill + reaction + discharge, so add a second reactor in parallel, shorten the reaction or fill time, or run larger batches; a bigger surge tank only smooths the gaps, it does not raise the average.`;
    case 'PUMP':
      return `${who} The pump's design flow caps the product reaching the filler: fit a larger pump or run two in parallel.`;
    case 'SURGE_TANK':
      return `${who} The tank's maximum discharge rate caps what it can send on: raise it (larger outlet, pump) or feed the filler from a second tank.`;
    case 'ROTARY_FILLER':
      return `${who} Add nozzles or shorten the fill and index times.`;
    case 'LABELER':
      return `${who} Raise the labeler's speed or add a second labeler in parallel.`;
    case 'PALLETIZER':
      return `${who} Shorten the layer cycle or build larger layers.`;
    case 'TERMINAL':
      return `${who} It is a feed: the supply rate set on it is what limits the line. Raise it (or set it to 0 to supply whatever the line takes) if the real supply allows.`;
    default:
      return `${who} Raise this unit's rate or run a second one in parallel.`;
  }
}
