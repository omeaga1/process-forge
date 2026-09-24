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

/** Removes a project's copy on this device. A cloud copy is untouched. */
export function deleteLocalProject(id: string): void {
  try {
    localStorage.removeItem(PROJECT_KEY_PREFIX + id);
    writeIndex(readIndex().filter((p) => p.id !== id));
  } catch (e) {
    console.error('Failed to delete project from localStorage:', e);
  }
}

/**
 * Brings older saves into the library: the open project, and bundles that
 * earlier versions kept under the account's record list. Runs on every
 * listing; it only writes what is missing.
 */
function migrateLegacy(): void {
  try {
    const known = new Set(readIndex().map((p) => p.id));
    const adopt = (project: SimulationProject) => {
      if (known.has(project.id) || localStorage.getItem(PROJECT_KEY_PREFIX + project.id)) return;
      localStorage.setItem(PROJECT_KEY_PREFIX + project.id, exportSimulationProject(project));
      writeIndex([...readIndex(), headerOf(project)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      known.add(project.id);
    };
    const current = loadCurrentLocalProject();
    if (current) adopt(current);
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(LEGACY_RECORDS_PREFIX)) continue;
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
