import type { UnitOpContract } from './contract.js';
import type { UnitOpDrawing } from './drawing.js';
import { drawingSimilarity } from './drawingKits.js';
import { CASE_PACKER_CONTRACT } from './examples/casePacker.js';
import { JUICE_CONCENTRATOR_CONTRACT, NEUTRALISER_CONTRACT } from './examples/componentUnits.js';
import { CRYSTALLISER_CONTRACT } from './examples/crystalliser.js';
import { EVAPORATOR_CONTRACT } from './examples/evaporator.js';
import { FDM_PRINTER_CONTRACT } from './examples/fdmPrinter.js';
import { CONCENTRATE_PUMP_CONTRACT, JUICE_FEED_PUMP_CONTRACT, SURFACE_CONDENSER_CONTRACT, VACUUM_EVAPORATOR_CONTRACT } from './examples/juiceConcentration.js';
import { DUST_COLLECTOR_CONTRACT, SPRAY_DRYER_CONTRACT, VENTURI_SCRUBBER_CONTRACT } from './examples/phaseUnits.js';
import { PUMP_CONTRACT } from './examples/pump.js';
import {
  CONTINUOUS_DRYER_CONTRACT,
  CSTR_CONTRACT,
  DECANTER_CENTRIFUGE_CONTRACT,
  DISTILLATION_COLUMN_CONTRACT,
  FLOW_SPLITTER_CONTRACT,
  INLINE_MIXER_CONTRACT,
  PLUG_FLOW_REACTOR_CONTRACT,
  PROCESS_HEATER_CONTRACT,
  SOLIDS_FILTER_CONTRACT
} from './examples/standardUnits.js';
import { TWO_STREAM_EXCHANGER_CONTRACT } from './examples/twoStreamExchanger.js';
import { WAX_COOLING_BELT_CONTRACT } from './examples/waxCoolingBelt.js';

/**
 * The drawings that ship with ProcessForge: the worked examples a model is
 * shown and the Standard palette's contracts. A designed unit should not be
 * one of them with the name changed.
 */
const SHIPPED: UnitOpContract[] = [
  CASE_PACKER_CONTRACT,
  JUICE_CONCENTRATOR_CONTRACT,
  NEUTRALISER_CONTRACT,
  CRYSTALLISER_CONTRACT,
  EVAPORATOR_CONTRACT,
  FDM_PRINTER_CONTRACT,
  CONCENTRATE_PUMP_CONTRACT,
  JUICE_FEED_PUMP_CONTRACT,
  SURFACE_CONDENSER_CONTRACT,
  VACUUM_EVAPORATOR_CONTRACT,
  DUST_COLLECTOR_CONTRACT,
  SPRAY_DRYER_CONTRACT,
  VENTURI_SCRUBBER_CONTRACT,
  PUMP_CONTRACT,
  CONTINUOUS_DRYER_CONTRACT,
  CSTR_CONTRACT,
  DECANTER_CENTRIFUGE_CONTRACT,
  DISTILLATION_COLUMN_CONTRACT,
  FLOW_SPLITTER_CONTRACT,
  INLINE_MIXER_CONTRACT,
  PLUG_FLOW_REACTOR_CONTRACT,
  PROCESS_HEATER_CONTRACT,
  SOLIDS_FILTER_CONTRACT,
  TWO_STREAM_EXCHANGER_CONTRACT,
  WAX_COOLING_BELT_CONTRACT
];

/** At or above this share of the same geometry, a drawing is a copy. */
export const NEAR_COPY_SIMILARITY = 0.8;

/**
 * The shipped drawing this one copies, if any. A fork says where it came from
 * (drawing.origin.forkedFrom) and is the engineer's to reshape, so it is not
 * held to this.
 */
export function nearCopyOf(drawing: UnitOpDrawing, contractId?: string): { name: string; similarity: number } | null {
  if (drawing.origin?.forkedFrom) return null;
  let best: { name: string; similarity: number } | null = null;
  for (const c of SHIPPED) {
    if (!c.drawing || c.id === contractId) continue;
    const similarity = drawingSimilarity(drawing, c.drawing);
    if (similarity >= NEAR_COPY_SIMILARITY && (!best || similarity > best.similarity)) best = { name: c.name, similarity };
  }
  return best;
}
