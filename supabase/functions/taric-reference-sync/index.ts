// deno-lint-ignore-file no-explicit-any
//
// Imports the EU TARIC goods nomenclature into `public.taric_codes`.
//
// The nomenclature is published as spreadsheet extractions (CIRCABC, "TARIC & Quota Data and
// Information") and changes monthly, so this is a recurring load rather than a one-off seed.
// We take CSV/TSV text rather than xlsx: the platform has no spreadsheet parser and adding one
// to an edge function to read a file an admin can "Save as CSV" in one click is not a trade
// worth making.
//
// Column names differ between the EU extraction, the Greek national extraction and whatever an
// admin re-exports, so headers are matched against an alias table instead of being hardcoded to
// one file layout. A file whose code column cannot be found fails loudly with the headers it
// actually saw — silently importing zero rows is the exact failure mode `taric_reference_stale`
// exists to catch, and it should never get the chance to fire for a fixable reason.

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isAdminAccess, isCronAuthorized } from '../_shared/auth.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { assertSafeUrl } from '../_shared/ssrf-guard.ts';
import { resolveSecret } from '../_shared/secrets.ts';

type Source = 'taric_eu' | 'gr_national';

interface RequestBody {
  action?: 'import' | 'stats';
  source?: Source;
  /** Raw CSV/TSV text. Mutually exclusive with `url`. */
  content?: string;
  /** Fetch the file instead of uploading it. Goes through the SSRF guard. */
  url?: string;
  /** Override auto-detection when a file uses column names we don't know. */
  mapping?: Partial<Record<Field, string>>;
}

type Field =
  | 'code' | 'product_line_suffix' | 'indent'
  | 'description_en' | 'description_el'
  | 'national_additional_code' | 'valid_from' | 'valid_to';

// Header aliases, lower-cased and stripped of punctuation before comparison. Greek headers are
// included because the EL extraction ships localised column names.
const HEADER_ALIASES: Record<Field, string[]> = {
  code: [
    'goods code', 'goods nomenclature code', 'goods nomenclature item id', 'commodity code',
    'taric code', 'taric', 'code', 'cn code', 'nomenclature code', 'κωδικος', 'κωδικος εμπορευματος',
  ],
  product_line_suffix: ['product line suffix', 'productline suffix', 'suffix', 'pls'],
  indent: ['indent', 'indents', 'number of indents', 'indent level'],
  description_en: ['description', 'description en', 'english description', 'goods description', 'description english'],
  description_el: ['description el', 'greek description', 'description greek', 'περιγραφη', 'περιγραφη εμπορευματος'],
  national_additional_code: ['national additional code', 'additional code', 'national code'],
  valid_from: ['start date', 'validity start date', 'valid from', 'date de debut'],
  valid_to: ['end date', 'validity end date', 'valid to', 'date de fin'],
};

const BATCH_SIZE = 1000;
/** Guard against an accidental multi-hundred-MB paste exhausting the worker. */
const MAX_CONTENT_BYTES = 40 * 1024 * 1024;

