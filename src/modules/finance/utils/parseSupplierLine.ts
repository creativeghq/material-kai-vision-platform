/**
 * Pulls structured product facts out of a supplier invoice line.
 *
 * A myDATA line gives us one free-text description, a quantity and a net value — e.g.
 *   "AMALFI GRIS 80X80 A' -3 -1"   qty 17.92   net €295.86
 * and everything a stock item needs (size, unit, grade, maker, cost per unit) is either
 * encoded in that string or derivable from it. This is deterministic parsing, deliberately
 * separate from the Haiku extraction in `_shared/finance/extract-products.ts`: it runs
 * instantly with no credit cost, and it is the thing that fills the intake form's fields.
 * The AI extraction stays the fallback for descriptions this cannot read.
 *
 * Everything returned is a *suggestion* — the intake form shows each value as editable, and
 * `confidence` drives whether it is applied silently or flagged for a look.
 */

export type LengthUnit = 'mm' | 'cm';

export interface ParsedDimensions {
  width_mm: number | null;
  length_mm: number | null;
  thickness_mm: number | null;
  /** The unit the numbers were written in, as inferred from the text. */
  source_unit: LengthUnit;
  /** Human form of what was matched, e.g. "80 × 80 cm". */
  label: string | null;
  /** The exact substring that produced the match, so the UI can show its evidence. */
  matched: string | null;
}

export interface ParsedSupplierLine {
  /** Description with the size/grade/code noise stripped — the product name proper. */
  name: string;
  dimensions: ParsedDimensions;
  /** Quality grade token: "A'" → "A". Common on tile invoices; null when absent. */
  grade: string | null;
  /** Supplier's own article code found in the text, if any. */
  supplier_product_code: string | null;
  /** Maker detected in the text (matched against known names), else null. */
  manufacturer: string | null;
  /** Canonical lowercase-English colour read from the name ("GRIS" → "grey"), else null. */
  color: string | null;
  /** Canonical lowercase-English surface finish ("LAPPATO" → "lappato"), else null. */
  finish: string | null;
  /** Leading words left after every known token is stripped — usually the range/collection
   *  ("AMALFI GRIS 80X80 A'" → "AMALFI"). Null when nothing distinctive remains. */
  series: string | null;
  /** Canonical unit key — see src/lib/units.ts. */
  unit: string;
  /** Why that unit was chosen, shown as a tooltip so the guess is never silent. */
  unit_reason: string;
  /** Net cost of ONE unit, ex-VAT. null when quantity is missing or zero. */
  unit_cost: number | null;
}

/** Tiles/slabs are quoted in cm at these magnitudes; anything larger is millimetres. */
const CM_PLAUSIBLE_MAX = 400;

const NBSP = / /g;

/**
 * 2- or 3-axis size token: "80X80", "60x60x2", "18Χ58X2600mm" (Greek capital Chi included —
 * Greek keyboards produce Χ, U+03A7, not the Latin X, and supplier feeds are full of it).
 */
const DIM_RE = /(\d{1,5}(?:[.,]\d+)?)\s*[xX×Χχ]\s*(\d{1,5}(?:[.,]\d+)?)(?:\s*[xX×Χχ]\s*(\d{1,5}(?:[.,]\d+)?))?\s*(mm|cm|εκ|χιλ)?/i;

/** Standalone thickness, e.g. "10mm", "2 cm". */
const THICKNESS_RE = /\b(\d{1,3}(?:[.,]\d+)?)\s*(mm|cm)\b/i;

