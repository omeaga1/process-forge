import { useMemo, useState, useCallback } from 'react';
import {
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
import { OsakaJadePalette as P, drafting, draftingRadius } from '@process-forge/theme';
import { EquipmentFigure } from '../../nozzles/EquipmentFigure.js';
import { layoutNozzles } from '../../nozzles/nozzleLayout.js';
import type { AssistantRoute } from '../../ai/assistantRoute.js';
import { McpDesignGuide } from './McpDesignGuide.js';

const D = drafting('dark');

/**
 * The unit-op creator: where an engineer describes a unit operation that does
 * not exist yet, a sub-agent designs it, and the ENGINE decides whether it is
 * real before it is allowed onto the canvas.
 *
 * Every derived number comes from evaluateUnitOp(), and every pass/fail badge
 * is a check the engine actually ran; no result is written by hand.
 *
 * Contract authoring is injected via `onPropose`. The desktop and web apps wire
 * it to authorUnitOpContract (ai/unitOpAuthor.ts): Claude, on the engineer's
 * own API key, writes the contract and the engine's verdicts go back to it
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
  onAccept: (contract: UnitOpContract) => void;
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

const card: React.CSSProperties = {
  background: P.background.surfaceElevated,
  border: D.rule,
  borderRadius: draftingRadius.sharp,
  padding: 14
};

const labelStyle: React.CSSProperties = { ...D.label, marginBottom: 6 } as React.CSSProperties;

function GateBadge({ state, label }: { state: 'pass' | 'fail' | 'pending'; label: string }) {
  const color =
    state === 'pass' ? D.semantic.ok : state === 'fail' ? D.semantic.violation : D.semantic.inert;
  const glyph = state === 'pass' ? '✓' : state === 'fail' ? '✕' : '·';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: draftingRadius.sharp,
        border: `1px solid ${color}`,
        color,
        ...D.data,
        fontSize: '0.72rem',
        fontWeight: 600
      }}
    >
      <span aria-hidden>{glyph}</span>
      <span>{label}</span>
    </div>
  );
}

export function UnitOpCreator({
  onPropose,
  route: routeProp,
  onChooseAssistant,
  onAccept,
  onClose,
  processContext,
  initialDescription = ''
}: UnitOpCreatorProps) {
  const [description, setDescription] = useState(initialDescription);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposeError, setProposeError] = useState<string | null>(null);
  // One line per round of the design loop, so the engineer can see what the
  // engine rejected and what Claude changed -- not just a spinner.
  const [progress, setProgress] = useState<string[]>([]);
  const route: AssistantRoute = routeProp ?? (onPropose ? 'api-key' : 'none');
  const [overrides, setOverrides] = useState<Record<string, number>>({});
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
    return review(parsedDraft, overrides);
  }, [parsedDraft, jsonBroken, overrides]);

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
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        minHeight: '100%'
      }}
    >
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Unit Operation Creator</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: P.text.secondary }}>
            {route === 'claude-desktop'
              ? 'Your MCP client designs it; the engine decides whether it is physically real.'
              : 'Describe the equipment. Your AI model designs it; the engine decides whether it is physically real.'}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: `1px solid ${P.background.surfaceHover}`,
              color: P.text.secondary,
              borderRadius: draftingRadius.soft,
              padding: '4px 10px',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        )}
      </header>

      {processContext && (processContext.upstream || processContext.downstream) && (
        <div style={{ ...card, borderColor: P.jade[700] }}>
          <div style={labelStyle}>Surrounding process</div>
          <div style={{ fontSize: '0.82rem', color: P.text.secondary, lineHeight: 1.5 }}>
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
        <div style={labelStyle}>What is the unit operation?</div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A giant water-cooled belt where molten wax is poured on, cools as it travels, and is scraped off solid at the end."
          rows={3}
          style={{
            width: '100%',
            background: P.background.surfaceMuted,
            color: P.text.primary,
            border: `1px solid ${P.background.surfaceHover}`,
            borderRadius: draftingRadius.soft,
            padding: 10,
            fontSize: '0.85rem',
            resize: 'vertical',
            boxSizing: 'border-box'
          }}
        />
        {route === 'api-key' && onPropose ? (
          <button
            onClick={handlePropose}
            disabled={busy || !description.trim()}
            style={{
              marginTop: 10,
              background: busy ? P.background.surfaceHover : P.jade[600],
              color: P.text.inverse,
              border: 'none',
              borderRadius: draftingRadius.soft,
              padding: '8px 16px',
              fontWeight: 600,
              cursor: busy || !description.trim() ? 'not-allowed' : 'pointer'
            }}
          >
            {busy ? 'Designing it…' : 'Ask AI to design it'}
          </button>
        ) : (
          <div>
            <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: P.text.muted }}>
              No AI model is set up. Paste a contract below, or set one up: sign in with OpenRouter to
              design here, or use Claude Desktop over MCP on your subscription.
            </p>
            {onChooseAssistant && (
          <button
            type="button"
            onClick={onChooseAssistant}
            style={{
              marginTop: 10,
              background: P.jade[600],
              color: P.text.inverse,
              border: 'none',
              borderRadius: draftingRadius.soft,
              padding: '8px 16px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Connect an AI model
          </button>
            )}
          </div>
        )}
        {progress.length > 0 && (
          <ol aria-live="polite" style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: '0.76rem', color: P.text.secondary }}>
            {progress.map((note, i) => (
              <li key={i} style={{ marginTop: 2 }}>{note}</li>
            ))}
          </ol>
        )}
        {proposeError && (
          <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: D.semantic.violation }}>
            {proposeError}
          </p>
        )}
      </div>
      )}

      <details
        open={route !== 'claude-desktop' || draft.trim().length > 0}
        style={{ ...card, padding: route === 'claude-desktop' ? '10px 14px' : 14 }}
      >
        <summary style={{ ...labelStyle, cursor: 'pointer', listStyle: route === 'claude-desktop' ? 'revert' : 'none', marginBottom: 6 }}>
          {route === 'claude-desktop' ? 'Have the contract as JSON? Paste it to check it here' : 'Proposed contract (JSON)'}
        </summary>
        <textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOverrides({});
          }}
          placeholder='{ "contractVersion": 1, "id": "...", ... }'
          rows={8}
          spellCheck={false}
          style={{
            width: '100%',
            background: P.background.surfaceMuted,
            color: P.text.primary,
            border: `1px solid ${jsonBroken ? D.semantic.violation : P.background.surfaceHover}`,
            borderRadius: draftingRadius.soft,
            padding: 10,
            fontSize: '0.76rem',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            resize: 'vertical',
            boxSizing: 'border-box'
          }}
        />
        {jsonBroken && (
          <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: D.semantic.violation }}>
            Not valid JSON yet.
          </p>
        )}
      </details>

      {(route !== 'claude-desktop' || draft.trim().length > 0) && (
      <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <GateBadge state={gateState(reviewState, 'schema')} label="Schema" />
        <GateBadge state={gateState(reviewState, 'static')} label="References resolve" />
        <GateBadge state={gateState(reviewState, 'physical')} label="Physically valid" />
        <GateBadge state={gateState(reviewState, 'drawing')} label="Drawn and pipeable" />
      </div>

      {reviewState.schemaErrors.length > 0 && (
        <div style={{ ...card, borderColor: D.semantic.violation }}>
          <div style={labelStyle}>Schema problems</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.8rem', color: P.text.secondary }}>
            {reviewState.schemaErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {reviewState.staticIssues.length > 0 && (
        <div style={{ ...card, borderColor: D.semantic.violation }}>
          <div style={labelStyle}>Unresolved references</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.8rem', color: P.text.secondary }}>
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
          <p style={{ margin: 0, fontSize: '0.8rem', color: P.text.secondary }}>
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
                <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: P.text.muted }}>
                  Drawn by the contract. Pipes attach at the {figure.layout.anchors.filter((a) => a.nozzle).length} nozzles shown.
                </p>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: '0.8rem', color: P.text.secondary }}>
                This contract has no drawing, so it will appear as a generic vessel with its connections along the edges.
              </p>
            )}
            {reviewState.drawingCheck && reviewState.drawingCheck.errors.length > 0 && (
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: '0.8rem', color: D.semantic.violation }}>
                {reviewState.drawingCheck.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            {reviewState.drawingCheck && reviewState.drawingCheck.warnings.length > 0 && (
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: '0.8rem', color: P.text.secondary }}>
                {reviewState.drawingCheck.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </div>

          <div style={card}>
            <div style={labelStyle}>Parameters — edit to ask “what if?”</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {reviewState.contract!.parameters.map((p) => {
                const current = overrides[p.name] ?? p.value;
                const outOfBounds =
                  (p.min !== undefined && current < p.min) ||
                  (p.max !== undefined && current > p.max);
                return (
                  <div
                    key={p.name}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem' }}
                  >
                    <span style={{ flex: 1, color: P.text.secondary }}>{p.label}</span>
                    <input
                      type="number"
                      value={current}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setOverrides((o) =>
                          Number.isFinite(v) ? { ...o, [p.name]: v } : o
                        );
                      }}
                      style={{
                        width: 96,
                        background: P.background.surfaceMuted,
                        color: outOfBounds ? D.semantic.violation : P.text.primary,
                        border: `1px solid ${outOfBounds ? D.semantic.violation : P.background.surfaceHover}`,
                        borderRadius: draftingRadius.soft,
                        padding: '4px 6px',
                        textAlign: 'right'
                      }}
                    />
                    <span style={{ width: 72, color: P.text.muted }}>{p.unit}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={card}>
            <div style={labelStyle}>Computed by the engine</div>
            <div style={{ display: 'grid', gap: 4 }}>
              {reviewState.contract!.derived.map((d) => (
                <div
                  key={d.name}
                  style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}
                >
                  <span style={{ color: P.text.secondary }}>{d.label}</span>
                  <span style={{ color: P.text.accent, ...D.data }}>
                    {Number(evaluation.derived[d.name] ?? 0).toLocaleString(undefined, {
                      maximumFractionDigits: 3
                    })}{' '}
                    <span style={{ color: P.text.muted }}>{d.unit}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={card}>
            <div style={labelStyle}>Physical checks</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {evaluation.constraints.map((c) => {
                const ok = c.satisfied;
                const color = ok
                  ? P.jade[400]
                  : c.severity === 'ERROR'
                    ? D.semantic.violation
                    : P.text.gold;
                return (
                  <div key={c.id} style={{ display: 'flex', gap: 8, fontSize: '0.78rem' }}>
                    <span style={{ color, fontWeight: 700 }}>{ok ? '✓' : '✕'}</span>
                    <div>
                      <div style={{ color: ok ? P.text.secondary : color }}>
                        {ok ? c.id : c.message}
                      </div>
                      {!ok && c.hint && (
                        <div style={{ color: P.text.muted, marginTop: 2 }}>Try: {c.hint}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 'auto' }}>
        <button
          disabled={!accepted}
          onClick={() => {
            const contract = reviewState.contract;
            if (!contract) return;
            // Add the design the gates actually passed, with the engineer's
            // "what if?" edits folded in.
            onAccept({
              ...contract,
              parameters: contract.parameters.map((p) =>
                overrides[p.name] === undefined ? p : { ...p, value: overrides[p.name]! }
              )
            });
          }}
          style={{
            background: accepted ? P.jade[600] : P.background.surfaceHover,
            color: accepted ? P.text.inverse : P.text.muted,
            border: 'none',
            borderRadius: draftingRadius.soft,
            padding: '10px 20px',
            fontWeight: 700,
            cursor: accepted ? 'pointer' : 'not-allowed'
          }}
        >
          Add to flowsheet
        </button>
        <span style={{ fontSize: '0.76rem', color: P.text.muted }}>
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
