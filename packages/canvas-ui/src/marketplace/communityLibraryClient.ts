import type { ProcessNode } from '@process-forge/protocol';

/**
 * The community unit-op library, backed by the cloud API.
 *
 * - A listing shows what its author wrote; nothing is rated or certified.
 * - Publishing uses the app's Google sign-in, which the cloud API verifies. A
 *   failed publish says so.
 * - The list endpoint leaves out each listing's equipment definition, so it is
 *   fetched when a listing is added to a flowsheet.
 */

export interface CommunityUnitOpItem {
  id: string;
  name: string;
  author: string;
  category: 'PACKAGING' | 'FLUID_PROCESSING' | 'MATERIAL_HANDLING' | 'QUALITY';
  description: string;
  tags?: string[];
  /** Absent in listings; see fetchUnitOpTemplate. */
  nodeTemplate?: ProcessNode;
  version?: string;
  /** A designed unit whose contract passed the engine's checks when it was published. Not a review. */
  engineChecked?: boolean;
  /** Your own listings: whether it is published or unpublished. */
  status?: 'published' | 'unpublished';
  updatedAt?: string;
  releaseNotes?: string;
}

export interface PublishMeta {
  name: string;
  category: CommunityUnitOpItem['category'];
  description: string;
  tags?: string[];
  releaseNotes?: string;
}

export interface PublishResult {
  success: boolean;
  pluginId?: string;
  version?: string;
  engineChecked?: boolean;
  message: string;
}

const toItem = (u: any): CommunityUnitOpItem => ({
  id: u.id,
  name: u.name,
  author: u.author_name || 'Unknown author',
  category: u.category,
  description: u.description,
  tags: u.tags ? String(u.tags).split(',').filter(Boolean) : [],
  ...(u.version ? { version: String(u.version) } : {}),
  engineChecked: u.engine_checked === 1 || u.engine_checked === true,
  ...(u.status ? { status: u.status } : {}),
  ...(u.updated_at ? { updatedAt: String(u.updated_at) } : {}),
  ...(u.release_notes ? { releaseNotes: String(u.release_notes) } : {})
});

export interface CreatorSession {
  userId: string;
  displayName: string;
  email: string;
  token: string;
}

const API_BASE_URL =
  typeof window !== 'undefined' && (window as any).__PF_COMMUNITY_API_URL__
    ? (window as any).__PF_COMMUNITY_API_URL__
    : 'https://process-forge-community-library.vprescenzi.workers.dev/api';

/** Written by the web app's account module; see apps/web/src/auth. */
const APP_SESSION_KEY = 'pf_user_session';

