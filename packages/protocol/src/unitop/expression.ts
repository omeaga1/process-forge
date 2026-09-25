/**
 * A deliberately small, total expression language for unit-op contracts.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT `eval`:
 *
 * A unit-op contract is authored by a model (a sub-agent) and executed by the
 * engine. If the model emitted JavaScript, three things would break at once:
 *
 *   1. Determinism. Arbitrary code can read the clock, call Math.random(), or
 *      close over mutable state. The engine's reproducibility guarantee would
 *      no longer be something the engine can enforce.
 *   2. Auditability. An engineer reviewing a generated unit op needs to read
 *      what it computes. An expression is readable; a closure is not.
 *   3. The ADR-0002 line. "The LLM compiles declarative configs; the
 *      deterministic engine executes the math." Generated code moves the math
 *      back into the model.
 *
 * So the model emits expressions over declared parameters, and this evaluator
 * is the only thing that runs them. It has no I/O, no assignment, no loops, no
 * property access beyond dotted name lookup in an explicit scope, and a fixed
 * function whitelist. Every function here is a pure function of its arguments.
 *
 * Grammar (precedence low to high):
 *
 *   or      := and ( '||' and )*
 *   and     := cmp ( '&&' cmp )*
 *   cmp     := sum ( ('<'|'<='|'>'|'>='|'=='|'!=') sum )?
 *   sum     := product ( ('+'|'-') product )*
 *   product := unary ( ('*'|'/'|'%') unary )*
 *   unary   := ('-'|'!') unary | power
 *   power   := primary ( '^' unary )?          // right associative
 *   primary := number | identifier | call | '(' or ')'
 *   call    := identifier '(' ( or ( ',' or )* )? ')'
 */

export type ExprValue = number | boolean;

export interface ExprScope {
  [key: string]: ExprValue | ExprScope;
}

// ---------------------------------------------------------------- tokenizer

type TokenType = 'num' | 'ident' | 'op' | 'lparen' | 'rparen' | 'comma' | 'eof';

interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

const OPERATORS = [
  '<=', '>=', '==', '!=', '&&', '||',
  '+', '-', '*', '/', '%', '^', '<', '>', '!'
];

export class ExpressionError extends Error {
  constructor(message: string, readonly expression: string, readonly position?: number) {
    super(
      position === undefined
        ? `${message} in "${expression}"`
        : `${message} at position ${position} in "${expression}"`
    );
    this.name = 'ExpressionError';
  }
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < src.length) {
    const c = src[i] as string;

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }

    if (c >= '0' && c <= '9') {
      let j = i;
      while (j < src.length && /[0-9]/.test(src[j] as string)) j++;
      if (src[j] === '.') {
        j++;
        while (j < src.length && /[0-9]/.test(src[j] as string)) j++;
      }
      if (src[j] === 'e' || src[j] === 'E') {
        let k = j + 1;
        if (src[k] === '+' || src[k] === '-') k++;
        if (k < src.length && /[0-9]/.test(src[k] as string)) {
          k++;
          while (k < src.length && /[0-9]/.test(src[k] as string)) k++;
          j = k;
        }
      }
      tokens.push({ type: 'num', value: src.slice(i, j), pos: i });
      i = j;
      continue;
    }

    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_.]/.test(src[j] as string)) j++;
      tokens.push({ type: 'ident', value: src.slice(i, j), pos: i });
      i = j;
      continue;
    }

    if (c === '(') { tokens.push({ type: 'lparen', value: c, pos: i }); i++; continue; }
    if (c === ')') { tokens.push({ type: 'rparen', value: c, pos: i }); i++; continue; }
    if (c === ',') { tokens.push({ type: 'comma', value: c, pos: i }); i++; continue; }

    const two = src.slice(i, i + 2);
    const op = OPERATORS.includes(two) ? two : OPERATORS.includes(c) ? c : null;
    if (op) {
      tokens.push({ type: 'op', value: op, pos: i });
      i += op.length;
      continue;
    }

    throw new ExpressionError(`Unexpected character "${c}"`, src, i);
  }

  tokens.push({ type: 'eof', value: '', pos: src.length });
  return tokens;
}

// ------------------------------------------------------------------- parser

