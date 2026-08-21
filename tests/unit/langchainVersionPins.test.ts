import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * One LangChain version per package, across the whole edge runtime.
 *
 * Two things this guards, both of which have already happened here:
 *
 * 1. **Unversioned `npm:` specifiers.** `_shared/langgraph-core.ts` — the runner behind every
 *    background agent — imported `npm:@langchain/langgraph`, `npm:@langchain/anthropic`,
 *    `npm:@langchain/openai`, `npm:@langchain/google-genai` and `npm:@langchain/core/messages`
 *    with no version at all. Deno re-resolves those on every deploy and `deno.lock` records
 *    none of them, so a breaking release ships to production with no commit and no review. It
 *    had already drifted: `supabase/functions/node_modules/.deno` held core at 1.1.15 AND
 *    1.2.3, anthropic at 1.3.10 AND 1.5.2, while the lockfile knew only the pinned pair.
 *
 * 2. **Two copies of the same package in one isolate.** The version is written inline in ~50
 *    shared tool modules, because they are imported by functions that have no import map of
 *    their own. Kept in agreement by hand, they are one careless edit away from putting two
 *    `@langchain/core` builds in the same deployment — at which point a message class from one
 *    fails `instanceof` against the other, silently. That cross-version hazard is real enough
 *    that upstream patched it deliberately (core 1.1.30 / langgraph 1.2.1 added explicit
 *    `: symbol` annotations to their `Symbol.for()` brands for exactly this reason).
 *
 * Bumping a version is therefore: change `agent-chat/deno.json`, then sed the inline pins to
 * match. This test tells you if you missed one.
 */

const ROOT = join(__dirname, '..', '..');
const FN_DIR = join(ROOT, 'supabase', 'functions');
const AGENT_CHAT_CONFIG = join(FN_DIR, 'agent-chat', 'deno.json');

/** Every `npm:@langchain/<pkg>[@version][/subpath]` specifier, with its version if pinned. */
const SPECIFIER = /npm:(@langchain\/[a-z0-9-]+)(?:@([0-9][^'"/\s)]*))?/g;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    // node_modules holds the resolved packages themselves — thousands of files, none ours.
    if (entry === 'node_modules' || entry === '.git') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (entry.endsWith('.ts') || entry === 'deno.json') out.push(full);
  }
  return out;
}

interface Ref { file: string; pkg: string; version: string | null; line: number }

function collectRefs(): Ref[] {
  const refs: Ref[] = [];
  for (const file of sourceFiles(FN_DIR)) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('npm:@langchain/')) continue;
    text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(SPECIFIER)) {
        refs.push({
          file: relative(ROOT, file).replace(/\\/g, '/'),
          pkg: m[1],
          version: m[2] ?? null,
          line: i + 1,
        });
      }
    });
  }
  return refs;
}

