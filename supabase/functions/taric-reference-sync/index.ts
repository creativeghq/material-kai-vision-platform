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
  /**
   * CIRCABC folder to resolve the CURRENT month's extraction from. Overrides the configured
   * `TARIC_CIRCABC_LIBRARY_ID`. When set (or configured), neither `url` nor `content` is needed.
   */
  library_id?: string;
  /**
   * Which language edition to pull when resolving from CIRCABC. ONE per invocation: each
   * edition is ~25,000 rows and two in a single run exceeds the edge runtime's budget — the
   * worker is killed mid-response and pg_net reports only "error reading a body from
   * connection". The cron therefore issues one call per language.
   */
  language?: string;
}

type Field =
  | 'code' | 'product_line_suffix' | 'indent'
  | 'description_en' | 'description_el'
  | 'national_additional_code' | 'valid_from' | 'valid_to' | 'language';

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
  language: ['language', 'lang', 'language code'],
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

    // ── Resolve WHAT to import ──────────────────────────────────────────────────────────────
    //
    // Preference order, most automatic first:
    //   1. a CIRCABC library — the current month is discovered on every run, which is the only
    //      option that stays correct, because the extraction moves to a new folder monthly;
    //   2. a pinned file URL — right until the next publication, then quietly stale;
    //   3. pasted content — the manual fallback.
    let url = body.url ?? null;
    let libraryId = body.library_id ?? null;
    if (!libraryId && !url && !body.content) {
      libraryId = (await resolveSecret(supabase, 'TARIC_CIRCABC_LIBRARY_ID')).value ?? null;
    }

    if (libraryId) {
      const language = (body.language ?? DEFAULT_LANGUAGE).toUpperCase();
      console.log(`[taric] resolving ${language} under ${libraryId}`);
      const files = await resolveNomenclatureFiles(libraryId, [language]);
      const file = files[0];
      console.log(`[taric] resolved ${file.name} (${file.id}) in "${file.folder}"`);

      // Each edition carries its own Language column, so the importer routes it into
      // description_en / description_el and the coalesce-based upsert merges the editions onto
      // one row across separate invocations.
      const bytes = await fetchBinary(circabcDownloadUrl(file.id, file.name));
      console.log(`[taric] downloaded ${bytes.byteLength} bytes`);
      const g = bytes[0] === 0x50 && bytes[1] === 0x4b
        ? await parseXlsx(bytes)
        : parseDelimited(new TextDecoder().decode(bytes), detectDelimiter(new TextDecoder().decode(bytes)));
      console.log(`[taric] parsed ${g.length} rows`);
      const res = await importGrid(
        supabase, g, language === 'EL' ? 'gr_national' : 'taric_eu', body.mapping ?? {},
      );
      console.log('[taric] import complete');
      return json({
        ...res,
        resolved_from: 'circabc', library_id: libraryId,
        language, file: file.name, folder: file.folder,
      });
    }

    if (cron && !body.content && !url) {
      url = (await resolveSecret(supabase, 'TARIC_REFERENCE_URL')).value ?? null;
      if (!url) {
        // Deliberately a 200 skip rather than an error. Normally a dispatcher answering 200 on a
        // skip is exactly what hides breakage from `ops.silent_zero` — the difference here is
        // that the outcome this cron exists to produce has its own probe:
        // `taric_reference_stale` fires on an empty or 60-day-old table whatever the cron
        // reports. Failing monthly on an optional, not-yet-configured feed would be noise on top
        // of a signal that is already covered.
        return json({ ok: true, skipped: 'neither TARIC_CIRCABC_LIBRARY_ID nor TARIC_REFERENCE_URL is configured' });
      }
    }

    // Rows arrive either as pasted delimited text or as the published spreadsheet. The
    // spreadsheet is the canonical artefact — CIRCABC publishes xlsx and nothing else — so a
    // fetched URL is read as a workbook when it looks like one, which is what lets the monthly
    // cron run with no human in the loop.
    let grid: string[][] | null = null;
    let text = body.content ?? '';

    if (!text && url) {
      const bytes = await fetchBinary(url);
      // A xlsx is a zip; every zip starts "PK\x03\x04". Sniffing the bytes beats trusting a
      // Content-Type header that CIRCABC does not always set correctly.
      if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
        grid = await parseXlsx(bytes);
      } else {
        text = new TextDecoder().decode(bytes);
      }
    }

    if (!grid) {
      if (!text.trim()) throw new HttpError(400, 'Provide `content` (CSV/TSV text) or `url`');
      if (new Blob([text]).size > MAX_CONTENT_BYTES) {
        throw new HttpError(413, 'TARIC file is larger than 40 MB — split it or import by chapter');
      }
      grid = parseDelimited(text, detectDelimiter(text));
    }

    const source: Source = body.source === 'gr_national' ? 'gr_national' : 'taric_eu';
    const result = await importGrid(supabase, grid, source, body.mapping ?? {});
    return json(result);
  },
));

