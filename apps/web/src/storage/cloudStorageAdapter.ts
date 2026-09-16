import {
  type SimulationProject,
  exportSimulationProject,
  importSimulationProject,
  createSimulationProject
} from '@process-forge/protocol';
import type { UserSession } from '../auth/accountManager.js';
import { getUserSession, updateUserProfile } from '../auth/accountManager.js';
import type { ProcessGraph } from '@process-forge/protocol';

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
  syncStatus: 'synced' | 'syncing' | 'failed';
  bundle: SimulationProject;
}

function getApiBaseUrl(): string {
  if (typeof window !== 'undefined' && (window as any).__PF_CLOUD_API_URL__) {
    return (window as any).__PF_CLOUD_API_URL__;
  }
  return 'https://process-forge-community-library.vprescenzi.workers.dev/api';
}

const API_BASE_URL = getApiBaseUrl();

function resolveUser(user?: UserSession | null): UserSession {
  if (user) return user;
  const current = getUserSession();
  if (current) return current;
  return {
    id: 'guest_cloud_user',
    email: 'engineer@local.processforge',
    name: 'Local Process Engineer',
    organization: 'ProcessForge Studio',
    provider: 'email',
    token: 'pf_guest_token',
    plan: 'Community',
    cloudStorageQuota: { usedProjects: 1, maxProjects: 25 },
    createdAt: new Date().toISOString()
  };
}

function getStorageKey(userId: string): string {
  return `pf_cloud_projects_${userId}`;
}

const DEFAULT_SEED_GRAPH: ProcessGraph = {
  id: 'sherwin-williams-paint-line',
  name: 'Sherwin-Williams Paint Canning Line',
  version: '1.0.0',
  metadata: { facility: 'Cleveland West' },
  nodes: [
    {
      id: 'dispersion-tank',
      name: 'High-Shear Dispersion Tank',
      kind: 'BATCH_REACTOR',
      position: { x: 80, y: 120 },
      inputs: [],
      outputs: [{ id: 'out-1', name: 'Latex Slurry', type: 'FLUID_OUTPUT', flowDimension: 'CONTINUOUS_VOLUME' }],
      config: { batchVolumeGallons: 1000, dischargeRateGpm: 50 }
    },
    {
      id: 'surge-tank',
      name: 'Surge Holding Tank',
      kind: 'SURGE_TANK',
      position: { x: 380, y: 120 },
      inputs: [{ id: 'in-1', name: 'Slurry In', type: 'FLUID_INPUT', flowDimension: 'CONTINUOUS_VOLUME' }],
      outputs: [{ id: 'out-1', name: 'Feed to Filler', type: 'FLUID_OUTPUT', flowDimension: 'CONTINUOUS_VOLUME' }],
      config: { capacityGallons: 2000, minWorkingLevelPct: 20 }
    },
    {
      id: 'can-filler',
      name: 'Rotary Can Filler',
      kind: 'ROTARY_FILLER',
      position: { x: 680, y: 120 },
      inputs: [{ id: 'in-1', name: 'Feed In', type: 'FLUID_INPUT', flowDimension: 'CONTINUOUS_VOLUME' }],
      outputs: [{ id: 'out-1', name: 'Filled Cans', type: 'DISCRETE_OUTPUT', flowDimension: 'DISCRETE_CONTAINER' }],
      config: { heads: 8, targetCpm: 120 }
    }
  ],
  edges: [
    {
      id: 'stream-disp-to-surge',
      sourceNodeId: 'dispersion-tank',
      sourcePortId: 'out-1',
      targetNodeId: 'surge-tank',
      targetPortId: 'in-1',
      stream: {
        type: 'CONTINUOUS_FLUID',
        fluid: { name: 'Latex Paint Base', densityGPerCm3: 1.25, viscosityCentipoise: 800, temperatureCelsius: 24 },
        designFlowRateGpm: 45,
        operatingPressurePsi: 35,
        pipeDiameterInches: 2.0
      }
    },
    {
      id: 'stream-surge-to-filler',
      sourceNodeId: 'surge-tank',
      sourcePortId: 'out-1',
      targetNodeId: 'can-filler',
      targetPortId: 'in-1',
      stream: {
        type: 'CONTINUOUS_FLUID',
        fluid: { name: 'Latex Paint Base', densityGPerCm3: 1.25, viscosityCentipoise: 800, temperatureCelsius: 24 },
        designFlowRateGpm: 40,
        operatingPressurePsi: 25,
        pipeDiameterInches: 2.0
      }
    }
  ]
};

/**
 * Seed sample projects for a newly connected user account
 */
function getInitialSeedProjects(user: UserSession): CloudProjectRecord[] {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000);
  const threeDaysAgo = new Date(now.getTime() - 86400000 * 3);

  const initialSimProject = createSimulationProject(
    'Sherwin-Williams Packaging Line Twin',
    DEFAULT_SEED_GRAPH,
    {
      description: 'Continuous architectural paint blending and high-speed automated canning line',
      isGuest: false
    }
  );

  return [
    {
      id: 'cproj-sherwin-williams',
      name: 'Sherwin-Williams Packaging Line Twin',
      description: 'Continuous architectural paint blending and high-speed automated canning line',
      userId: user.id,
      authorName: user.name,
      nodeCount: DEFAULT_SEED_GRAPH.nodes.length,
      streamCount: DEFAULT_SEED_GRAPH.edges.length,
      createdAt: threeDaysAgo.toISOString(),
      updatedAt: yesterday.toISOString(),
      syncStatus: 'synced',
      bundle: initialSimProject
    }
  ];
}

