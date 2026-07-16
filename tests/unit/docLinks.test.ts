/**
 * Documentation link integrity guard.
 *
 * Every relative `](*.md)` link in /docs must resolve to a real file.
 *
 * Why this exists: two cleanup commits — 51ff18b6 (dead web-scrape path) and
 * 75e9e843 (3 dead edge functions) — deleted docs + functions but left the
 * references behind. 30 dangling links accumulated, including 4 to
 * web-scraping-integration.md (deleted by 51ff18b6, yet still advertised as
 * "✨ NEW" in docs/README.md). See #268.
 *
 * Deleting is as much a wiring operation as adding; this makes the delete half
 * fail loudly. Added at ZERO — keep it there. If a doc is intentionally removed,
 * remove or repoint its inbound links in the same commit.
 *
 * Scope: only relative links to .md files. External URLs, anchors, and links to
 * non-.md files (source, .sql) are out of scope — they need a different check.
 *
 * IMPORTANT — resolve against GIT-TRACKED files, not the local filesystem.
 * existsSync() answers "is this on MY disk", which is not the question. A dev box
 * has gitignored dirs (.claude/) and populated submodule working copies
 * (mivaa-pdf-extractor/ is a separate repo) that a fresh clone and CI do not.
 * Using existsSync made this test pass locally and fail in CI — and it was CI
 * that was right: both of those links are genuinely broken for anyone cloning.
 * git ls-files is what a reader actually gets, so it is the honest oracle and it
 * makes the check environment-independent.
 */
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
