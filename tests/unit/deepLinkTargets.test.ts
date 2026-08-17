/**
 * Deep-link guard — a link that goes nowhere is a silent zero in the navigation layer.
 *
 * Two link shapes in this app point at a destination by STRING, from a place the destination
 * cannot see:
 *
 *   • `action_url` on a flow event → stored on a `user_notifications` row → the bell → `navigate()`
 *   • `?tab=<key>` deep links into a tabbed page
 *
 * Both fail silently when the destination moves or was never spelled the way the link spells it:
 *
 *   • A tabbed page is one Radix `<Tabs value={searchParams.get('tab') ?? …}>`. Radix renders a
 *     pane only when the value matches a `<TabsContent value=…>`. There is no "unknown tab" branch
 *     and no fallback, so an unknown key renders the sidebar with nothing selected and an EMPTY
 *     body. The route resolves, the page loads, the header draws, and the operator is looking at a
 *     blank panel.
 *   • An `action_url` whose path matches no route lands on the catch-all instead.
 *
 * This is not hypothetical — it is what this file was written for. Every order notification
 * carried `action_url: '/finance?tab=orders'` while the tab has always been keyed `doc_orders`, so
 * clicking an order in the bell landed on a dead Finance page. The same sweep found leave-request
 * notifications pointing at `/hr?tab=absences` (the tab is `timeoff`), campaign notifications at
 * `/email-marketing?tab=campaigns` (the route is `/marketing/email`), follower notifications at
 * `/profile?tab=followers` (no such tab), and five `action_url`s under `/admin/finance` — a prefix
 * that has never been a route at all.
 *
 * Nothing else can see any of it:
 *
 *   • TypeScript sees a string. `'orders'` and `'doc_orders'` are the same type.
 *   • The links are written at a DISTANCE from what they address — in edge functions, in services,
 *     in notification rows stored months earlier. Renaming a tab cannot break its call sites at
 *     compile time when the call sites are string literals in another runtime.
 *   • The notification row is perfectly well-formed either way, so no integrity check sees it.
 *
 * So the check has to be a source scan, and it has to fail LOUDLY when it cannot resolve a
 * destination rather than quietly vouching for it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { stripComments as sharedStripComments, blankComments as sharedBlankComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const rel = (p: string) => relative(ROOT, p).replace(/\\/g, '/');

/**
 * Walk for `.ts`/`.tsx`. NOT `fs.globSync` — that landed in Node 22 and CI runs Node 20, matching
 * every other source-scanning guard in this directory.
 */
function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === 'node_modules' || e === 'dist') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

/** Blank out comments while PRESERVING line numbers, so a documented example URL is not a link. */
function blankComments(src: string): string {
  return sharedBlankComments(src);
}

const SOURCE_ROOTS = ['src', 'supabase/functions'];
const sourceFiles = SOURCE_ROOTS.flatMap((r) => walk(join(ROOT, r)));

// ─────────────────────────────── route table ───────────────────────────────

function resolveSpec(spec: string, fromFile: string, name?: string): string | null {
  if (!spec.startsWith('.') && !spec.startsWith('@/')) return null;
  const base = spec.startsWith('@/') ? join(ROOT, 'src', spec.slice(2)) : resolve(dirname(fromFile), spec);
  for (const c of [base + '.tsx', base + '.ts', join(base, 'index.tsx'), join(base, 'index.ts')]) {
    if (existsSync(c)) return followBarrel(c, name);
  }
  return null;
}

/** `index.tsx` is often just `export { Page } from './Page'` — follow it to the real component. */
function followBarrel(file: string, name?: string, hops = 0): string {
  if (hops > 3) return file;
  const src = read(file);
  if (src.split('\n').filter((l) => l.trim()).length > 6) return file;
  for (const m of src.matchAll(/export\s+\{([^}]+)\}\s+from\s+'([^']+)'/g)) {
    const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()!.trim());
    if (name && !names.includes(name)) continue;
    const base = m[2].startsWith('@/') ? join(ROOT, 'src', m[2].slice(2)) : resolve(dirname(file), m[2]);
    for (const c of [base + '.tsx', base + '.ts', join(base, 'index.tsx')]) {
      if (existsSync(c)) return followBarrel(c, name, hops + 1);
    }
  }
  return file;
}

function importMap(file: string): Map<string, string> {
  const src = read(file);
  const map = new Map<string, string>();
  for (const m of src.matchAll(/import\s+(?:\{([^}]+)\}|([A-Za-z0-9_]+))\s+from\s+'([^']+)'/g)) {
    if (m[2]) map.set(m[2], m[3]);
    if (m[1]) for (const raw of m[1].split(',')) {
      const n = raw.trim().split(/\s+as\s+/).pop()!.trim();
      if (n) map.set(n, m[3]);
    }
  }
  for (const m of src.matchAll(/const\s+([A-Za-z0-9_]+)\s*=\s*lazy\(\(\)\s*=>\s*import\('([^']+)'\)/g)) {
    map.set(m[1], m[2]);
  }
  return map;
}

