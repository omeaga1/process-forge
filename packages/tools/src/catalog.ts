import {
  EQUIPMENT_CATEGORIES,
  ProcessNodeSchema,
  STANDARD_EQUIPMENT_CATALOG,
  createStandardUnitOp,
  effectiveContract,
  findStandardUnitOp,
  type Carries,
  type EquipmentPaletteItem,
  type ProcessNode
} from '@process-forge/protocol';
import type { AddUnitOptions, HostResult, ToolHost } from './host.js';

/**
 * The equipment that ships with ProcessForge (the app's palette, the same
 * catalog: protocol/equipment/catalog.ts), and the community library.
 */

export const portsOf = (node: ProcessNode) => ({
  inlets: node.inputs.map((p) => ({ id: p.id, name: p.name, carries: p.flowDimension === 'DISCRETE_CONTAINER' ? 'items' : 'liquid' })),
  outlets: node.outputs.map((p) => ({ id: p.id, name: p.name, carries: p.flowDimension === 'DISCRETE_CONTAINER' ? 'items' : 'liquid' }))
});

function describeEntry(item: EquipmentPaletteItem) {
  const sample = createStandardUnitOp(item, { position: { x: 0, y: 0 } });
  // Every unit's settings are its contract's parameters, with their units and physical ranges.
  const contract = effectiveContract(sample);
  const parameters = contract
    ? Object.fromEntries(
        contract.parameters.map((p) => [
          p.name,
          { value: p.value, unit: p.unit, label: p.label, ...(p.min !== undefined ? { min: p.min } : {}), ...(p.max !== undefined ? { max: p.max } : {}) }
        ])
      )
    : Object.fromEntries(Object.entries(sample.config as Record<string, unknown>).filter(([, v]) => typeof v === 'number'));
  return {
    unit: item.id,
    title: item.title,
    kind: item.kind,
    ...(item.terminalRole ? { role: item.terminalRole } : {}),
    category: item.category,
    categoryLabel: EQUIPMENT_CATEGORIES.find((c) => c.id === item.category)?.label,
    what: item.subtitle,
    description: item.description,
    howItIsSimulated: item.model,
    ...(contract
      ? {
          contractMode: contract.behavior.mode,
          designNote: 'Runs on a contract like any designed unit: tune its parameters with update_unit, or redesign it (design_unit_op, starting from this contract) for your process.'
        }
      : {}),
    ...portsOf(sample),
    parameters,
    ...(item.terminalRole
      ? {
          note:
            'Its port takes on the kind of the first unit it is piped to (liquid or items). Give "material" to name what it carries' +
            (item.terminalRole === 'feed'
              ? ', and "supplyRate" (gal/min or items/min) to limit the supply (or "supplyKgPerHour" for a mass flow, "supplyScfm" for a gas), and "phase" (LIQUID, GAS or SOLID) for what it carries: a GAS feed is an ideal gas at its temperature unless given a density. Say what liquid it supplies with parameters { "temperatureC", "densityGPerCm3", "specificHeatKjPerKgK" }; unset, it supplies the liquid the unit it feeds was designed for.'
              : '.')
        }
      : {})
  };
}

export function listStandardUnitOps(args: { query?: string; category?: string } = {}): Record<string, unknown> {
  const q = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
  const category = typeof args.category === 'string' ? args.category.trim().toUpperCase() : '';
  if (category && !EQUIPMENT_CATEGORIES.some((c) => c.id === category)) {
    return { success: false, error: `No category "${args.category}". Categories: ${EQUIPMENT_CATEGORIES.map((c) => c.id).join(', ')}.` };
  }
  const items = STANDARD_EQUIPMENT_CATALOG.filter(
    (i) => (!category || i.category === category) && (!q || `${i.id} ${i.title} ${i.short} ${i.subtitle} ${i.description} ${i.kind} ${i.tags.join(' ')}`.toLowerCase().includes(q))
  );
  return {
    success: true,
    count: items.length,
    categories: EQUIPMENT_CATEGORIES.map((c) => ({ id: c.id, label: c.label, description: c.description, units: STANDARD_EQUIPMENT_CATALOG.filter((i) => i.category === c.id).length })),
    units: items.map(describeEntry),
    nextStep: 'Place one with add_standard_unit_op (by its "unit" id). For equipment that is not here, search_community_unit_ops, or design one with design_unit_op.'
  };
}

