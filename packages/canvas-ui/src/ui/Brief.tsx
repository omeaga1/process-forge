/**
 * Long prose, read at a glance. A description shows its first sentence; the
 * rest folds behind "More" as a short list, one point per sentence. Use it for
 * any text an author (or a model) wrote that the UI cannot keep short itself:
 * unit-op descriptions, library listings, parameter help.
 */
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/** The text's first sentence, and the rest as one point per sentence. */
export function splitBrief(text: string): { lead: string; points: string[] } {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return { lead: '', points: [] };
  // Split after . ! ? or ; when the next word starts a new thought (not "e.g. x", "U = 1500 W/m²K.").
  const parts = clean.split(/(?<=[.!?;])\s+(?=[A-Z(‘'"0-9])/).map((s) => s.trim()).filter(Boolean);
  let lead = parts.shift() ?? '';
  // A lead that is itself a paragraph gets cut at its colon: "X without heat: a, b and c".
  if (lead.length > 160) {
    const at = lead.indexOf(': ');
    if (at > 30 && at < 160) {
      parts.unshift(capitalise(lead.slice(at + 2)));
      lead = `${lead.slice(0, at)}.`;
    }
  }
  return { lead, points: parts.map((p) => p.replace(/;$/, '.')) };
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface BriefProps {
  text: string;
  /** Lines the lead may take before it is cut with an ellipsis. */
  lines?: number;
  /** Start unfolded. */
  defaultOpen?: boolean;
  style?: React.CSSProperties;
  /** Colour of the folded points; the lead inherits. */
  mutedColor?: string;
}

export const Brief: React.FC<BriefProps> = ({ text, lines = 2, defaultOpen = false, style, mutedColor }) => {
  const { lead, points } = splitBrief(text);
  const [open, setOpen] = useState(defaultOpen);
  if (!lead) return null;
  return (
    <div style={{ fontSize: 13, lineHeight: 1.55, ...style }}>
      <div
        title={open ? undefined : text}
        style={open ? undefined : { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
      >
        {lead}
      </div>
      {points.length > 0 && (
        <>
          {open && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, display: 'grid', gap: 3, color: mutedColor, opacity: mutedColor ? 1 : 0.85 }}>
              {points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
            aria-expanded={open}
            style={{
              marginTop: 4,
              padding: 0,
              border: 'none',
              background: 'none',
              color: 'inherit',
              opacity: 0.7,
              font: 'inherit',
              fontSize: '0.92em',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3
            }}
          >
            {open ? 'Less' : `More (${points.length})`}
            <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }} />
          </button>
        </>
      )}
    </div>
  );
};
