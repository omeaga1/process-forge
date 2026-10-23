import React from 'react';
import { CheckCircle2, AlertTriangle, History } from 'lucide-react';
import type { PlanReceipt } from '@process-forge/tools';
import { tint } from '@process-forge/theme';
import { useTheme } from '../hooks/useTheme.js';
import { requestRestore } from './checkpoints.js';

const fmt = (v: unknown, digits = 1) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—');
const show = (v: unknown) => (typeof v === 'number' ? fmt(v, 3) : typeof v === 'string' ? v : JSON.stringify(v));

/**
 * The run evidence for a plan that landed on the flowsheet: what changed,
 * how a run of the line moved (same seed before and after), whether the
 * flowsheet read back shows every change, and a way back to the flowsheet as
 * it was. The same record Claude sees, drawn for the engineer.
 */
export const PlanReceiptCard: React.FC<{ receipt: PlanReceipt; source?: string }> = ({ receipt, source }) => {
  const { palette, font, radius: r } = useTheme();
  const { diff, run, readBack, restorePoint } = receipt;
  const verified = readBack ? readBack.verified : true;
  const tone = verified ? palette.jade.glow : palette.status.blocked;

  const lines: { sign: '+' | '−' | '~'; text: React.ReactNode }[] = [
    ...diff.unitsAdded.map((u) => ({ sign: '+' as const, text: <>Added {u}</> })),
    ...diff.unitsRemoved.map((u) => ({ sign: '−' as const, text: <>Removed {u}</> })),
    ...diff.streamsAdded.map((s) => ({ sign: '+' as const, text: <>Piped {s}</> })),
    ...diff.streamsRemoved.map((s) => ({ sign: '−' as const, text: <>Unpiped {s}</> })),
    ...diff.settingsChanged.map((u) => ({
      sign: '~' as const,
      text: (
        <>
          {u.unit}:{' '}
          {u.changes.map((c, i) => (
            <span key={c.setting}>
              {i > 0 && '; '}
              {c.setting} <s style={{ color: palette.text.muted }}>{show(c.from)}</s> → {show(c.to)}
            </span>
          ))}
        </>
      )
    }))
  ];
  const signColor = { '+': palette.jade.glow, '−': palette.status.failed, '~': palette.text.secondary };

  const some = (a?: number, b?: number) => Boolean(a) || Boolean(b);
  const tile = (label: string, before: string, after: string, unit = '', wide = false) => (
    <div key={label} style={{ gridColumn: wide ? '1 / -1' : undefined, minWidth: 0, padding: '6px 8px', borderRadius: r.md, border: `1px solid ${palette.border.subtle}`, background: palette.background.base }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: palette.text.muted }}>{label}</div>
      <div style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 600, color: palette.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {after}
        {unit && <span style={{ fontSize: 10, fontWeight: 400, color: palette.text.muted, marginLeft: 3 }}>{unit}</span>}
      </div>
      <div style={{ fontSize: 10, color: palette.text.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{before === after ? 'unchanged' : `was ${before}`}</div>
    </div>
  );

  return (
    <section
      aria-label="Plan receipt"
      data-testid="plan-receipt"
      style={{ padding: 10, borderRadius: r.lg, border: `1px solid ${tint(tone, 0.45)}`, background: palette.background.surface, display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {verified ? <CheckCircle2 size={14} color={tone} /> : <AlertTriangle size={14} color={tone} />}
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: tone }}>
          {verified ? 'Plan applied' : 'Plan applied · check it'}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: palette.text.muted, fontFamily: font.mono }}>
          {source ? `${source} · ` : ''}
          {new Date(receipt.appliedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {lines.length > 0 ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {lines.slice(0, 8).map((l, i) => (
            <li key={i} style={{ display: 'flex', gap: 6, fontSize: 12, lineHeight: 1.4, color: palette.text.primary }}>
              <span style={{ width: 10, flexShrink: 0, fontFamily: font.mono, fontWeight: 700, color: signColor[l.sign] }}>{l.sign}</span>
              <span style={{ minWidth: 0 }}>{l.text}</span>
            </li>
          ))}
          {lines.length > 8 && <li style={{ fontSize: 11, color: palette.text.muted, paddingLeft: 16 }}>and {lines.length - 8} more</li>}
        </ul>
      ) : (
        <div style={{ fontSize: 12, color: palette.text.muted }}>No change to units or streams.</div>
      )}

      <div>
        <div style={{ fontSize: 10, color: palette.text.muted, marginBottom: 4 }}>
          A {run.minutes}-minute run, before and after, on the same seed
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 6 }}>
          {tile('Status', run.before.status, run.after.status)}
          {/* Items for a packaging line, kilograms for a liquid one; a line that makes neither shows both. */}
          {(some(run.before.unitsPerMinute, run.after.unitsPerMinute) || !some(run.before.liquidOutKg, run.after.liquidOutKg)) &&
            tile('Output', fmt(run.before.unitsPerMinute), fmt(run.after.unitsPerMinute), '/min')}
          {(some(run.before.liquidOutKg, run.after.liquidOutKg) || !some(run.before.unitsPerMinute, run.after.unitsPerMinute)) &&
            tile('Liquid out', fmt(run.before.liquidOutKg, 0), fmt(run.after.liquidOutKg, 0), 'kg')}
          {tile('Bottleneck', run.before.bottleneck ?? 'none', run.after.bottleneck ?? 'none', '', true)}
        </div>
      </div>

      {receipt.staticCheck.newErrors.length > 0 && (
        <div style={{ fontSize: 11, color: palette.status.failed, lineHeight: 1.4 }}>New check errors: {receipt.staticCheck.newErrors.join('; ')}</div>
      )}
      {readBack && !readBack.verified && (
        <div style={{ fontSize: 11, color: palette.status.blocked, lineHeight: 1.4 }}>
          The flowsheet read back does not show every planned change.
          {'missingUnits' in readBack && readBack.missingUnits?.length ? ` Missing: ${readBack.missingUnits.join(', ')}.` : ''}
        </div>
      )}

      {restorePoint && (
        <button
          type="button"
          className="pf-focus"
          onClick={() => requestRestore(restorePoint.id)}
          title={`Go back to “${restorePoint.label}”. The flowsheet as it is now is kept too.`}
          style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: r.md, border: `1px solid ${palette.border.default}`, background: 'transparent', color: palette.text.secondary, fontSize: 11, cursor: 'pointer' }}
        >
          <History size={12} /> Go back to before this plan
        </button>
      )}
    </section>
  );
};
