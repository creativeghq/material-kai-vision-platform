// Safe parametric-formula evaluator for the Blueprint estimating engine.
// A blueprint/plan line may carry a `quantity_formula` like `= floor_area + wall_area`
// or `= n_points * 1.1`. We evaluate it against the plan's named dimensions
// ({floor_area: 6, wall_area: 24, ...}). NO arbitrary JS — only numbers, the named
// dimensions, parentheses, the operators + - * / and a small whitelist of functions
// (min, max, ceil, floor, round, abs, sqrt). Anything else, or a missing variable,
// fails closed to `ok:false` and the caller falls back to a stored default.
// This file is the single source of the math. The Vite frontend keeps a byte-identical
// mirror at src/utils/blueprintFormula.ts for optimistic preview; the edge function
// (project-plan-engine) is the authoritative writer of persisted prices.

export interface FormulaResult {
  value: number;
  ok: boolean;
  error?: string;
}

type Token =
  | { t: 'num'; v: number }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'comma' };

const FUNCS: Record<string, (args: number[]) => number> = {
  min: (a) => Math.min(...a),
  max: (a) => Math.max(...a),
  ceil: (a) => Math.ceil(a[0]),
  floor: (a) => Math.floor(a[0]),
  round: (a) => Math.round(a[0]),
  abs: (a) => Math.abs(a[0]),
  sqrt: (a) => Math.sqrt(a[0]),
};

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c >= '0' && c <= '9' || (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
      let j = i + 1;
      while (j < src.length && ((src[j] >= '0' && src[j] <= '9') || src[j] === '.')) j++;
      tokens.push({ t: 'num', v: parseFloat(src.slice(i, j)) });
      i = j; continue;
    }
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_') {
      let j = i + 1;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
      tokens.push({ t: 'id', v: src.slice(i, j) });
      i = j; continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/') { tokens.push({ t: 'op', v: c }); i++; continue; }
    if (c === '(') { tokens.push({ t: 'lp' }); i++; continue; }
    if (c === ')') { tokens.push({ t: 'rp' }); i++; continue; }
    if (c === ',') { tokens.push({ t: 'comma' }); i++; continue; }
    throw new Error(`Unexpected character '${c}'`);
  }
  return tokens;
}

export function evaluateFormula(formula: string | null | undefined, vars: Record<string, number>): FormulaResult {
  if (formula == null || String(formula).trim() === '') return { value: 0, ok: false, error: 'empty' };
  let src = String(formula).trim();
  if (src.startsWith('=')) src = src.slice(1);
  // A bare number is the common case (literal quantity)
  const asNum = Number(src);
  if (!Number.isNaN(asNum) && /^[-+]?[0-9.]+$/.test(src.trim())) return { value: asNum, ok: true };

  try {
    const tokens = tokenize(src);
    let pos = 0;
    const peek = () => tokens[pos];
    const next = () => tokens[pos++];

    function parseExpr(): number {
      let left = parseTerm();
      while (peek() && peek().t === 'op' && ((peek() as { v: string }).v === '+' || (peek() as { v: string }).v === '-')) {
        const op = (next() as { v: string }).v;
        const right = parseTerm();
        left = op === '+' ? left + right : left - right;
      }
      return left;
    }
    function parseTerm(): number {
      let left = parseFactor();
      while (peek() && peek().t === 'op' && ((peek() as { v: string }).v === '*' || (peek() as { v: string }).v === '/')) {
        const op = (next() as { v: string }).v;
        const right = parseFactor();
        left = op === '*' ? left * right : left / right;
      }
      return left;
    }
    function parseFactor(): number {
      const tk = peek();
      if (!tk) throw new Error('Unexpected end of formula');
      if (tk.t === 'op' && tk.v === '-') { next(); return -parseFactor(); }
      if (tk.t === 'op' && tk.v === '+') { next(); return parseFactor(); }
      if (tk.t === 'num') { next(); return (tk as { v: number }).v; }
      if (tk.t === 'lp') { next(); const v = parseExpr(); if (!peek() || peek().t !== 'rp') throw new Error('Expected )'); next(); return v; }
      if (tk.t === 'id') {
        next();
        const name = (tk as { v: string }).v;
        // function call?
        if (peek() && peek().t === 'lp') {
          next();
          const args: number[] = [];
          if (peek() && peek().t !== 'rp') {
            args.push(parseExpr());
            while (peek() && peek().t === 'comma') { next(); args.push(parseExpr()); }
          }
          if (!peek() || peek().t !== 'rp') throw new Error('Expected )');
          next();
          const fn = FUNCS[name];
          if (!fn) throw new Error(`Unknown function ${name}`);
          return fn(args);
        }
        // variable
        if (!(name in vars) || typeof vars[name] !== 'number' || Number.isNaN(vars[name])) {
          throw new Error(`Unknown variable '${name}'`);
        }
        return vars[name];
      }
      throw new Error('Unexpected token');
    }

    const result = parseExpr();
    if (pos !== tokens.length) throw new Error('Trailing tokens');
    if (!Number.isFinite(result)) throw new Error('Non-finite result');
    return { value: result, ok: true };
  } catch (err) {
    return { value: 0, ok: false, error: err instanceof Error ? err.message : 'parse error' };
  }
}

// Round to 2 decimals (currency)
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface PricingInput {
  is_allowance?: boolean;
  allowance_amount?: number | null;
  material_cost?: number | null;   // per-unit material (override)
  labor_rate?: number | null;      // per-unit labor (override)
  resolved_material?: number | null; // from product_prices when no override
  resolved_labor?: number | null;    // from product_prices when no override
  margin_pct?: number | null;
  quantity: number;
  is_selected?: boolean;
}

export interface PricingOutput { unit_price: number; line_total: number; }

// Authoritative per-line pricing. base = material + labor; unit = base*(1+margin%);
// allowance lines ignore qty (the allowance amount IS the line). Unselected option
// rows contribute 0 to the total but keep their unit_price for display.
export function computeLinePricing(p: PricingInput): PricingOutput {
  const selected = p.is_selected !== false;
  if (p.is_allowance) {
    const amt = round2(Number(p.allowance_amount ?? 0));
    return { unit_price: amt, line_total: selected ? amt : 0 };
  }
  const material = p.material_cost ?? p.resolved_material ?? 0;
  const labor = p.labor_rate ?? p.resolved_labor ?? 0;
  const base = Number(material) + Number(labor);
  const unit = round2(base * (1 + Number(p.margin_pct ?? 0) / 100));
  const qty = Number(p.quantity ?? 0);
  return { unit_price: unit, line_total: selected ? round2(unit * qty) : 0 };
}
