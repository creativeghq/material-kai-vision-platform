/** fe-smoke runs only the routes a push can have affected, and every route whenever it cannot tell. */
import { describe, it, expect } from 'vitest';
import { selectRoutes, buildRecord, ALWAYS } from '../../scripts/smoke/routeSelection.mjs';
import { ROUTE_LIST } from '../e2e/routeList.mjs';

const routes = ['/', '/auth', '/finance', '/crm', '/tools'];
const record = {
  '/': ['src/main.tsx', 'src/App.tsx'],
  '/auth': ['src/main.tsx', 'src/pages/Auth.tsx'],
  '/finance': ['src/main.tsx', 'src/pages/Admin/FinancePage.tsx', 'src/components/core/ui/button.tsx'],
  '/crm': ['src/main.tsx', 'src/modules/crm/pages/CRMPage.tsx', 'src/components/core/ui/button.tsx'],
  '/tools': ['src/main.tsx', 'src/pages/Tools/ToolsPage.tsx'],
};

describe('selectRoutes', () => {
  it('runs a changed page and the always-on shell routes only', () => {
    const sel = selectRoutes({ routes, changed: ['src/pages/Admin/FinancePage.tsx'], record });
    expect(sel.routes).toEqual(['/', '/auth', '/finance']);
    expect(sel.all).toBe(false);
  });

  it('runs every route that loads a changed shared module', () => {
    const sel = selectRoutes({ routes, changed: ['src/components/core/ui/button.tsx'], record });
    expect(sel.routes).toEqual(['/', '/auth', '/finance', '/crm']);
  });

  it('runs everything when an entry module changes, because every route loads it', () => {
    expect(selectRoutes({ routes, changed: ['src/main.tsx'], record }).routes).toEqual(routes);
  });

  it('runs only the shell for a change no route loads (docs, functions, types)', () => {
    const sel = selectRoutes({ routes, changed: ['docs/x.md', 'supabase/functions/a/index.ts'], record });
    expect(sel.routes).toEqual(ALWAYS);
  });

  it.each([
    'package-lock.json', 'vite.config.ts', 'index.html', 'vercel.json', 'tailwind.config.ts',
    'tests/e2e/routeList.mjs', 'playwright.config.ts', 'public/sw.js', '.github/content-audit-baseline.json',
  ])('runs everything when global file %s changes', (f) => {
    expect(selectRoutes({ routes, changed: [f], record }).all).toBe(true);
  });

  it('fails OPEN: no baseline, no record, forced, or a route with no record all run', () => {
    expect(selectRoutes({ routes, changed: null, record }).all).toBe(true);
    expect(selectRoutes({ routes, changed: ['src/x.ts'], record: null }).all).toBe(true);
    expect(selectRoutes({ routes, changed: [], record, forceAll: true }).all).toBe(true);
    const partial = { ...record, '/crm': [] };
    expect(selectRoutes({ routes, changed: ['docs/x.md'], record: partial }).routes).toContain('/crm');
  });

  it('keeps the shell routes in the real route list', () => {
    for (const r of ALWAYS) expect(ROUTE_LIST).toContain(r);
  });
});

describe('buildRecord', () => {
  const chunkModules = { 'a-1.js': ['src/a.ts'], 'b-1.js': ['src/b.ts'] };

  it('records the modules of the chunks a route loaded and carries skipped routes forward', () => {
    const next = buildRecord({
      routes: ['/x', '/y', '/z'],
      prev: { '/y': ['src/old.ts'] },
      chunkModules,
      routeAssets: { '/x': ['a-1.js', 'b-1.js'] },
    });
    expect(next).toEqual({ '/x': ['src/a.ts', 'src/b.ts'], '/y': ['src/old.ts'] });
  });

  it('records nothing for a route whose loaded chunks are unknown to this build, so it runs next time', () => {
    const next = buildRecord({ routes: ['/x'], prev: { '/x': ['src/a.ts'] }, chunkModules, routeAssets: { '/x': ['zzz.js'] } });
    expect(next).toEqual({});
  });
});
