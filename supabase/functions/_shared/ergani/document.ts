// deno-lint-ignore-file no-explicit-any
// Builds an Ergani submission body from Ergani's OWN live template (Documents/{code} GET).
//
// WHY THIS EXISTS AT ALL. The Ergani II API guide documents the envelope and exactly one document
// schema in full (WRKCardSE — see workcard.ts, which hand-authors it because it is specified). The
// field schemas for E3 / E4 / E5 / E6 / E7 / E8 and leaves are NOT in the guide; they ship in
// Ergani's HELP_FILES_SAMPLES.zip and change per employer. So we never hand-author them. We fetch
// the employer's own live template and substitute values into the fields whose key names match
// documented Ergani conventions, leaving every other placeholder exactly as Ergani returned it.
//
// Two consequences the callers depend on:
//  1. `unfilled` is returned alongside the document. A caller MUST show it to the operator before
//     submitting — a placeholder we could not recognise is a field a human has to complete. Filing
//     a government document with a guessed value is worse than not filing it.
//  2. Nothing here invents structure. Repeated rows (one per employee, per shift, per overtime
//     block) are produced by CLONING the template's own detail element, never by building an array
//     shape we assumed.

/** The canonical value vocabulary. Slots absent from a document's template are simply unused. */
export interface ErganiValues {
  // Employer-level (header)
  employerAfm?: string | null;
  branchAa?: string | null;
  comments?: string | null;
  // Person
  afm?: string | null;
  amka?: string | null;
  lastName?: string | null;
  firstName?: string | null;
  fatherName?: string | null;
  birthDate?: string | null;
  // Employment
  specialty?: string | null;
  contractType?: string | null;
  salary?: number | string | null;
  weeklyHours?: number | string | null;
  // Document-specific
  code?: string | null;      // leave code / separation reason code / schedule day code
  type?: string | null;      // f_type
  reason?: string | null;    // f_aitiologia
  amount?: number | string | null; // severance / compensation
  // Dates & times
  date?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  hours?: number | string | null;
  /**
   * Exact template-key → value escape hatch, applied BEFORE any convention matching and reported
   * as filled. This is how an operator supplies the Ergani-specific codes we cannot derive
   * (specialty/ΣΤΕΠ code, contract-type code, collective agreement): they read the key name off
   * the `unfilled` list of a preview and store it once on the employee (hr_employees.ergani_e3).
   */
  overrides?: Record<string, unknown> | null;
}

// Key-name conventions. `f_*` names in the first block are the ones the API guide itself uses
// (verified against the WRKCardSE schema); the regex families below cover the Greek-transliterated
// names the sample documents use for the same concepts (ημερομηνία → hmer/imer/imnia,
// ώρα → ora/wra, από/έως → apo/eos, έναρξη/λήξη → enarks/lixi).
const DATE_KEY = /(date|hmer|imer|imnia|hmnia)/;
const TIME_KEY = /(time|ora|wra)/;
const FROM_KEY = /(apo|from|start|enarks|enarx|enark)/;
const TO_KEY = /(eos|ews|to|end|lix|liks|lhks)/;

function has(v: unknown): boolean { return v !== undefined && v !== null && v !== ''; }

/**
 * Resolve ONE template placeholder key to a value, or report a miss.
 * Ordered most-specific first — `f_eidikotita` (specialty) must not fall through to the generic
 * `eidos` (kind) rule, and `f_onoma_patros` must not be read as the employee's own first name.
 */
