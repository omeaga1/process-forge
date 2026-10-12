import React, { useMemo, useState } from 'react';
import { OsakaJadeDarkPalette as D, fontFamily } from '@process-forge/theme';
import { EquipmentFigure, UnitGlance } from '@process-forge/canvas-ui';
import {
  CASE_PACKER_CONTRACT,
  CRYSTALLISER_CONTRACT,
  DECANTER_CENTRIFUGE_CONTRACT,
  DUST_COLLECTOR_CONTRACT,
  EVAPORATOR_CONTRACT,
  JUICE_CONCENTRATOR_CONTRACT,
  NEUTRALISER_CONTRACT,
  SPRAY_DRYER_CONTRACT,
  TWO_STREAM_EXCHANGER_CONTRACT,
  VENTURI_SCRUBBER_CONTRACT,
  WAX_COOLING_BELT_CONTRACT,
  drawingToDressing,
  evaluateUnitOp,
  executeValidateUnitOp,
  type UnitOpContract
} from '@process-forge/protocol';
import { COLD_BREW_CONTRACT } from './coldBrew.js';

/**
 * More worked examples: the contracts the engine ships as worked examples
 * for AI clients to pattern-match against, each drawn from its own contract.
 * Pick one and the engine validates it and lays out its panel, here.
 */

const mono: React.CSSProperties = { fontFamily: fontFamily.mono, fontVariantNumeric: 'tabular-nums' };

const EXAMPLES: { contract: UnitOpContract; shows: string }[] = [
  { contract: COLD_BREW_CONTRACT, shows: 'Freezes water out as ice; heat of freezing in the duty' },
  { contract: WAX_COOLING_BELT_CONTRACT, shows: 'Solidification on a cooled belt' },
  { contract: SPRAY_DRYER_CONTRACT, shows: 'Liquid in, powder and humid air out' },
  { contract: DUST_COLLECTOR_CONTRACT, shows: 'Gas–solid separation, air-to-cloth' },
  { contract: VENTURI_SCRUBBER_CONTRACT, shows: 'Absorption into a scrubbing liquor' },
  { contract: JUICE_CONCENTRATOR_CONTRACT, shows: 'Separation by component recovery' },
  { contract: EVAPORATOR_CONTRACT, shows: 'Reads its live inlet; splits and heats per outlet' },
  { contract: NEUTRALISER_CONTRACT, shows: 'A mass-balanced reaction' },
  { contract: CRYSTALLISER_CONTRACT, shows: 'Batch: fill, heat, cool, decant, drop' },
  { contract: TWO_STREAM_EXCHANGER_CONTRACT, shows: 'Two channels that never mix' },
  { contract: DECANTER_CENTRIFUGE_CONTRACT, shows: 'Three-phase split' },
  { contract: CASE_PACKER_CONTRACT, shows: 'Takes a kit of items, rejects some' }
];

const MODE: Record<string, string> = { CONTINUOUS_RATE: 'Continuous', DISCRETE_CYCLE: 'Cycle', BATCH: 'Batch', STORAGE: 'Storage' };

/** The contract's own drawing, as large as fits a box of `box` px, in its proportions. */
function Figure({ contract, box }: { contract: UnitOpContract; box: [number, number] }) {
  const dressing = useMemo(() => (contract.drawing ? drawingToDressing(contract.drawing, contract.ports) : undefined), [contract]);
  const vb = contract.drawing?.viewBox ?? { width: 1, height: 1 };
  const width = Math.min(box[0], (box[1] * vb.width) / vb.height);
  return (
    <div style={{ width: box[0], height: box[1], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <EquipmentFigure kind="CUSTOM_UNIT_OP" {...(dressing ? { dressing } : {})} width={width} isRunning />
    </div>
  );
}

export const ExampleGallery: React.FC = () => {
  const [pick, setPick] = useState(1);
  const chosen = EXAMPLES[pick]!.contract;
  const verdict = useMemo(() => executeValidateUnitOp({ contract: chosen }), [chosen]);
  const evaluation = useMemo(() => evaluateUnitOp(chosen), [chosen]);
  const firstSentence = (s: string) => s.split(/(?<=\.)\s/)[0];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div role="listbox" aria-label="Worked examples" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
        {EXAMPLES.map(({ contract, shows }, i) => {
          const on = i === pick;
          return (
            <button
              key={contract.id}
              type="button"
              role="option"
              aria-selected={on}
              onClick={() => setPick(i)}
              className="pf-tile"
              style={{ display: 'grid', justifyItems: 'center', alignContent: 'start', gap: 6, padding: '12px 8px 10px', borderRadius: 12, cursor: 'pointer', border: `1px solid ${on ? D.jade.glow : D.border.subtle}`, background: on ? D.background.surfaceElevated : `${D.background.surface}99`, color: on ? D.text.primary : D.text.secondary }}
            >
              <Figure contract={contract} box={[110, 72]} />
              <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'center', lineHeight: 1.3 }}>{contract.name}</span>
              <span style={{ fontSize: 11, color: D.text.muted, textAlign: 'center', lineHeight: 1.35 }}>{shows}</span>
            </button>
          );
        })}
      </div>

      <div data-theme="dark" className="pf-control-grid pf-pop" key={chosen.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 0.8fr) minmax(0, 1.6fr)', gap: 16, alignItems: 'start' }}>
        <div style={{ border: `1px solid ${D.border.default}`, borderRadius: 14, background: D.background.surface, padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Figure contract={chosen} box={[240, 150]} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 650, marginTop: 12 }}>{chosen.name}</div>
          <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.55, color: D.text.secondary }}>{firstSentence(chosen.description ?? '')}</p>
          <div style={{ ...mono, display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12, fontSize: 11 }}>
            <span style={{ padding: '3px 8px', borderRadius: 999, border: `1px solid ${verdict.verdict === 'ACCEPTED' ? D.jade[500] : D.status.failed}`, color: verdict.verdict === 'ACCEPTED' ? D.jade.glow : D.status.failed }}>
              {verdict.verdict}
            </span>
            <span style={{ padding: '3px 8px', borderRadius: 999, border: `1px solid ${D.border.strong}`, color: D.text.secondary }}>{MODE[chosen.behavior.mode] ?? chosen.behavior.mode}</span>
            <span style={{ padding: '3px 8px', borderRadius: 999, border: `1px solid ${D.border.strong}`, color: D.text.secondary }}>
              {chosen.parameters.length} parameters · {chosen.derived.length} equations · {chosen.constraints.length} limits
            </span>
          </div>
        </div>
        <div style={{ border: `1px solid ${D.border.default}`, borderRadius: 14, background: D.background.base, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', margin: '2px 4px 12px' }}>
            <span style={{ ...mono, fontSize: 11, letterSpacing: '0.12em', color: D.text.muted }}>AT A GLANCE</span>
            <span style={{ fontSize: 12, color: D.text.muted }}>Validated and laid out by the engine in this page.</span>
          </div>
          <UnitGlance contract={chosen} evaluation={evaluation} />
        </div>
      </div>
    </div>
  );
};
