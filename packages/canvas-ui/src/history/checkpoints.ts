import type { ProcessGraph } from '@process-forge/protocol';

/**
 * Never overwrite: before the flowsheet is changed in bulk (a plan applied,
 * a version restored, a file opened over a project), the studio keeps the
 * flowsheet as it was, so the engineer can always go back to it.
 *
 * The app owns where versions are kept (apps/web/src/storage/versions.ts) and
 * registers itself here; the places that change the flowsheet (the in-app
 * assistant, the MCP bridge) ask for a checkpoint without knowing where it
 * goes. With no app registered (tests, the website's demos), nothing is kept.
 */

export type CheckpointReason = 'auto' | 'save' | 'before-plan' | 'before-restore' | 'before-open';

/** A version the app kept, by which the engineer can go back to it. */
export interface Checkpoint {
  id: string;
  label: string;
}

type Handler = (reason: CheckpointReason, label: string, graph: ProcessGraph) => Checkpoint | undefined;

let handler: Handler | undefined;

/** The app keeps versions through this; returns a function that unregisters it. */
export function setCheckpointHandler(next: Handler): () => void {
  handler = next;
  return () => {
    if (handler === next) handler = undefined;
  };
}

/** Keeps `graph` as a version, and says how to find it; undefined if nothing could be kept. */
export function checkpoint(reason: CheckpointReason, label: string, graph: ProcessGraph): Checkpoint | undefined {
  try {
    return handler?.(reason, label, graph);
  } catch {
    // Storage full or blocked: the change still goes ahead, without a version.
    return undefined;
  }
}

/** Fired on window when a plan lands on the flowsheet: { receipt, source }. */
export const PLAN_RECEIPT_EVENT = 'pf-plan-receipt';
/** Fired on window to go back to a version: { versionId }. The app restores it, keeping the flowsheet as it is first. */
export const RESTORE_VERSION_EVENT = 'pf-restore-version';

export function requestRestore(versionId: string): void {
  window.dispatchEvent(new CustomEvent(RESTORE_VERSION_EVENT, { detail: { versionId } }));
}