/** Quality grade: A', B', Α' (Greek Alpha), "1η", "2nd". */
const GRADE_RE = /\b([ABΑΒ])['’´]/;

/**
 * Colour words seen on Greek/Southern-European building-material invoices, mapped to the
 * lowercase-English canonical form the platform's facet layer expects (see the L0 prompt rule
 * and `facet_whitelist.py` — `color` is a canonicalized facet, so feeding it English here
 * saves the multilingual canonicalizer a round trip).
 *
 * Deliberately a dictionary, not an LLM call: it runs instantly, costs nothing, and is
 * predictable. Anything it misses falls through to the Haiku `attributes` the nightly sync
 * already extracted, and failing that the operator types it.
 */
const COLOR_WORDS: Record<string, string> = {
  // English
  white: 'white', black: 'black', grey: 'grey', gray: 'grey', beige: 'beige', cream: 'cream',
  ivory: 'ivory', sand: 'sand', brown: 'brown', taupe: 'taupe', anthracite: 'anthracite',
  charcoal: 'charcoal', silver: 'silver', gold: 'gold', bronze: 'bronze', copper: 'copper',
  blue: 'blue', green: 'green', red: 'red', yellow: 'yellow', pink: 'pink', natural: 'natural',
  // Spanish / Italian / French — common on tile ranges
  blanco: 'white', bianco: 'white', blanc: 'white',
  negro: 'black', nero: 'black', noir: 'black',
  gris: 'grey', grigio: 'grey', perla: 'pearl', perle: 'pearl',
  marron: 'brown', marrone: 'brown', avorio: 'ivory', crema: 'cream', arena: 'sand',
  antracita: 'anthracite', antracite: 'anthracite',
  // Greek
  λευκο: 'white', λευκό: 'white', μαυρο: 'black', μαύρο: 'black',
  γκρι: 'grey', μπεζ: 'beige', καφε: 'brown', καφέ: 'brown',
};

/** Surface finishes. Same canonical-English rule as colours. */
const FINISH_WORDS: Record<string, string> = {
  matt: 'matt', matte: 'matt', mat: 'matt', ματ: 'matt',
  glossy: 'glossy', gloss: 'glossy', lucido: 'glossy', brillo: 'glossy', γυαλιστερο: 'glossy',
  polished: 'polished', pulido: 'polished', lappato: 'lappato', semipulido: 'semi-polished',
  honed: 'honed', satin: 'satin', satinado: 'satin',
  rectified: 'rectified', rettificato: 'rectified',
  structured: 'structured', estructurado: 'structured', relief: 'relief',
  antislip: 'anti-slip', 'anti-slip': 'anti-slip', antideslizante: 'anti-slip',
};

/** First dictionary hit among the line's words, or null. */
function lookupWord(tokens: string[], dict: Record<string, string>): { canonical: string; raw: string } | null {
  for (const t of tokens) {
    const hit = dict[t.toLowerCase()];
    if (hit) return { canonical: hit, raw: t };
  }
  return null;
}

const numOf = (s: string | undefined): number | null => {
  if (!s) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/**
 * Decide whether bare numbers are cm or mm.
 * A tile written "80X80" is 80 cm; a profile written "18Χ58X2600" is millimetres — the giveaway
 * is magnitude, since nobody sells a 2600 cm skirting board.
 */
function inferLengthUnit(values: number[], explicit: string | undefined): LengthUnit {
  if (explicit) {
    const e = explicit.toLowerCase();
    if (e === 'mm' || e === 'χιλ') return 'mm';
    if (e === 'cm' || e === 'εκ') return 'cm';
  }
  return values.some((v) => v > CM_PLAUSIBLE_MAX) ? 'mm' : 'cm';
}

const toMm = (v: number | null, unit: LengthUnit): number | null =>
  v == null ? null : Math.round((unit === 'cm' ? v * 10 : v) * 100) / 100;

export function parseDimensions(text: string): ParsedDimensions {
  const empty: ParsedDimensions = {
    width_mm: null, length_mm: null, thickness_mm: null, source_unit: 'cm', label: null, matched: null,
  };
  const s = (text ?? '').replace(NBSP, ' ');
  const m = DIM_RE.exec(s);
  if (!m) {
    // No pair, but a lone "10mm" is still useful as a thickness.
    const t = THICKNESS_RE.exec(s);
    if (!t) return empty;
    const unit = (t[2].toLowerCase() === 'cm' ? 'cm' : 'mm') as LengthUnit;
    const v = numOf(t[1]);
    return { ...empty, thickness_mm: toMm(v, unit), source_unit: unit, matched: t[0].trim(), label: `${v} ${unit}` };
  }

  const a = numOf(m[1]);
  const b = numOf(m[2]);
  const c = numOf(m[3]);
  const unit = inferLengthUnit([a, b, c].filter((v): v is number => v != null), m[4]);

  // A 3-axis token on a flat product is width × length × thickness; the smallest axis is the
  // thickness regardless of the order it was written in.
  let width = a, length = b, thickness = c;
  if (c != null) {
    const sorted = [a!, b!, c].sort((x, y) => x - y);
    thickness = sorted[0];
    [width, length] = [sorted[1], sorted[2]];
  }

  const fmt = (v: number | null) => (v == null ? '' : String(v));
  const label = c != null
    ? `${fmt(width)} × ${fmt(length)} × ${fmt(thickness)} ${unit}`
    : `${fmt(width)} × ${fmt(length)} ${unit}`;

  return {
    width_mm: toMm(width, unit),
    length_mm: toMm(length, unit),
    thickness_mm: toMm(thickness, unit),
    source_unit: unit,
    label,
    matched: m[0].trim(),
  };
}

/**
 * An article code: a ≥5-character token mixing letters and digits, or a long pure-digit run
 * (EAN-ish). Excludes anything already claimed as a dimension so "80X80" never becomes a code.
 */
function findSupplierCode(text: string, exclude: string[]): string | null {
  const excluded = new Set(exclude.filter(Boolean).map((e) => e.toUpperCase()));
  const tokens = (text ?? '').split(/[\s,;()]+/).filter(Boolean);
  for (const raw of tokens) {
    const t = raw.replace(/^[-–]+|[-–]+$/g, '');
    if (t.length < 5) continue;
    const up = t.toUpperCase();
    if (excluded.has(up)) continue;
    const hasDigit = /\d/.test(t);
    if (!hasDigit) continue;
    // Pure dimension leftovers like "2600mm" are not codes.
    if (/^\d+(?:[.,]\d+)?\s*(mm|cm|m|kg|lt)$/i.test(t)) continue;
    if (/^[A-Z0-9]{5,}$/i.test(t)) return up;
  }
  return null;
}

/** Longest known name that appears as a whole word in the text wins ("KEROS HELLAS" > "KEROS"). */
function findManufacturer(text: string, known: string[]): string | null {
  const hay = ` ${(text ?? '').toUpperCase()} `;
  const hit = [...known]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .find((n) => {
      const needle = n.toUpperCase().trim();
      return needle.length >= 3 && hay.includes(` ${needle} `);
    });
  return hit ?? null;
}

export interface ParseSupplierLineInput {
  description: string | null | undefined;
  quantity?: number | null;
  netValue?: number | null;
  /** Maker names to look for — issuer name, CRM suppliers, brands already in stock. */
  knownManufacturers?: string[];
  /** Falls back to this when the text names no maker — normally the document's issuer. */
  defaultManufacturer?: string | null;
}

/**
 * Unit inference. A 2-D size in centimetres billed at a fractional quantity is area — you
 * cannot buy 17.92 tiles, but you can buy 17.92 m². Length profiles billed fractionally are
 * metres. Everything else is pieces.
 */
function inferUnit(dims: ParsedDimensions, quantity: number | null | undefined): { unit: string; reason: string } {
  const qty = quantity ?? null;
  const fractional = qty != null && Math.abs(qty - Math.round(qty)) > 1e-9;
  const hasPair = dims.width_mm != null && dims.length_mm != null;

  if (hasPair && fractional && dims.source_unit === 'cm') {
    return { unit: 'm2', reason: 'A two-dimensional size billed at a fractional quantity is area, not pieces.' };
  }
  if (!hasPair && fractional) {
    return { unit: 'm', reason: 'Fractional quantity with no area size — billed by length.' };
  }
  return { unit: 'pcs', reason: 'Whole-number quantity — billed per piece.' };
}

export function parseSupplierLine(input: ParseSupplierLineInput): ParsedSupplierLine {
  const raw = (input.description ?? '').replace(NBSP, ' ').trim();
  const dimensions = parseDimensions(raw);
  const gradeM = GRADE_RE.exec(raw);
  const grade = gradeM ? gradeM[1].replace('Α', 'A').replace('Β', 'B') : null;

  const supplier_product_code = findSupplierCode(raw, [dimensions.matched ?? '']);
  const manufacturer = findManufacturer(raw, input.knownManufacturers ?? [])
    ?? (input.defaultManufacturer || null);

  const { unit, reason } = inferUnit(dimensions, input.quantity);

  const words = raw.split(/[\s,;/()]+/).filter(Boolean);
  const colorHit = lookupWord(words, COLOR_WORDS);
  const finishHit = lookupWord(words, FINISH_WORDS);

  // Name = the description minus the tokens we've already understood.
  let name = raw;
  for (const token of [dimensions.matched, gradeM?.[0], supplier_product_code]) {
    if (token) name = name.split(token).join(' ');
  }
  name = name
    .replace(/\s*[-–]\s*\d+(?=\s|$)/g, ' ')   // trailing "-3 -1" batch/lot markers
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;·-]+|[\s,;·-]+$/g, '')
    .trim();

  // The range/collection is what's left once colour and finish are also removed. Keeping the
  // colour IN the product name is deliberate — "AMALFI GRIS" is how the item is ordered — so
  // this is reported separately rather than subtracted from `name`.
  const seriesText = [colorHit?.raw, finishHit?.raw]
    .filter(Boolean)
    .reduce((acc, w) => acc.split(w!).join(' '), name)
    .replace(/\s{2,}/g, ' ')
    .trim();

  const qty = input.quantity ?? null;
  const net = input.netValue ?? null;
  const unit_cost = qty != null && qty > 0 && net != null
    ? Math.round((net / qty) * 100) / 100
    : null;

  return {
    name: name || raw,
    dimensions,
    grade,
    supplier_product_code,
    manufacturer,
    color: colorHit?.canonical ?? null,
    finish: finishHit?.canonical ?? null,
    series: seriesText && seriesText !== name ? seriesText : null,
    unit,
    unit_reason: reason,
    unit_cost,
  };
}