// ── CIRCABC discovery ──────────────────────────────────────────────────────────────────────
//
// The nomenclature is republished EVERY MONTH into a NEW folder, so a pinned file URL is right
// for exactly one month and then silently serves stale codes. CIRCABC's own Angular client
// reads `GET /service/circabc/spaces/{id}/children`, and that endpoint honours `guest=true` for
// public libraries — so the folder tree can be walked without credentials and the current
// month resolved on every run.
//
// (`/api/-default-/public/alfresco/…` answers 401 and `/api/nodes/…` 404s; this is the path the
// product actually uses.)

const CIRCABC_BASE = 'https://circabc.europa.eu';
const CIRCABC_MAX_DEPTH = 4;
const DEFAULT_LANGUAGE = 'EN';

/**
 * Every outbound fetch in this function goes through here: SSRF-guarded, size-capped, and
 * redirect-aware.
 *
 * Redirects are followed BY HAND, re-running the SSRF guard on each hop. `redirect: 'follow'`
 * would let the first hop send us anywhere; `redirect: 'manual'` — the previous behaviour —
 * yields an opaque response whose body cannot be read at all, which surfaced as
 * "error reading a body from connection" the moment the CIRCABC listing endpoint redirected.
 * Neither is right on its own.
 */
async function fetchGuarded(rawUrl: string, accept?: string): Promise<Response> {
  let target = rawUrl;
  for (let hop = 0; hop <= 3; hop++) {
    const safe = await assertSafeUrl(target, { allowSchemes: ['https:'] });
    const res = await fetch(safe, {
      redirect: 'manual',
      headers: accept ? { Accept: accept } : undefined,
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new HttpError(502, `Redirect without a Location from ${target}`);
      // Cancel the body so the connection is released before the next hop.
      await res.body?.cancel();
      target = new URL(location, safe).toString();
      continue;
    }
    if (!res.ok) throw new HttpError(502, `Fetching ${target} failed: ${res.status}`);
    return res;
  }
  throw new HttpError(502, `Too many redirects starting at ${rawUrl}`);
}

async function fetchBinary(rawUrl: string): Promise<Uint8Array> {
  const res = await fetchGuarded(rawUrl);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_CONTENT_BYTES) {
    throw new HttpError(413, 'TARIC file is larger than 40 MB — import it by chapter');
  }
  return bytes;
}

interface CircabcNode {
  id: string;
  name: string;
  type: string;
  properties?: Record<string, string>;
}

const isFolder = (n: CircabcNode) => (n.type ?? '').endsWith('}folder');

async function circabcChildren(nodeId: string): Promise<CircabcNode[]> {
  if (!/^[0-9a-f-]{36}$/i.test(nodeId)) {
    throw new HttpError(400, `Not a CIRCABC node id: ${nodeId}`);
  }
  const url = `${CIRCABC_BASE}/service/circabc/spaces/${nodeId}/children?guest=true&limit=500`;
  const res = await fetchGuarded(url, 'application/json');
  const body = await res.json();
  const list = Array.isArray(body) ? body : (body?.data ?? body?.nodes ?? []);
  if (!Array.isArray(list)) throw new HttpError(502, 'CIRCABC listing was not a list');
  return list as CircabcNode[];
}

/** Most recently published sibling. Dates first — they survive a year rollover that a name
 *  sort does not, because "01 - January" sorts BELOW "12 - December" of the year before. */
function newestFolder(folders: CircabcNode[]): CircabcNode {
  const stamp = (n: CircabcNode) =>
    Date.parse(n.properties?.modified ?? '') || Date.parse(n.properties?.created ?? '') || 0;
  return [...folders].sort((a, b) => (stamp(b) - stamp(a)) || b.name.localeCompare(a.name))[0];
}

