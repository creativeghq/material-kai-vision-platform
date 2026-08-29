/**
 * The one way a guard test gets at the repo's source, and the reason it only pays for it once.
 *
 * 225 of the 271 files in this directory are source-level greps — that is the enforcement
 * mechanism this codebase runs on, and the COUNT was never the problem. The cost distribution
 * was: measured 2026-08-29, `npm test` ran 3,732 tests in 53s, and **31 files held ~80% of it**,
 * with three of them (`deepLinkTargets` 40.1s, `pricingChain` 35.5s, `profileSectionLinks` 22.5s)
 * costing more than the other 3,700 tests put together.
 *
 * Almost none of that was assertion time. 79 test files walk the tree with `readdirSync`, 48 of
 * them declared their own `walk()`, and the slow ones then re-read and re-comment-stripped all
 * 1,616 files under `src` + `supabase/functions` ONCE PER `it()` — `pricingChain` did six full
 * passes to serve eight tests. The walk was usually hoisted to module scope; the READ almost
 * never was, and the read is the expensive half.
 *
 * So this is the twin of `stripComments`: that file turned ten drifted copies into one correct
 * scanner, this one turns 48 hand-rolled walks into one cache. Same shape of problem one layer
 * up — a copy nobody can see is a copy that drifts.
 *
 * Caches are module-level and therefore PER TEST FILE (vitest isolates each file in its own
 * worker), which is exactly the scope that was being wasted. Two indexes over overlapping roots
 * in the same file share the read and strip caches, so a file is read once and stripped once
 * however many guards consult it.
 *
 * ── CRLF is normalized on the way in, deliberately ────────────────────────────────────────────
 * Every accessor here works in LF. `stripComments` already normalized; the `read` helpers these
 * replaced did it by hand in some files and not others, which is the split `stripComments.ts`
 * documents: a guard's anchor describes source STRUCTURE — `"from('quote_items')\n      .insert("`
 * — and on a Windows checkout with `core.autocrlf=true` every one of those newlines is CR LF on
 * disk, so the anchor silently cannot match. `quoteCostBasis` failed exactly that way locally
 * while passing in CI. Normalizing in one place means `blankedSource` offsets still align, because
 * they align against the same normalized string the caller is handed.
 *
 * ── Exclusions are per-caller ON PURPOSE ──────────────────────────────────────────────────────
 * The 48 walks did not agree: some skipped `dist`, some `_generated`, some neither. Those are not
 * cosmetic differences — a guard's file set IS its coverage, so silently widening one can turn it
 * red on generated code it was never meant to police, and silently narrowing one makes it stop
 * seeing the thing it exists to catch WITHOUT failing, which is the worst available outcome for a
 * test whose whole job is to notice. Callers pass what they excluded before; this helper
 * standardizes the caching, not the policy. `node_modules` is the sole unconditional skip,
 * because no guard has ever wanted it.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { stripComments, blankComments } from './stripComments';

const ROOT = process.cwd();

/** Absolute path → file contents, CRLF normalized to LF. */
const rawCache = new Map<string, string>();
/** Absolute path → `stripComments(raw)`. Comment text removed. */
const strippedCache = new Map<string, string>();
/** Absolute path → `blankComments(raw)`. Aligned byte-for-byte with `readSource` of the same file. */
const blankedCache = new Map<string, string>();
/** `dir\0exclude,list` → the `.ts`/`.tsx` files under it. */
const walkCache = new Map<string, string[]>();

/** Repo-relative, forward slashes, on every platform. */
export const posix = (p: string): string => relative(ROOT, p).split(sep).join('/');

/** Absolute path from a repo-relative one. An already-absolute path passes through. */
const abs = (p: string): string => (p.startsWith(ROOT) ? p : join(ROOT, p));

/** File contents in LF, read at most once per test file. */
export function readSource(path: string): string {
  const p = abs(path);
  let v = rawCache.get(p);
  if (v === undefined) {
    const disk = readFileSync(p, 'utf8');
    v = disk.indexOf('\r') === -1 ? disk : disk.replace(/\r\n/g, '\n');
    rawCache.set(p, v);
  }
  return v;
}

/**
 * Comment TEXT removed — use when asserting on WHAT the source says. See `stripComments.ts` for
 * why that is a scanner and not a pair of regexes.
 */
export function strippedSource(path: string): string {
  const p = abs(path);
  let v = strippedCache.get(p);
  if (v === undefined) {
    v = stripComments(readSource(p));
    strippedCache.set(p, v);
  }
  return v;
}

/**
 * Comments replaced by spaces — same length, line and column as `readSource(path)` for
 * everything that is not a comment. Use when an assertion reports a line number or slices by
 * index.
 */
export function blankedSource(path: string): string {
  const p = abs(path);
  let v = blankedCache.get(p);
  if (v === undefined) {
    v = blankComments(readSource(p));
    blankedCache.set(p, v);
  }
  return v;
}

export interface SourceIndexOptions {
  /** Repo-relative roots to walk. Default: `src` + `supabase/functions`. */
  roots?: readonly string[];
  /**
   * Directory and file basenames to skip, on top of the unconditional `node_modules`. Pass
   * whatever the guard skipped before — see the note at the top of this file.
   */
  exclude?: readonly string[];
  /** Final say on membership, given the repo-relative posix path. */
  filter?: (posixPath: string) => boolean;
}

function walk(dir: string, exclude: readonly string[], out: string[]): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === 'node_modules' || exclude.includes(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, exclude, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

function walkCached(dir: string, exclude: readonly string[]): string[] {
  const key = `${dir}\0${[...exclude].sort().join(',')}`;
  let v = walkCache.get(key);
  if (v === undefined) {
    v = walk(dir, exclude, []);
    walkCache.set(key, v);
  }
  return v;
}

export interface SourceIndex {
  /** Absolute paths, in walk order. */
  readonly files: string[];
  /** Repo-relative posix paths, index-aligned with `files`. */
  readonly paths: string[];
  /** `[absolutePath, strippedContents]` for every file — the workhorse of most guards. */
  stripped(): Array<[string, string]>;
  /** `[absolutePath, blankedContents]`, for guards that report a line number. */
  blanked(): Array<[string, string]>;
  /** Every file's stripped source joined by newlines. Cached; some guards only need this. */
  all(): string;
}

/**
 * A cached view of the source tree.
 *
 * Build it ONCE at module scope and let every `it()` in the file read from it:
 *
 *     const INDEX = sourceIndex({ exclude: ['_generated'] });
 *     it('…', () => { for (const [file, src] of INDEX.stripped()) { … } });
 *
 * The walk, the reads and the comment stripping then happen on first use and never again,
 * however many guards in that file consult them.
 */
export function sourceIndex(options: SourceIndexOptions = {}): SourceIndex {
  const { roots = ['src', 'supabase/functions'], exclude = [], filter } = options;

  const files = roots
    .flatMap((r) => walkCached(join(ROOT, r), exclude))
    .filter((f) => (filter ? filter(posix(f)) : true));

  let strippedPairs: Array<[string, string]> | undefined;
  let blankedPairs: Array<[string, string]> | undefined;
  let joined: string | undefined;

  return {
    files,
    paths: files.map(posix),
    stripped() {
      return (strippedPairs ??= files.map((f) => [f, strippedSource(f)]));
    },
    blanked() {
      return (blankedPairs ??= files.map((f) => [f, blankedSource(f)]));
    },
    all() {
      return (joined ??= this.stripped().map(([, s]) => s).join('\n'));
    },
  };
}
