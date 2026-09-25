import {
  exportSimulationProject,
  importSimulationProject,
  type SimulationProject
} from '@process-forge/protocol';

/** The open project, kept whole so the app can reopen it on launch. */
const STORAGE_KEY_CURRENT = 'pf_current_project';
/** Headers for every project on this device, most recently edited first. */
const STORAGE_KEY_LIST = 'pf_saved_projects';
/** Each project's bundle, one key per project. */
const PROJECT_KEY_PREFIX = 'pf_project_';
/** Older saves kept whole bundles here, per account. */
const LEGACY_RECORDS_PREFIX = 'pf_cloud_projects_';
/** Set once older saves have been brought into the library. */
const MIGRATED_KEY = 'pf_library_migrated_v1';

export interface ProjectMetadataHeader {
  id: string;
  name: string;
  description: string;
  createdAt?: string;
  updatedAt: string;
  isGuestProject: boolean;
  nodeCount: number;
  streamCount?: number;
}

function headerOf(project: SimulationProject): ProjectMetadataHeader {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    isGuestProject: project.isGuestProject,
    nodeCount: project.graph.nodes.length,
    streamCount: project.graph.edges.length
  };
}

function readIndex(): ProjectMetadataHeader[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LIST);
    return raw ? (JSON.parse(raw) as ProjectMetadataHeader[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(list: ProjectMetadataHeader[]): void {
  localStorage.setItem(STORAGE_KEY_LIST, JSON.stringify(list));
}

/**
 * Saves a project on this device and makes it the open one. Every project
 * keeps its own copy, so opening another project or starting a new one never
 * loses this one.
 */
export function saveLocalProject(project: SimulationProject, options: { makeCurrent?: boolean } = {}): void {
  try {
    const serialized = exportSimulationProject(project);
    // Renaming or duplicating a project in the browser saves it without opening it.
    if (options.makeCurrent !== false) localStorage.setItem(STORAGE_KEY_CURRENT, serialized);
    localStorage.setItem(PROJECT_KEY_PREFIX + project.id, serialized);
    writeIndex([headerOf(project), ...readIndex().filter((p) => p.id !== project.id)]);
  } catch (e) {
    console.error('Failed to save project to localStorage:', e);
  }
}

/** Loads the open project, or null if none is saved. */
export function loadCurrentLocalProject(): SimulationProject | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CURRENT);
    if (!raw) return null;
    return importSimulationProject(raw);
  } catch (e) {
    console.warn('Failed to parse cached project from localStorage:', e);
    return null;
  }
}

/** One project from this device, or null if its copy is missing or unreadable. */
export function loadLocalProject(id: string): SimulationProject | null {
  try {
    const raw = localStorage.getItem(PROJECT_KEY_PREFIX + id);
    if (raw) return importSimulationProject(raw);
    // The open project from before projects had their own copies.
    const current = loadCurrentLocalProject();
    return current?.id === id ? current : null;
  } catch {
    return null;
  }
}

/**
 * Removes a project from this device: its copy, its header, and any copy an
 * older version kept for it. A cloud copy is untouched.
 *
 * The older copies matter: they are what the library was first filled from,
 * and while they stayed, a deleted project came back on the next listing.
 */
export function deleteLocalProject(id: string): void {
  try {
    localStorage.removeItem(PROJECT_KEY_PREFIX + id);
    writeIndex(readIndex().filter((p) => p.id !== id));
    for (const key of legacyKeys()) {
      const records = JSON.parse(localStorage.getItem(key) || '[]') as { id?: string; bundle?: { id?: string } }[];
      const kept = records.filter((r) => r.id !== id && r.bundle?.id !== id);
      if (kept.length !== records.length) localStorage.setItem(key, JSON.stringify(kept));
    }
  } catch (e) {
    console.error('Failed to delete project from localStorage:', e);
  }
}

function legacyKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(LEGACY_RECORDS_PREFIX)) keys.push(key);
  }
  return keys;
}

/**
 * Brings older saves into the library, once: the open project, and bundles
 * that earlier versions kept under the account's record list. Once only, so
 * a project deleted from the library stays deleted.
 */
function migrateLegacy(): void {
  try {
    if (localStorage.getItem(MIGRATED_KEY)) return;
    const known = new Set(readIndex().map((p) => p.id));
    const adopt = (project: SimulationProject) => {
      // Older versions kept headers without the project itself: a header
      // alone does not mean the project is already in the library.
      if (localStorage.getItem(PROJECT_KEY_PREFIX + project.id)) return;
      localStorage.setItem(PROJECT_KEY_PREFIX + project.id, exportSimulationProject(project));
      if (!known.has(project.id)) {
        writeIndex([...readIndex(), headerOf(project)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
        known.add(project.id);
      }
    };
    const current = loadCurrentLocalProject();
    if (current) adopt(current);
    for (const key of legacyKeys()) {
      const records = JSON.parse(localStorage.getItem(key) || '[]') as { bundle?: unknown }[];
      for (const r of records) {
        if (!r.bundle) continue;
        try {
          adopt(importSimulationProject(typeof r.bundle === 'string' ? r.bundle : JSON.stringify(r.bundle)));
        } catch {
          // An unreadable old record: leave it where it is.
        }
      }
    }
    localStorage.setItem(MIGRATED_KEY, new Date().toISOString());
  } catch {
    // Storage blocked or full: the listing below still shows what it can.
  }
}

/**
 * Every project on this device that can be opened, most recently edited
 * first. Headers whose copy is gone (saved by versions that kept only the
 * open project) are dropped rather than listed as projects that cannot open.
 */
export function listLocalProjects(): ProjectMetadataHeader[] {
  migrateLegacy();
  const currentId = loadCurrentLocalProject()?.id;
  const list = readIndex().filter((p) => p.id === currentId || localStorage.getItem(PROJECT_KEY_PREFIX + p.id) !== null);
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Triggers a browser download of the entire simulation as a `.pfg.json` bundle.
 */
export function downloadProjectFile(project: SimulationProject): void {
  const serialized = exportSimulationProject(project);
  const blob = new Blob([serialized], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = project.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  a.href = url;
  a.download = `${safeName || 'process-twin'}.pfg.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Reads and validates an uploaded `.pfg.json` file from the user's filesystem.
 */
export function readProjectFromFile(file: File): Promise<SimulationProject> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const project = importSimulationProject(text);
        resolve(project);
      } catch (err) {
        reject(new Error(`Invalid ProcessForge project file: ${err instanceof Error ? err.message : String(err)}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read selected project file'));
    reader.readAsText(file);
  });
}