export type Ast =
  | { k: 'num'; v: number }
  | { k: 'ref'; name: string; pos: number }
  | { k: 'unary'; op: string; a: Ast; pos: number }
  | { k: 'bin'; op: string; a: Ast; b: Ast; pos: number }
  | { k: 'call'; name: string; args: Ast[]; pos: number };

class Parser {
  private i = 0;
  constructor(private readonly tokens: Token[], private readonly src: string) {}

  private peek(): Token {
    return this.tokens[this.i] as Token;
  }

  private eat(type: TokenType, value?: string): Token {
    const t = this.peek();
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      throw new ExpressionError(
        `Expected ${value ?? type} but found ${t.value || t.type}`,
        this.src,
        t.pos
      );
    }
    this.i++;
    return t;
  }

  private matchOp(...ops: string[]): Token | null {
    const t = this.peek();
    if (t.type === 'op' && ops.includes(t.value)) {
      this.i++;
      return t;
    }
    return null;
  }

  parse(): Ast {
    const node = this.or();
    const t = this.peek();
    if (t.type !== 'eof') {
      throw new ExpressionError(`Unexpected trailing "${t.value}"`, this.src, t.pos);
    }
    return node;
  }

  private or(): Ast {
    let a = this.and();
    let t: Token | null;
    while ((t = this.matchOp('||'))) a = { k: 'bin', op: '||', a, b: this.and(), pos: t.pos };
    return a;
  }

  private and(): Ast {
    let a = this.cmp();
    let t: Token | null;
    while ((t = this.matchOp('&&'))) a = { k: 'bin', op: '&&', a, b: this.cmp(), pos: t.pos };
    return a;
  }

  private cmp(): Ast {
    const a = this.sum();
    const t = this.matchOp('<', '<=', '>', '>=', '==', '!=');
    if (!t) return a;
    return { k: 'bin', op: t.value, a, b: this.sum(), pos: t.pos };
  }

  private sum(): Ast {
    let a = this.product();
    let t: Token | null;
    while ((t = this.matchOp('+', '-'))) a = { k: 'bin', op: t.value, a, b: this.product(), pos: t.pos };
    return a;
  }

  private product(): Ast {
    let a = this.unary();
    let t: Token | null;
    while ((t = this.matchOp('*', '/', '%'))) a = { k: 'bin', op: t.value, a, b: this.unary(), pos: t.pos };
    return a;
  }

  private unary(): Ast {
    const t = this.matchOp('-', '!');
    if (t) return { k: 'unary', op: t.value, a: this.unary(), pos: t.pos };
    return this.power();
  }

  private power(): Ast {
    const base = this.primary();
    const t = this.matchOp('^');
    if (!t) return base;
    // right associative: 2^3^2 == 2^(3^2)
    return { k: 'bin', op: '^', a: base, b: this.unary(), pos: t.pos };
  }

  private primary(): Ast {
    const t = this.peek();

    if (t.type === 'num') {
      this.i++;
      return { k: 'num', v: Number(t.value) };
    }

    if (t.type === 'ident') {
      this.i++;
      if (this.peek().type === 'lparen') {
        this.eat('lparen');
        const args: Ast[] = [];
        if (this.peek().type !== 'rparen') {
          args.push(this.or());
          while (this.peek().type === 'comma') {
            this.eat('comma');
            args.push(this.or());
          }
        }
        this.eat('rparen');
        return { k: 'call', name: t.value, args, pos: t.pos };
      }
      return { k: 'ref', name: t.value, pos: t.pos };
    }

    if (t.type === 'lparen') {
      this.eat('lparen');
      const node = this.or();
      this.eat('rparen');
      return node;
    }

    throw new ExpressionError(`Unexpected ${t.value || t.type}`, this.src, t.pos);
  }
}

// ---------------------------------------------------------------- functions

/**
 * The complete set of callable functions. Every one is a pure, total function
 * of its arguments. Nothing here reads the clock, the filesystem, or any
 * ambient state. Adding a function to this table is the only way to widen what
 * a contract can compute.
 */
