import { useEffect, useState } from 'react';
import { UnitOpContractSchema, type UnitOpContract } from '@process-forge/protocol';

/**
 * "My unit ops": every unit operation designed on this device, kept so it can
 * be placed again in any project without designing it twice.
 *
 * A design is saved when it is accepted in the Unit Op Creator, when an MCP
 * client adds it to a flowsheet, or when the engineer saves one from the unit
 * studio. Stored whole, so a saved unit is exactly the contract the engine
 * checked. Signed in, the library also syncs with the account (see
 * unitOpCloudSync.ts); removals are remembered so they sync too.
 */

export interface SavedUnitOp {
  /** contract.id; saving a newer design with the same id replaces it. */
  id: string;
  contract: UnitOpContract;
  savedAt: string;
  source: 'designed' | 'mcp' | 'studio';
}

/** A removal, remembered so it reaches the account and the other devices. */
export interface RemovedUnitOp {
  id: string;
  removedAt: string;
}

const KEY = 'pf_my_unit_ops';
const REMOVED_KEY = 'pf_my_unit_ops_removed';
const CHANGED = 'pf-my-unit-ops-changed';
/** Fired on window after a save or removal: { id } locally, { fromSync: true } after a sync. */
export const SAVED_UNIT_OPS_CHANGED_EVENT = CHANGED;

function read<T>(key: string): T[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

export function listSavedUnitOps(): SavedUnitOp[] {
  // Only designs the current schema still reads.
  return read<SavedUnitOp>(KEY).filter((i) => UnitOpContractSchema.safeParse(i.contract).success);
}

export function listRemovedUnitOps(): RemovedUnitOp[] {
  return read<RemovedUnitOp>(REMOVED_KEY);
}

function store(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked or full: the library lasts for this session only.
  }
}

function notify(detail: { id?: string; fromSync?: boolean }): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CHANGED, { detail }));
}

export function saveUnitOp(contract: UnitOpContract, source: SavedUnitOp['source']): void {
  const item: SavedUnitOp = { id: contract.id, contract, savedAt: new Date().toISOString(), source };
  store(KEY, [item, ...listSavedUnitOps().filter((i) => i.id !== contract.id)]);
  store(REMOVED_KEY, listRemovedUnitOps().filter((r) => r.id !== contract.id));
  notify({ id: contract.id });
}

export function removeSavedUnitOp(id: string): void {
  store(KEY, listSavedUnitOps().filter((i) => i.id !== id));
  store(REMOVED_KEY, [{ id, removedAt: new Date().toISOString() }, ...listRemovedUnitOps().filter((r) => r.id !== id)]);
  notify({ id });
}

export function isUnitOpSaved(id: string): boolean {
  return listSavedUnitOps().some((i) => i.id === id);
}

/** What one side (this device, or the account) knows about one unit op: its latest save, or its removal. */
export type UnitOpRecord = { id: string; at: string; saved: SavedUnitOp } | { id: string; at: string; removed: true };

export interface MergedLibrary {
  saved: SavedUnitOp[];
  removed: RemovedUnitOp[];
  /** Records this device has that the account does not, or has older: to upload. */
  toUpload: UnitOpRecord[];
}

/**
 * Merges this device's library with the account's, one unit op at a time:
 * whichever side saved or removed it last wins. Pure, so it is tested alone.
 */
export function mergeUnitOpLibraries(local: UnitOpRecord[], remote: UnitOpRecord[]): MergedLibrary {
  const l = new Map(local.map((r) => [r.id, r]));
  const r = new Map(remote.map((x) => [x.id, x]));
  const saved: SavedUnitOp[] = [];
  const removed: RemovedUnitOp[] = [];
  const toUpload: UnitOpRecord[] = [];
  for (const id of new Set([...l.keys(), ...r.keys()])) {
    const mine = l.get(id);
    const theirs = r.get(id);
    const localWins = mine !== undefined && (theirs === undefined || mine.at > theirs.at);
    const winner = (localWins ? mine : theirs)!;
    if (localWins) toUpload.push(mine);
    if ('saved' in winner) saved.push(winner.saved);
    else removed.push({ id, removedAt: winner.at });
  }
  saved.sort((x, y) => (x.savedAt < y.savedAt ? 1 : -1));
  return { saved, removed, toUpload };
}

/** This device's library as records, for merging. */
export function localUnitOpRecords(): UnitOpRecord[] {
  return [
    ...listSavedUnitOps().map((s) => ({ id: s.id, at: s.savedAt, saved: s })),
    ...listRemovedUnitOps().map((x) => ({ id: x.id, at: x.removedAt, removed: true as const }))
  ];
}

/** Replaces this device's library with a merged one (from a sync). */
export function replaceLocalLibrary(merged: Pick<MergedLibrary, 'saved' | 'removed'>): void {
  store(KEY, merged.saved);
  store(REMOVED_KEY, merged.removed);
  notify({ fromSync: true });
}

/** The library, kept current as designs are saved or removed anywhere in the app. */
export function useSavedUnitOps(): SavedUnitOp[] {
  const [items, setItems] = useState<SavedUnitOp[]>(() => listSavedUnitOps());
  useEffect(() => {
    const refresh = () => setItems(listSavedUnitOps());
    window.addEventListener(CHANGED, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(CHANGED, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return items;
}
