import { useEffect, useState } from 'react';
import { UnitOpContractSchema, type UnitOpContract } from '@process-forge/protocol';

/**
 * "My unit ops": every unit operation designed on this device, kept so it can
 * be placed again in any project without designing it twice.
 *
 * A design is saved when it is accepted in the Unit Op Creator, when an MCP
 * client adds it to a flowsheet, or when the engineer saves one from the unit
 * studio. Stored whole, so a saved unit is exactly the contract the engine
 * checked.
 */

export interface SavedUnitOp {
  /** contract.id; saving a newer design with the same id replaces it. */
  id: string;
  contract: UnitOpContract;
  savedAt: string;
  source: 'designed' | 'mcp' | 'studio';
}

const KEY = 'pf_my_unit_ops';
const CHANGED = 'pf-my-unit-ops-changed';

export function listSavedUnitOps(): SavedUnitOp[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (!raw) return [];
    const items = JSON.parse(raw) as SavedUnitOp[];
    // Only designs the current schema still reads.
    return items.filter((i) => UnitOpContractSchema.safeParse(i.contract).success);
  } catch {
    return [];
  }
}

function write(items: SavedUnitOp[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Storage blocked or full: the library lasts for this session only.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CHANGED));
}

export function saveUnitOp(contract: UnitOpContract, source: SavedUnitOp['source']): void {
  const item: SavedUnitOp = { id: contract.id, contract, savedAt: new Date().toISOString(), source };
  write([item, ...listSavedUnitOps().filter((i) => i.id !== contract.id)]);
}

export function removeSavedUnitOp(id: string): void {
  write(listSavedUnitOps().filter((i) => i.id !== id));
}

export function isUnitOpSaved(id: string): boolean {
  return listSavedUnitOps().some((i) => i.id === id);
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
