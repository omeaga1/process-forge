import { parseExpression, type Ast } from './expression.js';

/**
 * A contract expression as an engineer reads it: `hydraulicKw / efficiency`
 * becomes "Hydraulic power ÷ Pump efficiency", with each name a token the
 * panel can show the value of. Pure and structural: the tokens are exactly
 * the expression, with the fewest brackets its precedence needs.
 */

export type ExprToken =
  | { t: 'name'; name: string }
  | { t: 'num'; text: string }
  | { t: 'op'; text: string; unary?: boolean }
  | { t: 'fn'; text: string }
  | { t: 'paren'; text: '(' | ')' }
  | { t: 'sep'; text: string }
  | { t: 'sup'; tokens: ExprToken[] };

const PREC: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '<': 3,
  '<=': 3,
  '>': 3,
  '>=': 3,
  '==': 3,
  '!=': 3,
  '+': 4,
  '-': 4,
  '*': 5,
  '/': 5,
  '%': 5,
  '^': 7
};

const OP_TEXT: Record<string, string> = {
  '||': 'or',
  '&&': 'and',
  '<': '<',
  '<=': '≤',
  '>': '>',
  '>=': '≥',
  '==': '=',
  '!=': '≠',
  '+': '+',
  '-': '−',
  '*': '×',
  '/': '÷',
  '%': 'mod'
};

const FN_TEXT: Record<string, string> = {
  sqrt: '√',
  abs: 'abs',
  log: 'ln',
  log10: 'log₁₀',
  exp: 'exp'
};

function num(v: number): string {
  if (Number.isInteger(v) && Math.abs(v) < 1e7) return v.toLocaleString('en-US').replace(/,/g, ' ');
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e7)) {
    const [m, e] = v.toExponential().split('e');
    return `${Number(Number(m).toPrecision(6))}×10${toSuper(e!.replace('+', ''))}`;
  }
  return String(Number(v.toPrecision(8)));
}

const SUPER: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const toSuper = (s: string) => s.split('').map((c) => SUPER[c] ?? c).join('');

function precOf(n: Ast): number {
  if (n.k === 'bin') return PREC[n.op] ?? 0;
  if (n.k === 'unary') return 6;
  return 9;
}

function walk(n: Ast, out: ExprToken[]): void {
  switch (n.k) {
    case 'num':
      out.push({ t: 'num', text: num(n.v) });
      return;
    case 'ref':
      out.push({ t: 'name', name: n.name });
      return;
    case 'unary': {
      out.push({ t: 'op', text: n.op === '!' ? 'not ' : '−', unary: true });
      const wrap = precOf(n.a) < 6;
      if (wrap) out.push({ t: 'paren', text: '(' });
      walk(n.a, out);
      if (wrap) out.push({ t: 'paren', text: ')' });
      return;
    }
    case 'bin': {
      const p = PREC[n.op] ?? 0;
      if (n.op === '^') {
        const wrap = precOf(n.a) <= p;
        if (wrap) out.push({ t: 'paren', text: '(' });
        walk(n.a, out);
        if (wrap) out.push({ t: 'paren', text: ')' });
        const sup: ExprToken[] = [];
        walk(n.b, sup);
        out.push({ t: 'sup', tokens: sup });
        return;
      }
      const left = precOf(n.a) < p;
      // The right side of − and ÷ needs brackets at equal precedence: a − (b − c).
      const right = precOf(n.b) < p || (precOf(n.b) === p && (n.op === '-' || n.op === '/' || n.op === '%'));
      if (left) out.push({ t: 'paren', text: '(' });
      walk(n.a, out);
      if (left) out.push({ t: 'paren', text: ')' });
      out.push({ t: 'op', text: OP_TEXT[n.op] ?? n.op });
      if (right) out.push({ t: 'paren', text: '(' });
      walk(n.b, out);
      if (right) out.push({ t: 'paren', text: ')' });
      return;
    }
    case 'call': {
      if (n.name === 'if' && n.args.length === 3) {
        out.push({ t: 'fn', text: 'if ' });
        walk(n.args[0]!, out);
        out.push({ t: 'sep', text: ' then ' });
        walk(n.args[1]!, out);
        out.push({ t: 'sep', text: ' else ' });
        walk(n.args[2]!, out);
        return;
      }
      if (n.name === 'pow' && n.args.length === 2) {
        const wrap = precOf(n.args[0]!) <= 7;
        if (wrap) out.push({ t: 'paren', text: '(' });
        walk(n.args[0]!, out);
        if (wrap) out.push({ t: 'paren', text: ')' });
        const sup: ExprToken[] = [];
        walk(n.args[1]!, sup);
        out.push({ t: 'sup', tokens: sup });
        return;
      }
      out.push({ t: 'fn', text: FN_TEXT[n.name] ?? n.name });
      out.push({ t: 'paren', text: '(' });
      n.args.forEach((a, i) => {
        if (i) out.push({ t: 'sep', text: ', ' });
        walk(a, out);
      });
      out.push({ t: 'paren', text: ')' });
      return;
    }
  }
}

/** The expression as display tokens, or null when it does not parse. */
export function formatExpression(expr: string): ExprToken[] | null {
  try {
    const out: ExprToken[] = [];
    walk(parseExpression(expr), out);
    return out;
  } catch {
    return null;
  }
}

/** Plain text, with names replaced by `label(name)` (for tests, tooltips and MCP text). */
export function expressionText(expr: string, label: (name: string) => string = (n) => n): string {
  const toks = formatExpression(expr);
  if (!toks) return expr;
  const text = (ts: ExprToken[]): string =>
    ts
      .map((t) => {
        switch (t.t) {
          case 'name':
            return label(t.name);
          case 'op':
            return t.unary ? t.text : ` ${t.text} `;
          case 'sup':
            return `^${text(t.tokens)}`;
          default:
            return t.text;
        }
      })
      .join('');
  return text(toks).replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')').trim();
}
