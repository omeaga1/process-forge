import { ProcessNodeSchema, type ProcessNode } from '@process-forge/protocol';
import { executeAddNode, type AddNodeOptions } from './desktopBridge.js';

/**
 * The ProcessForge community library: unit ops people have published from
 * the app (packages/community-library-api). Searching and pulling are public
 * and read-only; publishing needs the app's Google sign-in and is not offered
 * here.
 *
 * A listing shows what its author wrote. Nothing is rated or certified by
 * ProcessForge, so say so when recommending one.
 */

const DEFAULT_API = 'https://process-forge-community-library.vprescenzi.workers.dev/api';

export function communityApiBase(env: NodeJS.ProcessEnv = process.env): string {
  return (env.PROCESS_FORGE_COMMUNITY_API_URL || DEFAULT_API).replace(/\/+$/, '');
}

const CATEGORIES = ['PACKAGING', 'FLUID_PROCESSING', 'MATERIAL_HANDLING', 'QUALITY'];
const UNREACHABLE = 'The ProcessForge community library could not be reached. Check the internet connection, or try again later.';

async function getJson(url: string): Promise<{ ok: true; status: number; body: any } | { ok: false }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    return { ok: true, status: res.status, body: await res.json().catch(() => null) };
  } catch {
    return { ok: false };
  }
}

export async function executeSearchCommunityUnitOps(args: { query?: string; category?: string } = {}): Promise<Record<string, unknown>> {
  const params = new URLSearchParams();
  if (typeof args.query === 'string' && args.query.trim()) params.set('q', args.query.trim());
  const category = typeof args.category === 'string' ? args.category.trim().toUpperCase() : '';
  if (category) {
    if (!CATEGORIES.includes(category)) return { success: false, error: `Category is one of ${CATEGORIES.join(', ')}.` };
    params.set('category', category);
  }
  const r = await getJson(`${communityApiBase()}/unitops?${params.toString()}`);
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
export async function fetchCommunityUnitOp(id: string): Promise<{ node: ProcessNode; name: string; author: string } | { error: string }> {
  const r = await getJson(`${communityApiBase()}/unitops/${encodeURIComponent(id)}`);
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

export async function executeAddCommunityUnitOp(
  params: { id: string; name?: string } & AddNodeOptions
): Promise<Record<string, unknown>> {
  if (typeof params?.id !== 'string' || !params.id.trim()) {
    return { success: false, added: false, error: 'Give "id": a listing id from search_community_unit_ops.' };
  }
  const got = await fetchCommunityUnitOp(params.id.trim());
  if ('error' in got) return { success: false, added: false, error: got.error };
  const node: ProcessNode = {
    ...got.node,
    // A fresh id: the same listing can be placed more than once.
    id: `community-${Date.now().toString(36)}`,
    name: params.name?.trim() || got.node.name || got.name
  };
  const result = await executeAddNode(
    node,
    {
      ...(params.position ? { position: params.position } : {}),
      ...(params.connectFrom ? { connectFrom: params.connectFrom } : {}),
      ...(params.connectTo ? { connectTo: params.connectTo } : {})
    },
    'community'
  );
  return { ...result, listing: { id: params.id, name: got.name, author: got.author } };
}
