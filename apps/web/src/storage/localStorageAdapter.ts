import {
  exportSimulationProject,
  importSimulationProject,
  type SimulationProject
} from '@process-forge/protocol';

const STORAGE_KEY_CURRENT = 'pf_current_project';
const STORAGE_KEY_LIST = 'pf_saved_projects';

export interface ProjectMetadataHeader {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  isGuestProject: boolean;
  nodeCount: number;
}

/**
 * Saves project to browser localStorage and updates the recent projects index.
 */
export function saveLocalProject(project: SimulationProject): void {
  try {
    const serialized = exportSimulationProject(project);
    localStorage.setItem(STORAGE_KEY_CURRENT, serialized);

    // Update project index list
    const existingList = listLocalProjects();
    const filtered = existingList.filter((p) => p.id !== project.id);
    const updated: ProjectMetadataHeader[] = [
      {
        id: project.id,
        name: project.name,
        description: project.description,
        updatedAt: project.updatedAt,
        isGuestProject: project.isGuestProject,
        nodeCount: project.graph.nodes.length
      },
      ...filtered
    ];
    localStorage.setItem(STORAGE_KEY_LIST, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save project to localStorage:', e);
  }
}

/**
 * Loads the current active project from localStorage, or null if none is saved.
 */
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

/**
 * Lists metadata headers for all locally stored simulations.
 */
export function listLocalProjects(): ProjectMetadataHeader[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LIST);
    if (!raw) return [];
    return JSON.parse(raw) as ProjectMetadataHeader[];
  } catch {
    return [];
  }
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
