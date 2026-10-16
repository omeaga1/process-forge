import { useMemo, useState, useCallback } from 'react';
import {
  designSpecsOf,
  type DesignSpec,
  UnitOpContractSchema,
  validateUnitOpContract,
  evaluateUnitOp,
  blockingViolations,
  checkUnitOpDrawing,
  drawingToDressing,
  type DrawingCheck,
  type UnitOpContract,
  type UnitOpEvaluation,
  type ContractValidationIssue
} from '@process-forge/protocol';
import { drafting, draftingRadius, fontFamily } from '@process-forge/theme';
import { useTheme } from '../../hooks/useTheme.js';
import { EquipmentFigure } from '../../nozzles/EquipmentFigure.js';
import { layoutNozzles } from '../../nozzles/nozzleLayout.js';
import type { AssistantRoute } from '../../ai/assistantRoute.js';
import { McpDesignGuide } from './McpDesignGuide.js';
import { ContractParametersPanel } from './ContractParametersPanel.js';
import { Button } from '../../ui/index.js';
import { Check, X, Circle, Sparkles } from 'lucide-react';
import { tint } from '@process-forge/theme';

/** The active theme's palette and drafting rules, so this screen follows the theme. */
function useDrafting() {
  const { palette, theme } = useTheme();
  return { P: palette, D: drafting(theme) };
}

/**
 * The unit-op creator: where an engineer describes a unit operation that does
 * not exist yet, a sub-agent designs it, and the ENGINE decides whether it is
 * real before it is allowed onto the canvas.
 *
 * Every derived number comes from evaluateUnitOp(), and every pass/fail badge
 * is a check the engine actually ran; no result is written by hand.
 *
 * Contract authoring is injected via `onPropose`. The desktop and web apps wire
 * it to authorUnitOpContract (ai/unitOpAuthor.ts): a model on the engineer's
 * OpenRouter sign-in writes the contract and the engine's verdicts go back to it
 * until it passes. Without `onPropose` the panel is paste-in, for a contract
 * authored elsewhere -- e.g. by Claude Desktop through the MCP tools.
 */

export interface UnitOpCreatorProcessContext {
  upstream?: string;
  downstream?: string;
  inletTemperatureC?: number;
}

export interface UnitOpCreatorProps {
  /** Authors a contract from the engineer's description. Omit for paste-in mode. */
  onPropose?: (description: string, onProgress?: (note: string) => void) => Promise<UnitOpContract | string>;
  /**
   * How the engineer uses Claude. Decides what the authoring button does:
   * Claude in the app (needs onPropose), a hand-off to Claude Desktop, or
   * paste-in only. Defaults to 'api-key' when onPropose is given.
   */
  route?: AssistantRoute;
  /** Opens the "how do you use Claude" settings. */
  onChooseAssistant?: () => void;
  /** Called with a contract that passed every gate. */
  /** The design to add, and the results it holds (set on the preview's spec sheet), to keep on the new unit. */
  onAccept: (contract: UnitOpContract, extras?: { designSpecs?: DesignSpec[] }) => void;
  onClose?: () => void;
  processContext?: UnitOpCreatorProcessContext;
  initialDescription?: string;
}

type Gate = 'schema' | 'static' | 'physical' | 'drawing';

interface ReviewState {
  contract?: UnitOpContract;
  schemaErrors: string[];
  staticIssues: ContractValidationIssue[];
  evaluation?: UnitOpEvaluation;
  /** Absent when the contract has no drawing. */
  drawingCheck?: DrawingCheck;
}

const EMPTY_REVIEW: ReviewState = { schemaErrors: [], staticIssues: [] };

/** Runs the same gates the MCP validate_unit_op tool runs. */
function review(raw: unknown, overrides: Record<string, number>): ReviewState {
  const parsed = UnitOpContractSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      schemaErrors: parsed.error.issues.map(
        (i) => `${i.path.join('.') || '(root)'}: ${i.message}`
      ),
      staticIssues: []
    };
  }
  const contract = parsed.data;
  const staticIssues = validateUnitOpContract(contract);
  if (staticIssues.length > 0) {
    return { contract, schemaErrors: [], staticIssues };
  }
  return {
    contract,
    schemaErrors: [],
    staticIssues: [],
    evaluation: evaluateUnitOp(contract, { parameterOverrides: overrides }),
    ...(contract.drawing ? { drawingCheck: checkUnitOpDrawing(contract.drawing, contract.ports) } : {})
  };
}