describe('LangChain version pins across the edge runtime', () => {
  it('finds the specifiers at all (guards against the scan silently matching nothing)', () => {
    const refs = collectRefs();
    expect(refs.length, 'no npm:@langchain specifiers found — did the layout or scheme change?')
      .toBeGreaterThan(20);
  });

  it('every @langchain specifier carries an explicit version', () => {
    const floating = collectRefs()
      .filter((r) => r.version === null)
      .map((r) => `${r.file}:${r.line} → npm:${r.pkg}`);

    expect(
      floating,
      'an unversioned npm:@langchain specifier re-resolves on every deploy and is absent from ' +
      'deno.lock, so a breaking release ships with no commit. Pin it to the version in ' +
      'supabase/functions/agent-chat/deno.json.',
    ).toEqual([]);
  });

  it('all files agree on one version per package', () => {
    const byPkg = new Map<string, Map<string, string[]>>();
    for (const ref of collectRefs()) {
      if (!ref.version) continue;
      if (!byPkg.has(ref.pkg)) byPkg.set(ref.pkg, new Map());
      const versions = byPkg.get(ref.pkg)!;
      if (!versions.has(ref.version)) versions.set(ref.version, []);
      versions.get(ref.version)!.push(`${ref.file}:${ref.line}`);
    }

    const split = [...byPkg.entries()]
      .filter(([, versions]) => versions.size > 1)
      .map(([pkg, versions]) =>
        `${pkg}: ${[...versions.entries()].map(([v, files]) => `${v} (${files.join(', ')})`).join(' vs ')}`);

    expect(
      split,
      'two versions of one @langchain package in the same runtime. Deno loads both, and a ' +
      'class from one does not satisfy instanceof against the other — which fails silently. ' +
      'Bring every site to the same version.',
    ).toEqual([]);
  });

  /**
   * zod is part of this set, and it is the pin that actually took production down.
   *
   * `@langchain/langgraph` imports `zod/v4` (and `zod/v3`, `zod/v4-mini`) from its own dist.
   * zod 3.24.0 exports only `.`, `./package.json` and `./locales/*` — so a lock that resolves
   * langgraph against 3.24.0 throws ERR_PACKAGE_PATH_NOT_EXPORTED on the first import, at
   * runtime, in production. That happened on 2026-08-21: typecheck, lint and 2,200 unit tests
   * were green and every JARVIS turn 500'd. The subpaths arrived in zod 3.25.0.
   *
   * `scripts/smoke-agent-chat-runtime.ts` catches the resolved-lock version of this by actually
   * running the graph; this catches the source-level version before the lock is even built.
   */
  it('every pinned zod is new enough to export the subpaths langgraph imports', () => {
    const ZOD = /npm:zod@([0-9][^'"\s)]*)/g;
    const bad: string[] = [];
    const seen = new Set<string>();

    for (const file of sourceFiles(FN_DIR)) {
      const text = readFileSync(file, 'utf8');
      if (!text.includes('npm:zod@')) continue;
      text.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(ZOD)) {
          const version = m[1];
          // `npm:zod@3` is a RANGE, not a pin — Deno resolves it to the newest 3.x, which has
          // the subpaths. Only exact pins can be too old.
          if (!/^\d+\.\d+\.\d+/.test(version)) continue;
          seen.add(version);
          const [major, minor] = version.split('.').map(Number);
          if (major < 3 || (major === 3 && minor < 25)) {
            bad.push(`${relative(ROOT, file).replace(/\\/g, '/')}:${i + 1} pins zod@${version}`);
          }
        }
      });
    }

    expect(
      bad,
      'zod below 3.25.0 does not export the `zod/v4` subpath that @langchain/langgraph ' +
      'imports. A lock that resolves langgraph against it throws ERR_PACKAGE_PATH_NOT_EXPORTED ' +
      'on the first request — clean typecheck, clean tests, 500 on every turn.',
    ).toEqual([]);

    expect(
      [...seen].sort(),
      'more than one exact zod version across the edge runtime — pick one',
    ).toHaveLength(seen.size ? 1 : 0);
  });

  it('the inline pins match agent-chat/deno.json, which is the declared version', () => {
    expect(existsSync(AGENT_CHAT_CONFIG), 'agent-chat/deno.json missing').toBe(true);
    const imports: Record<string, string> = JSON.parse(readFileSync(AGENT_CHAT_CONFIG, 'utf8')).imports ?? {};

    const declared = new Map<string, string>();
    for (const target of Object.values(imports)) {
      for (const m of String(target).matchAll(SPECIFIER)) {
        if (m[2]) declared.set(m[1], m[2]);
      }
    }
    expect(declared.size, 'agent-chat/deno.json declares no @langchain versions').toBeGreaterThan(2);

    const mismatched = collectRefs()
      .filter((r) => r.version && declared.has(r.pkg) && declared.get(r.pkg) !== r.version)
      .map((r) => `${r.file}:${r.line} pins ${r.pkg}@${r.version}, deno.json says ${declared.get(r.pkg)}`);

    expect(
      mismatched,
      'an inline pin drifted from agent-chat/deno.json. Bumping a version means changing the ' +
      'import map AND every inline specifier in supabase/functions/**.',
    ).toEqual([]);
  });
});