/** Every declared route pattern, and the page component behind it where we can resolve one. */
function routeTable(): { patterns: Set<string>; pageFor: Map<string, string> } {
  const patterns = new Set<string>();
  const pageFor = new Map<string, string>();

  const appFile = join(ROOT, 'src/App.tsx');
  const app = read(appFile);
  const appImports = importMap(appFile);
  for (const m of app.matchAll(/path="([^"]+)"/g)) patterns.add(m[1]);
  // The page is the LEAF of the guard/layout nest — the self-closing element. Wrappers
  // (<AuthGuard>, <Layout>, <EntitlementGuard>) are open tags and are skipped by construction.
  for (const m of app.matchAll(/path="([^"]+)"([\s\S]{0,900}?)(?=\n\s*(?:<Route|path="))/g)) {
    if (pageFor.has(m[1])) continue;
    const leaves = (m[2].match(/<([A-Z][A-Za-z0-9_]*)\s*\/>/g) ?? [])
      .map((s) => s.replace(/[<>/\s]/g, '')).reverse();
    for (const c of leaves) {
      const spec = appImports.get(c);
      const f = spec && resolveSpec(spec, appFile, c);
      if (f) { pageFor.set(m[1], f); break; }
    }
  }

  // Feature modules register their own routes: src/modules/*/index.ts → { path, component }.
  for (const dir of readdirSync(join(ROOT, 'src/modules'))) {
    const file = join(ROOT, 'src/modules', dir, 'index.ts');
    if (!existsSync(file)) continue;
    const src = read(file);
    const imports = importMap(file);
    for (const m of src.matchAll(/path:\s*'([^']+)'/g)) patterns.add(m[1]);
    for (const m of src.matchAll(/path:\s*'([^']+)'[\s\S]{0,200}?component:\s*([A-Za-z0-9_]+)/g)) {
      if (pageFor.has(m[1])) continue;
      const spec = imports.get(m[2]);
      const f = spec && resolveSpec(spec, file, m[2]);
      if (f) pageFor.set(m[1], f);
    }
  }
  return { patterns, pageFor };
}

const { patterns: ROUTES, pageFor: PAGE_FOR } = routeTable();

/** Does a concrete URL path match a declared route pattern (`:param` segments, `*` wildcard)? */
function routeExists(urlPath: string): boolean {
  const segs = urlPath.split('/').filter(Boolean);
  for (const r of ROUTES) {
    if (!r.startsWith('/')) continue;
    const rs = r.split('/').filter(Boolean);
    if (rs[rs.length - 1] === '*') {
      if (segs.length >= rs.length - 1 && rs.slice(0, -1).every((s, i) => s.startsWith(':') || s === segs[i])) return true;
      continue;
    }
    if (rs.length !== segs.length) continue;
    if (rs.every((s, i) => s.startsWith(':') || s === segs[i])) return true;
  }
  return false;
}

// ─────────────────────────────── tab keys per page ───────────────────────────────

const tabCache = new Map<string, Set<string>>();

function tabKeys(file: string, depth = 0, seen = new Set<string>()): Set<string> {
  if (seen.has(file) || depth > 2) return new Set();
  seen.add(file);
  const src = read(file);
  const keys = new Set<string>();
  for (const m of src.matchAll(/<TabsContent\s+[^>]*value="([^"]+)"/g)) keys.add(m[1]);
  // Catalog-driven panes: <TabsContent value={d.value}> fed by an array of { value: '…' }.
  if (/<TabsContent\s+[^>]*value=\{/.test(src)) {
    for (const m of src.matchAll(/value:\s*'([A-Za-z0-9_-]+)'/g)) keys.add(m[1]);
    for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
      const r = resolveSpec(m[1], file);
      if (r) for (const k of tabKeys(r, depth + 1, seen)) keys.add(k);
    }
  }
  // A page that DELEGATES its body: the route component is a thin shell (guard + PageHeader) and
  // the tabs live one component down — /market-trends is <MarketTrendsPage> wrapping
  // <MarketTrendsTab>. Without this the guard reports "renders no tabs at all" for every such page,
  // which reads as a broken link when the truth is that the check could not see the tabs. Follow
  // local imports when THIS file declares no panes of its own; the "no tabs at all" verdict then
  // still fires, but only once the children have been looked at too.
  if (keys.size === 0) {
    for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
      const r = resolveSpec(m[1], file);
      if (r) for (const k of tabKeys(r, depth + 1, seen)) keys.add(k);
    }
  }
  return keys;
}

function tabsFor(file: string): Set<string> {
  if (!tabCache.has(file)) tabCache.set(file, tabKeys(file));
  return tabCache.get(file)!;
}

