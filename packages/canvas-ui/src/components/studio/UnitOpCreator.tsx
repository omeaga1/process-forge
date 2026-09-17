import { useMemo, useState, useCallback } from 'react';
import {
  UnitOpContractSchema,
  validateUnitOpContract,
  evaluateUnitOp,
  blockingViolations,
  synthesizeEquipmentDrawing,
  type UnitOpContract,
  type UnitOpEvaluation,
  type ContractValidationIssue
} from '@process-forge/protocol';
import { OsakaJadePalette as P } from '@process-forge/theme';

/**
 * The unit-op creator: where an engineer describes a unit operation that does
 * not exist yet, a sub-agent designs it, and the ENGINE decides whether it is
 * real before it is allowed onto the canvas.
 *
 * The important property of this panel is that nothing it shows is decorative.
 * Every derived number comes from evaluateUnitOp(), and every pass/fail badge
 * is a constraint the engine actually evaluated. There is no place in this
 * component where a validation result is written by hand -- which is the
 * failure mode the audit found in the previous sub-agent surface, where a
 * `status: 'PASS'` badge was a string literal.
 *
 * Contract authoring is injected via `onPropose`. When the host app supplies it
 * (wired to the LLM client, or to an MCP round-trip), the engineer can describe
 * and receive. When it is absent the panel falls back to paste-in, which is the
 * honest default for a BYO-subscription product: the engineer's own MCP client
 * authors the contract and they paste the result here.
 */

export interface UnitOpCreatorProcessContext {
  upstream?: string;
  downstream?: string;
  inletTemperatureC?: number;
}

export interface UnitOpCreatorProps {
  /** Authors a contract from the engineer's description. Omit for paste-in mode. */
  onPropose?: (description: string) => Promise<UnitOpContract | string>;
  /** Called with a contract that passed every gate. */
  onAccept: (contract: UnitOpContract) => void;
  onClose?: () => void;
  processContext?: UnitOpCreatorProcessContext;
  initialDescription?: string;
}

type Gate = 'schema' | 'static' | 'physical';

interface ReviewState {
  contract?: UnitOpContract;
  schemaErrors: string[];
  staticIssues: ContractValidationIssue[];
  evaluation?: UnitOpEvaluation;
}

const EMPTY_REVIEW: ReviewState = { schemaErrors: [], staticIssues: [] };

/** Runs the same three gates the MCP validate_unit_op tool runs. */
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
    evaluation: evaluateUnitOp(contract, { parameterOverrides: overrides })
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
  if (!r.evaluation) return 'pending';
  if (r.evaluation.error) return 'fail';
  return blockingViolations(r.evaluation).length === 0 ? 'pass' : 'fail';
}

const card: React.CSSProperties = {
  background: P.background.surfaceElevated,
  border: `1px solid ${P.background.surfaceHover}`,
  borderRadius: 8,
  padding: 14
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: P.text.muted,
  marginBottom: 6
};