function gateState(r: ReviewState, gate: Gate): 'pass' | 'fail' | 'pending' {
  if (gate === 'schema') {
    if (!r.contract && r.schemaErrors.length === 0) return 'pending';
    return r.schemaErrors.length === 0 ? 'pass' : 'fail';
  }
  if (gate === 'static') {
    if (!r.contract) return 'pending';
    if (r.schemaErrors.length > 0) return 'pending';
    return r.staticIssues.length === 0 ? 'pass' : 'fail';
  }
  if (gate === 'drawing') {
    if (!r.contract || r.schemaErrors.length > 0 || r.staticIssues.length > 0) return 'pending';
    // No drawing is allowed (older contracts); it is drawn as a generic vessel.
    return !r.drawingCheck || r.drawingCheck.errors.length === 0 ? 'pass' : 'fail';
  }
  if (!r.evaluation) return 'pending';
  if (r.evaluation.error) return 'fail';
  return blockingViolations(r.evaluation).length === 0 ? 'pass' : 'fail';
}

function GateBadge({ state, label }: { state: 'pass' | 'fail' | 'pending'; label: string }) {
  const { D } = useDrafting();
  const color =
    state === 'pass' ? D.semantic.ok : state === 'fail' ? D.semantic.violation : D.semantic.inert;
  const Icon = state === 'pass' ? Check : state === 'fail' ? X : Circle;
  return (
    <div
      role="status"
      aria-label={`${label}: ${state === 'pass' ? 'passes' : state === 'fail' ? 'fails' : 'not checked yet'}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 26,
        padding: '0 10px',
        borderRadius: 999,
        backgroundColor: state === 'pending' ? 'transparent' : tint(color, 0.12),
        border: `1px solid ${state === 'pending' ? 'var(--pf-border-default)' : tint(color, 0.4)}`,
        color: state === 'pending' ? 'var(--pf-text-muted)' : color,
        fontFamily: fontFamily.sans,
        fontSize: 12,
        fontWeight: 600
      }}
    >
      <Icon size={state === 'pending' ? 8 : 13} strokeWidth={state === 'pending' ? 3 : 2.5} aria-hidden />
      <span>{label}</span>
    </div>
  );
}

/** Starting points for the description: click one to fill it in, then change it. */
const EXAMPLES: { label: string; text: string }[] = [
  { label: 'Wax cooling belt', text: 'A water-cooled belt where molten wax is poured on, cools as it travels, and is scraped off solid at the end.' },
  { label: 'Brine crystalliser', text: 'A batch cooling crystalliser for magnesium sulfate brine: heat to dissolve, cool slowly, then split the mother liquor from the crystal slurry.' },
  { label: 'Plate heat exchanger', text: 'A plate heat exchanger that recovers heat from hot wort to preheat cold water, with both streams staying separate.' },
  { label: 'Rotary dryer', text: 'A rotary dryer that takes wet salt crystals down to half a percent moisture with hot air, sending the water out as vapour.' }
];

export function UnitOpCreator({
  onPropose,
  route: routeProp,
  onChooseAssistant,
  onAccept,
  onClose,
  processContext,
  initialDescription = ''
}: UnitOpCreatorProps) {
  const { P, D } = useDrafting();
  const card: React.CSSProperties = { background: P.background.surfaceElevated, border: `1px solid ${P.border.subtle}`, borderRadius: 12, padding: 20 };
  const labelStyle: React.CSSProperties = { fontSize: 15, fontWeight: 600, letterSpacing: '-0.005em', color: P.text.primary, marginBottom: 8 };
  const [description, setDescription] = useState(initialDescription);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposeError, setProposeError] = useState<string | null>(null);
  // One line per round of the design loop, so the engineer can see what the
  // engine rejected and what Claude changed -- not just a spinner.
  const [progress, setProgress] = useState<string[]>([]);
  const route: AssistantRoute = routeProp ?? (onPropose ? 'api-key' : 'none');
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  // The draft as the spec sheet below has edited it (values, feed, holds): what the gates check and what is added.
  const [previewConfig, setPreviewConfig] = useState<Record<string, unknown> | null>(null);
  // Keyed to the description it was made for, so editing the description
  // discards a pick that no longer applies.

  const parsedDraft = useMemo<unknown>(() => {
    if (!draft.trim()) return undefined;
    try {
      return JSON.parse(draft);
    } catch {
      return Symbol.for('unparseable');
    }
  }, [draft]);

  const jsonBroken = parsedDraft === Symbol.for('unparseable');

  const reviewState = useMemo<ReviewState>(() => {
    if (parsedDraft === undefined || jsonBroken) return EMPTY_REVIEW;
    return previewConfig ? review(previewConfig.contract, {}) : review(parsedDraft, overrides);
  }, [parsedDraft, jsonBroken, overrides, previewConfig]);

  // The unit as the canvas will draw it: from the contract's own drawing.
  const figure = useMemo(() => {
    const c = reviewState.contract;
    if (!c?.drawing) return null;
    const dressing = drawingToDressing(c.drawing, c.ports);
    const inputs = c.ports
      .filter((p) => p.direction === 'INLET')
      .map((p) => ({ id: p.id, name: p.name, type: 'FLUID_INPUT' as const, flowDimension: 'CONTINUOUS_VOLUME' as const }));
    const outputs = c.ports
      .filter((p) => p.direction === 'OUTLET')
      .map((p) => ({ id: p.id, name: p.name, type: 'FLUID_OUTPUT' as const, flowDimension: 'CONTINUOUS_VOLUME' as const }));
    const layout = layoutNozzles({ kind: 'CUSTOM_UNIT_OP', dressing, inputs, outputs });
    return { dressing, layout };
  }, [reviewState.contract]);

  const accepted =
    gateState(reviewState, 'schema') === 'pass' &&
    gateState(reviewState, 'static') === 'pass' &&
    gateState(reviewState, 'physical') === 'pass' &&
    gateState(reviewState, 'drawing') === 'pass';

  const handlePropose = useCallback(async () => {
    if (!onPropose || !description.trim()) return;
    setBusy(true);
    setProposeError(null);
    setProgress([]);
    try {
      const result = await onPropose(description, (note) => setProgress((p) => [...p, note]));
      setDraft(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
      setOverrides({});
      setPreviewConfig(null);
    } catch (e) {
      setProposeError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [onPropose, description]);

  const evaluation = reviewState.evaluation;
  const blocking = evaluation ? blockingViolations(evaluation) : [];
  const warnings = evaluation
    ? evaluation.constraints.filter((c) => !c.satisfied && c.severity === 'WARNING')
    : [];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        padding: 18,
        background: P.background.surface,
        color: P.text.primary,
        fontFamily: fontFamily.sans,
        minHeight: '100%'
      }}
    >
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.015em' }}>Design a unit op</h2>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: P.text.secondary, lineHeight: 1.6, maxWidth: 560 }}>
            {route === 'claude-desktop'
              ? 'Your MCP client designs it, and the engine decides whether it is physically real before it reaches the flowsheet.'
              : 'Describe the equipment in plain words. Your AI model writes the design, then the engine checks that the physics holds before it reaches the flowsheet.'}
          </p>
        </div>
        {onClose && <Button variant="ghost" size="sm" iconOnly icon={<X size={15} />} label="Close · Esc" onClick={onClose} />}
      </header>

      {processContext && (processContext.upstream || processContext.downstream) && (
        <div style={{ ...card, borderColor: P.jade[700] }}>
          <div style={labelStyle}>Surrounding process</div>
          <div style={{ fontSize: 13, color: P.text.secondary, lineHeight: 1.5 }}>
            {processContext.upstream && (
              <div>
                Fed by <strong style={{ color: P.text.accent }}>{processContext.upstream}</strong>
                {typeof processContext.inletTemperatureC === 'number' &&
                  ` at ${processContext.inletTemperatureC} °C`}
              </div>
            )}
            {processContext.downstream && (
              <div>
                Discharges to{' '}
                <strong style={{ color: P.text.accent }}>{processContext.downstream}</strong>
              </div>
            )}
          </div>
        </div>
      )}

      {route === 'claude-desktop' ? (
        <McpDesignGuide />
      ) : (
      <div style={card}>
        <div style={labelStyle}>What does the unit do?</div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Say what goes in, what happens to it, and what comes out."
          rows={4}
          className="pf-textarea"
          aria-label="What does the unit do?"
          style={{ fontSize: 14, lineHeight: 1.55 }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 12 }}>
          <span style={{ fontSize: 12, color: P.text.muted, marginRight: 4 }}>Try</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              className="pf-focus"
              onClick={() => setDescription(ex.text)}
              style={{ border: `1px solid ${P.border.subtle}`, background: 'transparent', color: P.text.secondary, borderRadius: 999, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}
            >
              {ex.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginTop: 18, flexWrap: 'wrap' }}>
          {route === 'api-key' && onPropose ? (
            <>
              <span style={{ fontSize: 12, color: P.text.muted, lineHeight: 1.5, maxWidth: 380 }}>The engine checks the result and sends it back to the model until it passes.</span>
              <Button variant="primary" icon={<Sparkles size={14} />} onClick={handlePropose} disabled={busy || !description.trim()}>
                {busy ? 'Designing it…' : 'Design it'}
              </Button>
            </>
          ) : (
            <>
              <span style={{ fontSize: 12, color: P.text.muted, lineHeight: 1.5, maxWidth: 380 }}>No AI model is set up. Connect one to design here, or paste a ready-made contract below.</span>
              {onChooseAssistant && (
                <Button variant="primary" onClick={onChooseAssistant}>
                  Connect an AI model
                </Button>
              )}
            </>
          )}
        </div>
        {progress.length > 0 && (
          <ol aria-live="polite" style={{ margin: '14px 0 0', paddingLeft: 18, fontSize: 12, color: P.text.secondary, lineHeight: 1.6 }}>
            {progress.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ol>
        )}
        {proposeError && <p style={{ margin: '12px 0 0', fontSize: 12, color: D.semantic.violation }}>{proposeError}</p>}
      </div>
      )}

      <details
        open={draft.trim().length > 0}
        style={{ ...card, padding: '14px 20px' }}
      >
        <summary style={{ fontSize: 13, fontWeight: 500, color: P.text.secondary, cursor: 'pointer', marginBottom: 0 }}>
          {draft.trim() ? 'Contract (JSON)' : 'Already have a contract? Paste the JSON to check it here'}
        </summary>
        <div style={{ height: 10 }} />
        <textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOverrides({});
      setPreviewConfig(null);
          }}
          // A contract pasted on one line (as clients and tools emit it) is laid out to read and edit; never while typing.
          onBlur={() => {
            if (!draft.trim() || draft.includes('\n  ')) return;
            try {
              setDraft(JSON.stringify(JSON.parse(draft), null, 2));
            } catch {
              // Not valid JSON yet: leave it as typed.
            }
          }}
          placeholder='{ "contractVersion": 1, "id": "...", ... }'
          rows={8}
          spellCheck={false}
          className="pf-textarea"
          data-mono=""
          aria-label="Contract JSON"
          aria-invalid={jsonBroken}
        />
        {jsonBroken && (
          <p style={{ margin: '6px 0 0', fontSize: 12, color: D.semantic.violation }}>
            Not valid JSON yet.
          </p>
        )}
      </details>

      {(route !== 'claude-desktop' || draft.trim().length > 0) && (
      <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 4 }}>
        <GateBadge state={gateState(reviewState, 'schema')} label="Schema" />
        <GateBadge state={gateState(reviewState, 'static')} label="References resolve" />
        <GateBadge state={gateState(reviewState, 'physical')} label="Physically valid" />
        <GateBadge state={gateState(reviewState, 'drawing')} label="Drawn and pipeable" />
      </div>

      {reviewState.schemaErrors.length > 0 && (
        <div style={{ ...card, borderColor: D.semantic.violation }}>
          <div style={labelStyle}>Schema problems</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: P.text.secondary }}>
            {reviewState.schemaErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {reviewState.staticIssues.length > 0 && (
        <div style={{ ...card, borderColor: D.semantic.violation }}>
          <div style={labelStyle}>Unresolved references</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: P.text.secondary }}>
            {reviewState.staticIssues.map((i) => (
              <li key={`${i.path}-${i.message}`}>
                <code style={{ color: P.text.accent }}>{i.path}</code> — {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {evaluation?.error && (
        <div style={{ ...card, borderColor: D.semantic.violation }}>
          <div style={labelStyle}>Evaluation failed</div>
          <p style={{ margin: 0, fontSize: 13, color: P.text.secondary }}>
            <code style={{ color: P.text.accent }}>{evaluation.error.path}</code> —{' '}
            {evaluation.error.message}
          </p>
        </div>
      )}

      {evaluation && !evaluation.error && (
        <>
          <div style={card}>
            <div style={labelStyle}>On the flowsheet</div>
            {figure ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    padding: 26,
                    background: P.background.surfaceMuted,
                    borderRadius: draftingRadius.soft
                  }}
                >
                  <EquipmentFigure
                    kind="CUSTOM_UNIT_OP"
                    dressing={figure.dressing}
                    width={figure.dressing.defaultSize?.width ?? 160}
                    stubs={figure.layout.anchors
                      .filter((a) => a.nozzle)
                      .map((a) => ({ nozzle: a.nozzle!, color: P.streams.continuousFluid }))}
                  />
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 11, color: P.text.muted }}>
                  Drawn by the contract. Pipes attach at the {figure.layout.anchors.filter((a) => a.nozzle).length} nozzles shown.
                </p>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: P.text.secondary }}>
                This contract has no drawing, so it will appear as a generic vessel with its connections along the edges.
              </p>
            )}
            {reviewState.drawingCheck && reviewState.drawingCheck.errors.length > 0 && (
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: D.semantic.violation }}>
                {reviewState.drawingCheck.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            {reviewState.drawingCheck && reviewState.drawingCheck.warnings.length > 0 && (
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: P.text.secondary }}>
                {reviewState.drawingCheck.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </div>

          {/* The same spec sheet a placed unit gets: what passes where, the solver, the study, before it is even added. */}
          <div style={card}>
            <ContractParametersPanel
              node={
                {
                  id: 'unit-op-preview',
                  name: reviewState.contract!.name,
                  kind: 'CUSTOM_UNIT_OP',
                  position: { x: 0, y: 0 },
                  inputs: [],
                  outputs: [],
                  config: previewConfig ?? { contract: reviewState.contract }
                } as unknown as Parameters<typeof ContractParametersPanel>[0]['node']
              }
              contract={reviewState.contract!}
              own
              onUpdateConfig={(_, config) => setPreviewConfig(config)}
            />
          </div>
        </>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginTop: 'auto',
          position: 'sticky',
          bottom: 0,
          margin: '0 -18px -18px',
          padding: '12px 18px',
          background: P.background.surface,
          borderTop: `1px solid ${P.border.subtle}`
        }}
      >
        <Button
          variant="primary"
          disabled={!accepted}
          onClick={() => {
            const contract = reviewState.contract;
            if (!contract) return;
            // Add the design the gates actually passed: the draft as the spec sheet left it, holds included.
            const holds = previewConfig ? designSpecsOf(previewConfig) : [];
            onAccept(
              previewConfig
                ? contract
                : {
                    ...contract,
                    parameters: contract.parameters.map((p) =>
                      overrides[p.name] === undefined ? p : { ...p, value: overrides[p.name]! }
                    )
                  },
              holds.length ? { designSpecs: holds } : undefined
            );
          }}
        >
          Add to flowsheet
        </Button>
        <span role="status" style={{ fontSize: 13, color: accepted ? P.jade[400] : P.text.muted }}>
          {accepted
            ? warnings.length > 0
              ? `Accepted with ${warnings.length} warning(s).`
              : 'All checks pass.'
            : blocking.length > 0
              ? `${blocking.length} physical constraint(s) violated.`
              : 'Blocked until every gate passes.'}
        </span>
      </div>
      </>
      )}
    </div>
  );
}