function resolveKey(rawKey: string, v: ErganiValues): { hit: boolean; value?: unknown } {
  const k = rawKey.toLowerCase();
  const hit = (value: unknown) => (has(value) ? { hit: true, value } : { hit: false });
  const from = FROM_KEY.test(k);
  const to = TO_KEY.test(k);

  // ── Exact keys documented in the guide ──────────────────────────────────────
  if (k === 'f_afm_ergodoti') return hit(v.employerAfm);
  if (k === 'f_aa') return hit(v.branchAa);
  if (k === 'f_comments' || k.endsWith('_comments')) return hit(v.comments);
  if (k === 'f_afm') return hit(v.afm);
  if (k === 'f_type') return hit(v.type);
  if (k === 'f_aitiologia') return hit(v.reason);

  // ── Person ──────────────────────────────────────────────────────────────────
  if (k.includes('amka')) return hit(v.amka);
  if (k.includes('eponym') || k.includes('eponim')) return hit(v.lastName);
  if (k.includes('patr')) return hit(v.fatherName);
  if (k.includes('mitr')) return { hit: false };            // mother's name — never inferred
  if (k.includes('onoma')) return hit(v.firstName);          // after patr/mitr/eponym
  if (DATE_KEY.test(k) && /(gennis|genis|birth)/.test(k)) return hit(v.birthDate);

  // ── Employment ──────────────────────────────────────────────────────────────
  if (/(eidikot|specialt)/.test(k)) return hit(v.specialty);
  if (/(symvas|simvas|contract|apasxol|apaschol)/.test(k)) return hit(v.contractType);
  if (/(apodox|misth|salary|wage|amoib)/.test(k)) return hit(v.salary);
  if (/(apozim|apozhm|severance)/.test(k)) return hit(v.amount);

  // ── Times & durations (checked before dates: "f_ora_apo" is a time, not a date) ──
  if (TIME_KEY.test(k) && from) return hit(v.startTime);
  if (TIME_KEY.test(k) && to) return hit(v.endTime);
  if (/(ores|wres|hours)/.test(k)) return hit(v.hours ?? v.weeklyHours);

  // ── Dates ───────────────────────────────────────────────────────────────────
  if (k === 'f_apo') return hit(v.startDate ?? v.date);
  if (k === 'f_eos' || k === 'f_ews') return hit(v.endDate);
  if (DATE_KEY.test(k) && from) return hit(v.startDate ?? v.date);
  if (DATE_KEY.test(k) && to) return hit(v.endDate);
  if (DATE_KEY.test(k)) return hit(v.date ?? v.startDate);

  // ── Document-specific code (leave type, separation reason, day code…) ───────
  if (/(kodik|code|eidos|typos)/.test(k)) return hit(v.code ?? v.type);

  // ── Money amounts, last (so salary/severance win their own keys first) ──────
  if (/(poso|amount)/.test(k)) return hit(v.amount);

  return { hit: false };
}

interface FillReport { filled: string[]; unfilled: string[] }

/** Substitute values into every leaf of one template node, recording what we could and could not fill. */
function fillNode(node: any, v: ErganiValues, report: FillReport): any {
  if (Array.isArray(node)) return node.map((n) => fillNode(n, v, report));
  if (node && typeof node === 'object') {
    const out: any = {};
    for (const [k, val] of Object.entries(node)) {
      if (val !== null && typeof val === 'object') { out[k] = fillNode(val, v, report); continue; }
      const override = v.overrides?.[k];
      if (has(override)) { out[k] = override; report.filled.push(k); continue; }
      const r = resolveKey(k, v);
      if (r.hit) { out[k] = r.value; report.filled.push(k); }
      else { out[k] = val; report.unfilled.push(k); }
    }
    return out;
  }
  return node;
}

/** Path (as keys) to the first array found in a depth-first walk, or null. */
function findArrayPath(node: any, path: string[] = []): string[] | null {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
  for (const [k, val] of Object.entries(node)) {
    if (Array.isArray(val)) return [...path, k];
    const deeper = findArrayPath(val, [...path, k]);
    if (deeper) return deeper;
  }
  return null;
}

function getAt(node: any, path: string[]): any { return path.reduce((n, k) => n?.[k], node); }

/** Structural clone of `node` with the value at `path` replaced. */
function setAt(node: any, path: string[], value: any): any {
  if (!path.length) return value;
  const [head, ...rest] = path;
  return { ...node, [head]: setAt(node[head], rest, value) };
}

export interface BuiltDocument {
  document: unknown;
  /** Template keys we substituted a value into. */
  filled: string[];
  /** Template keys left exactly as Ergani returned them — the operator must complete these. */
  unfilled: string[];
}

/**
 * Build a submission body from Ergani's live template.
 *
 * Ergani envelopes nest as  {Wrapper: {Header: [ …header fields…, Details: {Rows: [ …row fields… ]} ]}}
 * (the WRKCardSE shape). We locate those two arrays STRUCTURALLY — first array = the header
 * collection, first array inside its element = the detail collection — and clone the detail
 * element once per row. A flat template (no nested array) gets one header element per row instead.
 *
 * @param rows one entry per employee / shift / overtime block. Each is merged OVER the header
 *             values, so a row may override `comments` and the header supplies `employerAfm`.
 */
export function buildErganiDocument(template: any, header: ErganiValues, rows: ErganiValues[]): BuiltDocument {
  const report: FillReport = { filled: [], unfilled: [] };
  const detailRows = rows.length ? rows : [{}];

  const headerPath = findArrayPath(template);
  if (!headerPath) {
    // No array anywhere — a flat document. Fill it with the header + first row and be done.
    return finish(fillNode(template, { ...header, ...detailRows[0] }, report), report);
  }

  const headerArray = getAt(template, headerPath);
  const headerProto = Array.isArray(headerArray) ? headerArray[0] : null;
  if (!headerProto || typeof headerProto !== 'object') {
    return finish(fillNode(template, { ...header, ...detailRows[0] }, report), report);
  }

  const detailPath = findArrayPath(headerProto);
  if (!detailPath) {
    // Flat collection: each element IS a row.
    const filledRows = detailRows.map((r) => fillNode(headerProto, { ...header, ...r }, report));
    return finish(setAt(template, headerPath, filledRows), report);
  }

  const detailArray = getAt(headerProto, detailPath);
  const detailProto = Array.isArray(detailArray) ? detailArray[0] : null;
  if (!detailProto || typeof detailProto !== 'object') {
    const filledRows = detailRows.map((r) => fillNode(headerProto, { ...header, ...r }, report));
    return finish(setAt(template, headerPath, filledRows), report);
  }

  // Two-level: one header carrying N cloned detail rows.
  const filledDetails = detailRows.map((r) => fillNode(detailProto, { ...header, ...r }, report));
  // Fill the header's own scalar fields with header values only (a header must not inherit one
  // employee's AFM), then graft the detail rows in.
  const headerOnly = fillNode(setAt(headerProto, detailPath, []), header, report);
  const builtHeader = setAt(headerOnly, detailPath, filledDetails);
  return finish(setAt(template, headerPath, [builtHeader]), report);
}