Deno.serve(withApiLogging(
  (req) => {
    try { return `taric-reference-sync?task=${new URL(req.url).searchParams.get('action') ?? 'import'}`; }
    catch { return 'taric-reference-sync'; }
  },
  async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

    const cron = isCronAuthorized(req);
    let body: RequestBody = {};
    if (req.method === 'POST') {
      try { body = (await req.json()) as RequestBody; } catch { body = {}; }
    }

    // The cron path carries no user; every other path must be an authenticated admin. This is
    // global reference data, so there is no workspace to bind to — admin is the whole gate.
    if (!cron) {
      const auth = await authenticate(req, { requireUser: true });
      if (!auth.success) throw new HttpError(401, auth.error ?? 'Unauthorized');
      if (body.action !== 'stats' && !isAdminAccess(auth)) {
        throw new HttpError(403, 'Importing TARIC reference data requires an admin');
      }
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    if (body.action === 'stats') return json(await stats(supabase));

    // A cron run has no uploaded file — it refreshes from the configured URL.
    let url = body.url ?? null;
    if (cron && !body.content && !url) {
      url = (await resolveSecret(supabase, 'TARIC_REFERENCE_URL')).value ?? null;
      if (!url) {
        // Deliberately a 200 skip rather than an error. Normally a dispatcher answering 200 on a
        // skip is exactly what hides breakage from `ops.silent_zero` — the difference here is
        // that the outcome this cron exists to produce has its own probe:
        // `taric_reference_stale` fires on an empty or 60-day-old table whatever the cron
        // reports. Failing monthly on an optional, not-yet-configured feed would be noise on top
        // of a signal that is already covered.
        return json({ ok: true, skipped: 'TARIC_REFERENCE_URL is not configured' });
      }
    }

    let text = body.content ?? '';
    if (!text && url) {
      const safe = await assertSafeUrl(url, { allowSchemes: ['https:'] });
      const res = await fetch(safe, { redirect: 'manual' });
      if (!res.ok) throw new HttpError(502, `Fetching the TARIC file failed: ${res.status}`);
      text = await res.text();
    }
    if (!text.trim()) throw new HttpError(400, 'Provide `content` (CSV/TSV text) or `url`');
    if (new Blob([text]).size > MAX_CONTENT_BYTES) {
      throw new HttpError(413, 'TARIC file is larger than 40 MB — split it or import by chapter');
    }

    const source: Source = body.source === 'gr_national' ? 'gr_national' : 'taric_eu';
    const result = await importCsv(supabase, text, source, body.mapping ?? {});
    return json(result);
  },
));

// ── CSV ────────────────────────────────────────────────────────────────────────────────────

/**
 * RFC 4180 parser. Handles quoted fields containing the delimiter, escaped `""`, and both
 * CRLF and LF line endings — TARIC descriptions routinely contain commas and quotes, so a
 * `split(',')` would shred roughly every line that matters.
 */