function GateBadge({ state, label }: { state: 'pass' | 'fail' | 'pending'; label: string }) {
  const color =
    state === 'pass' ? P.jade[400] : state === 'fail' ? P.border.glowAmber : P.text.muted;
  const glyph = state === 'pass' ? '✓' : state === 'fail' ? '✕' : '·';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        border: `1px solid ${color}`,
        color,
        fontSize: '0.74rem',
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
  onAccept,
  onClose,
  processContext,
  initialDescription = ''
}: UnitOpCreatorProps) {
  const [description, setDescription] = useState(initialDescription);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposeError, setProposeError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, number>>({});

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

  const drawing = useMemo(() => {
    if (!description.trim()) return null;
    try {
      return synthesizeEquipmentDrawing(description, {
        machineName: reviewState.contract?.name
      });
    } catch {
      return null;
    }
  }, [description, reviewState.contract?.name]);

  const accepted =
    gateState(reviewState, 'schema') === 'pass' &&
    gateState(reviewState, 'static') === 'pass' &&
    gateState(reviewState, 'physical') === 'pass';

  const handlePropose = useCallback(async () => {
    if (!onPropose || !description.trim()) return;
    setBusy(true);
    setProposeError(null);
    try {
      const result = await onPropose(description);
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
            Describe the equipment. The sub-agent designs it; the engine decides whether it is
            physically real.
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: `1px solid ${P.background.surfaceHover}`,
              color: P.text.secondary,
              borderRadius: 6,
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
            borderRadius: 6,
            padding: 10,
            fontSize: '0.85rem',
            resize: 'vertical',
            boxSizing: 'border-box'
          }}
        />
        {onPropose ? (
          <button
            onClick={handlePropose}
            disabled={busy || !description.trim()}
            style={{
              marginTop: 10,
              background: busy ? P.background.surfaceHover : P.jade[600],
              color: P.text.inverse,
              border: 'none',
              borderRadius: 6,
              padding: '8px 16px',
              fontWeight: 600,
              cursor: busy || !description.trim() ? 'not-allowed' : 'pointer'
            }}
          >
            {busy ? 'Sub-agent designing…' : 'Ask the sub-agent to design it'}
          </button>
        ) : (
          <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: P.text.muted }}>
            No model is wired into this panel. Author the contract in your own MCP client using{' '}
            <code style={{ color: P.text.accent }}>design_unit_op</code>, then paste the result
            below.
          </p>
        )}
        {proposeError && (
          <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: P.border.glowAmber }}>
            {proposeError}
          </p>
        )}
      </div>

      <div style={card}>
        <div style={labelStyle}>Proposed contract (JSON)</div>
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
            border: `1px solid ${jsonBroken ? P.border.glowAmber : P.background.surfaceHover}`,
            borderRadius: 6,
            padding: 10,
            fontSize: '0.76rem',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            resize: 'vertical',
            boxSizing: 'border-box'
          }}
        />
        {jsonBroken && (
          <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: P.border.glowAmber }}>
            Not valid JSON yet.
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <GateBadge state={gateState(reviewState, 'schema')} label="Schema" />
        <GateBadge state={gateState(reviewState, 'static')} label="References resolve" />
        <GateBadge state={gateState(reviewState, 'physical')} label="Physically valid" />
      </div>

      {reviewState.schemaErrors.length > 0 && (
        <div style={{ ...card, borderColor: P.border.glowAmber }}>
          <div style={labelStyle}>Schema problems</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.8rem', color: P.text.secondary }}>
            {reviewState.schemaErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {reviewState.staticIssues.length > 0 && (
        <div style={{ ...card, borderColor: P.border.glowAmber }}>
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
        <div style={{ ...card, borderColor: P.border.glowAmber }}>
          <div style={labelStyle}>Evaluation failed</div>
          <p style={{ margin: 0, fontSize: '0.8rem', color: P.text.secondary }}>
            <code style={{ color: P.text.accent }}>{evaluation.error.path}</code> —{' '}
            {evaluation.error.message}
          </p>
        </div>
      )}

      {evaluation && !evaluation.error && (
        <>
          {drawing && (
            <div style={card}>
              <div style={labelStyle}>Rendered component</div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  padding: 8,
                  background: P.background.surfaceMuted,
                  borderRadius: 6
                }}
              >
                <svg
                  viewBox={drawing.viewBox}
                  preserveAspectRatio="xMidYMid meet"
                  style={{ width: 160, height: 120 }}
                  aria-label={drawing.label}
                >
                  <g
                    fill="rgba(16, 185, 129, 0.08)"
                    stroke={P.jade[400]}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dangerouslySetInnerHTML={{ __html: drawing.svgShell }}
                  />
                  {drawing.svgDetails && (
                    <g
                      fill="none"
                      stroke={P.streams.continuousFluid}
                      strokeWidth={1.2}
                      opacity={0.8}
                      dangerouslySetInnerHTML={{ __html: drawing.svgDetails }}
                    />
                  )}
                </svg>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: P.text.muted }}>
                {drawing.label} — template match from the ISA-5.1 library, not a generated drawing.
              </p>
            </div>
          )}

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
                        color: outOfBounds ? P.border.glowAmber : P.text.primary,
                        border: `1px solid ${outOfBounds ? P.border.glowAmber : P.background.surfaceHover}`,
                        borderRadius: 4,
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
                  <span style={{ color: P.text.accent, fontVariantNumeric: 'tabular-nums' }}>
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
                    ? P.border.glowAmber
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
          onClick={() => reviewState.contract && onAccept(reviewState.contract)}
          style={{
            background: accepted ? P.jade[600] : P.background.surfaceHover,
            color: accepted ? P.text.inverse : P.text.muted,
            border: 'none',
            borderRadius: 6,
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
    </div>
  );
}