async function withTimeout(url: string, init: RequestInit = {}, ms = 4000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export class CommunityLibraryService {
  /** The app's verified Google session, if there is one. */
  static getSession(): CreatorSession | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(APP_SESSION_KEY);
      if (!raw) return null;
      const u = JSON.parse(raw) as {
        id: string;
        name: string;
        email: string;
        cloudToken?: string;
        cloudTokenExpiresAt?: string;
      };
      if (!u.cloudToken) return null;
      if (u.cloudTokenExpiresAt && Date.parse(u.cloudTokenExpiresAt) <= Date.now()) return null;
      return { userId: u.id, displayName: u.name, email: u.email, token: u.cloudToken };
    } catch {
      return null;
    }
  }

  static async fetchUnitOps(
    query = '',
    category: string = 'ALL'
  ): Promise<{ items: CommunityUnitOpItem[]; isLiveApi: boolean }> {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (category && category !== 'ALL') params.set('category', category);
    try {
      const res = await withTimeout(`${API_BASE_URL}/unitops?${params.toString()}`);
      if (!res.ok) return { items: [], isLiveApi: false };
      const data = (await res.json()) as { success: boolean; unitops: any[] };
      if (!data.success || !Array.isArray(data.unitops)) return { items: [], isLiveApi: false };
      return { isLiveApi: true, items: data.unitops.map(toItem) };
    } catch {
      return { items: [], isLiveApi: false };
    }
  }

  /** The equipment definition for one listing. */
  static async fetchUnitOpTemplate(id: string): Promise<ProcessNode | null> {
    try {
      const res = await withTimeout(`${API_BASE_URL}/unitops/${encodeURIComponent(id)}`);
      if (!res.ok) return null;
      const data = (await res.json()) as { success: boolean; unitop?: { bundle?: ProcessNode } };
      const bundle = data.unitop?.bundle;
      return bundle && typeof bundle === 'object' && 'kind' in bundle ? bundle : null;
    } catch {
      return null;
    }
  }

  /** Your own listings, published and unpublished. Empty when signed out. */
  static async fetchMine(): Promise<{ items: CommunityUnitOpItem[]; error?: string }> {
    const session = this.getSession();
    if (!session) return { items: [], error: 'Sign in with Google to see what you have published.' };
    try {
      const res = await withTimeout(`${API_BASE_URL}/unitops/mine`, { headers: { Authorization: `Bearer ${session.token}` } });
      const data = (await res.json().catch(() => ({}))) as { unitops?: any[]; error?: string };
      if (!res.ok) return { items: [], error: res.status === 401 ? 'Your sign-in has expired; sign in again.' : data.error || `HTTP ${res.status}` };
      return { items: (data.unitops ?? []).map(toItem) };
    } catch {
      return { items: [], error: 'ProcessForge Cloud could not be reached.' };
    }
  }

  static async fetchVersions(id: string): Promise<{ version: string; releaseNotes?: string; createdAt: string }[]> {
    try {
      const session = this.getSession();
      const res = await withTimeout(`${API_BASE_URL}/unitops/${encodeURIComponent(id)}/versions`, {
        ...(session ? { headers: { Authorization: `Bearer ${session.token}` } } : {})
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { versions?: { version: string; release_notes?: string | null; created_at: string }[] };
      return (data.versions ?? []).map((v) => ({ version: v.version, ...(v.release_notes ? { releaseNotes: v.release_notes } : {}), createdAt: v.created_at }));
    } catch {
      return [];
    }
  }

  /** Publishes a unit as a new listing. A designed unit is checked by the engine first, on the server. */
  static async publishUnitOp(node: ProcessNode, meta: PublishMeta): Promise<PublishResult> {
    return this.send('POST', '/unitops/publish', {
      name: meta.name || node.name,
      category: meta.category,
      description: meta.description,
      tags: meta.tags?.join(','),
      ...(meta.releaseNotes ? { releaseNotes: meta.releaseNotes } : {}),
      bundle: node
    });
  }

  /** Publishes a new version of one of your listings (or, without a node, updates its details). It is published again if it was not. */
  static async updateUnitOp(id: string, node: ProcessNode | null, meta: Partial<PublishMeta>): Promise<PublishResult> {
    return this.send('PUT', `/unitops/${encodeURIComponent(id)}`, {
      ...(meta.name ? { name: meta.name } : {}),
      ...(meta.category ? { category: meta.category } : {}),
      ...(meta.description !== undefined ? { description: meta.description } : {}),
      ...(meta.tags ? { tags: meta.tags.join(',') } : {}),
      ...(meta.releaseNotes ? { releaseNotes: meta.releaseNotes } : {}),
      ...(node ? { bundle: node } : {})
    });
  }

  /** Takes one of your listings out of the library. Flowsheets that use it keep their copy. */
  static async unpublishUnitOp(id: string): Promise<PublishResult> {
    return this.send('DELETE', `/unitops/${encodeURIComponent(id)}`);
  }

  private static async send(method: 'POST' | 'PUT' | 'DELETE', route: string, body?: unknown): Promise<PublishResult> {
    const session = this.getSession();
    if (!session) {
      return { success: false, message: 'Sign in with Google to publish to the community library. Nothing was changed.' };
    }
    try {
      const res = await withTimeout(`${API_BASE_URL}${route}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      }, 10000);
      const data = (await res.json().catch(() => ({}))) as { pluginId?: string; version?: string; engineChecked?: boolean; message?: string; error?: string };
      if (res.ok) {
        return {
          success: true,
          ...(data.pluginId ? { pluginId: data.pluginId } : {}),
          ...(data.version ? { version: data.version } : {}),
          ...(data.engineChecked !== undefined ? { engineChecked: data.engineChecked } : {}),
          message: data.message || 'Done.'
        };
      }
      return {
        success: false,
        message: `Not done: ${res.status === 401 ? 'your sign-in has expired; sign in again' : data.error || `HTTP ${res.status}`}.`
      };
    } catch {
      return { success: false, message: 'Not done: ProcessForge Cloud could not be reached.' };
    }
  }
}
