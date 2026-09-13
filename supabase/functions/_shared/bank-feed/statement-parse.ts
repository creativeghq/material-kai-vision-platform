/**
 * Read a bank statement export into feed rows. Pure — no IO, no database, so it is testable and
 * so the same parse runs for the preview and for the import.
 *
 * Every bank exports different columns, so the mapping comes from the operator
 * (`bank_statement_mappings`) rather than from a parser written per bank.
 */

export interface StatementMapping {
  date_column: string;
  reference_column?: string | null;
  counterparty_column?: string | null;
  /** A single signed column, OR the credit/debit pair. Both shapes are common in the wild. */
  amount_column?: string | null;
  credit_column?: string | null;
  debit_column?: string | null;
  external_id_column?: string | null;
  date_format: string;
  decimal_mark: '.' | ',';
}

export interface ParsedRow {
  /** ISO date. */
  booked_at: string;
  /** Always POSITIVE; `direction` carries the sign. */
  amount: number;
  direction: 'in' | 'out';
  reference: string | null;
  counterparty_name: string | null;
  /** The bank's own id where the export carries one. */
  external_id: string | null;
  /** Row number in the file, 1-based, for the operator to find a rejected line. */
  line: number;
}

export interface ParseProblem { line: number; reason: string }

export interface ParseResult {
  headers: string[];
  rows: ParsedRow[];
  problems: ParseProblem[];
}

/**
 * RFC4180: quoted fields may contain commas, newlines and escaped quotes (`""`).
 * Hand-written because a statement is exactly the file where a counterparty called
 * `SMITH, J & SONS "THE YARD"` appears, and a naive split on commas silently shifts every
 * later column on that row.
 */
export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  // A BOM would otherwise become part of the first header name and match no mapping.
  if (text.charCodeAt(0) === 0xFEFF) i = 1;

  const endField = () => { row.push(field); field = ''; };
  const endRow = () => { endField(); rows.push(row); row = []; };

  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { quoted = true; i++; continue; }
    if (ch === delimiter) { endField(); i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { endRow(); i++; continue; }
    field += ch; i++;
  }
  if (field.length > 0 || row.length > 0) endRow();
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** The delimiter this file actually uses — European exports are frequently semicolon-separated. */
export function sniffDelimiter(text: string): string {
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
  const counts = [',', ';', '\t', '|'].map((d) => [d, firstLine.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

/**
 * A number as the bank wrote it. `1.234,56` and `1,234.56` are the same amount and differ only in
 * convention, so the decimal mark is stated by the mapping rather than guessed per row — guessing
 * turns `1.234` into either 1234 or 1.234 depending on the row it was guessed from.
 */
export function parseAmount(raw: string, decimalMark: '.' | ','): number | null {
  let s = String(raw ?? '').trim();
  if (!s) return null;
  // Accounting negatives, and any currency symbol or space the export carries.
  const parenNegative = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, '').replace(/[^\d.,+-]/g, '');
  if (!s) return null;
  s = decimalMark === ','
    ? s.replace(/\./g, '').replace(',', '.')
    : s.replace(/,/g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return parenNegative ? -n : n;
}

const MONTH_FIRST = new Set(['MM/DD/YYYY', 'MM-DD-YYYY', 'MM.DD.YYYY']);

/**
 * A date in the stated format. NEVER `new Date(string)`: it reads `03/04/2026` as March 4th, so a
 * European statement would be silently misdated for eleven days of every month — a valid date,
 * nothing raised, and the reconciler would match against the wrong window.
 */
export function parseDate(raw: string, format: string): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;

  // ISO first, whatever the stated format: an export that already uses it is unambiguous.
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const parts = s.split(/[/.\-\s]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const [a, b, c] = parts;
  if (!/^\d+$/.test(a) || !/^\d+$/.test(b) || !/^\d+$/.test(c)) return null;

  const monthFirst = MONTH_FIRST.has(format.toUpperCase());
  const day = Number(monthFirst ? b : a);
  const month = Number(monthFirst ? a : b);
  let year = Number(c);
  if (year < 100) year += year < 70 ? 2000 : 1900;

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

const pick = (row: Record<string, string>, col?: string | null): string =>
  (col && row[col] != null ? String(row[col]) : '').trim();

/** Parse a whole file against a mapping. Rejected lines are REPORTED, never dropped silently. */
export function parseStatement(text: string, mapping: StatementMapping): ParseResult {
  const grid = parseCsv(text, sniffDelimiter(text));
  if (grid.length === 0) return { headers: [], rows: [], problems: [] };

  const headers = grid[0].map((h) => h.trim());
  const rows: ParsedRow[] = [];
  const problems: ParseProblem[] = [];

  for (let r = 1; r < grid.length; r++) {
    const line = r + 1;
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => { rec[h] = grid[r][idx] ?? ''; });

    const booked = parseDate(pick(rec, mapping.date_column), mapping.date_format);
    if (!booked) {
      problems.push({ line, reason: `could not read a date from "${mapping.date_column}"` });
      continue;
    }

    let signed: number | null = null;
    if (mapping.amount_column) {
      signed = parseAmount(pick(rec, mapping.amount_column), mapping.decimal_mark);
    } else {
      const credit = parseAmount(pick(rec, mapping.credit_column), mapping.decimal_mark) ?? 0;
      const debit = parseAmount(pick(rec, mapping.debit_column), mapping.decimal_mark) ?? 0;
      // A row with neither is a balance line or a separator, not a transaction.
      signed = credit !== 0 ? Math.abs(credit) : debit !== 0 ? -Math.abs(debit) : null;
    }
    if (signed === null || signed === 0) {
      problems.push({ line, reason: 'no amount on this row' });
      continue;
    }

    rows.push({
      booked_at: booked,
      amount: Math.abs(signed),
      direction: signed > 0 ? 'in' : 'out',
      reference: pick(rec, mapping.reference_column) || null,
      counterparty_name: pick(rec, mapping.counterparty_column) || null,
      external_id: pick(rec, mapping.external_id_column) || null,
      line,
    });
  }

  return { headers, rows, problems };
}

/**
 * The identity a re-import must agree with. The unique index on
 * `(workspace_id, provider, provider_ref)` enforces it; this only has to be STABLE.
 *
 * The bank's own id wins where the export has one, else a fingerprint plus an ordinal — two
 * genuine EUR 50 deposits on one day fingerprint identically, and dropping the second would lose
 * real money from the feed.
 */
export function statementRefs(rows: ParsedRow[], accountId: string): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    if (r.external_id) return `ext:${r.external_id}`;
    const base = [
      accountId, r.booked_at, r.direction, r.amount.toFixed(2),
      (r.reference ?? '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120),
      (r.counterparty_name ?? '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80),
    ].join('|');
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `fp:${base}#${n}`;
  });
}