export interface AddStandardParams extends AddUnitOptions {
  unit: string;
  name?: string;
  parameters?: Record<string, number>;
  material?: string;
  supplyRate?: number;
  composition?: Record<string, number>;
  carries?: Carries;
  phase?: 'LIQUID' | 'GAS' | 'SOLID';
  supplyKgPerHour?: number;
  supplyScfm?: number;
}

export async function addStandardUnitOp(params: AddStandardParams, host: ToolHost): Promise<HostResult> {
  if (typeof params?.unit !== 'string' || !params.unit.trim()) {
    return { success: false, added: false, error: 'Give "unit": a catalog id from list_standard_unit_ops, such as "pump" or "feed".' };
  }
  const item = findStandardUnitOp(params.unit);
  if (!item) return { success: false, added: false, error: `No standard unit "${params.unit}". Units: ${STANDARD_EQUIPMENT_CATALOG.map((i) => i.id).join(', ')}.` };
  const node = createStandardUnitOp(item, {
    ...(params.name ? { name: params.name } : {}),
    ...(params.parameters ? { parameters: params.parameters } : {}),
    ...(params.material ? { material: params.material } : {}),
    ...(typeof params.supplyRate === 'number' ? { supplyRate: params.supplyRate } : {}),
    ...(params.composition && typeof params.composition === 'object' ? { composition: params.composition } : {}),
    ...(params.carries === 'items' || params.carries === 'liquid' ? { carries: params.carries } : {}),
    ...(params.phase === 'LIQUID' || params.phase === 'GAS' || params.phase === 'SOLID' ? { phase: params.phase } : {}),
    ...(typeof params.supplyKgPerHour === 'number' ? { supplyKgPerHour: params.supplyKgPerHour } : {}),
    ...(typeof params.supplyScfm === 'number' ? { supplyScfm: params.supplyScfm } : {})
  });
  // Settings the unit does not have (or, for a designed unit, values outside a
  // parameter's physical range) are reported, not silently dropped.
  const known = node.config as Record<string, unknown>;
  const ignored = Object.entries(params.parameters ?? {})
    .filter(([k, v]) => typeof known[k] !== 'number' || (item.contract !== undefined && known[k] !== v))
    .map(([k]) => k);
  const result = await host.addUnit(node, { ...(params.position ? { position: params.position } : {}), ...(params.connectFrom ? { connectFrom: params.connectFrom } : {}), ...(params.connectTo ? { connectTo: params.connectTo } : {}) }, 'standard');
  return {
    ...result,
    unit: item.id,
    ...(ignored.length
      ? {
          ignoredParameters: ignored,
          parametersNote: item.contract
            ? `Not applied: not a parameter of the ${item.title}, or outside its physical range. Its parameters: ${item.contract.parameters
                .map((p) => `${p.name} (${p.unit}${p.min !== undefined || p.max !== undefined ? `, ${p.min ?? '-inf'} to ${p.max ?? 'inf'}` : ''})`)
                .join(', ')}.`
            : `Not settings of a ${item.title}; its settings are: ${Object.keys(known).filter((k) => typeof known[k] === 'number').join(', ')}.`
        }
      : {})
  };
}

// ------------------------------------------------------------- community

export const COMMUNITY_CATEGORIES = ['PACKAGING', 'FLUID_PROCESSING', 'MATERIAL_HANDLING', 'QUALITY'] as const;
const UNREACHABLE = 'The ProcessForge community library could not be reached. Check the internet connection, or try again later.';

async function getJson(url: string): Promise<{ ok: true; status: number; body: any } | { ok: false }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    return { ok: true, status: res.status, body: await res.json().catch(() => null) };
  } catch {
    return { ok: false };
  }
}

