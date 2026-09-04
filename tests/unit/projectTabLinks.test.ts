/**
 * A `?tab=` in a link is a promise the page has to keep.
 *
 * MEASURED 2026-08-30: `ProjectDetailPage` held its open tab in `useState('overview')` and never
 * looked at the URL. Seven links in the repo said otherwise:
 *
 *   • `BillingTab`'s own button → `/projects/:id?tab=quotes`
 *   • all four `project_request_*` flow events → `/projects/:id?tab=requests&request=<id>`
 *   • the sheet-share edge function → `/projects/:id?tab=client-view`
 *
 * Every one of them landed the reader on Overview. Nothing fails when this happens: the route
 * matches, the page renders, the query string is simply ignored — so the notification that says
 * "a client raised a request" opens a screen with no request on it, and the reader is left to
 * find the tab. That is the empty-state defect wearing a URL.
 *
 * This guard reads the link sites and the page's own tab list, so a new tab, a renamed tab or a
 * new notification link cannot re-open the gap. It deliberately does NOT restate the tab names:
 * the list comes from the page.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const PAGE = 'src/modules/projects/pages/ProjectDetailPage.tsx';
const pageSrc = readFileSync(join(ROOT, PAGE), 'utf8');

/** The tabs the page declares — the one list the render and the URL both read. */
function declaredTabs(): string[] {
  const at = pageSrc.indexOf('const PROJECT_TABS = [');
  expect(at, `${PAGE} no longer declares PROJECT_TABS — this guard is pointed at nothing`)
    .toBeGreaterThan(-1);
  const end = pageSrc.indexOf('] as const', at);
  return [...pageSrc.slice(at, end).matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
}

/**
 * The tabs the page actually renders. Triggers are no longer literal: the strip is built from
 * `TAB_GROUPS` (one line of stages, each opening its sections), so a section is reachable exactly
 * when some stage lists it. Contents are still one literal `<TabsContent>` per section.
 */
function renderedTabs(): { triggers: string[]; contents: string[] } {
  const at = pageSrc.indexOf('const TAB_GROUPS');
  expect(at, `${PAGE} no longer declares TAB_GROUPS — the strip has lost its source`)
    .toBeGreaterThan(-1);
  const block = pageSrc.slice(at, pageSrc.indexOf('];', at));
  const triggers = [...block.matchAll(/tabs: \[([^\]]*)\]/g)]
    .flatMap((m) => [...m[1].matchAll(/'([a-z-]+)'/g)].map((x) => x[1]));
  const contents = [...pageSrc.matchAll(/<TabsContent value="([a-z-]+)"/g)].map((m) => m[1]);
  return { triggers, contents };
}

/** Every `/projects/…?tab=x` in the repo, with the file that writes it. */
function linkSites(): Array<{ file: string; tab: string }> {
  const out: Array<{ file: string; tab: string }> = [];
  const skip = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'mivaa-pdf-extractor']);
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx)$/.test(e.name)) continue;
      const src = readFileSync(p, 'utf8');
      if (!src.includes('?tab=')) continue;
      for (const m of src.matchAll(/\/projects\/[^'"`\s]*\?tab=([a-z-]+)/g)) {
        out.push({ file: p.slice(ROOT.length + 1).replace(/\\/g, '/'), tab: m[1] });
      }
    }
  };
  for (const top of ['src', 'supabase/functions', 'api']) {
    try { walk(join(ROOT, top)); } catch { /* optional tree */ }
  }
  return out;
}

describe('a project tab link lands on that tab', () => {
  it('reads the page and the link sites at all', () => {
    expect(declaredTabs().length).toBeGreaterThan(10);
    // The page has to actually consult the URL. Without this the whole rule below is vacuous —
    // every tab name can be valid while none of the links work, which is the state this found.
    expect(pageSrc, `${PAGE} must read the tab from the URL, not from useState`)
      .toMatch(/sp\.get\('tab'\)/);
    expect(linkSites().length, 'no ?tab= links found — the crawl has lost its target')
      .toBeGreaterThan(3);
  });

  it('every ?tab= link in the repo names a tab this page declares', () => {
    const tabs = new Set(declaredTabs());
    const offenders = linkSites()
      .filter(({ tab }) => !tabs.has(tab))
      .map(({ file, tab }) => `${file} → ?tab=${tab}`);
    expect(
      offenders,
      'These links name a tab the project page does not have, so they silently land on Overview. '
      + `A link to nowhere is worse than the mention it replaced:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('the declared list and the rendered tabs are the same set', () => {
    const declared = declaredTabs();
    const { triggers, contents } = renderedTabs();
    // Both directions. A trigger with no entry is a tab no link can reach; an entry with no
    // trigger is a `?tab=` the page accepts and then renders nothing for.
    expect([...new Set(triggers)].filter((t) => !declared.includes(t)),
      'a stage in TAB_GROUPS lists a section with no PROJECT_TABS entry').toEqual([]);
    expect(declared.filter((t) => !triggers.includes(t)),
      'PROJECT_TABS entry no stage lists — no trigger, so no link can reach it').toEqual([]);
    // Exactly one stage each. Listed twice, the section would render under whichever stage the
    // derivation finds first and be a dead trigger under the other.
    expect(triggers.filter((t, i) => triggers.indexOf(t) !== i),
      'a section listed by more than one stage').toEqual([]);
    expect([...new Set(contents)].filter((t) => !declared.includes(t)),
      'rendered <TabsContent> with no PROJECT_TABS entry').toEqual([]);
    expect(declared.filter((t) => !contents.includes(t)),
      'PROJECT_TABS entry with no <TabsContent> — the tab opens onto a blank panel').toEqual([]);
  });

  it('the deep link that names a record is carried into the tab that shows it', () => {
    // `?tab=requests&request=<id>` is the shape every project_request_* notification uses. Landing
    // on the right tab is half the promise; opening the thread it names is the other half.
    expect(pageSrc, 'the requests tab must receive the ?request= id')
      .toMatch(/focusRequestId=\{sp\.get\('request'\)\}/);
    const tabSrc = readFileSync(
      join(ROOT, 'src/modules/projects/components/tabs/RequestsTab.tsx'), 'utf8',
    );
    expect(tabSrc, 'RequestsTab must accept focusRequestId').toContain('focusRequestId');
    expect(tabSrc, 'RequestsTab must open the focused thread').toMatch(/setOpenId\(focusRequestId\)/);
    // A closed request is filtered out of the list by default, so focusing it without un-hiding
    // it lands on a list that does not contain the thing the notification is about.
    expect(tabSrc, 'a focused thread that has been closed must un-hide itself')
      .toMatch(/setShowClosed\(true\)/);
  });
});
