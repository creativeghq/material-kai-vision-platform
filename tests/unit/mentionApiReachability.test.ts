/**
 * Guard: every mention-monitoring reader has a screen, and both kinds of subject have one.
 *
 * WHY THIS EXISTS
 * ---------------
 * Issue #349, found while checking that the A1–A4 work was actually visible. It was not.
 *
 * `tracked_mentions` holds two kinds of row: a PRODUCT enrolment (`product_id` set,
 * served at `/products/{id}/…`) and a free brand/keyword SUBJECT (served at
 * `/track/{id}/…`). MIVAA has served both families since the feature shipped. The client
 * only ever spoke the product one.
 *
 * The measured state, checked against the live DB on 2026-08-23:
 *
 *   - The INTERNAL flow holds **zero** subjects. Not "none openable" — none created, and
 *     none creatable: `createTrackedMention` had no caller anywhere in `src/`. The only
 *     ways in were curl and the agent tool, and the agent tool is product-only too.
 *   - The 17 rows that do exist all carry `api_key_id` — they came through the `kai_*`
 *     partner API, and `MentionMonitoringDashboard` filters `.is('api_key_id', null)` on
 *     purpose, so that screen has always rendered an empty list. Their 636 probe rows
 *     across 50 runs are reachable by the partner's own API calls and by nothing in this
 *     app.
 *   - `shareOfVoice()` had zero callers on the day it was fixed. So did both opportunity
 *     readers, which are the read side of a ~2,000-line service scoring AI Overview
 *     presence, PAA gaps and competitor rankings.
 *
 * So the product had a create path with no door and a read path that could only address
 * the minority kind of row. Nothing failed: every wrapper typechecked, every route
 * routed, the suite was green, and the admin page rendered a clean empty state.
 *
 * This is `inboxApiReachability`'s shape one level up: there, an action had no caller;
 * here, a whole ADDRESSING MODE had no screen. A typed wrapper is not a surface, and a
 * route is not one either.
 *
 * Comments are stripped before anything is counted — a file that merely mentions
 * `getSubjectOpportunities` in prose must not answer for a call site.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const SERVICE_REL = join('src', 'services', 'mentionMonitoringApi.ts');
const SERVICE = join(ROOT, SERVICE_REL);
const TAB = join(ROOT, 'src/components/business/mention-monitoring/MentionMonitorTab.tsx');
const DASHBOARD = join(ROOT, 'src/components/business/mention-monitoring/MentionMonitoringDashboard.tsx');

const read = (p: string) => stripComments(readFileSync(p, 'utf8'));

/**
 * Exports allowed to have no caller in `src/`, each with its reason. SHRINK-ONLY: an
 * entry that gains a caller must be deleted, and a test below fails until it is. Do not
 * add to this to make a red build green — an unreachable reader IS the defect.
 */
const NO_CALLER_EXPECTED: Record<string, string> = {};

function srcFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) {
        if (entry !== 'node_modules') walk(p);
      } else if (/\.(ts|tsx)$/.test(entry)) {
        out.push(p);
      }
    }
  };
  walk(join(ROOT, 'src'));
  // The wrapper file is not a caller of itself.
  return out.filter((p) => !p.endsWith(SERVICE_REL.replace(/\//g, sep)));
}

const serviceSrc = read(SERVICE);
const exported = [...serviceSrc.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1]);
const callerBodies = srcFiles().map((p) => read(p)).join('\n');

describe('mention-monitoring API reachability', () => {
  it('parses both sides (guards against an empty read)', () => {
    expect(exported.length, 'no exported functions parsed from the service').toBeGreaterThan(8);
    expect(callerBodies.length, 'no caller source parsed').toBeGreaterThan(10_000);
  });

  it('every exported reader is called from a screen', () => {
    const dead = exported.filter(
      (fn) => !NO_CALLER_EXPECTED[fn] && !new RegExp(`\\b${fn}\\s*\\(`).test(callerBodies),
    );
    expect(
      dead,
      `Unreachable mention-monitoring reader(s): ${dead.join(', ')}. Every one of these is a `
      + `complete, typed, working call to a live endpoint that no screen makes. That is how `
      + `the internal subject flow ended up with no create door and no detail screen.`,
    ).toEqual([]);
  });

  it('NO_CALLER_EXPECTED stays honest — an entry that gains a caller must be removed', () => {
    const stale = Object.keys(NO_CALLER_EXPECTED).filter(
      (fn) => !exported.includes(fn) || new RegExp(`\\b${fn}\\s*\\(`).test(callerBodies),
    );
    expect(
      stale,
      `Prune from NO_CALLER_EXPECTED (now called, or no longer exported): ${stale.join(', ')}`,
    ).toEqual([]);
  });
});

describe('both kinds of subject have a screen', () => {
  it('the readers are addressed by ref, not by product id', () => {
    // The defect in one line: a reader that can only be given a productId can only ever
    // serve the minority of rows that have one.
    const productOnly = exported.filter((fn) => /^(get|probe|refresh)Product(?!Opportunities)/.test(fn));
    expect(
      productOnly,
      `Product-only reader(s) still present: ${productOnly.join(', ')}. These must take a `
      + `MentionSubjectRef so a brand/keyword subject reaches the same code path.`,
    ).toEqual([]);
  });

  it('MentionSubjectRef covers both addressing modes the backend serves', () => {
    expect(serviceSrc).toMatch(/kind:\s*'product';\s*productId:\s*string/);
    expect(serviceSrc).toMatch(/kind:\s*'subject';\s*trackedMentionId:\s*string/);
    // Both arms must actually be built into a URL, or one of them is decorative.
    expect(serviceSrc).toContain('/api/v1/mention-monitoring/products/');
    expect(serviceSrc).toContain('/api/v1/mention-monitoring/track/');
  });

  it('the monitor tab takes a ref, so it can render a subject with no product', () => {
    const tab = read(TAB);
    expect(tab).toMatch(/subject:\s*MentionSubjectRef/);
    expect(tab, 'the tab still takes a bare productId prop').not.toMatch(/^\s*productId:\s*string;/m);
  });

  it('the admin list can OPEN a subject, not only a product', () => {
    const dash = read(DASHBOARD);
    // The pre-#349 affordance was an <a> rendered `if (r.product_id)` pointing at another
    // page, so a subject row had no way in at all.
    expect(dash).toContain('MentionMonitorTab');
    expect(dash).toMatch(/kind:\s*'subject',\s*trackedMentionId:/);
  });

  it('a subject can be CREATED from the UI, with the domain that makes citations decidable', () => {
    const dash = read(DASHBOARD);
    expect(dash).toContain('TrackSubjectDialog');
    const dialog = read(join(ROOT, 'src/components/business/mention-monitoring/TrackSubjectDialog.tsx'));
    expect(dialog).toContain('createTrackedMention');
    // Without homepage_domain every `brand_cited` is NULL forever — undecidable, which no
    // amount of probing resolves. Zero of the 17 existing subjects have one, because the
    // only way to create a subject was curl.
    expect(
      dialog,
      'the create form must collect homepage_domain — it is the only input that makes a '
      + 'ghost citation decidable',
    ).toContain('homepage_domain');
  });
});
