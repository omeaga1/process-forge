import {
  type SimulationProject,
  exportSimulationProject,
  importSimulationProject
} from '@process-forge/protocol';
import type { UserSession } from '../auth/accountManager.js';
import { getUserSession, hasCloudSession } from '../auth/accountManager.js';
import { cloudApiBase } from './cloudApi.js';

/**
 * Saved projects: a copy on this device, and -- for a Google account the cloud
 * API has verified -- a copy in ProcessForge Cloud.
 *
 * Only a verified cloud session (`cloudToken`) reaches the network; guests'
 * and local profiles' projects never leave the device. A save reports which
 * of the two copies was written.
 */

export interface CloudProjectRecord {
  id: string;
  name: string;
  description: string;
  userId: string;
  authorName: string;
  nodeCount: number;
  streamCount: number;
  createdAt: string;
  updatedAt: string;
  /** 'synced': in the cloud. 'local': on this device only. */
  syncStatus: 'synced' | 'local' | 'failed';
  /** Absent on a cloud listing for a project saved elsewhere: see resolveProjectBundle. */
  bundle?: SimulationProject;
}

export interface SaveResult {
  success: boolean;
  /** True only when the cloud accepted the upload. */
  synced: boolean;
  cloudRecord: CloudProjectRecord;
  message: string;
}

const LOCAL_USER: UserSession = {
  id: 'local',
  email: '',
  name: 'Local engineer',
  organization: '',
  provider: 'email',
  token: '',
  createdAt: new Date(0).toISOString()
};

function resolveUser(user?: UserSession | null): UserSession {
  return user ?? getUserSession() ?? LOCAL_USER;
}

function getStorageKey(userId: string): string {
  return `pf_cloud_projects_${userId}`;
}

function readLocal(userId: string): CloudProjectRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    return raw ? (JSON.parse(raw) as CloudProjectRecord[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(user: UserSession, records: CloudProjectRecord[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(user.id), JSON.stringify(records));
  } catch (e) {
    console.error('Failed to write projects to local storage:', e);
  }
}

/** A cloud call with a timeout, only ever made with a verified session. */
async function cloudFetch(user: UserSession & { cloudToken: string }, path: string, init: RequestInit = {}, ms = 4000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(`${cloudApiBase()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.cloudToken}`,
        ...(init.headers || {})
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** Lists the active user's projects: the cloud's when signed in and reachable. */
export async function listUserCloudProjects(user?: UserSession | null): Promise<CloudProjectRecord[]> {
  const activeUser = resolveUser(user);
  const local = readLocal(activeUser.id);
  if (!hasCloudSession(activeUser)) return local;

  try {
    const res = await cloudFetch(activeUser, '/projects');
    if (!res.ok) return local;
    const data = (await res.json()) as { success: boolean; projects: any[] };
    if (!data.success || !Array.isArray(data.projects)) return local;

    const remote = new Map<string, CloudProjectRecord>();
    for (const p of data.projects) {
      const cached = local.find((l) => l.id === p.id);
      remote.set(p.id, {
        id: p.id,
        name: p.name,
        description: p.description || '',
        userId: p.userId,
        authorName: p.authorName || activeUser.name,
        nodeCount: p.nodeCount || 0,
        streamCount: p.streamCount || 0,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        syncStatus: 'synced',
        // The list endpoint omits bundles; loadProjectFromCloud fetches one.
        bundle: cached?.bundle
      });
    }
    // Anything saved here that never reached the cloud is still listed.
    const unsynced = local.filter((l) => !remote.has(l.id)).map((l) => ({ ...l, syncStatus: 'local' as const }));
    return [...remote.values(), ...unsynced];
  } catch {
    return local;
  }
}

/** Saves a project on this device, and to the cloud for a verified account. */
export async function saveProjectToCloud(project: SimulationProject, user?: UserSession | null): Promise<SaveResult> {
  const activeUser = resolveUser(user);
  const now = new Date().toISOString();
  const bundle: SimulationProject = { ...project, updatedAt: now, isGuestProject: false };
  const record: CloudProjectRecord = {
    id: project.id,
    name: project.name,
    description: project.description || '',
    userId: activeUser.id,
    authorName: activeUser.name,
    nodeCount: project.graph.nodes.length,
    streamCount: project.graph.edges.length,
    createdAt: project.createdAt || now,
    updatedAt: now,
    syncStatus: 'local',
    bundle
  };

  const store = (r: CloudProjectRecord) =>
    writeLocal(activeUser, [r, ...readLocal(activeUser.id).filter((p) => p.id !== r.id)]);

  if (!hasCloudSession(activeUser)) {
    store(record);
    return {
      success: true,
      synced: false,
      cloudRecord: record,
      message: `Saved "${record.name}" on this device. Sign in with Google to keep a copy in ProcessForge Cloud.`
    };
  }

  let problem = 'ProcessForge Cloud could not be reached';
  try {
    const res = await cloudFetch(activeUser, '/projects', {
      method: 'POST',
      body: JSON.stringify({
        id: record.id,
        name: record.name,
        description: record.description,
        nodeCount: record.nodeCount,
        streamCount: record.streamCount,
        bundle: exportSimulationProject(bundle)
      })
    });
    if (res.ok) {
      const synced = { ...record, syncStatus: 'synced' as const };
      store(synced);
      return { success: true, synced: true, cloudRecord: synced, message: `Saved "${record.name}" to ProcessForge Cloud.` };
    }
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    problem = res.status === 401 ? 'your cloud session has expired; sign in again' : err.error || `HTTP ${res.status}`;
  } catch {
    // unreachable: problem already says so
  }

  const failed = { ...record, syncStatus: 'failed' as const };
  store(failed);
  return {
    success: true,
    synced: false,
    cloudRecord: failed,
    message: `Saved "${record.name}" on this device, but not to the cloud: ${problem}.`
  };
}

/** Loads a project: the cloud copy for a verified account, else this device's. */
export async function loadProjectFromCloud(projectId: string, user?: UserSession | null): Promise<SimulationProject | null> {
  const activeUser = resolveUser(user);

  if (hasCloudSession(activeUser)) {
    try {
      const res = await cloudFetch(activeUser, `/projects/${encodeURIComponent(projectId)}`);
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; project: any };
        if (data.success && data.project?.bundle) {
          return typeof data.project.bundle === 'string'
            ? importSimulationProject(data.project.bundle)
            : data.project.bundle;
        }
      }
    } catch {
      // fall through to the local copy
    }
  }

  return readLocal(activeUser.id).find((p) => p.id === projectId)?.bundle ?? null;
}

/** Deletes a project here and, for a verified account, from the cloud. */
export async function deleteProjectFromCloud(projectId: string, user?: UserSession | null): Promise<boolean> {
  const activeUser = resolveUser(user);
  writeLocal(activeUser, readLocal(activeUser.id).filter((p) => p.id !== projectId));

  if (!hasCloudSession(activeUser)) return true;
  try {
    const res = await cloudFetch(activeUser, `/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
    // 404 means it was never in the cloud, which is the outcome we wanted.
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

/**
 * The full project for a listed record. Cloud listings carry metadata only, so
 * a project saved from another device is fetched when it is opened.
 */
export async function resolveProjectBundle(
  record: CloudProjectRecord,
  user?: UserSession | null
): Promise<SimulationProject | null> {
  return record.bundle ?? (await loadProjectFromCloud(record.id, user));
}
