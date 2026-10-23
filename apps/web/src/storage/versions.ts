import type { ProcessGraph } from '@process-forge/protocol';
import type { Checkpoint, CheckpointReason } from '@process-forge/canvas-ui';

/**
 * Earlier versions of each project, on this device. The project itself is
 * saved on every edit (localStorageAdapter.ts); these are the points the
 * engineer can go back to: before a plan from an assistant landed, before a
 * file was opened over the project, before a version was restored, each
 * explicit save, and every few minutes of editing.
 *
 * Nothing here ever replaces a version: a new one is added in front and the
 * oldest fall off past the limit, or sooner when storage is full.
 */

const PREFIX = 'pf_versions_';
/** Versions kept per project. */
export const MAX_VERSIONS = 30;
/** An edit that has gone this long without a version gets one. */
export const AUTO_VERSION_EVERY_MS = 10 * 60 * 1000;

export interface ProjectVersion {
  id: string;
  at: string;
  reason: CheckpointReason;
  label: string;
  nodeCount: number;
  streamCount: number;
  graph: ProcessGraph;
}

const key = (projectId: string) => PREFIX + projectId;

export function listVersions(projectId: string): ProjectVersion[] {
  try {
    const raw = localStorage.getItem(key(projectId));
    const list = raw ? (JSON.parse(raw) as ProjectVersion[]) : [];
    return Array.isArray(list) ? list.filter((v) => v && typeof v.id === 'string' && v.graph) : [];
  } catch {
    return [];
  }
}

export function loadVersion(projectId: string, versionId: string): ProjectVersion | undefined {
  return listVersions(projectId).find((v) => v.id === versionId);
}

const sameGraph = (a: ProcessGraph, b: ProcessGraph) => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * Keeps `graph` as a version of the project. If the newest version already
 * holds exactly this flowsheet, that one is the checkpoint and nothing is
 * added. When storage is full the oldest versions make room; if even one
 * will not fit, nothing is kept and undefined comes back.
 */
export function recordVersion(projectId: string, reason: CheckpointReason, label: string, graph: ProcessGraph, now = new Date()): Checkpoint | undefined {
  const list = listVersions(projectId);
  const newest = list[0];
  if (newest && sameGraph(newest.graph, graph)) return { id: newest.id, label: newest.label };
  const version: ProjectVersion = {
    id: `v-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    at: now.toISOString(),
    reason,
    label,
    nodeCount: graph.nodes.length,
    streamCount: graph.edges.length,
    graph
  };
  let kept = [version, ...list].slice(0, MAX_VERSIONS);
  while (kept.length) {
    try {
      localStorage.setItem(key(projectId), JSON.stringify(kept));
      return { id: version.id, label };
    } catch {
      // Full: let the oldest version go and try again.
      if (kept.length === 1) break;
      kept = kept.slice(0, -1);
    }
  }
  return undefined;
}

/** Whether an edit should be kept as a version: the newest is older than the interval, or there is none. */
export function dueForAutoVersion(projectId: string, now = Date.now()): boolean {
  const newest = listVersions(projectId)[0];
  return !newest || now - Date.parse(newest.at) >= AUTO_VERSION_EVERY_MS;
}

export function deleteVersions(projectId: string): void {
  try {
    localStorage.removeItem(key(projectId));
  } catch {
    // Storage blocked: nothing to remove.
  }
}

/** What a version is, in a word the history list can show. */
export function reasonLabel(reason: CheckpointReason): string {
  switch (reason) {
    case 'before-plan':
      return 'Before a plan';
    case 'before-restore':
      return 'Before going back';
    case 'before-open':
      return 'Before a file replaced it';
    case 'save':
      return 'Saved';
    default:
      return 'Autosave';
  }
}