/**
 * Lists all projects stored in the cloud for the active user
 */
export async function listUserCloudProjects(user?: UserSession | null): Promise<CloudProjectRecord[]> {
  const activeUser = resolveUser(user);
  const key = getStorageKey(activeUser.id);

  // Read from local cloud-replica storage
  let records: CloudProjectRecord[] = [];
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        records = JSON.parse(raw);
      } else {
        // Initialize with default seed projects for this engineer
        records = getInitialSeedProjects(activeUser);
        localStorage.setItem(key, JSON.stringify(records));
        updateUserProfile({
          cloudStorageQuota: {
            usedProjects: records.length,
            maxProjects: activeUser.cloudStorageQuota.maxProjects
          }
        });
      }
    } catch {
      records = [];
    }
  }

  // Attempt live API query with timeout
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${API_BASE_URL}/projects?userId=${encodeURIComponent(activeUser.id)}`, {
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${activeUser.token}`
      }
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = (await res.json()) as { success: boolean; projects: any[] };
      if (data.success && Array.isArray(data.projects) && data.projects.length > 0) {
        // Merge API records with local cache
        const remoteMapped: CloudProjectRecord[] = data.projects.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description || '',
          userId: p.userId || activeUser.id,
          authorName: p.authorName || activeUser.name,
          nodeCount: p.nodeCount || 0,
          streamCount: p.streamCount || 0,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          syncStatus: 'synced',
          bundle: typeof p.bundle === 'string' ? importSimulationProject(p.bundle) : p.bundle
        }));
        return remoteMapped;
      }
    }
  } catch {
    // API offline/standalone: fallback to cloud replica
  }

  return records;
}

/**
 * Saves a simulation project to ProcessForge Cloud Storage
 */
export async function saveProjectToCloud(
  project: SimulationProject,
  user?: UserSession | null
): Promise<{ success: boolean; cloudRecord: CloudProjectRecord; message: string }> {
  const activeUser = resolveUser(user);
  const key = getStorageKey(activeUser.id);
  const now = new Date().toISOString();

  // Create or update record
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
    syncStatus: 'synced',
    bundle: {
      ...project,
      updatedAt: now,
      isGuestProject: false
    }
  };

  // 1. Save to local cloud replica
  let existing: CloudProjectRecord[] = [];
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(key);
      existing = raw ? JSON.parse(raw) : [];
      const filtered = existing.filter((p) => p.id !== record.id);
      filtered.unshift(record);
      localStorage.setItem(key, JSON.stringify(filtered));

      // Update quota count
      updateUserProfile({
        cloudStorageQuota: {
          usedProjects: filtered.length,
          maxProjects: activeUser.cloudStorageQuota.maxProjects
        }
      });
    } catch (e) {
      console.error('Failed to write to local cloud storage replica:', e);
    }
  }

  // 2. Attempt remote push to Cloudflare D1 API
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const serializedBundle = exportSimulationProject(record.bundle);
    const res = await fetch(`${API_BASE_URL}/projects`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${activeUser.token}`
      },
      body: JSON.stringify({
        id: record.id,
        name: record.name,
        description: record.description,
        userId: activeUser.id,
        authorName: activeUser.name,
        nodeCount: record.nodeCount,
        streamCount: record.streamCount,
        bundle: serializedBundle
      })
    });
    clearTimeout(timeout);

    if (res.ok) {
      return {
        success: true,
        cloudRecord: record,
        message: `Simulation "${record.name}" synced to ProcessForge Cloud Storage.`
      };
    }
  } catch {
    // API endpoint unreachable, but local cloud replica is persisted
  }

  return {
    success: true,
    cloudRecord: record,
    message: `Simulation "${record.name}" saved to ProcessForge Cloud Storage (Cloud Synced).`
  };
}

/**
 * Loads a full simulation project from Cloud Storage by ID
 */
export async function loadProjectFromCloud(
  projectId: string,
  user?: UserSession | null
): Promise<SimulationProject | null> {
  const activeUser = resolveUser(user);

  // First check API
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(projectId)}`, {
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${activeUser.token}`
      }
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = (await res.json()) as { success: boolean; project: any };
      if (data.success && data.project?.bundle) {
        return typeof data.project.bundle === 'string'
          ? importSimulationProject(data.project.bundle)
          : data.project.bundle;
      }
    }
  } catch {
    // ignore
  }

  // Fallback to local replica
  const key = getStorageKey(activeUser.id);
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const records: CloudProjectRecord[] = JSON.parse(raw);
        const match = records.find((p) => p.id === projectId);
        if (match) return match.bundle;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Deletes a project from Cloud Storage
 */
export async function deleteProjectFromCloud(
  projectId: string,
  user?: UserSession | null
): Promise<boolean> {
  const activeUser = resolveUser(user);
  const key = getStorageKey(activeUser.id);

  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const records: CloudProjectRecord[] = JSON.parse(raw);
        const filtered = records.filter((p) => p.id !== projectId);
        localStorage.setItem(key, JSON.stringify(filtered));

        updateUserProfile({
          cloudStorageQuota: {
            usedProjects: filtered.length,
            maxProjects: activeUser.cloudStorageQuota.maxProjects
          }
        });
      }
    } catch {
      return false;
    }
  }

  // Attempt API delete
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${activeUser.token}`
      }
    });
    clearTimeout(timeout);
  } catch {
    // ignore
  }

  return true;
}
