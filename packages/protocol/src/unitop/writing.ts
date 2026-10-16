/**
 * How a unit op's words read in the app. Every description a model writes is
 * shown on a card, a panel row or a library listing, so it has to read at a
 * glance: the engineer scans, and the numbers carry the detail.
 */
import type { UnitOpContract } from './contract.js';

export const WRITING_LIMITS = {
  /** The unit's description: what it is and what it does. */
  description: { chars: 240, sentences: 2 },
  /** A parameter's or derived value's description: one short line under its label. */
  field: { chars: 90, sentences: 1 },
  /** A label on the panel. */
  label: { chars: 36 }
} as const;

/** The rules, as told to a model writing a contract or a library listing. */
export const WRITING_RULES = `Keep text short. description ≤${WRITING_LIMITS.description.chars} chars: what it is and does, no lists. Field descriptions ≤${WRITING_LIMITS.field.chars}, labels ≤${WRITING_LIMITS.label.chars}.`;

function sentences(text: string): number {
  return text.trim().split(/(?<=[.!?;])\s+(?=[A-Z(0-9])/).filter(Boolean).length;
}

/** Warnings for words the app would show as a wall of text. They never reject a contract. */
export function writingWarnings(contract: UnitOpContract): { path: string; message: string }[] {
  const out: { path: string; message: string }[] = [];
  const d = contract.description ?? '';
  const L = WRITING_LIMITS;
  if (d.length > L.description.chars || sentences(d) > L.description.sentences) {
    out.push({
      path: 'description',
      message: `Too long to read on a card (${d.length} characters, ${sentences(d)} sentences; keep to ${L.description.sentences} sentences, ${L.description.chars} characters). Say what the equipment is and does; move assumptions and numbers into parameters.`
    });
  }
  const fields: { path: string; label?: string; description?: string }[] = [
    ...(contract.parameters ?? []).map((p, i) => ({ path: `parameters[${i}]`, label: p.label, description: p.description })),
    ...(contract.derived ?? []).map((p, i) => ({ path: `derived[${i}]`, label: p.label, description: p.description }))
  ];
  for (const f of fields) {
    if (f.description && (f.description.length > L.field.chars || sentences(f.description) > L.field.sentences)) {
      out.push({ path: `${f.path}.description`, message: `One line under its label: keep to ${L.field.chars} characters (it has ${f.description.length}).` });
    }
    if (f.label && f.label.length > L.label.chars) {
      out.push({ path: `${f.path}.label`, message: `Label too long for the panel (${f.label.length} characters; keep to ${L.label.chars}).` });
    }
  }
  return out;
}
