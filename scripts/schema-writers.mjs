#!/usr/bin/env node
/** Schema-writer lint — does this checkout still agree with the live schema? */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co').replace(/\/$/, '');
const DB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/** Directories scanned, in the order a reader would care about them. */
const SCAN = [
  'supabase/functions',
  'src',
  'tests/integration',
  'api',
];

/** How far past a `.from()` to look for its `.select()` / `.insert()`. The hard stop at the next
 *  `.from()` is what guarantees correctness; this is only a bound for the pathological case. */
const WINDOW = 1200;

const SKIP_DIR = new Set(['node_modules', 'dist', 'build', '.deno', 'coverage', '__snapshots__']);

// ── live schema ──────────────────────────────────────────────────────────────

export async function fetchRegistry() {
  if (!DB_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required — the schema is the reference');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/schema_column_registry`, {
    method: 'POST',
    headers: { apikey: DB_KEY, Authorization: `Bearer ${DB_KEY}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error(`schema_column_registry → ${res.status} ${(await res.text()).slice(0, 200)}`);
  const payload = await res.json();
  const tables = payload?.tables;
  if (!tables || typeof tables !== 'object') throw new Error('schema_column_registry returned no tables object');

  /** table → Set(column) */
  const columns = new Map();
  /** table → Set(column) that Postgres computes itself */
  const generated = new Map();
  for (const [table, spec] of Object.entries(tables)) {
    columns.set(table, new Set(spec.columns ?? []));
    if (spec.generated?.length) generated.set(table, new Set(spec.generated));
  }

  // A registry that arrives INCOMPLETE does not fail — it describes a smaller database, and every
  // table missing from it is skipped by the lint, so the guard finds less and looks healthier.
  // That is exactly what happened when this was a set-returning function: PostgREST's row cap
  // truncated 7,600 rows, the check passed locally on a whole registry and reported 17 of its 26
  // baseline entries as "matching nothing" in CI. The reference data has to be checked like
  // anything else, so an implausibly small schema is an error rather than a quiet pass.
  const MIN_TABLES = 300;
  if (columns.size < MIN_TABLES) {
    throw new Error(
      `schema_column_registry returned only ${columns.size} tables (expected >= ${MIN_TABLES}). `
      + 'Refusing to lint against a partial schema — every missing table would be silently skipped.',
    );
  }
  return { columns, generated };
}

// ── repo scan ────────────────────────────────────────────────────────────────

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP_DIR.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx|js|mjs)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) yield full;
  }
}

const lineOf = (src, index) => src.slice(0, index).split('\n').length;

/**
 * Split a PostgREST select list on top-level commas, dropping embedded relations.
 *
 * `'id, name, products ( name, sku )'` → ['id', 'name'] — `name` and `sku` belong to `products`,
 * not to the table being selected from, and counting them against it is how a naive version of
 * this check produces noise nobody reads.
 */
function parseSelectList(list) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of list) {
    // An identifier immediately followed by `(` is an EMBEDDED RELATION, not a column of this
    // table — `products ( name, sku )` on quote_items. Discard the name along with its contents,
    // or the guard reports "column products does not exist on quote_items" on every join in the
    // codebase, which is most of them.
    if (ch === '(') { if (depth === 0) cur = ''; depth++; continue; }
    if (ch === ')') { depth--; continue; }
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    if (depth === 0) cur += ch;
  }
  out.push(cur);
  return out
    .map((s) => s.trim())
    // `alias:column` → column; `column!inner` / `column!left` → column
    .map((s) => (s.includes(':') ? s.slice(s.indexOf(':') + 1) : s))
    .map((s) => s.split('!')[0].trim())
    .filter((s) => s && s !== '*' && /^[a-z_][a-z0-9_]*$/i.test(s));
}

/**
 * Blank everything that is not code — string CONTENTS and comment bodies — preserving length so
 * every offset still lines up with the original.
 */
export function blankNonCode(src) {
  const out = src.split('');
  let i = 0;
  // Last significant character, for the one genuinely ambiguous case in JS lexing: whether a `/`
  // opens a REGEX or is division. It matters here because a regex character class routinely holds
  // quotes — this file's own `/\.from\(\s*['"`]…/` does — and a scanner with no regex awareness
  // treats that `'` as opening a string that never closes, going blind for the rest of the file.
  // The usual heuristic: after a value (identifier, literal, `)`, `]`) a slash is division;
  // anywhere else it starts a regex.
  let prev = '';
  while (i < src.length) {
    const ch = src[i];
    if (ch === '/' && src[i + 1] !== '/' && src[i + 1] !== '*' && !/[\w$)\]]/.test(prev)) {
      let j = i + 1;
      let inClass = false;
      while (j < src.length && src[j] !== '\n') {
        if (src[j] === '\\') { out[j] = ' '; out[j + 1] = ' '; j += 2; continue; }
        if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) break;
        out[j] = ' ';
        j++;
      }
      i = j + 1;
      prev = '/';
      continue;
    }
    if (ch === '/' && src[i + 1] === '/') {
      let j = i;
      while (j < src.length && src[j] !== '\n') { out[j] = ' '; j++; }
      i = j;
      prev = '';
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      let j = i;
      while (j < src.length && !(src[j] === '*' && src[j + 1] === '/')) { if (src[j] !== '\n') out[j] = ' '; j++; }
      // blank the closing `*/` too
      for (let k = j; k < Math.min(j + 2, src.length); k++) out[k] = ' ';
      i = j + 2;
      prev = '';
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      let j = i + 1;
      let tmplDepth = 0;
      while (j < src.length) {
        if (src[j] === '\\') { out[j] = ' '; out[j + 1] = ' '; j += 2; continue; }
        if (quote === '`' && src[j] === '$' && src[j + 1] === '{') { tmplDepth++; out[j] = ' '; out[j + 1] = ' '; j += 2; continue; }
        if (quote === '`' && tmplDepth > 0 && src[j] === '}') { tmplDepth--; out[j] = ' '; j++; continue; }
        if (src[j] === quote && tmplDepth === 0) break;
        if (src[j] !== '\n') out[j] = ' ';
        j++;
      }
      i = j + 1;
      prev = '"';
      continue;
    }
    if (!/\s/.test(ch)) prev = ch;
    i++;
  }
  return out.join('');
}

/** Object keys of an `.insert({...})` / `.update({...})` literal, or null when not parseable. */
function parseWriteKeys(body) {
  if (body.includes('...')) return null;   // spread — the keys are not visible here
  const keys = [];
  let depth = 0, i = 0;
  // The last non-whitespace character seen at depth 0. A key may only follow the start of the
  // object or a comma — WITHOUT this, the `baz` in `col: cond ? baz : qux` matches "identifier
  // then colon" and gets reported as a column. Ternaries are everywhere in these payloads, and
  // that one mistake produced most of the first run's false positives.
  let lastSig = '';
  while (i < body.length) {
    const ch = body[i];
    if (ch === '{' || ch === '[' || ch === '(') { depth++; i++; lastSig = ch; continue; }
    if (ch === '}' || ch === ']' || ch === ')') { depth--; i++; lastSig = ch; continue; }
    if (depth === 0) {
      if (/^\[/.test(body.slice(i))) return null; // computed key
      const m = /^([a-z_][a-z0-9_]*)\s*:/i.exec(body.slice(i));
      if (m && (lastSig === '' || lastSig === ',')) {
        keys.push(m[1]);
        i += m[0].length;
        lastSig = ':';
        continue;
      }
    }
    if (!/\s/.test(ch)) lastSig = ch;
    i++;
  }
  return keys;
}

/** Balanced slice starting at `open` (which must be the opening bracket). */
function balanced(src, open) {
  const pairs = { '{': '}', '(': ')', '[': ']' };
  const close = pairs[src[open]];
  if (!close) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === src[open]) depth++;
    else if (src[i] === close) { depth--; if (depth === 0) return src.slice(open + 1, i); }
  }
  return null;
}

/**
 * Every `.from('<table>')` chain in a file, with the columns it reads and the columns it writes.
 *
 * Scoped to the ~600 characters following the `from(...)`, which is comfortably past the
 * `.select()` / `.insert()` in every call site in this repo and short enough that the NEXT
 * statement's columns cannot bleed into this one's table.
 */
export function extractUsages(src, file) {
  const usages = [];
  // Structure is read off the MASKED copy (string contents blanked, same length, so every index
  // below indexes both). Column names living inside a select string are read off the original.
  const masked = blankNonCode(src);
  const re = /\.from\(\s*['"`]([a-z_][a-z0-9_]*)['"`]\s*\)/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    const table = m[1];
    // The window STOPS at the next `.from(`. Capped at 600 chars as well, but the hard stop is
    // what matters: a chain 40 lines later belongs to a different table, and attributing its
    // columns to this one reported real code as broken (`user_websites.update({page_count})`
    // blamed on `user_website_pages`, forty lines above it).
    const nextFrom = src.slice(m.index + m[0].length).search(/(?<!Array)\.from\(/);
    const end = m.index + m[0].length + (nextFrom === -1 ? WINDOW : Math.min(nextFrom, WINDOW));
    const window = src.slice(m.index, end);
    const maskedWindow = masked.slice(m.index, end);
    const at = { file, line: lineOf(src, m.index), table };

    const sel = /\.select\(\s*(['"`])([\s\S]*?)\1/.exec(window);
    if (sel) {
      if (sel[2].includes('${')) usages.push({ ...at, kind: 'skip', why: 'interpolated select' });
      else if (sel[2].includes('*')) usages.push({ ...at, kind: 'skip', why: 'select *' });
      else for (const col of parseSelectList(sel[2])) usages.push({ ...at, kind: 'read', column: col });
    }

    for (const verb of ['insert', 'update', 'upsert']) {
      const vm = new RegExp(`\\.${verb}\\(\\s*\\{`).exec(maskedWindow);
      if (!vm) continue;
      // Absolute offset into the FULL masked source — the body may extend past the window.
      const body = balanced(masked, m.index + vm.index + vm[0].length - 1);
      if (body === null) { usages.push({ ...at, kind: 'skip', why: `unparseable ${verb}` }); continue; }
      const keys = parseWriteKeys(body);
      if (keys === null) { usages.push({ ...at, kind: 'skip', why: `${verb} with spread/computed keys` }); continue; }
      for (const col of keys) usages.push({ ...at, kind: 'write', column: col });
    }
  }
  return usages;
}

// ── the check ────────────────────────────────────────────────────────────────

export function lint(registry, usages) {
  const problems = [];
  for (const u of usages) {
    if (u.kind === 'skip') continue;
    const cols = registry.columns.get(u.table);
    if (!cols) continue; // not a public table (a view alias, an RPC name, another system's table)
    if (!cols.has(u.column)) {
      problems.push({ ...u, problem: `column "${u.column}" does not exist on "${u.table}"` });
      continue;
    }
    if (u.kind === 'write' && registry.generated.get(u.table)?.has(u.column)) {
      problems.push({ ...u, problem: `"${u.table}.${u.column}" is GENERATED — Postgres rejects any non-DEFAULT write` });
    }
  }
  return problems;
}

export function scanRepo(root = ROOT) {
  const usages = [];
  for (const dir of SCAN) for (const file of walk(join(root, dir))) {
    usages.push(...extractUsages(readFileSync(file, 'utf8'), relative(root, file).replace(/\\/g, '/')));
  }
  return usages;
}

/**
 * Stable identity for a problem. Deliberately NOT line-based: the baseline must survive an edit
 * three lines above it, or it churns on every unrelated change and stops being read.
 */
export const problemKey = (p) => `${p.file}|${p.table}.${p.column}|${p.kind}`;

/** EMPTY, and it should stay that way. */
export const KNOWN_DRIFT = new Set([]);

export async function run() {
  const registry = await fetchRegistry();
  const usages = scanRepo();
  const all = lint(registry, usages);
  const seen = new Set(all.map(problemKey));
  const stale = [...KNOWN_DRIFT].filter((k) => !seen.has(k));
  const problems = all.filter((p) => !KNOWN_DRIFT.has(problemKey(p)));
  const known = all.length - problems.length;
  const skipped = usages.filter((u) => u.kind === 'skip').length;
  const checked = usages.length - skipped;
  return { problems, stale, known, checked, skipped, tables: registry.columns.size };
}

// CLI
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const { problems, stale, known, checked, skipped, tables } = await run();
  console.log(`schema-writers: ${checked} column references checked against ${tables} live tables `
    + `(${skipped} skipped as unparseable, ${known} known pre-existing drift)`);
  if (stale.length) {
    console.error(`\n${stale.length} baseline entry(ies) no longer match anything — delete them from KNOWN_DRIFT:\n`);
    for (const s of stale) console.error(`  ${s}`);
    console.error('\nThe baseline is shrink-only. A stale entry is a standing exemption for a file and');
    console.error('column that no longer needs one, and it will silently absorb the next real finding there.\n');
    process.exit(1);
  }
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):\n`);
    for (const p of problems) console.error(`  ${p.file}:${p.line}  [${p.kind}]  ${p.problem}`);
    console.error('\nA dropped or newly-generated column leaves its writers behind. Fix the call site,');
    console.error('or if the column genuinely moved, update the reader to the new derivation.\n');
    process.exit(1);
  }
  console.log('OK: every column reference this can parse exists, and nothing writes a generated column.');
}
