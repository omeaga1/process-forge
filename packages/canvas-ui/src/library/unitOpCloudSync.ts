import { useEffect, useState } from 'react';
import { CommunityLibraryService, communityApiUrl } from '../marketplace/communityLibraryClient.js';
import {
  SAVED_UNIT_OPS_CHANGED_EVENT,
  localUnitOpRecords,
  mergeUnitOpLibraries,
  replaceLocalLibrary,
  type SavedUnitOp,
  type UnitOpRecord
} from './savedUnitOps.js';

/**
 * Keeps "My unit ops" in step with the signed-in account, so a design made on
 * one device (or by an MCP client on it) is there on the others.
 *
 * A sync downloads the account's library, merges it with this device's by
 * whichever side saved or removed each unit last, keeps the result here, and
 * uploads what this device had newer. It runs on sign-in, when the app opens
 * signed in, and shortly after every save or removal. Signed out, nothing
 * leaves the device.
 */

export type UnitOpSyncStatus =
  | { kind: 'signed-out' }
  | { kind: 'syncing' }
  | { kind: 'synced'; at: number; count: number }
  | { kind: 'error'; message: string };

const STATUS_EVENT = 'pf-unit-op-sync-status';
let status: UnitOpSyncStatus = { kind: 'signed-out' };

function setStatus(next: UnitOpSyncStatus): void {
  status = next;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(STATUS_EVENT));
}

interface RemoteRow {
  id: string;
  savedAt: string;
  source?: string;
  deleted?: boolean;
  contract?: SavedUnitOp['contract'] | null;
}

const toRecord = (r: RemoteRow): UnitOpRecord | null =>
  r.deleted
    ? { id: r.id, at: r.savedAt, removed: true }
    : r.contract
      ? {
          id: r.id,
          at: r.savedAt,
          saved: { id: r.id, contract: r.contract, savedAt: r.savedAt, source: (['designed', 'mcp', 'studio'].includes(String(r.source)) ? r.source : 'designed') as SavedUnitOp['source'] }
        }
      : null;

let running: Promise<UnitOpSyncStatus> | null = null;

/** One sync with the account. Concurrent calls share one run. */
export function syncUnitOpsWithCloud(): Promise<UnitOpSyncStatus> {
  if (running) return running;
  running = run().finally(() => {
    running = null;
  });
  return running;
}

async function run(): Promise<UnitOpSyncStatus> {
  const session = CommunityLibraryService.getSession();
  if (!session) {
    setStatus({ kind: 'signed-out' });
    return status;
  }
  setStatus({ kind: 'syncing' });
  const auth = { Authorization: `Bearer ${session.token}` };
  try {
    const res = await fetch(communityApiUrl('/me/unitops'), { headers: auth });
    const data = (await res.json().catch(() => ({}))) as { unitops?: RemoteRow[]; error?: string };
    if (res.status === 404) {
      // An API from before sync existed: keep everything on this device.
      setStatus({ kind: 'error', message: 'Syncing with your account is not available yet; your unit ops are kept on this device.' });
      return status;
    }
    if (!res.ok) throw new Error(res.status === 401 ? 'Your sign-in has expired; sign in again to sync.' : data.error || `HTTP ${res.status}`);
    const remote = (data.unitops ?? []).map(toRecord).filter((r): r is UnitOpRecord => r !== null);
    const merged = mergeUnitOpLibraries(localUnitOpRecords(), remote);
    replaceLocalLibrary(merged);
    const failures: string[] = [];
    for (const rec of merged.toUpload) {
      const url = communityApiUrl(`/me/unitops/${encodeURIComponent(rec.id)}`);
      const body = 'saved' in rec ? { contract: rec.saved.contract, source: rec.saved.source, savedAt: rec.at } : { savedAt: rec.at };
      const up = await fetch(url, {
        method: 'saved' in rec ? 'PUT' : 'DELETE',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!up.ok) {
        const e = (await up.json().catch(() => ({}))) as { error?: string };
        failures.push(e.error || `HTTP ${up.status}`);
      }
    }
    if (failures.length) throw new Error(`Some unit ops did not sync: ${failures[0]}`);
    setStatus({ kind: 'synced', at: Date.now(), count: merged.saved.length });
  } catch (e) {
    setStatus({ kind: 'error', message: e instanceof Error && e.message !== 'Failed to fetch' ? e.message : 'ProcessForge Cloud could not be reached; your unit ops are safe on this device.' });
  }
  return status;
}

/**
 * Runs the sync while signed in: now, and a moment after each save or
 * removal. Mount it once, near the top of the app.
 */
export function useUnitOpCloudSync(signedIn: boolean): void {
  useEffect(() => {
    if (!signedIn) {
      setStatus({ kind: 'signed-out' });
      return;
    }
    void syncUnitOpsWithCloud();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = (e: Event) => {
      if ((e as CustomEvent<{ fromSync?: boolean }>).detail?.fromSync) return;
      clearTimeout(timer);
      timer = setTimeout(() => void syncUnitOpsWithCloud(), 1500);
    };
    window.addEventListener(SAVED_UNIT_OPS_CHANGED_EVENT, onChange);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(SAVED_UNIT_OPS_CHANGED_EVENT, onChange);
    };
  }, [signedIn]);
}

/** Where the library stands with the account, for showing next to it. */
export function useUnitOpSyncStatus(): UnitOpSyncStatus {
  const [s, setS] = useState<UnitOpSyncStatus>(status);
  useEffect(() => {
    const on = () => setS(status);
    window.addEventListener(STATUS_EVENT, on);
    return () => window.removeEventListener(STATUS_EVENT, on);
  }, []);
  return s;
}
