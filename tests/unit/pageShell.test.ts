/** Every routed page renders the design-system shell: PageHeader, and a record route the record archetype. */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

import { blankComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const BASELINE = join(ROOT, '.github', 'page-shell-baseline.json');

const HEADER = /<(?:PageHeader|HubRecordPage)\b/;
const RECORD = /<(?:HubRecordLayout|HubRecordPage)\b/;

const rel = (p: string) => relative(ROOT, p).split(sep).join('/');
const read = (p: string) => blankComments(readFileSync(p, 'utf8'));

function resolveSpec(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null;
  for (const c of [base, `${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')]) {
    if (existsSync(c) && !c.endsWith(sep) && c.match(/\.tsx?$/)) return c;
  }
  return null;
}

function componentFiles(file: string, src: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of src.matchAll(/const\s+(\w+)\s*=\s*lazy\w*\(\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const f = resolveSpec(file, m[2]);
    if (f) out.set(m[1], f);
  }
  for (const m of src.matchAll(/import\s+(?:(\w+)|\{([^}]+)\})\s+from\s+['"]([^'"]*\/pages\/[^'"]+)['"]/g)) {
    const f = resolveSpec(file, m[3]);
    if (!f) continue;
    const names = m[1] ? [m[1]] : m[2].split(',').map((n) => n.trim().split(/\s+as\s+/).pop()!.trim());
    for (const n of names) if (n) out.set(n, f);
  }
  return out;
}

export interface RoutedPage { path: string; file: string }

export function routedPages(): RoutedPage[] {
  const routes: RoutedPage[] = [];
  const app = join(SRC, 'App.tsx');
  const appSrc = read(app);
  const appComponents = componentFiles(app, appSrc);
  const starts = [...appSrc.matchAll(/\bpath="([^"]+)"/g)];
  starts.forEach((m, i) => {
    const segment = appSrc.slice(m.index!, starts[i + 1]?.index ?? appSrc.length);
    // Public pages (pay links, share links, kiosks) render outside the app chrome by design.
    if (!/<Layout\b/.test(segment)) return;
    for (const [name, file] of appComponents) {
      if (new RegExp(`<${name}[\\s/>]`).test(segment)) routes.push({ path: m[1], file });
    }
  });

  const modulesDir = join(SRC, 'modules');
  for (const mod of readdirSync(modulesDir)) {
    const index = ['index.ts', 'index.tsx'].map((f) => join(modulesDir, mod, f)).find(existsSync);
    if (!index) continue;
    const src = read(index);
    const components = componentFiles(index, src);
    for (const m of src.matchAll(/\{\s*path:\s*['"]([^'"]+)['"]\s*,\s*component:\s*(\w+)/g)) {
      const file = components.get(m[2]);
      if (file) routes.push({ path: m[1], file });
    }
  }
  return routes.filter((r) => !/Redirect/.test(r.file));
}

/** The page file, or a local component it renders directly, satisfies `re`. */
function renders(file: string, re: RegExp): boolean {
  const src = read(file);
  if (re.test(src)) return true;
  for (const m of src.matchAll(/import\s+[^'"]*?from\s+['"]([^'"]+)['"]/g)) {
    if (m[1].startsWith('@/components/core/ui')) continue;
    const dep = resolveSpec(file, m[1]);
    if (dep && dep.endsWith('.tsx') && re.test(read(dep))) return true;
  }
  return false;
}

export function findOffenders(): { pages: string[]; records: string[] } {
  const routes = routedPages();
  const files = [...new Set(routes.map((r) => r.file))];
  const recordFiles = [...new Set(routes.filter((r) => r.path.includes('/:')).map((r) => r.file))];
  return {
    pages: files.filter((f) => !renders(f, HEADER)).map(rel).sort(),
    records: recordFiles.filter((f) => !renders(f, RECORD)).map(rel).sort(),
  };
}

type Baseline = { pages: string[]; records: string[] };
const readBaseline = (): Baseline => JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline;

if (process.env.WRITE_PAGE_SHELL_BASELINE === '1') {
  writeFileSync(BASELINE, JSON.stringify(findOffenders(), null, 2) + '\n');
}

describe('every page is built on the design-system shell', () => {
  const offenders = findOffenders();

  it('route discovery actually finds the routed pages', () => {
    const files = routedPages().map((r) => rel(r.file));
    expect(new Set(files).size).toBeGreaterThan(80);
    expect(files).toContain('src/modules/crm/pages/LeadDetailPage.tsx');
    expect(files).toContain('src/modules/crm/pages/CRMPage.tsx');
  });

  it('the baseline exists', () => {
    expect(existsSync(BASELINE), 'missing .github/page-shell-baseline.json — regenerate with WRITE_PAGE_SHELL_BASELINE=1').toBe(true);
  });

  it('no NEW page skips PageHeader', () => {
    const base = new Set(readBaseline().pages);
    expect(
      offenders.pages.filter((f) => !base.has(f)),
      'These routed pages render no <PageHeader>. Start every page from docs/design-system.md §10: ' +
        '<PageHeader icon title subtitle breadcrumbs actions /> then the §7 archetype from ' +
        'src/components/core/hub/. Do NOT copy the layout of an older page — the ones in ' +
        '.github/page-shell-baseline.json are the debt, not the reference.',
    ).toEqual([]);
  });

  it('no NEW record route (/:id) skips the record archetype', () => {
    const base = new Set(readBaseline().records);
    expect(
      offenders.records.filter((f) => !base.has(f)),
      'A record page renders <HubRecordPage> (PageHeader + HubRecordLayout in one): identity and ' +
        'properties on the left, the record\'s content in the centre, what it links to on the right. ' +
        'Edit in a dialog, not as a page-wide form.',
    ).toEqual([]);
  });

  it('baseline entries that are already fixed have been removed from it', () => {
    const base = readBaseline();
    const fixed = [
      ...base.pages.filter((f) => !offenders.pages.includes(f)),
      ...base.records.filter((f) => !offenders.records.includes(f)),
    ];
    expect(fixed, 'Fixed — delete these from .github/page-shell-baseline.json so they cannot regress:').toEqual([]);
  });
});
