import {
  STANDARD_EQUIPMENT_CATALOG,
  createStandardUnitOp,
  findStandardUnitOp,
  type Carries,
  type EquipmentPaletteItem,
  type ProcessNode
} from '@process-forge/protocol';
import { executeAddNode } from './desktopBridge.js';

/**
 * The equipment that ships with ProcessForge, for an MCP client: the same
 * catalog the app's palette shows (protocol/equipment/catalog.ts), so a
 * standard pump added here is the pump the engineer would have dragged in.
 * Feeds, products, byproducts and waste are in it too: the arrows that mark
 * where material enters and leaves the flowsheet.
 */

const portsOf = (node: ProcessNode) => ({
  inlets: node.inputs.map((p) => ({ id: p.id, name: p.name, carries: p.flowDimension === 'DISCRETE_CONTAINER' ? 'items' : 'liquid' })),
  outlets: node.outputs.map((p) => ({ id: p.id, name: p.name, carries: p.flowDimension === 'DISCRETE_CONTAINER' ? 'items' : 'liquid' }))
});

function describeEntry(item: EquipmentPaletteItem) {
  const sample = createStandardUnitOp(item, { position: { x: 0, y: 0 } });
  const parameters = Object.fromEntries(
    Object.entries(sample.config as Record<string, unknown>).filter(([, v]) => typeof v === 'number')
  );
  return {
    unit: item.id,
    title: item.title,
    kind: item.kind,
    ...(item.terminalRole ? { role: item.terminalRole } : {}),
    category: item.category,
    what: item.subtitle,
    description: item.description,
    ...portsOf(sample),
    parameters,
    ...(item.terminalRole
      ? {
          note:
            'Its port takes on the kind of the first unit it is piped to (liquid or items). Give "material" to name what it carries' +
            (item.terminalRole === 'feed' ? ', and "supplyRate" (gal/min or items/min) to limit the supply.' : '.')
        }
      : {})
  };
}

export function executeListStandardUnitOps(args: { query?: string } = {}): Record<string, unknown> {
  const q = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
  const items = STANDARD_EQUIPMENT_CATALOG.filter(
    (i) => !q || `${i.id} ${i.title} ${i.subtitle} ${i.description} ${i.kind} ${i.tags.join(' ')}`.toLowerCase().includes(q)
  );
  return {
    success: true,
    count: items.length,
    units: items.map(describeEntry),
    nextStep:
      'Place one with add_standard_unit_op (by its "unit" id). For equipment that is not here, search_community_unit_ops, or design one with design_unit_op.'
  };
}

export interface AddStandardParams {
  unit: string;
  name?: string;
  parameters?: Record<string, number>;
  material?: string;
  supplyRate?: number;
  composition?: Record<string, number>;
  carries?: Carries;
  position?: { x: number; y: number };
  connectFrom?: string;
  connectTo?: string;
}

export async function executeAddStandardUnitOp(params: AddStandardParams): Promise<Record<string, unknown>> {
  if (typeof params?.unit !== 'string' || !params.unit.trim()) {
    return { success: false, added: false, error: 'Give "unit": a catalog id from list_standard_unit_ops, such as "pump" or "feed".' };
  }
  const item = findStandardUnitOp(params.unit);
  if (!item) {
    return {
      success: false,
      added: false,
      error: `No standard unit "${params.unit}". Units: ${STANDARD_EQUIPMENT_CATALOG.map((i) => i.id).join(', ')}.`
    };
  }
  const node = createStandardUnitOp(item, {
    ...(params.name ? { name: params.name } : {}),
    ...(params.parameters ? { parameters: params.parameters } : {}),
    ...(params.material ? { material: params.material } : {}),
    ...(typeof params.supplyRate === 'number' ? { supplyRate: params.supplyRate } : {}),
    ...(params.composition && typeof params.composition === 'object' ? { composition: params.composition } : {}),
    ...(params.carries === 'items' || params.carries === 'liquid' ? { carries: params.carries } : {})
  });
  // Settings the unit does not have are reported, not silently dropped.
  const known = node.config as Record<string, unknown>;
  const ignored = Object.keys(params.parameters ?? {}).filter((k) => typeof known[k] !== 'number');

  const result = await executeAddNode(
    node,
    {
      ...(params.position ? { position: params.position } : {}),
      ...(params.connectFrom ? { connectFrom: params.connectFrom } : {}),
      ...(params.connectTo ? { connectTo: params.connectTo } : {})
    },
    'standard'
  );
  return {
    ...result,
    unit: item.id,
    ...(ignored.length
      ? { ignoredParameters: ignored, parametersNote: `Not settings of a ${item.title}; its settings are: ${Object.keys(known).filter((k) => typeof known[k] === 'number').join(', ')}.` }
      : {})
  };
}