// ─────────────────────────────── the scans ───────────────────────────────

interface Site { file: string; line: number; }

function scan(re: RegExp): Map<string, Site[]> {
  const hits = new Map<string, Site[]>();
  for (const file of sourceFiles) {
    blankComments(read(file)).split('\n').forEach((line, i) => {
      for (const m of line.matchAll(re)) {
        const key = m.slice(1).join('|');
        if (!hits.has(key)) hits.set(key, []);
        hits.get(key)!.push({ file: rel(file), line: i + 1 });
      }
    });
  }
  return hits;
}

const show = (sites: Site[]) => sites.map((s) => `${s.file}:${s.line}`).join(', ');

describe('the route table itself', () => {
  it('resolves — a broken scan would silently vouch for every link in the repo', () => {
    expect(ROUTES.size).toBeGreaterThan(80);
    expect(PAGE_FOR.size).toBeGreaterThan(30);
    // Spot-check both registries: App.tsx routes and module-registered routes.
    expect(routeExists('/finance')).toBe(true);
    expect(routeExists('/finance/orders/abc-123')).toBe(true);
    expect(routeExists('/hr')).toBe(true);
    expect(routeExists('/marketing/email')).toBe(true);
    // …and that a plausible-but-absent path is NOT accepted. `/admin/finance` is the real one:
    // five action_urls pointed there and it has never been a route.
    expect(routeExists('/admin/finance')).toBe(false);
  });

  /**
   * The other half of the same prefix, and the half a URL-literal scan cannot see.
   *
   * Six components built their finance links off
   *     useLocation().pathname.startsWith('/admin') ? '/admin/finance' : '/finance'
   * to mirror a mount point Finance does not have (CRM does — `/admin/crm/*` is real). Every link
   * they produced from an admin page resolved to the `path="*"` catch-all: an order opened from a
   * CRM timeline, a covering purchase order opened from a sale, an invoice opened right after it
   * was created. The scans below never saw it, because the URL is only a URL at runtime — in the
   * source it is a template hole.
   *
   * So the assertion is on the PREFIX, not on the assembled path: nothing in `src` may name
   * `/admin/finance` at all. `FINANCE_BASE` (src/modules/finance/routes.ts) is the one answer.
   */
  it('never names the /admin/finance prefix in source — it has never been a route', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      blankComments(read(file)).split('\n').forEach((line, i) => {
        if (line.includes('/admin/finance')) offenders.push(`${rel(file)}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
    }
    expect(
      offenders,
      'Finance is mounted at /finance and nowhere else (src/modules/finance/index.ts registers no ' +
      'routes). Import FINANCE_BASE from @/modules/finance/routes instead of building an ' +
      '/admin-prefixed one.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  /**
   * The same rule for CRM, which had the opposite problem: `/admin/crm/*` WAS real, rendering the
   * very same pages as `/crm/*` but behind AdminGuard instead of the `crm.view` capability. So the
   * link worked — for admins. A sales, accountant or hr user following any of the ~30 in-app links
   * into that prefix was bounced off a customer record they can open one URL over, and nothing
   * anywhere reported it: the route resolved, the guard did its job, the page simply refused.
   *
   * `/admin/crm/*` is now redirects into `/crm/*`. The exception is `users/:id` — `public.roles` is
   * the GLOBAL account tier, one value true in every workspace at once, and `crm-api` refuses to
   * mutate it for anyone who is not a global operator. That is operator tooling and keeps its
   * address.
   */
  it('links CRM at /crm — the /admin/crm twin is redirects only (except operator users/:id)', () => {
    // The redirect registry and the redirect component must name the old prefix; that is their job.
    const ALLOWED = ['src/modules/crm/index.ts', 'src/modules/crm/pages/CrmLegacyRedirect.tsx'];
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      if (ALLOWED.includes(rel(file))) continue;
      blankComments(read(file)).split('\n').forEach((line, i) => {
        // `/admin/crm/users` is the one surface that legitimately stays under /admin.
        const hits = line.split('/admin/crm').length - 1;
        const users = line.split('/admin/crm/users').length - 1;
        if (hits > users) offenders.push(`${rel(file)}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
    }
    expect(
      offenders,
      'CRM record pages live at /crm/... (capability crm.view). Link there directly — the ' +
      '/admin/crm paths are redirects kept for links that outlived the move, not addresses to ' +
      'write new links against.' + '\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  /**
   * The seven tenant surfaces that were mounted under /admin, and why the prefix mattered.
   *
   * `AdminGuard` does not mean "an admin". It is `isPlatformOperator` — owner/admin of the ROOT
   * workspace — and its own comment says so. Behind it sat pages that configure things belonging
   * to a WORKSPACE: its messaging channels, its email domain, its catalogs, its connected social
   * accounts, its tracked mentions, its automations, its quote vocabulary. Every table behind them
   * carries a workspace_id. So a customer who BOUGHT one of those modules could not open the page
   * that sets it up — not their owner, not anyone. The module was sold and unusable, and nothing
   * reported it: the route resolved and the guard did exactly what it says on the tin.
   *
   * They now live at their own addresses behind `EntitlementGuard + WorkspaceAdminGuard` (the
   * workspace owns the module AND you run that workspace), with the old paths kept as redirects
   * for links that outlived the move. Writing a NEW link to the old prefix would quietly put a
   * tenant back in front of the operator console, so it fails here instead.
   */
  it('never links the moved tenant surfaces under /admin', () => {
    const MOVED = [
      '/admin/messaging', '/admin/emails', '/admin/email-templates', '/admin/catalogs',
      '/admin/social-media', '/admin/mention-monitoring', '/admin/flows', '/admin/quote-requests',
      '/admin/quote-settings', '/admin/status-tags', '/admin/upsells', '/admin/timeline-steps',
      '/admin/catalog-master',
    ];
    // The redirect helper and the module registries that declare the redirect ROUTES must name
    // the old paths — that is the whole job of those entries.
    const ALLOWED = (f: string) => f === 'src/modules/_core/legacyAdminRedirect.tsx'
      || (f.startsWith('src/modules/') && f.endsWith('/index.ts'));
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      if (ALLOWED(rel(file))) continue;
      blankComments(read(file)).split('\n').forEach((line, i) => {
        // A redirect DECLARATION has to name the address it retires; everything else is a link.
        if (line.includes('<Navigate to=')) return;
        for (const prefix of MOVED) {
          if (line.includes(prefix)) {
            offenders.push(`${rel(file)}:${i + 1}: ${prefix}`);
            break;
          }
        }
      });
    }
    expect(
      offenders,
      'These surfaces moved off /admin because AdminGuard is the PLATFORM OPERATOR, not a ' +
      'workspace admin — behind it a tenant cannot configure a module they own. Link to the new ' +
      'path; the /admin one is a redirect for old links, not an address to write.' + '\n'
      + offenders.join('\n'),
    ).toEqual([]);
  });
});

describe('notification action_url', () => {
  it('every action_url path matches a declared route', () => {
    const offenders: string[] = [];
    for (const [url, sites] of scan(/action_url:\s*[`'"](\/[^`'"]*)[`'"]/g)) {
      const path = (url.split('?')[0].split('#')[0].replace(/\$\{[^}]*\}/g, ':param').replace(/\/+$/, '')) || '/';
      if (!routeExists(path)) offenders.push(`${path} — ${show(sites)}`);
    }
    expect(offenders, `action_urls that land on no route:\n${offenders.join('\n')}`).toEqual([]);
  });
});

describe('?tab= deep links', () => {
  const links = scan(/(\/[a-z0-9/_-]*)\?tab=([A-Za-z0-9_-]+)/g);

  it('every link addresses a page this guard can resolve', () => {
    // A path we cannot resolve is NOT a pass — it is a hole in the check, and it must be visible.
    const unresolved = [...links.entries()]
      .filter(([k]) => !PAGE_FOR.has(k.split('|')[0]))
      .map(([k, sites]) => `${k.split('|')[0]} — ${show(sites)}`);
    expect(unresolved, `paths with no resolvable page component:\n${unresolved.join('\n')}`).toEqual([]);
  });

  it('every ?tab=<key> names a tab that renders a pane', () => {
    const offenders: string[] = [];
    for (const [k, sites] of links) {
      const [path, key] = k.split('|');
      const page = PAGE_FOR.get(path);
      if (!page) continue; // reported by the test above
      const keys = tabsFor(page);
      if (keys.size === 0) {
        offenders.push(`${path}?tab=${key} — ${rel(page)} renders no tabs at all (${show(sites)})`);
      } else if (!keys.has(key)) {
        offenders.push(`${path}?tab=${key} — ${rel(page)} renders: ${[...keys].sort().join(', ')} (${show(sites)})`);
      }
    }
    expect(offenders, `deep links to a tab that renders nothing:\n${offenders.join('\n')}`).toEqual([]);
  });

  /**
   * `?order=<id>` is read by OrdersPanel, which only mounts inside the doc_orders pane — so pairing
   * it with any other tab means the redirect never runs. Orders have their own route; a link that
   * knows the id should use it rather than round-tripping through the list.
   */
  it('a link that knows an order id points at the order page, not the orders list', () => {
    const offenders = [...scan(/(\/(?:admin\/)?finance)\?tab=[A-Za-z0-9_]+&(order)=/g).entries()]
      .map(([, sites]) => show(sites));
    expect(offenders, `orders-list links carrying an id:\n${offenders.join('\n')}`).toEqual([]);
  });
});
