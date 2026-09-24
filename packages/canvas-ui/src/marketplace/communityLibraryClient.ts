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
}

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
      return {
        isLiveApi: true,
        items: data.unitops.map((u) => ({
          id: u.id,
          name: u.name,
          author: u.author_name || 'Unknown author',
          category: u.category,
          description: u.description,
          tags: u.tags ? String(u.tags).split(',').filter(Boolean) : []
        }))
      };
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

  static async publishUnitOp(
    node: ProcessNode,
    meta: {
      name: string;
      category: CommunityUnitOpItem['category'];
      description: string;
      tags?: string[];
    }
  ): Promise<{ success: boolean; pluginId?: string; message: string }> {
    const session = this.getSession();
    if (!session) {
      return {
        success: false,
        message: 'Sign in with Google to publish to the community library. Nothing was published.'
      };
    }
    try {
      const res = await withTimeout(`${API_BASE_URL}/unitops/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({
          name: meta.name || node.name,
          category: meta.category,
          description: meta.description,
          tags: meta.tags?.join(','),
          bundle: node
        })
      });
      const data = (await res.json().catch(() => ({}))) as { pluginId?: string; error?: string };
      if (res.ok && data.pluginId) {
        return { success: true, pluginId: data.pluginId, message: `Published "${meta.name || node.name}" to the community library.` };
      }
      return {
        success: false,
        message: `Not published: ${res.status === 401 ? 'your sign-in has expired; sign in again' : data.error || `HTTP ${res.status}`}.`
      };
    } catch {
      return { success: false, message: 'Not published: ProcessForge Cloud could not be reached.' };
    }
  }
}