export const EXPRESSION_FUNCTIONS: Record<string, { arity: number | [number, number]; fn: (...a: number[]) => number }> = {
  min: { arity: [2, 8], fn: (...a) => Math.min(...a) },
  max: { arity: [2, 8], fn: (...a) => Math.max(...a) },
  abs: { arity: 1, fn: (a) => Math.abs(a as number) },
  sqrt: { arity: 1, fn: (a) => Math.sqrt(a as number) },
  floor: { arity: 1, fn: (a) => Math.floor(a as number) },
  ceil: { arity: 1, fn: (a) => Math.ceil(a as number) },
  round: { arity: 1, fn: (a) => Math.round(a as number) },
  clamp: { arity: 3, fn: (v, lo, hi) => Math.min(Math.max(v as number, lo as number), hi as number) },
  pow: { arity: 2, fn: (a, b) => Math.pow(a as number, b as number) },
  log: { arity: 1, fn: (a) => Math.log(a as number) },
  log10: { arity: 1, fn: (a) => Math.log10(a as number) },
  exp: { arity: 1, fn: (a) => Math.exp(a as number) },
  sign: { arity: 1, fn: (a) => Math.sign(a as number) },
  /**
   * Piecewise-linear lookup: interp(x, x1, y1, x2, y2, ...), with the x values
   * ascending. Clamped at both ends, so a table never extrapolates.
   */
  interp: { arity: [5, 41], fn: interpolate }
};

/**
 * Names that look like functions but are not in the table because their
 * arguments are not all evaluated. `if(cond, a, b)` evaluates only the branch
 * it takes, so `if(flow > 0, duty / flow, 0)` is safe at zero flow.
 */
export const EXPRESSION_SPECIAL_FORMS = ['if'] as const;

function interpolate(...a: number[]): number {
  const [x, ...pts] = a as [number, ...number[]];
  if (pts.length % 2 !== 0) throw new Error('interp takes x, then pairs of x and y');
  const n = pts.length / 2;
  for (let i = 1; i < n; i++) {
    if (!(pts[2 * i]! > pts[2 * (i - 1)]!)) throw new Error('interp needs its x values in ascending order');
  }
  if (x <= pts[0]!) return pts[1]!;
  for (let i = 1; i < n; i++) {
    const x0 = pts[2 * (i - 1)]!;
    const y0 = pts[2 * (i - 1) + 1]!;
    const x1 = pts[2 * i]!;
    const y1 = pts[2 * i + 1]!;
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return pts[2 * n - 1]!;
}

export const EXPRESSION_CONSTANTS: Record<string, number> = {
  PI: Math.PI,
  E: Math.E
};

// -------------------------------------------------------------- evaluation

function lookup(scope: ExprScope, path: string, src: string, pos: number): ExprValue {
  if (path in EXPRESSION_CONSTANTS) return EXPRESSION_CONSTANTS[path] as number;

  const parts = path.split('.');
  let cur: ExprValue | ExprScope | undefined = scope;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') {
      throw new ExpressionError(`Unknown reference "${path}"`, src, pos);
    }
    cur = (cur as ExprScope)[part];
  }

  if (cur === undefined || cur === null) {
    throw new ExpressionError(`Unknown reference "${path}"`, src, pos);
  }
  if (typeof cur === 'object') {
    throw new ExpressionError(`Reference "${path}" is a group, not a value`, src, pos);
  }
  return cur;
}

function asNumber(v: ExprValue, src: string, pos: number): number {
  if (typeof v !== 'number') {
    throw new ExpressionError(`Expected a number but got a boolean`, src, pos);
  }
  if (!Number.isFinite(v)) {
    throw new ExpressionError(`Expression produced ${v}`, src, pos);
  }
  return v;
}

