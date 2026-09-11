/** The public catalog URL is workspace-scoped, and it is built in exactly one place. */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  catalogPublicPath,
  catalogPublicUrl,
  normalizeWorkspaceHandle,
  WORKSPACE_HANDLE_RE,
} from '@/config/catalogPublicUrl';

const ROOT = process.cwd();
const SCAN = ['src', 'supabase/functions'];

/** The source itself and its generated twin are where the string is allowed to be assembled. */
const SOURCES = new Set([
  'src/config/catalogPublicUrl.ts',
  'supabase/functions/_shared/catalogPublicUrl.generated.ts',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

describe('the public catalog path has one builder', () => {
  const files = SCAN.flatMap((d) => walk(join(ROOT, d)))
    .map((f) => relative(ROOT, f).replace(/\\/g, '/'));

  it('finds files to scan', () => {
    expect(files.length).toBeGreaterThan(500);
  });

  /**
   * Nine sites interpolated `/c/${slug}` before this — the publish tool, the customer email, two
   * admin screens, the list page, the builder header. Adding the workspace segment by editing nine
   * places that have to agree is how the email keeps the old shape for a release.
   */
  it('nobody interpolates a catalog path by hand', () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (SOURCES.has(f)) continue;
      const src = readFileSync(join(ROOT, f), 'utf8');
      // `/c/` immediately followed by an interpolation or concatenation — i.e. a path being BUILT,
      // not the literal prefix appearing in a route pattern, a test fixture or a comment.
      for (const m of src.matchAll(/['"`]\/c\/\$\{/g)) {
        offenders.push(`${f}:${src.slice(0, m.index!).split('\n').length}`);
      }
    }
    expect(
      offenders,
      'Build it with `catalogPublicPath(handle, slug)` from src/config/catalogPublicUrl.ts '
      + '(Deno: the mirrored .generated.ts). A hand-built path drops the workspace segment.\n'
      + offenders.join('\n'),
    ).toEqual([]);
  });

  it('the route declares both segments', () => {
    const app = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8');
    expect(app).toContain('path="/c/:handle/:slug"');
    // The one-segment form stays routed: every link shared before the scoping exists in inboxes,
    // and the page canonicalises it rather than 404-ing on it.
    expect(app).toContain('path="/c/:slug"');
  });
});

describe('catalogPublicPath', () => {
  it('needs BOTH halves — a missing handle is no URL, never a half one', () => {
    expect(catalogPublicPath('materialshub', 'monoblock')).toBe('/c/materialshub/monoblock');
    expect(catalogPublicPath(null, 'monoblock')).toBeNull();
    expect(catalogPublicPath('materialshub', null)).toBeNull();
    expect(catalogPublicPath(undefined, undefined)).toBeNull();
  });

  it('does not double the slash when the origin carries one', () => {
    expect(catalogPublicUrl('https://app.materialshub.gr/', 'materialshub', 'x'))
      .toBe('https://app.materialshub.gr/c/materialshub/x');
  });
});

describe('normalizeWorkspaceHandle', () => {
  /** The same normalisation `set_workspace_public_handle` applies, so the field and the RPC
   *  cannot disagree about whether what was typed is acceptable. */
  it('turns what a person types into what the CHECK accepts', () => {
    for (const input of ['Materials Hub', '  materials--hub  ', 'Materials_Hub!', 'Μaterials Hub']) {
      const out = normalizeWorkspaceHandle(input);
      expect(WORKSPACE_HANDLE_RE.test(out), `${input} → ${out}`).toBe(true);
    }
  });

  it('never leaves a leading or trailing dash for the CHECK to reject', () => {
    expect(normalizeWorkspaceHandle('---brand---')).toBe('brand');
    expect(normalizeWorkspaceHandle('!!!')).toBe('');
  });

  it('stays inside the 40-character column budget', () => {
    expect(normalizeWorkspaceHandle('a'.repeat(80)).length).toBeLessThanOrEqual(40);
  });
});