function finish(document: unknown, report: FillReport): BuiltDocument {
  const filled = [...new Set(report.filled)];
  const filledSet = new Set(filled);
  // A key filled in one row and missing in another counts as filled — the gap is that row's data,
  // not an unrecognised field, and reporting it as unfilled would bury the real unknowns.
  return { document, filled, unfilled: [...new Set(report.unfilled)].filter((k) => !filledSet.has(k)) };
}

// NOTE ON DATE FORMAT: we send ISO 'YYYY-MM-DD', which is what the production-verified WRKCardSE
// path (workcard.ts `f_reference_date`) and the existing leave path already send. Ergani echoes
// submitDate back as dd/mm/yyyy in RESPONSES, but that is not the request format — do not "fix"
// this by reformatting outbound dates without a rejected submission proving it.

/**
 * Overlay a caller-supplied document onto the one WE built, taking the caller's value ONLY for
 * template keys we could not fill ourselves (#354 HR-1).
 *
 * The preview → complete → submit workflow is real: `unfilled` exists precisely so an operator can
 * supply the Ergani-specific codes no convention can derive. What was NOT acceptable is that a
 * supplied `document` bypassed the builder entirely, so the identity and money in the filing came
 * from the request body while the audit row described the employee named by `employee_id`. An
 * audit trail that can be made to disagree with what was filed is worse than none, because it is
 * believed: file Bob's ΑΦΜ and €2,400 under Alice's id and `hr_ergani_submissions` says Alice.
 *
 * So: everything the server knows (ΑΦΜ, ΑΜΚΑ, name, salary, dates) is server-owned and cannot be
 * overridden from the body; everything it could not recognise stays the operator's to complete.
 * Both lists come back so the response can say exactly which keys the caller supplied.
 *
 * Structure is taken from the BUILT document throughout — the supplied one is only ever read at a
 * matching path, so a caller cannot add rows, add keys, or reshape the envelope.
 */
export interface MergeReport {
  /** Unfilled keys the caller supplied a value for. */
  applied: string[];
  /** Keys the caller tried to set that we had already filled — ignored, and reported. */
  ignored: string[];
}

export function mergeUnfilledKeys(
  built: unknown, supplied: unknown, unfilled: string[],
): { document: unknown; applied: string[]; ignored: string[] } {
  const allowed = new Set(unfilled);
  const report: MergeReport = { applied: [], ignored: [] };
  const document = mergeNode(built, supplied, allowed, report);
  return { document, applied: [...new Set(report.applied)], ignored: [...new Set(report.ignored)] };
}

function mergeNode(built: any, supplied: any, allowed: Set<string>, report: MergeReport): any {
  if (Array.isArray(built)) {
    // Length comes from OUR document: one row per employee / shift / overtime block, as loaded.
    if (!Array.isArray(supplied)) return built;
    return built.map((n, i) => mergeNode(n, supplied[i], allowed, report));
  }
  if (built && typeof built === 'object') {
    const src = (supplied && typeof supplied === 'object' && !Array.isArray(supplied)) ? supplied as any : {};
    const out: any = {};
    for (const [k, val] of Object.entries(built)) {
      if (val !== null && typeof val === 'object') { out[k] = mergeNode(val, src[k], allowed, report); continue; }
      const given = src[k];
      const offered = given !== undefined && given !== null && given !== '';
      if (!offered) { out[k] = val; continue; }
      if (allowed.has(k)) { out[k] = given; report.applied.push(k); }
      else if (given !== val) { out[k] = val; report.ignored.push(k); }
      else { out[k] = val; }
    }
    return out;
  }
  return built;
}

/** 'HH:MM[:SS]' → 'HH:MM'. */
export function toErganiTime(t: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? ''));
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : String(t ?? '');
}

/** Split a display name into [lastName, firstName] the way the work-card path already does. */
export function splitName(name: string): [string, string] {
  const [last, ...rest] = String(name ?? '').trim().split(/\s+/);
  return [last || String(name ?? ''), rest.join(' ')];
}