function evalAst(node: Ast, scope: ExprScope, src: string): ExprValue {
  switch (node.k) {
    case 'num':
      return node.v;

    case 'ref':
      return lookup(scope, node.name, src, node.pos);

    case 'unary': {
      const a = evalAst(node.a, scope, src);
      if (node.op === '!') return !(a as boolean);
      return -asNumber(a, src, node.pos);
    }

    case 'bin': {
      // Short-circuit so that e.g. `rate > 0 && duty / rate < 5` is safe.
      if (node.op === '&&') {
        return (evalAst(node.a, scope, src) as boolean) ? (evalAst(node.b, scope, src) as boolean) : false;
      }
      if (node.op === '||') {
        return (evalAst(node.a, scope, src) as boolean) ? true : (evalAst(node.b, scope, src) as boolean);
      }

      const av = evalAst(node.a, scope, src);
      const bv = evalAst(node.b, scope, src);

      if (node.op === '==') return av === bv;
      if (node.op === '!=') return av !== bv;

      const a = asNumber(av, src, node.pos);
      const b = asNumber(bv, src, node.pos);

      switch (node.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/':
          if (b === 0) throw new ExpressionError('Division by zero', src, node.pos);
          return a / b;
        case '%':
          if (b === 0) throw new ExpressionError('Modulo by zero', src, node.pos);
          return a % b;
        case '^': return Math.pow(a, b);
        case '<': return a < b;
        case '<=': return a <= b;
        case '>': return a > b;
        case '>=': return a >= b;
        default:
          throw new ExpressionError(`Unknown operator "${node.op}"`, src, node.pos);
      }
    }

    case 'call': {
      if (node.name === 'if') {
        if (node.args.length !== 3) {
          throw new ExpressionError(`"if" takes 3 arguments (condition, then, else), got ${node.args.length}`, src, node.pos);
        }
        const cond = evalAst(node.args[0]!, scope, src);
        if (typeof cond !== 'boolean') {
          throw new ExpressionError('The first argument of "if" must be a comparison, such as x > 0', src, node.pos);
        }
        return evalAst(cond ? node.args[1]! : node.args[2]!, scope, src);
      }
      const def = EXPRESSION_FUNCTIONS[node.name];
      if (!def) {
        throw new ExpressionError(
          `Unknown function "${node.name}". Available: if, ${Object.keys(EXPRESSION_FUNCTIONS).join(', ')}`,
          src,
          node.pos
        );
      }
      const [lo, hi] = Array.isArray(def.arity) ? def.arity : [def.arity, def.arity];
      if (node.args.length < lo || node.args.length > hi) {
        throw new ExpressionError(
          `"${node.name}" takes ${lo === hi ? lo : `${lo}-${hi}`} argument(s), got ${node.args.length}`,
          src,
          node.pos
        );
      }
      const args = node.args.map((a) => asNumber(evalAst(a, scope, src), src, node.pos));
      let out: number;
      try {
        out = def.fn(...args);
      } catch (e) {
        throw new ExpressionError(`"${node.name}": ${(e as Error).message}`, src, node.pos);
      }
      if (!Number.isFinite(out)) {
        throw new ExpressionError(`"${node.name}" produced ${out}`, src, node.pos);
      }
      return out;
    }
  }
}

const parseCache = new Map<string, Ast>();

/** Parses an expression, caching the AST. Throws ExpressionError on bad syntax. */
export function parseExpression(src: string): Ast {
  const hit = parseCache.get(src);
  if (hit) return hit;
  const ast = new Parser(tokenize(src), src).parse();
  parseCache.set(src, ast);
  return ast;
}

/** Evaluates an expression against a scope. Pure: same inputs, same output, always. */
export function evaluateExpression(src: string, scope: ExprScope): ExprValue {
  return evalAst(parseExpression(src), scope, src);
}

/** Evaluates an expression that must yield a finite number. */
export function evaluateNumber(src: string, scope: ExprScope): number {
  const v = evaluateExpression(src, scope);
  if (typeof v !== 'number') {
    throw new ExpressionError('Expected a numeric result but got a boolean', src);
  }
  if (!Number.isFinite(v)) {
    throw new ExpressionError(`Expression produced ${v}`, src);
  }
  return v;
}

/** Evaluates an expression that must yield a boolean (used for constraints). */
export function evaluateBoolean(src: string, scope: ExprScope): boolean {
  const v = evaluateExpression(src, scope);
  if (typeof v !== 'boolean') {
    throw new ExpressionError('Expected a boolean result but got a number', src);
  }
  return v;
}

/**
 * Every name an expression reads. Used to verify at authoring time that a
 * contract only references things it actually declares, so a bad reference is
 * caught when the contract is validated rather than mid-simulation.
 */
export function referencedNames(src: string): string[] {
  const names = new Set<string>();
  const walk = (n: Ast): void => {
    switch (n.k) {
      case 'ref':
        if (!(n.name in EXPRESSION_CONSTANTS)) names.add(n.name);
        break;
      case 'unary': walk(n.a); break;
      case 'bin': walk(n.a); walk(n.b); break;
      case 'call': n.args.forEach(walk); break;
      case 'num': break;
    }
  };
  walk(parseExpression(src));
  return [...names];
}
