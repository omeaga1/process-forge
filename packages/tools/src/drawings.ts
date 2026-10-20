import {
  DRAWING_KITS,
  DRAWING_KIT_SUMMARY,
  STANDARD_EQUIPMENT_CATALOG,
  UnitOpDrawingSchema,
  checkUnitOpDrawing,
  createStandardUnitOp,
  drawUnitOp,
  drawingQuality,
  drawingToStandaloneSvg,
  effectiveContract,
  findStandardUnitOp,
  nearCopyOf,
  resolveUnit,
  variantFor,
  type DrawingKit,
  type KitPort,
  type KitSettings,
  type ProcessNode,
  type UnitOpContract,
  type UnitOpDrawing
} from '@process-forge/protocol';
import { fetchCommunityUnitOp } from './catalog.js';
import type { ToolHost } from './host.js';

/**
 * Drawing designed units: draw one from its contract with a kit, look at a
 * drawing as an image, and fork a unit that is already modelled (a Standard
 * unit, a Library unit, or one on the flowsheet) to reshape it.
 */

type Json = Record<string, any>;

/** A palette unit's kind, as the kit that draws the same equipment. */
const KIND_KIT: Partial<Record<ProcessNode['kind'], DrawingKit>> = {
  ROTARY_FILLER: 'rotary-machine',
  CONVEYOR: 'conveyor',
  LABELER: 'labeler',
  PALLETIZER: 'palletizer',
  SURGE_TANK: 'tank',
  BATCH_REACTOR: 'tank',
  MIXER: 'tank',
  PUMP: 'pump',
  HEAT_EXCHANGER: 'heat-exchanger',
  SEPARATOR: 'tank',
  SCRUBBER: 'carbonator',
  SPRAY_CHAMBER: 'tank'
};

const isKit = (k: unknown): k is DrawingKit => typeof k === 'string' && (DRAWING_KITS as readonly string[]).includes(k);

/** What a drawing looks like at a glance: its kit, shapes, moving parts, score, and anything to fix. */
function drawingReport(drawing: UnitOpDrawing, ports: { id: string; direction: string }[], moves: boolean, contractId?: string) {
  const check = checkUnitOpDrawing(drawing, ports);
  const quality = drawingQuality(drawing, { moves });
  const copy = nearCopyOf(drawing, contractId);
  return {
    shapes: drawing.shapes.length,
    movingParts: (drawing.parts ?? []).map((p) => `${p.id} (${p.motion})`),
    nozzles: drawing.nozzles.map((n) => `${n.portId} on the ${n.side} at ${n.x}%, ${n.y}%`),
    quality: quality.score,
    errors: check.errors,
    warnings: [...check.warnings, ...quality.warnings, ...(copy ? [`${Math.round(copy.similarity * 100)}% the same as "${copy.name}", which ships with ProcessForge.`] : [])]
  };
}

const moving = (c: Partial<UnitOpContract> | undefined) => c?.behavior?.mode === 'DISCRETE_CYCLE' || c?.archetype === 'pump';

export function drawUnit(args: Json): Json {
  const contract = args.contract && typeof args.contract === 'object' ? (args.contract as Partial<UnitOpContract> & { ports?: KitPort[] }) : undefined;
  const ports = (contract?.ports ?? args.ports) as KitPort[] | undefined;
  if (!Array.isArray(ports) || !ports.length) {
    return { success: false, error: 'Give "contract" (with its ports), or "ports" with a "name": every port gets a nozzle on the drawing.' };
  }
  if (args.kit !== undefined && !isKit(args.kit)) return { success: false, error: `"kit" is one of ${DRAWING_KITS.join(', ')}.` };
  const r = drawUnitOp({
    ...(contract ? { contract: { ...contract, ports } } : { ports }),
    ...(typeof args.name === 'string' ? { name: args.name } : {}),
    ...(typeof args.description === 'string' ? { description: args.description } : {}),
    ...(isKit(args.kit) ? { kit: args.kit } : {}),
    ...(typeof args.variant === 'number' ? { variant: Math.max(0, Math.floor(args.variant)) % 1_000_000 } : {}),
    ...(args.settings && typeof args.settings === 'object' ? { settings: args.settings as Partial<KitSettings> } : {})
  });
  return {
    success: true,
    kit: r.routing.kit,
    kitSummary: DRAWING_KIT_SUMMARY[r.routing.kit],
    routing: r.routing,
    variant: r.variant,
    settings: r.settings,
    report: drawingReport(r.drawing, ports, moving(contract), contract?.id),
    drawing: r.drawing,
    nextStep:
      'Put this in contract.drawing. Look at it with preview_unit_drawing, then make it this unit\'s own where it differs (shapes, tones, a part that moves). Another variant (variant: any number) changes the free choices; another kit (kit) draws different equipment. Then validate_unit_op.'
  };
}

/**
 * A drawing as an image: the host renders the SVG (the desktop app's web view
 * does it), so a model can look at what it made and fix it before the engineer
 * sees it. Without a renderer, the SVG text and the report still come back.
 */
