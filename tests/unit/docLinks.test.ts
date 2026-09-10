/** Documentation link integrity guard. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname, sep } from 'node:path';

const ROOT = process.cwd();
const DOCS = join(ROOT, 'docs');

/** Every path tracked in THIS repo (submodule contents excluded — they live in another repo). */
function trackedFiles(): Set<string> {
  const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return new Set(out.split('\n').filter(Boolean));
}

/** Relative markdown links: `](path/to/doc.md)` and `](./doc.md#anchor)`. Skips URLs via the `:` exclusion. */
const MD_LINK_RE = /\]\(([^)#:]+\.md)(#[^)]*)?\)/g;

/** Absolute path → repo-relative posix path, matching `git ls-files` output. */
const toRepoPath = (abs: string) => abs.slice(ROOT.length + 1).split(sep).join('/');

describe('docs link integrity', () => {
  const tracked = trackedFiles();
  const docs = [...tracked].filter((p) => p.startsWith('docs/') && p.endsWith('.md'));

  it('finds the tracked docs tree (guards against an empty read)', () => {
    expect(tracked.size, 'git ls-files returned nothing').toBeGreaterThan(500);
    expect(docs.length, 'no tracked markdown files under docs/').toBeGreaterThan(100);
  });

  it('every relative .md link resolves to a git-tracked file', () => {
    const broken: string[] = [];
    for (const rel of docs) {
      const abs = join(ROOT, rel);
      for (const m of readFileSync(abs, 'utf8').matchAll(MD_LINK_RE)) {
        const target = toRepoPath(resolve(dirname(abs), m[1]));
        if (!tracked.has(target)) broken.push(`${rel} → ${m[1]}`);
      }
    }
    expect(
      broken,
      `Broken doc link(s) — target is not a tracked file in this repo:\n  ${broken.join('\n  ')}\n` +
        `Repoint to a live doc, or remove the reference. NOTE: gitignored paths ` +
        `(.claude/) and submodule contents (mivaa-pdf-extractor/) are NOT tracked ` +
        `here — link to their GitHub URL instead of a relative path.`,
    ).toEqual([]);
  });

  it('no doc links escape the repo root (../../.. path bugs)', () => {
    const escapes: string[] = [];
    for (const rel of docs) {
      const abs = join(ROOT, rel);
      for (const m of readFileSync(abs, 'utf8').matchAll(MD_LINK_RE)) {
        if (!resolve(dirname(abs), m[1]).startsWith(ROOT)) escapes.push(`${rel} → ${m[1]}`);
      }
    }
    expect(escapes, `Doc link(s) resolving outside the repo:\n  ${escapes.join('\n  ')}`).toEqual([]);
  });
});
