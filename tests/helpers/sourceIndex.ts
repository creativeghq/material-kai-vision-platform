/** The one way a guard test gets at the repo's source, and the reason it only pays for it once. */
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