export async function previewDrawing(args: Json, host: ToolHost): Promise<Json> {
  let drawing: UnitOpDrawing | undefined;
  let ports: { id: string; direction: string }[] = [];
  let contract: Partial<UnitOpContract> | undefined;
  let label = 'drawing';
  if (args.contract && typeof args.contract === 'object') {
    contract = args.contract as Partial<UnitOpContract>;
    drawing = contract.drawing as UnitOpDrawing | undefined;
    ports = (contract.ports ?? []) as { id: string; direction: string }[];
    label = contract.name ?? label;
  } else if (args.drawing && typeof args.drawing === 'object') {
    drawing = args.drawing as UnitOpDrawing;
    ports = Array.isArray(args.ports) ? args.ports : drawing.nozzles.map((n) => ({ id: n.portId, direction: 'INLET' }));
  } else if (typeof args.unit === 'string') {
    const open = await host.readOpen();
    if ('error' in open) return { success: false, error: open.error };
    const node = resolveUnit(open.graph, args.unit);
    if (!node || typeof node === 'string') return { success: false, error: typeof node === 'string' ? node : `No unit "${args.unit}" on the flowsheet.` };
    contract = (node.config as { contract?: UnitOpContract }).contract;
    drawing = contract?.drawing;
    ports = [...node.inputs, ...node.outputs].map((p) => ({ id: p.id, direction: node.inputs.includes(p) ? 'INLET' : 'OUTLET' }));
    label = node.name;
    if (!drawing) return { success: false, error: `"${node.name}" is drawn by the app's palette, not by a contract drawing. fork_unit_op gives it one to reshape.` };
  }
  if (!drawing) return { success: false, error: 'Give "contract" (with its drawing), "drawing", or "unit" (a designed unit on the flowsheet).' };
  const parsed = UnitOpDrawingSchema.safeParse(drawing);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { success: false, error: `The drawing is not valid: ${i?.path.join('.') || 'drawing'}: ${i?.message ?? 'invalid'}.` };
  }
  const svg = drawingToStandaloneSvg(parsed.data, { pixelWidth: Math.max(200, Math.min(900, Number(args.pixelWidth) || 560)) });
  const report = drawingReport(parsed.data, ports, moving(contract), contract?.id);
  const rendered = host.renderSvg ? await host.renderSvg(svg).catch((e: unknown) => ({ error: (e as Error).message })) : { error: 'This host cannot render images.' };
  if ('png' in rendered) {
    return {
      success: true,
      unit: label,
      report,
      image: { mimeType: 'image/png', data: rendered.png },
      nextStep: 'Look at the image: is it recognisably this equipment, are the nozzles on the walls where the streams connect, does anything overlap or float? Fix the shapes and preview again.'
    };
  }
  return {
    success: true,
    unit: label,
    report,
    imageUnavailable: `No image: ${rendered.error} The SVG is below; read the report instead.`,
    svg
  };
}

/**
 * Starts a new design from a unit that is already modelled: its whole
 * contract and a drawing to reshape, under a new id so the original is left
 * as it was. From a Standard unit (catalog id), a Library listing (id), or a
 * unit on the open flowsheet (id, name or tag).
 */
export async function forkUnitOp(args: Json, host: ToolHost): Promise<Json> {
  const from = typeof args.from === 'string' ? args.from.trim() : '';
  if (!from) return { success: false, error: 'Give "from": a Standard unit\'s catalog id (list_standard_unit_ops), a Library listing id (search_community_unit_ops), or a unit on the flowsheet.' };
  let node: ProcessNode | undefined;
  let source: string;
  const standard = args.source !== 'library' && args.source !== 'flowsheet' ? findStandardUnitOp(from) : undefined;
  if (standard) {
    node = createStandardUnitOp(standard);
    source = `Standard unit "${standard.title}"`;
  } else if (args.source !== 'library') {
    const open = await host.readOpen();
    const found = 'error' in open ? null : resolveUnit(open.graph, from);
    if (found && typeof found !== 'string') {
      node = found;
      source = `"${found.name}" on the flowsheet`;
    } else source = '';
  } else source = '';
  if (!node) {
    const got = await fetchCommunityUnitOp(from, host.communityApiBase);
    if ('error' in got) {
      return {
        success: false,
        error: `Nothing to fork called "${from}": not a Standard unit (${STANDARD_EQUIPMENT_CATALOG.map((i) => i.id).join(', ')}), not a unit on the flowsheet, and the Library said: ${got.error}`
      };
    }
    node = got.node;
    source = `Library unit "${got.name}" by ${got.author}`;
  }
  const base = effectiveContract(node);
  if (!base) return { success: false, error: `${source} has no contract to fork (a feed or outlet arrow).` };
  const suffix = variantFor(`${base.id}|${Date.now()}`).toString(36);
  const name = typeof args.name === 'string' && args.name.trim() ? args.name.trim() : `${base.name} (fork)`;
  const ports = base.ports as KitPort[];
  // Keep a drawing the unit already has; draw palette units, whose look lives in the app, with their kit.
  const kept = base.drawing ?? (node.config as { contract?: UnitOpContract }).contract?.drawing;
  const drawn = kept
    ? { ...kept, origin: { ...(kept.origin ?? {}), forkedFrom: source } }
    : {
        ...drawUnitOp({ contract: { ...base, name }, ...(KIND_KIT[node.kind] ? { kit: KIND_KIT[node.kind]! } : {}) }).drawing,
        origin: { kit: KIND_KIT[node.kind] ?? 'machine', forkedFrom: source }
      };
  const contract: UnitOpContract = {
    ...base,
    id: `${base.id}-fork-${suffix}`.slice(0, 80),
    name,
    drawing: drawn as UnitOpDrawing,
    provenance: { ...(base.provenance ?? {}), authoredBy: 'SUB_AGENT', engineerConfirmed: [] } as UnitOpContract['provenance']
  };
  return {
    success: true,
    forkedFrom: source,
    contract,
    report: drawingReport(drawn as UnitOpDrawing, ports, moving(base), contract.id),
    nextStep:
      'This is a copy to reshape: change its parameters, ports, physics and drawing to what the engineer asked for (preview_unit_drawing to look at it), then validate_unit_op and add_unit_op_to_flowsheet. The original is unchanged.'
  };
}
