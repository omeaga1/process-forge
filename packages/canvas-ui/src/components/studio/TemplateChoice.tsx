import type { TemplateFamily, TemplateRouting } from '@process-forge/protocol';
import { drafting, draftingRadius } from '@process-forge/theme';
import { useTheme } from '../../hooks/useTheme.js';

export const TEMPLATE_FAMILY_LABELS: Record<TemplateFamily, string> = {
  column: 'Column',
  reactor: 'Reactor',
  exchanger: 'Heat exchanger',
  pump: 'Pump',
  cyclone: 'Cyclone',
  spray: 'Spray / scrubber',
  sphere: 'Sphere',
  drum: 'Horizontal drum',
  generic: 'Plain vessel'
};

interface TemplateChoiceProps {
  /** Routing from the description alone, before any pick. */
  routing: TemplateRouting;
  /** The family currently drawn: the engineer's pick, or `routing.family`. */
  current: TemplateFamily;
  onPick: (family: TemplateFamily) => void;
}

/**
 * Shown when a description names more than one drawing family.
 *
 * The engine still returns a drawing for a tie -- the first family declared --
 * because a preview needs something to show. This is where the engineer learns
 * it was a tie and picks, rather than reading the first match as a decision.
 * Renders nothing when the description was decided.
 */
export function TemplateChoice({ routing, current, onPick }: TemplateChoiceProps) {
  const { theme, palette } = useTheme();
  if (routing.decided || routing.alternatives.length === 0) return null;
  const D = drafting(theme === 'light' ? 'light' : 'dark');
  const options = [routing.family, ...routing.alternatives];
  const names = options.map((f) => TEMPLATE_FAMILY_LABELS[f].toLowerCase());

  return (
    <div role="group" aria-label="Which drawing template?" style={{ marginTop: 8 }}>
      <div style={{ ...D.label, color: D.semantic.caution, marginBottom: 4 }}>
        Description names {names.join(' and ')} — which is it?
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {options.map((family) => {
          const active = family === current;
          return (
            <button
              key={family}
              type="button"
              aria-pressed={active}
              onClick={() => onPick(family)}
              style={{
                ...D.prose,
                fontSize: '0.72rem',
                padding: '3px 8px',
                borderRadius: draftingRadius.soft,
                border: active ? `1px solid ${palette.jade[400]}` : D.rule,
                background: active ? palette.background.surfaceMuted : 'transparent',
                color: active ? palette.text.primary : palette.text.secondary,
                cursor: 'pointer'
              }}
            >
              {TEMPLATE_FAMILY_LABELS[family]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
