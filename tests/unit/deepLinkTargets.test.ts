/** Deep-link guard — a link that goes nowhere is a silent zero in the navigation layer. */
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readSource, strippedSource, blankedSource } from '../helpers/sourceIndex';
import { ROUTES, PAGE_FOR, importMap, resolveSpec, routeExists, ownTabsFor, tabsFor } from '../helpers/routeTargets';
import {
  ordersLink, quotesLink, receivablesLink, payablesLink, companiesLink,
  receivablesBucketLink, CRM_KIND, PROJECTS_LINK, INBOX_LINK,
} from '../../src/components/features/dashboard/officeLinks';
import { readFilterParam } from '../../src/components/core/filters/filterUrl';

const ROOT = process.cwd();
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

const SOURCE_ROOTS = ['src', 'supabase/functions'];
const sourceFiles = SOURCE_ROOTS.flatMap((r) => walk(join(ROOT, r)));

// ─────────────────────────────── the scans ───────────────────────────────

interface Site { file: string; line: number; }

function scan(re: RegExp): Map<string, Site[]> {
  const hits = new Map<string, Site[]>();
  for (const file of sourceFiles) {
    blankedSource(file).split('\n').forEach((line, i) => {
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

const pathOf = (url: string) =>
  (url.split('?')[0].split('#')[0].replace(/\$?\{[^}]*\}/g, ':param').replace(/\/+$/, '')) || '/';

function walkPython(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === '__pycache__') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walkPython(p, out);
    else if (e.endsWith('.py')) out.push(p);
  }
  return out;
}

/** Every path literal on an `action_url:` line, so both arms of a ternary are checked. */
function actionUrlLiterals(): Map<string, Site[]> {
  const hits = new Map<string, Site[]>();
  for (const file of sourceFiles) {
    blankedSource(file).split('\n').forEach((line, i) => {
      if (!/\baction_url\s*:/.test(line)) return;
      for (const m of line.matchAll(/[`'"](\/[A-Za-z][^`'"]*)[`'"]/g)) {
        if (!hits.has(m[1])) hits.set(m[1], []);
        hits.get(m[1])!.push({ file: rel(file), line: i + 1 });
      }
    });
  }
  return hits;
}

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

  /** The other half of the same prefix, and the half a URL-literal scan cannot see. */
  it('never names the /admin/finance prefix in source — it has never been a route', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      blankedSource(file).split('\n').forEach((line, i) => {
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
   */
  it('links CRM at /crm — the /admin/crm twin is redirects only (except operator users/:id)', () => {
    // The redirect registry and the redirect component must name the old prefix; that is their job.
    const ALLOWED = ['src/modules/crm/index.ts', 'src/modules/crm/pages/CrmLegacyRedirect.tsx'];
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      if (ALLOWED.includes(rel(file))) continue;
      blankedSource(file).split('\n').forEach((line, i) => {
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

  /** The seven tenant surfaces that were mounted under /admin, and why the prefix mattered. */
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
      blankedSource(file).split('\n').forEach((line, i) => {
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
    for (const [url, sites] of actionUrlLiterals()) {
      const path = pathOf(url);
      if (!routeExists(path)) offenders.push(`${path} — ${show(sites)}`);
    }
    expect(offenders, `action_urls that land on no route:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('every extra ?param on an action_url is read by something', () => {
    const readers = new Set<string>();
    for (const file of sourceFiles) {
      if (rel(file).startsWith('src/')) for (const m of readSource(file).matchAll(/\.get\('([A-Za-z_]+)'\)/g)) readers.add(m[1]);
    }
    const offenders: string[] = [];
    for (const [url, sites] of actionUrlLiterals()) {
      for (const m of (url.split('?')[1] ?? '').matchAll(/(?:^|&)([A-Za-z_]+)=/g)) {
        if (m[1] !== 'tab' && !readers.has(m[1])) offenders.push(`${pathOf(url)}?${m[1]}= — ${show(sites)}`);
      }
    }
    expect(offenders, `the record id in these links goes nowhere; the reader lands on the list:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('every MIVAA notification link lands on a route and a tab that renders', () => {
    const app = join(ROOT, 'mivaa-pdf-extractor/app');
    const files = existsSync(app) ? walkPython(app) : [];
    expect(files.length, 'mivaa-pdf-extractor/app is empty — this guard cannot see its haystack').toBeGreaterThan(50);

    const offenders: string[] = [];
    let seen = 0;
    const check = (url: string, file: string) => {
      seen++;
      const path = pathOf(url);
      const tab = url.match(/[?&]tab=([A-Za-z0-9_-]+)/)?.[1];
      const page = PAGE_FOR.get(path);
      if (!routeExists(path)) offenders.push(`${url} — no route (${rel(file)})`);
      else if (tab && page && !tabsFor(page).has(tab)) offenders.push(`${url} — no such tab (${rel(file)})`);
    };
    for (const file of files) {
      const src = readSource(file);
      for (const line of src.split('\n')) {
        if (!/action_url|action_path/.test(line) || /^\s*#/.test(line)) continue;
        for (const m of line.matchAll(/["'](\/[A-Za-z][^"']*)["']/g)) check(m[1], file);
      }
      for (const fn of src.matchAll(/def _build_action_\w+[\s\S]*?(?=\n {4}(?:async )?def |\n\S|$)/g)) {
        for (const m of fn[0].matchAll(/return\s+f?["'](\/[A-Za-z][^"']*)["']/g)) check(m[1], file);
      }
    }
    expect(seen, 'no MIVAA notification links found — the call shape changed').toBeGreaterThan(5);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  /**
   * The check above matches `action_url: '/…'` — a literal that ALREADY looks like a path. An
   * absolute URL therefore matched nothing and was silently vouched for, which is the failure
   * mode this whole file was written to refuse.
   */
  it('no action_url literal is written as an absolute URL', () => {
    const offenders: string[] = [];
    // Any `action_url:` followed by a string/template literal that does NOT open with `/`.
    for (const [value, sites] of scan(/action_url:\s*[`'"]([^`'"/][^`'"]*)[`'"]/g)) {
      offenders.push(`${value} — ${show(sites)}`);
    }
    expect(
      offenders,
      'An action_url is fed to navigate(), which treats it as a path — an absolute URL 404s.\n' +
      'Write the app-relative path. If the same value is also an email CTA, build the absolute\n' +
      'form separately for the email and keep the path on the notification:\n' +
      offenders.join('\n'),
    ).toEqual([]);
  });

  /** A seeded prompt becomes the USER'S OWN MESSAGE. */
  it('no agent-hub seed prompt hands the user an internal identifier', () => {
    const offenders: string[] = [];
    // Apostrophes are ORDINARY here ("today's findings"), so the terminator set must not include
    // `'` — excluding it truncated every seed at the first one and the guard passed on its own
    // motivating case.
    const seed = /[?&](?:q|prompt)=([^"`&\n]*)/g;
    for (const file of sourceFiles) {
      blankedSource(file).split('\n').forEach((line, i) => {
        for (const m of line.matchAll(seed)) {
          // `<something>_id <value>` — naming an id column in text a person will read.
          if (/\b\w*_id\b\s*[:=]?\s*(\$\{|[0-9a-f]{8}-)/.test(m[1]) || /\b(tracked_job_id|workspace_id|conversation_id|run_id)\b/.test(m[1])) {
            offenders.push(`${m[1].slice(0, 80)} — ${rel(file)}:${i + 1}`);
          }
        }
      });
    }
    expect(
      offenders,
      'A ?q=/?prompt= seed is rendered as the USER\'S message. Name the thing the way the user\n' +
      'named it, or link to a surface that already shows the answer:\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  /**
   * The read-time half. Producers are four runtimes wide and rows outlive every one of them, so
   * the bell must never hand `action_url` straight to `navigate()` again.
   */
  it('the bell resolves action_url instead of navigating to it raw', () => {
    const bell = 'src/modules/notifications/components/NotificationsPanel.tsx';
    expect(strippedSource(bell)).not.toMatch(/navigate\(\s*n\.action_url\s*\)/);
    expect(readSource(bell)).toContain('resolveNotificationTarget');
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

/**
 * The dashboard's My Office blocks — the other half of the same defect, and the half a
 * `?tab=` scan cannot see.
 */
describe('My Office block destinations', () => {
  const DESTINATIONS: Array<{ what: string; url: string }> = [
    { what: 'Orders block', url: ordersLink() },
    { what: 'Orders → Confirmed', url: ordersLink('confirmed') },
    { what: 'Orders → Partly fulfilled', url: ordersLink('partially_fulfilled') },
    { what: 'Orders → Draft', url: ordersLink('draft') },
    { what: 'Quotes block', url: quotesLink() },
    { what: 'Quotes → Draft', url: quotesLink('draft') },
    { what: 'Quotes → Submitted', url: quotesLink('submitted') },
    { what: 'Quotes → Quoted', url: quotesLink('quoted') },
    { what: 'Finance block', url: receivablesLink() },
    { what: 'Finance → Overdue', url: receivablesLink({ pastDue: true }) },
    { what: 'Finance → Payables', url: payablesLink() },
    { what: 'Finance → an age bucket', url: receivablesBucketLink('90+') },
    { what: 'Customers block', url: companiesLink() },
    { what: 'Customers → Customers', url: companiesLink(CRM_KIND.customer) },
    { what: 'Customers → Suppliers', url: companiesLink(CRM_KIND.supplier) },
    { what: 'Customers → Active projects', url: PROJECTS_LINK },
    { what: 'Quick access → Inbox', url: INBOX_LINK },
  ];

  const parse = (url: string) => {
    const [path, qs = ''] = url.split('?');
    return { path, params: new URLSearchParams(qs) };
  };

  /** `const NAME = 'literal'` as declared in `file`, or in the module `file` imports it from. */
  function constLiteral(file: string, name: string): string | undefined {
    const re = new RegExp(`const\\s+${name}\\s*=\\s*'([^']+)'`);
    const own = blankedSource(file).match(re);
    if (own) return own[1];
    const spec = importMap(file).get(name);
    const target = spec && resolveSpec(spec, file, name);
    const decl = target && blankedSource(target).match(re);
    return decl ? decl[1] : undefined;
  }

  it('every destination resolves to a declared route', () => {
    const offenders = DESTINATIONS
      .filter((d) => !routeExists(parse(d.url).path))
      .map((d) => `${d.what} → ${d.url}`);
    expect(offenders, `dashboard links that land on no route:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('every destination resolves to a page this guard can actually inspect', () => {
    // A path we cannot resolve is NOT a pass — it is a hole in the check, and it must be visible.
    const unresolved = [...new Set(DESTINATIONS.map((d) => parse(d.url).path))]
      .filter((p) => !PAGE_FOR.has(p));
    expect(unresolved, `dashboard paths with no resolvable page component:\n${unresolved.join('\n')}`).toEqual([]);
  });

  /**
   * THE regression. A tabbed page opened without a tab shows its default pane, which is not the
   * list the figure was counted from — and nothing anywhere reports it.
   */
  it('names a tab whenever the page it opens has tabs', () => {
    const offenders: string[] = [];
    for (const d of DESTINATIONS) {
      const { path, params } = parse(d.url);
      const page = PAGE_FOR.get(path);
      if (!page) continue; // reported by the test above
      const keys = ownTabsFor(page);
      if (keys.size === 0) continue; // genuinely tab-less: the bare path IS the whole address
      const tab = params.get('tab');
      if (!tab) {
        // QuotesPage is the one page whose DEFAULT pane is the list a block counts, and its own
        // tab handler DELETES `?tab=` when that pane is selected — naming it here would write a
        // param the page immediately strips. Every other page must say where it is going.
        if (path === '/quotes') continue;
        offenders.push(`${d.what} → ${d.url} opens ${rel(page)} with no ?tab=; it renders: ${[...keys].sort().join(', ')}`);
      } else if (!keys.has(tab)) {
        offenders.push(`${d.what} → ${d.url} names ?tab=${tab}; ${rel(page)} renders: ${[...keys].sort().join(', ')}`);
      }
    }
    expect(offenders, `dashboard links that open the wrong pane:\n${offenders.join('\n')}`).toEqual([]);
  });

  /**
   * The filter half. `filterUrl` writes a JSON bag under a per-surface key; `useFilters` /
   * `useFilterValues` read it back. A key nothing reads produces a URL that every route resolves
   * and every list ignores — the tab is right and the list shows everything, which is exactly as
   * silent as the wrong tab was.
   */
  it('every filter param it writes is read back by a list surface', () => {
    const declared = new Set<string>();
    for (const file of sourceFiles) {
      // The whole expression after `urlKey:`, not just a bare token — OrdersPanel writes
      // `urlKey: embedded ? undefined : ORDERS_FILTER_KEY`, and a scan that only accepted a
      // literal would report that key as read by nobody and blame the link for it.
      for (const m of blankedSource(file).matchAll(/urlKey:\s*([^,}\n]+)/g)) {
        const expr = m[1];
        for (const lit of expr.matchAll(/'([^']+)'/g)) declared.add(lit[1]);
        for (const ref of expr.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)) {
          const lit = constLiteral(file, ref[1]);
          if (lit) declared.add(lit);
        }
      }
    }
    expect(declared.size, 'no urlKey call sites found — the scan is broken, not the links').toBeGreaterThan(3);

    const offenders: string[] = [];
    for (const d of DESTINATIONS) {
      for (const [key, raw] of parse(d.url).params) {
        if (key === 'tab') continue;
        if (!declared.has(key)) {
          offenders.push(`${d.what} writes ?${key}= and no surface reads it (read back: ${[...declared].sort().join(', ')})`);
          continue;
        }
        // …and the bag has to survive the round trip the list will put it through.
        const back = readFilterParam(raw, { __unparsed: true } as never) as Record<string, unknown>;
        if (back.__unparsed) offenders.push(`${d.what} writes ?${key}=${raw}, which does not parse back into a filter bag`);
      }
    }
    expect(offenders, `dashboard filters nothing reads:\n${offenders.join('\n')}`).toEqual([]);
  });

  /**
   * And the field names inside the bag. `{ status: 'confirmed' }` only narrows the orders list if
   * that list declares a field keyed `status`; a typo matches no field, `applyFilters` passes it
   * through untouched, and the list shows everything.
   */
  it('every field it filters on is declared by some filter-group definition', () => {
    const fieldKeys = new Set<string>();
    for (const file of sourceFiles) {
      const src = blankedSource(file);
      if (!src.includes('FilterGroupDef')) continue;
      for (const m of src.matchAll(/key:\s*'([A-Za-z0-9_]+)'/g)) fieldKeys.add(m[1]);
      // A field keyed by a shared constant: `key: OVERDUE_KEY`.
      for (const m of src.matchAll(/key:\s*([A-Z][A-Z0-9_]*)\s*,/g)) {
        const lit = constLiteral(file, m[1]);
        if (lit) fieldKeys.add(lit);
      }
    }
    expect(fieldKeys.size, 'no filter fields found — the scan is broken, not the links').toBeGreaterThan(20);

    const offenders: string[] = [];
    for (const d of DESTINATIONS) {
      for (const [key, raw] of parse(d.url).params) {
        if (key === 'tab') continue;
        for (const field of Object.keys(readFilterParam(raw))) {
          if (!fieldKeys.has(field)) offenders.push(`${d.what} filters on '${field}', which no filter definition declares`);
        }
      }
    }
    expect(offenders, `dashboard filters on fields that do not exist:\n${offenders.join('\n')}`).toEqual([]);
  });
});
