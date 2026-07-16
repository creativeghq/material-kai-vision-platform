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
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname, sep } from 'node:path';

const ROOT = process.cwd();
const DOCS = join(ROOT, 'docs');

/** Relative markdown links: `](path/to/doc.md)` and `](./doc.md#anchor)`. Skips URLs via the `:` exclusion. */
const MD_LINK_RE = /\]\(([^)#:]+\.md)(#[^)]*)?\)/g;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

const rel = (p: string) => p.slice(ROOT.length + 1).split(sep).join('/');

describe('docs link integrity', () => {
  const files = walk(DOCS).filter((f) => f.endsWith('.md'));

  it('finds the docs tree (guards against an empty walk)', () => {
    expect(files.length, 'no markdown files found under /docs').toBeGreaterThan(100);
  });

  it('every relative .md link resolves to a real file', () => {
    const broken: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(MD_LINK_RE)) {
        if (!existsSync(resolve(dirname(f), m[1]))) broken.push(`${rel(f)} → ${m[1]}`);
      }
    }
    expect(
      broken,
      `Broken doc link(s) — the target does not exist:\n  ${broken.join('\n  ')}\n` +
        `Repoint to a live doc, or remove the reference. If you deleted a doc, ` +
        `clean up its inbound links in the same commit.`,
    ).toEqual([]);
  });

  it('no doc links escape the repo root (../../.. path bugs)', () => {
    const escapes: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(MD_LINK_RE)) {
        const target = resolve(dirname(f), m[1]);
        if (!target.startsWith(ROOT)) escapes.push(`${rel(f)} → ${m[1]}`);
      }
    }
    expect(escapes, `Doc link(s) resolving outside the repo:\n  ${escapes.join('\n  ')}`).toEqual([]);
  });
});