function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === delimiter) { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Pick the delimiter that yields the most columns on the header line. */
function detectDelimiter(text: string): string {
  const head = text.slice(0, 8192).split('\n')[0] ?? '';
  const counts: Array<[string, number]> = [
    [',', (head.match(/,/g) ?? []).length],
    ['\t', (head.match(/\t/g) ?? []).length],
    [';', (head.match(/;/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

function normalizeHeader(h: string): string {
  return (h ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')   // drop combining marks (Greek headers carry tonos)
    .toLowerCase()
    .replace(/[^a-z0-9α-ω\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveColumns(
  headers: string[],
  override: Partial<Record<Field, string>>,
): Partial<Record<Field, number>> {
  const normalized = headers.map(normalizeHeader);
  const out: Partial<Record<Field, number>> = {};

  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<[Field, string[]]>) {
    const forced = override[field];
    if (forced) {
      const idx = normalized.indexOf(normalizeHeader(forced));
      if (idx >= 0) { out[field] = idx; continue; }
    }
    // Exact alias match first; only then a contains-match, so "description" cannot claim the
    // "greek description" column when both are present.
    let idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx < 0) idx = normalized.findIndex((h) => aliases.some((a) => h.includes(a)));
    if (idx >= 0 && !Object.values(out).includes(idx)) out[field] = idx;
  }
  return out;
}

/** TARIC publishes every level zero-padded to 10 digits; shorter inputs are heading lines. */
function normalizeCode(raw: string): string | null {
  const digits = (raw ?? '').replace(/[^0-9]/g, '');
  if (digits.length === 0 || digits.length > 10) return null;
  if (![2, 4, 6, 8, 10].includes(digits.length)) return null;
  return digits.padEnd(10, '0');
}

function parseDate(raw: string | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  // DD/MM/YYYY and DD-MM-YYYY are what the extractions use; ISO passes through.
  const dmy = s.match(/^(\d{2})[/.-](\d{2})[/.-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : null;
}

interface ImportResult {
  ok: boolean;
  source: Source;
  rows_in_file: number;
  rows_parsed: number;
  rows_upserted: number;
  rows_skipped: number;
  parents_linked: number;
  columns: Partial<Record<Field, string>>;
  declarable_total: number;
}

async function importCsv(
  supabase: any,
  text: string,
  source: Source,
  override: Partial<Record<Field, string>>,
): Promise<ImportResult> {
  const rows = parseDelimited(text, detectDelimiter(text));
  if (rows.length < 2) throw new HttpError(400, 'File has no data rows');

  const headers = rows[0];
  const cols = resolveColumns(headers, override);
  if (cols.code === undefined) {
    throw new HttpError(
      400,
      `Could not find a goods-code column. Headers seen: ${headers.join(' | ')}. ` +
      'Pass `mapping: { code: "<header>" }` to override.',
    );
  }
  if (cols.description_en === undefined && cols.description_el === undefined) {
    throw new HttpError(
      400,
      `Could not find a description column. Headers seen: ${headers.join(' | ')}.`,
    );
  }

  const at = (r: string[], f: Field): string | undefined =>
    cols[f] === undefined ? undefined : r[cols[f] as number];

  const parsed: Array<Record<string, unknown>> = [];
  let skipped = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const code = normalizeCode(at(r, 'code') ?? '');
    if (!code) { skipped++; continue; }
    const indentRaw = (at(r, 'indent') ?? '').replace(/[^0-9]/g, '');
    parsed.push({
      code,
      product_line_suffix: ((at(r, 'product_line_suffix') ?? '').replace(/[^0-9]/g, '') || '80'),
      indent: indentRaw ? Number(indentRaw) : null,
      // A Greek extraction's single description column is Greek, not English.
      description_en: source === 'gr_national' && cols.description_el === undefined
        ? null
        : (at(r, 'description_en') ?? null),
      description_el: source === 'gr_national' && cols.description_el === undefined
        ? (at(r, 'description_en') ?? null)
        : (at(r, 'description_el') ?? null),
      national_additional_code: at(r, 'national_additional_code') ?? null,
      source,
      valid_from: parseDate(at(r, 'valid_from')),
      valid_to: parseDate(at(r, 'valid_to')),
    });
  }

  if (parsed.length === 0) {
    throw new HttpError(400, `No row carried a usable goods code (${skipped} rows skipped)`);
  }

  let upserted = 0;
  for (let i = 0; i < parsed.length; i += BATCH_SIZE) {
    const batch = parsed.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase.rpc('taric_upsert_batch', { p_rows: batch });
    if (error) throw new Error(`taric_upsert_batch failed at row ${i}: ${error.message}`);
    upserted += Number(data ?? 0);
  }

  const { data: linked, error: parentErr } = await supabase.rpc('taric_rebuild_parents');
  if (parentErr) throw new Error(`taric_rebuild_parents failed: ${parentErr.message}`);

  const { count } = await supabase
    .from('taric_codes').select('code', { count: 'exact', head: true }).eq('declarable', true);

  return {
    ok: true,
    source,
    rows_in_file: rows.length - 1,
    rows_parsed: parsed.length,
    rows_upserted: upserted,
    rows_skipped: skipped,
    parents_linked: Number(linked ?? 0),
    columns: Object.fromEntries(
      Object.entries(cols).map(([f, idx]) => [f, headers[idx as number]]),
    ) as Partial<Record<Field, string>>,
    declarable_total: count ?? 0,
  };
}

async function stats(supabase: any) {
  const [{ count: total }, { count: declarable }, { data: latest }] = await Promise.all([
    supabase.from('taric_codes').select('code', { count: 'exact', head: true }),
    supabase.from('taric_codes').select('code', { count: 'exact', head: true }).eq('declarable', true),
    supabase.from('taric_codes').select('imported_at').order('imported_at', { ascending: false }).limit(1),
  ]);
  return {
    total: total ?? 0,
    declarable: declarable ?? 0,
    last_import: latest?.[0]?.imported_at ?? null,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