/**
 * The community library: unit ops people have published from the app.
 * Searching and pulling are public and read-only. A listing shows what its
 * author wrote; nothing is rated or certified by ProcessForge.
 */
export async function searchCommunityUnitOps(args: { query?: string; category?: string }, apiBase: string): Promise<Record<string, unknown>> {
  const params = new URLSearchParams();
  if (typeof args.query === 'string' && args.query.trim()) params.set('q', args.query.trim());
  const category = typeof args.category === 'string' ? args.category.trim().toUpperCase() : '';
  if (category) {
    if (!(COMMUNITY_CATEGORIES as readonly string[]).includes(category)) return { success: false, error: `Category is one of ${COMMUNITY_CATEGORIES.join(', ')}.` };
    params.set('category', category);
  }
  const r = await getJson(`${apiBase.replace(/\/+$/, '')}/unitops?${params.toString()}`);
  if (!r.ok) return { success: false, error: UNREACHABLE };
  if (r.status !== 200 || !r.body?.success || !Array.isArray(r.body.unitops)) {
    return { success: false, error: r.body?.error ?? `The community library answered HTTP ${r.status}.` };
  }
  const units = (r.body.unitops as any[]).map((u) => ({
    id: u.id,
    name: u.name,
    author: u.author_name || 'Unknown author',
    category: u.category,
    description: u.description,
    version: u.version,
    tags: u.tags ? String(u.tags).split(',').filter(Boolean) : [],
    downloads: u.download_count
  }));
  return {
    success: true,
    count: units.length,
    units,
    note: 'Published by ProcessForge users. A listing shows what its author wrote; ProcessForge does not review or certify them.',
    nextStep: units.length
      ? 'Place one on the open flowsheet with add_community_unit_op (by its id).'
      : 'Nothing matches. Try a broader query, list_standard_unit_ops, or design one with design_unit_op.'
  };
}

/** One listing's unit, as its author published it, checked against the schema. */
export async function fetchCommunityUnitOp(id: string, apiBase: string): Promise<{ node: ProcessNode; name: string; author: string } | { error: string }> {
  const r = await getJson(`${apiBase.replace(/\/+$/, '')}/unitops/${encodeURIComponent(id)}`);
  if (!r.ok) return { error: UNREACHABLE };
  if (r.status === 404) return { error: `No community unit op "${id}". search_community_unit_ops lists them.` };
  const unitop = r.body?.unitop;
  if (r.status !== 200 || !unitop) return { error: r.body?.error ?? `The community library answered HTTP ${r.status}.` };
  const parsed = ProcessNodeSchema.safeParse(unitop.bundle);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: `"${unitop.name}" was published in a form ProcessForge cannot place (${issue?.path.join('.') || 'bundle'}: ${issue?.message ?? 'invalid'}).` };
  }
  return { node: parsed.data, name: unitop.name, author: unitop.author_name || 'Unknown author' };
}

export async function addCommunityUnitOp(params: { id: string; name?: string } & AddUnitOptions, host: ToolHost): Promise<HostResult> {
  if (typeof params?.id !== 'string' || !params.id.trim()) {
    return { success: false, added: false, error: 'Give "id": a listing id from search_community_unit_ops.' };
  }
  const got = await fetchCommunityUnitOp(params.id.trim(), host.communityApiBase);
  if ('error' in got) return { success: false, added: false, error: got.error };
  const node: ProcessNode = {
    ...got.node,
    // A fresh id: the same listing can be placed more than once.
    id: `community-${Date.now().toString(36)}`,
    name: params.name?.trim() || got.node.name || got.name
  };
  const result = await host.addUnit(
    node,
    { ...(params.position ? { position: params.position } : {}), ...(params.connectFrom ? { connectFrom: params.connectFrom } : {}), ...(params.connectTo ? { connectTo: params.connectTo } : {}) },
    'community'
  );
  return { ...result, listing: { id: params.id, name: got.name, author: got.author } };
}