interface ResolvedFile { language: string; id: string; name: string; folder: string }

/**
 * Walk down from `libraryId`, always taking the most recently published subfolder, until a level
 * carrying `Nomenclature <LANG>.xlsx` files is reached. Works whether the configured node is the
 * year folder (→ month → files) or its parent (→ year → month → files).
 */
async function resolveNomenclatureFiles(
  libraryId: string,
  languages: string[],
): Promise<ResolvedFile[]> {
  let nodeId = libraryId;
  let folderName = '';
  const trail: string[] = [];

  for (let depth = 0; depth < CIRCABC_MAX_DEPTH; depth++) {
    const children = await circabcChildren(nodeId);

    const found: ResolvedFile[] = [];
    for (const c of children) {
      const m = /^Nomenclature\s+([A-Z]{2})\.xlsx$/i.exec((c.name ?? '').trim());
      if (m && languages.includes(m[1].toUpperCase())) {
        found.push({ language: m[1].toUpperCase(), id: c.id, name: c.name, folder: folderName });
      }
    }
    if (found.length > 0) return found;

    const folders = children.filter(isFolder);
    if (folders.length === 0) break;
    const next = newestFolder(folders);
    trail.push(next.name);
    nodeId = next.id;
    folderName = next.name;
  }

  throw new HttpError(
    502,
    `No "Nomenclature <LANG>.xlsx" found under CIRCABC node ${libraryId}` +
    (trail.length ? ` (walked ${trail.join(' → ')})` : '') +
    '. Has the library been reorganised?',
  );
}

/** CIRCABC serves any attachment by node id; the filename in the path is decorative. */
const circabcDownloadUrl = (fileId: string, name: string) =>
  `${CIRCABC_BASE}/sd/a/${fileId}/${encodeURIComponent(name)}`;

// ── XLSX ───────────────────────────────────────────────────────────────────────────────────

/**
 * Minimal xlsx reader: enough of the format to turn the published TARIC extraction into a grid,
 * and nothing more. No formulas, no styles, no dates-as-serial-numbers (the extraction writes
 * dates as text).
 *
 * Two subtleties, both of which silently corrupt this file rather than failing:
 *
 * 1. **Cells are placed by their `r="H1234"` reference, never by stream position.** Positional
 *    reading shifts every later column when a cell is missing.
 * 2. **An empty cell is written self-closing — `<c r="C536" t="inlineStr" />`.** A pattern that
 *    demands a closing `</c>` does not merely skip it, it swallows the NEXT cell along with it:
 *    the following cell's value gets attributed to the empty cell's column. That put `EL` in the
 *    End-date column and pushed each description into the Indent column, where a description
 *    like "…κλάσεων 0801 μέχρι και 0806" reduced to the digits 8010806 and overflowed a
 *    smallint mid-import. Both forms are matched below.
 */
async function parseXlsx(bytes: Uint8Array): Promise<string[][]> {
  const { unzipSync, strFromU8 } = await import('npm:fflate@0.8.2');

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch (err) {
    throw new HttpError(400, `Not a readable spreadsheet: ${(err as Error)?.message ?? 'unzip failed'}`);
  }

  // Older producers intern every string in a shared table; this extraction inlines them. Support
  // both — an unresolved index would otherwise import as a number.
  const shared: string[] = [];
  const sharedXml = files['xl/sharedStrings.xml'];
  if (sharedXml) {
    for (const si of strFromU8(sharedXml).match(/<si>[\s\S]*?<\/si>/g) ?? []) {
      shared.push(decodeXmlText([...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join('')));
    }
  }

  const sheetName = Object.keys(files).find((n) => /^xl\/worksheets\/sheet1\.xml$/.test(n))
    ?? Object.keys(files).find((n) => /^xl\/worksheets\/.*\.xml$/.test(n));
  if (!sheetName) throw new HttpError(400, 'Spreadsheet has no worksheet');

  const xml = strFromU8(files[sheetName]);
  const grid: string[][] = [];

  for (const rowXml of xml.match(/<row[\s\S]*?<\/row>/g) ?? []) {
    const cells: string[] = [];
    // Self-closing `<c … />` OR `<c …>…</c>`. The alternation order matters: `/>` is tried
    // first so an empty cell terminates at itself instead of consuming its neighbour.
    for (const m of rowXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = m[1];
      const body = m[2] ?? '';
      const col = columnIndex(/\br="([A-Z]+)\d+"/.exec(attrs)?.[1] ?? '');
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];

      let value = '';
      if (type === 's') {
        const idx = Number(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '-1');
        value = shared[idx] ?? '';
      } else if (type === 'inlineStr') {
        value = decodeXmlText([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''));
      } else {
        const t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1];
        value = decodeXmlText(t ?? /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '');
      }
      if (col >= 0) {
        while (cells.length < col) cells.push('');
        cells[col] = value;
      } else {
        cells.push(value);
      }
    }
    if (cells.some((c) => c.trim() !== '')) grid.push(cells);
  }
  if (grid.length < 2) throw new HttpError(400, 'Spreadsheet has no data rows');
  return grid;
}

