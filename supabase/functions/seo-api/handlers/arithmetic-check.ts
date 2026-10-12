/** Worked examples in prose (`6 ÷ 0,64 = 9,4 κουτιά`) recomputed by code. Import-free (unit-tested). */

export interface ArithmeticError { text: string; expected: string; stated: string }
export interface ArithmeticReport { checked: number; wrong: ArithmeticError[] }
export interface ArithmeticEdit { index: number; before: string; after: string }

type Op = '*' | '/' | '+' | '-';
interface NumTok { kind: 'num'; start: number; end: number; raw: string; value: number; decimals: number; decimalSep: ',' | '.'; grouped: boolean }
type Tok =
  | NumTok
  | { kind: 'op'; op: Op; start: number; end: number }
  | { kind: 'eq'; approx: boolean; start: number; end: number }
  | { kind: 'range'; start: number; end: number }
  | { kind: 'word'; text: string; start: number; end: number }
  | { kind: 'break'; start: number; end: number };

const NUM = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?(?!\d)|\d+(?:[.,]\d+)?`;
const TOKEN = new RegExp(
  [
    `(?<num>${NUM})`,
    String.raw`(?<range>(?<=\d)\s*[–—]\s*(?=\d)|(?<=\d)-(?=\d))`,
    String.raw`(?<op>[×÷−+]|(?<=\d)[xX](?=\d)|(?<=\s)[xX-](?=\s)|(?<=\d|\s)\*(?=\s|\d)|\/(?=\s*[€\d])|(?<=\s):(?=\s))`,
    String.raw`(?<eq>[=≈≃~])`,
    String.raw`(?<markup>\*+|_+|\x60+)`,
    String.raw`(?<ws>[ \t ]+)`,
    String.raw`(?<word>(?:[^\s\d=≈≃~×÷*+−–—\-():;!?,|\/\x60_]|(?<=\p{L})\d+|-|\/(?!\s*[€\d]))+)`,
    String.raw`(?<brk>[\s\S])`,
  ].join('|'),
  'gu',
);

const APPROX_WORDS = new Set(['περίπου', 'περ.', 'about', 'approximately', 'approx.', 'circa', 'ca.']);
const RANGE_WORDS = new Set(['έως', 'ως', 'μέχρι', 'to']);
const MAX_UNIT_WORDS = 3;

function parseNumber(raw: string): Omit<NumTok, 'kind' | 'start' | 'end' | 'raw'> {
  const hasDot = raw.includes('.');
  const hasComma = raw.includes(',');
  let intPart = raw;
  let frac = '';
  let decimalSep: ',' | '.' = ',';
  let grouped = false;
  if (hasDot && hasComma) {
    decimalSep = raw.lastIndexOf(',') > raw.lastIndexOf('.') ? ',' : '.';
    grouped = true;
  } else if (hasComma) {
    if (/^\d{1,3}(?:,\d{3}){2,}$/.test(raw)) {
      grouped = true;
      decimalSep = '.';
    }
  } else if (hasDot) {
    if (/^[1-9]\d{0,2}(?:\.\d{3})+$/.test(raw)) grouped = true;
    else decimalSep = '.';
  }
  const thousandsSep = decimalSep === ',' ? '.' : ',';
  const cleaned = raw.split(thousandsSep).join('');
  const at = cleaned.indexOf(decimalSep);
  if (at >= 0) {
    intPart = cleaned.slice(0, at);
    frac = cleaned.slice(at + 1);
  } else {
    intPart = cleaned;
  }
  return { value: Number(`${intPart}.${frac || '0'}`), decimals: frac.length, decimalSep, grouped };
}

function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  for (const m of text.matchAll(TOKEN)) {
    const g = m.groups ?? {};
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (g.ws !== undefined || g.markup !== undefined) continue;
    if (g.num !== undefined) out.push({ kind: 'num', start, end, raw: g.num, ...parseNumber(g.num) });
    else if (g.range !== undefined) out.push({ kind: 'range', start, end });
    else if (g.op !== undefined) {
      const c = g.op;
      const op: Op = c === '+' ? '+' : c === '−' || c === '-' ? '-' : c === '÷' || c === '/' || c === ':' ? '/' : '*';
      out.push({ kind: 'op', op, start, end });
    } else if (g.eq !== undefined) out.push({ kind: 'eq', approx: g.eq !== '=', start, end });
    else if (g.word !== undefined) out.push({ kind: 'word', text: g.word, start, end });
    else out.push({ kind: 'break', start, end });
  }
  return out;
}

interface Operand { num: NumTok; unit: string; percent: boolean }

function unitAfter(toks: Tok[], i: number): { unit: string; next: number } {
  const words: string[] = [];
  let j = i;
  while (j < toks.length && toks[j].kind === 'word' && words.length < MAX_UNIT_WORDS) {
    words.push((toks[j] as { text: string }).text);
    j++;
  }
  return { unit: words.join(' '), next: j };
}

function numberAt(toks: Tok[], i: number, afterEq: boolean): { num: NumTok; next: number; approx: boolean } | null {
  let j = i;
  let approx = false;
  for (let skipped = 0; j < toks.length && toks[j].kind === 'word' && skipped < 2; skipped++) {
    const w = (toks[j] as { text: string }).text.toLowerCase();
    if (w === '€' || w === '$') j++;
    else if (afterEq && APPROX_WORDS.has(w)) { approx = true; j++; }
    else break;
  }
  if (afterEq && toks[j]?.kind === 'eq' && (toks[j] as { approx: boolean }).approx) { approx = true; j++; }
  const t = toks[j];
  return t?.kind === 'num' ? { num: t, next: j + 1, approx } : null;
}

function evaluate(operands: Operand[], ops: Op[]): number | null {
  if (ops.length === 1 && (ops[0] === '+' || ops[0] === '-') && operands[1].percent && !operands[0].percent) {
    const p = operands[1].num.value / 100;
    return operands[0].num.value * (ops[0] === '+' ? 1 + p : 1 - p);
  }
  const anyPercent = operands.some((o) => o.percent);
  if (anyPercent && ops.some((o) => o === '+' || o === '-') && !operands.every((o) => o.percent)) return null;
  const values = operands.map((o) => (o.percent ? o.num.value / 100 : o.num.value));
  const terms: number[] = [values[0]];
  const signs: Op[] = [];
  for (let k = 0; k < ops.length; k++) {
    const v = values[k + 1];
    if (ops[k] === '*') terms[terms.length - 1] *= v;
    else if (ops[k] === '/') {
      if (v === 0) return null;
      terms[terms.length - 1] /= v;
    } else {
      signs.push(ops[k]);
      terms.push(v);
    }
  }
  let total = terms[0];
  signs.forEach((s, k) => { total = s === '+' ? total + terms[k + 1] : total - terms[k + 1]; });
  return Number.isFinite(total) ? total : null;
}

function precisionOfInteger(raw: string): number {
  const digits = raw.replace(/\D/g, '');
  const zeros = digits.length - digits.replace(/0+$/, '').length;
  return digits === '0' ? 1 : 10 ** Math.min(zeros, digits.length - 1);
}

const SMALL_UNIT = /^(?:cm|mm|εκ|χιλ|g\b|γρ|ml)/iu;
const LARGE_UNIT = /^(?:m\b|m²|m2|m³|μ\.|μέτρ|τ\.?μ|κ\.?μ|kg|κιλ|l\b|λίτρ)/iu;

const AREA_LARGE = /^(?:τ\.?μ|m²|m2|τετρ)/iu;
const AREA_SMALL = /^(?:cm²|cm2|τ\.?εκ)/iu;

function conversionExponent(operandUnits: string[], resultUnit: string): number | null {
  const small = operandUnits.filter((u) => SMALL_UNIT.test(u));
  const large = operandUnits.filter((u) => LARGE_UNIT.test(u));
  if (small.length && large.length) return null;
  const mm = (u: string) => /^(?:mm|χιλ)/iu.test(u);
  if (small.length && LARGE_UNIT.test(resultUnit)) {
    if (AREA_LARGE.test(resultUnit)) return small.some(mm) ? -6 : -4;
    return small.some((u) => /^(?:cm|εκ)/iu.test(u)) ? -2 : -3;
  }
  if (large.length && SMALL_UNIT.test(resultUnit)) {
    if (AREA_SMALL.test(resultUnit)) return 4;
    return /^(?:cm|εκ)/iu.test(resultUnit) ? 2 : 3;
  }
  return 0;
}

function agrees(computed: number, stated: NumTok, approx: boolean): boolean {
  const half = 0.5 * 10 ** -stated.decimals;
  const eps = 1e-9 * Math.max(1, Math.abs(computed));
  let tol = half + eps;
  if (approx) {
    tol = Math.max(tol, 0.02 * Math.abs(computed));
    if (stated.decimals === 0) tol = Math.max(tol, precisionOfInteger(stated.raw) / 2);
  }
  const s = stated.value;
  if (Math.abs(s - computed) <= tol) return true;
  return stated.decimals === 0 && s === Math.ceil(computed - eps);
}

function format(value: number, like: NumTok): string {
  const whole = Number.isInteger(Number(value.toFixed(6)));
  const decimals = like.decimals > 0 ? like.decimals : whole ? 0 : 2;
  let fixed = Math.abs(value).toFixed(decimals);
  if (like.decimals === 0 && decimals > 0) fixed = fixed.replace(/0+$/, '').replace(/\.$/, '');
  const [intPart, frac = ''] = fixed.split('.');
  const thousands = like.decimalSep === ',' ? '.' : ',';
  const groupedInt = like.grouped || Math.abs(value) >= 10000 ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousands) : intPart;
  return (value < 0 ? '-' : '') + groupedInt + (frac ? like.decimalSep + frac : '');
}

function rangeFollows(toks: Tok[], i: number): boolean {
  const t = toks[i];
  if (t?.kind === 'range') return true;
  if (t?.kind === 'word' && RANGE_WORDS.has(t.text.toLowerCase()) && toks[i + 1]?.kind === 'num') return true;
  return false;
}

interface Found { text: string; stated: NumTok; computed: number; ok: boolean }

function scan(markdown: string): Found[] {
  const toks = tokenize(markdown);
  const found: Found[] = [];
  const consumed = new Set<number>();
  for (let i = 0; i < toks.length; i++) {
    const first = toks[i];
    if (first.kind !== 'num' || consumed.has(i)) continue;
    const prev = toks[i - 1];
    if (prev && (prev.kind === 'range' || prev.kind === 'op' || (prev.kind === 'word' && RANGE_WORDS.has(prev.text.toLowerCase())))) continue;

    let operands: Operand[] = [];
    let ops: Op[] = [];
    let start = first.start;
    let j = i;
    let current: NumTok = first;
    let tainted = false;
    for (;;) {
      consumed.add(j);
      const { unit, next } = unitAfter(toks, j + 1);
      operands.push({ num: current, unit, percent: unit.startsWith('%') });
      const t = toks[next];
      if (t?.kind === 'range') { tainted = true; break; }
      if (t?.kind === 'op') {
        const n = numberAt(toks, next + 1, false);
        if (!n) break;
        ops.push(t.op);
        current = n.num;
        j = n.next - 1;
        continue;
      }
      if (t?.kind !== 'eq' || !ops.length) break;
      const r = numberAt(toks, next + 1, true);
      if (!r) break;
      const resultIdx = r.next - 1;
      consumed.add(resultIdx);
      const after = unitAfter(toks, resultIdx + 1);
      if (tainted || rangeFollows(toks, resultIdx + 1) || rangeFollows(toks, after.next)) break;
      const resultPercent = after.unit.startsWith('%');
      const value = evaluate(operands, ops);
      const exponent = conversionExponent(operands.map((o) => o.unit), after.unit);
      if (value !== null && exponent !== null) {
        const scaled = value * 10 ** exponent;
        const computed = resultPercent && !operands.some((o) => o.percent) ? scaled * 100 : scaled;
        found.push({
          text: markdown.slice(start, r.num.end),
          stated: r.num,
          computed,
          ok: agrees(computed, r.num, t.approx || r.approx),
        });
      }
      if (toks[after.next]?.kind !== 'op') break;
      operands = [];
      ops = [];
      start = r.num.start;
      current = r.num;
      j = resultIdx;
    }
  }
  return found;
}

export function checkArithmetic(markdown: string): ArithmeticReport {
  const found = scan(markdown);
  return {
    checked: found.length,
    wrong: found.filter((f) => !f.ok).map((f) => ({ text: f.text, expected: format(f.computed, f.stated), stated: f.stated.raw })),
  };
}

export function fixArithmetic(markdown: string, wrong: ArithmeticError[]): { markdown: string; edits: ArithmeticEdit[] } {
  let out = markdown;
  const edits: ArithmeticEdit[] = [];
  for (const w of wrong) {
    if (!w.text.endsWith(w.stated) || w.expected === w.stated) continue;
    const at = out.indexOf(w.text);
    if (at < 0 || out.indexOf(w.text, at + 1) >= 0) continue;
    const end = at + w.text.length;
    if (/^\d|^[.,]\d/.test(out.slice(end))) continue;
    if (/^\s*(?:[^\s\d=≈×÷*+−/]{1,15}\s*){0,3}[×÷*+−/]\s*[€\d]/u.test(out.slice(end, end + 60))) continue;
    const after = w.text.slice(0, -w.stated.length) + w.expected;
    out = out.slice(0, at) + after + out.slice(end);
    edits.push({ index: at, before: w.text, after });
  }
  return { markdown: out, edits };
}