/** "A" → 0, "H" → 7, "AA" → 26. Returns -1 when the reference is missing. */
function columnIndex(ref: string): number {
  if (!ref) return -1;
  let n = 0;
  for (const ch of ref) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function decodeXmlText(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&')
    // The extraction uses a pipe where a non-breaking space belongs ("50|kg"). Left alone it
    // survives into descriptions and into the search vector.
    .replace(/\|/g, ' ')
    .trim();
}

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

async function importGrid(
  supabase: any,
  rows: string[][],
  source: Source,
  override: Partial<Record<Field, string>>,
): Promise<ImportResult> {
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
    // The published extraction writes code and product line suffix in ONE cell: "0101210000 10".
    // Both halves must be split BEFORE normalising: the concatenated digits are 12 long and
    // `normalizeCode` — correctly — rejects that, so splitting afterwards would have skipped
    // every row in the file.
    //
    // The suffix is not cosmetic. 80 is a declarable line; 10 is an intermediate one that exists
    // only to carry the hierarchy and is rejected on a customs declaration. Defaulting it to 80
    // would publish thousands of unusable codes into the picker as if they were valid.
    // Split ONLY when the part before the trailing pair is itself a full 10-digit code, which is
    // the published form. Without that guard a hand-spaced code — "6907 21 00 90" — loses its
    // last pair to the suffix and silently imports as heading 6907210000.
    const rawCode = (at(r, 'code') ?? '').trim();
    const split = /^([0-9\s]+?)\s+(\d{2})$/.exec(rawCode);
    const splitCodeDigits = split ? split[1].replace(/[^0-9]/g, '') : '';
    const useSplit = splitCodeDigits.length === 10;
    const codePart = useSplit ? split![1] : rawCode;
    const suffixFromCode = useSplit ? split![2] : undefined;

    const code = normalizeCode(codePart);
    if (!code) { skipped++; continue; }

    const suffixCell = (at(r, 'product_line_suffix') ?? '').replace(/[^0-9]/g, '');
    const suffix = suffixCell || suffixFromCode || '80';

    // Indent is published as dashes ("- - -"), not a number. Anything outside 0..99 is not an
    // indent whatever the file says — a stray value there means the column mapping is wrong, and
    // it must not be allowed to abort a 25,000-row import at the smallint boundary.
    const indentCell = (at(r, 'indent') ?? '').trim();
    const indentRaw = /^[-\s]+$/.test(indentCell) && indentCell
      ? (indentCell.match(/-/g) ?? []).length
      : (indentCell.replace(/[^0-9]/g, '') ? Number(indentCell.replace(/[^0-9]/g, '')) : null);
    const indent = indentRaw != null && indentRaw >= 0 && indentRaw <= 99 ? indentRaw : null;

    // One description column plus a Language column is how the extraction ships. Route by the
    // row's own language rather than by which file we think we are reading.
    const lang = (at(r, 'language') ?? '').trim().toUpperCase();
    const single = at(r, 'description_en') ?? null;
    const isGreekRow = lang === 'EL' || (lang === '' && source === 'gr_national');
    parsed.push({
      code,
      product_line_suffix: suffix,
      indent,
      description_en: cols.description_el !== undefined
        ? single
        : (isGreekRow ? null : single),
      description_el: cols.description_el !== undefined
        ? (at(r, 'description_el') ?? null)
        : (isGreekRow ? single : null),
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
