/** Every ACTION an edge function dispatches on is in the public OpenAPI spec. */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { blankComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const SPEC = join(ROOT, 'scripts/edge-endpoints.json');
const FUNCTIONS = join(ROOT, 'supabase/functions');

interface SpecAction { name?: string; action?: string; method?: string }
interface SpecEntry { name: string; actions?: SpecAction[] }

const specActionName = (a: SpecAction) => a.name || a.action || a.method || '';

/**
 * Actions a function performs when the request carries NO `action` field.
 *
 * These are real, documented actions with no `case` or `=== '…'` to find, because they are the
 * fall-through path. Shrink-only: an entry here is a claim that the function's default branch does
 * this thing, and the pair is asserted below so a rename cannot leave a stale exemption behind.
 */
const DEFAULT_ACTIONS: Record<string, string> = {
  'catalog-send-to-customers': 'send',        // `preview` is the only branch; everything else sends
  'seo-domain-tracker': 'run',                // `cron-run` is the branch; the user path is the default
  'seo-rank-tracker': 'run',
  'seo-site-audit': 'run',
  'stripe-connect': 'onboard',                // `status` is the branch
  'taric-reference-sync': 'import',           // `stats` is the branch
  'taric-classify': 'classify',               // `mode: 'backfill'` is the branch
  'finance-customer-documents': 'overview',   // literally `body?.action ?? 'overview'`
};

/**
 * Functions whose `switch` is NOT an HTTP action dispatch. Each needs a reason, because the
 * cost of a wrong exclusion here is the whole point of the test going quiet for that function.
 */
const NOT_AN_ACTION_DISPATCH: Record<string, string> = {
  // `switch (actionType)` over flow NODE types (send_email, add_tag, http_request…). Those are
  // the automation vocabulary, not routes — flow-engine's own HTTP surface is 3 actions.
  'flow-engine': 'switches on flow node actionType, not an HTTP action',
  // Takes no `action` field at all: it dispatches on HTTP method plus `?catalog=1`. `run_agent`
  // and `get_catalog` are documentation labels for those two paths, not strings in the code.
  'background-agent-runner': 'dispatches on method + ?catalog=1, not an action field',
  // REST-shaped: `url.pathname.split('/')` then `method + path[0]`. Its spec "actions" are path
  // segments, and most never appear as a literal because they are matched positionally.
  'recommendations-api': 'routes on method + URL path segment, not an action field',
  // Discriminated by field PRESENCE, not by name: a body carrying a `feedback` object writes
  // feedback, and anything else resolves the token. Neither word is a routing literal.
  'moodboard-sheet-share': 'routes on whether a `feedback` object is present in the body',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.deno') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.ts$/.test(e)) out.push(p);
  }
  return out;
}

/**
 * Actions a function dispatches on, read from its source.
 *
 * Four shapes are in use and all four are load-bearing somewhere, so all four are read:
 *   switch (action) { case 'x': }        most handlers
 *   if (action === 'x')                  seo-*, products-3d-api, real-estate-public
 *   const X_ACTIONS = new Set([...])     zernio-api, pinterest-api
 *   const ACTION_MAP = { 'x': { path } } mivaa-gateway
 */
function codeActions(fnName: string): Set<string> {
  const found = new Set<string>();
  for (const file of walk(join(FUNCTIONS, fnName))) {
    // Comments name actions constantly ("// `cron-run` is the branch"). Blank them first or the
    // guard reports prose as code.
    const src = blankComments(readFileSync(file, 'utf8'));

    // `switch (action)` and `switch (String(action))` — the identifier must be EXACTLY `action`.
    // flow-engine's `actionType`, and the `operator` / `conditionType` switches beside it, are
    // different vocabularies.
    const lines = src.split('\n');

    /**
     * Scan a block delimited by the `}` at the SAME indentation as its opening line.
     *
     * `pick` decides what counts. Keeping it a parameter matters: a switch body is full of
     * ordinary object literals (`workspace_id: wsId,`), so applying the ROUTES key pattern there
     * harvested ~200 field names as "actions" and buried the one real finding.
     */
    const scanBlock = (ln: number, indent: string, pick: (line: string) => string | null) => {
      const closer = `${indent}}`;
      for (let i = ln + 1; i < lines.length; i++) {
        const end = lines[i].replace(/\s+$/, '');
        if (end === closer || end === `${closer};`) break;
        const hit = pick(lines[i]);
        if (hit) found.add(hit);
      }
    };
    const caseLabel = (l: string) => l.match(/^\s*case\s+'([^']+)'\s*:/)?.[1] ?? null;
    /** `research: handleResearch,` — a key mapped to a bare handler identifier. */
    const routeKey = (l: string) => l.match(/^\s*'?([A-Za-z][\w.-]*)'?\s*:\s*[A-Za-z_$][\w$.]*\s*,?\s*$/)?.[1] ?? null;

    lines.forEach((line, ln) => {
      // `switch (action)`, `switch (String(action))`, `switch (body.action)`, `switch (body?.action)`.
      // The subject must BE `action` or end in `.action` — flow-engine's `actionType`, and the
      // `operator` / `conditionType` switches beside it, are different vocabularies.
      const sw = line.match(/^(\s*)switch\s*\(\s*(?:String\s*\(\s*)?([\w$?.]+)/);
      if (sw && /(^|\.)action$/.test(sw[2].replace(/\?/g, ''))) scanBlock(ln, sw[1], caseLabel);

      // `const ROUTES: Record<string, (req: Request) => Promise<Response>> = {` — the annotation
      // contains `=>`, so anything matching up to the first `=` stops in the middle of the type.
      const routes = line.match(/^(\s*)(?:const|let|var)\s+\w*(?:ROUTES|HANDLERS|ACTIONS)\w*\b.*=\s*\{\s*$/);
      if (routes) scanBlock(ln, routes[1], routeKey);
    });

    // `action === 'x'`. The negative lookbehind matters: real-estate-api counts import outcomes
    // with `r.action === 'created'`, which is a row field, not a route.
    for (const c of src.matchAll(/(?<![.\w$])(?:body\??\.)?action\s*===\s*'([^']+)'/g)) found.add(c[1]);

    // `const SOMETHING_ACTIONS = new Set([...])`
    for (const c of src.matchAll(/[A-Z_]*ACTIONS[A-Z_]*\s*(?::[^=]*)?=\s*new Set\(\s*\[([^\]]*)\]/g)) {
      for (const s of c[1].matchAll(/'([^']+)'/g)) found.add(s[1]);
    }

    // `'x': { path: '…', method: '…' }` — mivaa-gateway's route table.
    for (const c of src.matchAll(/^\s*'([a-z0-9_]+)':\s*\{\s*path:/gm)) found.add(c[1]);

    // `const ROUTES = { research: handleResearch, … }` — a key mapped to a handler identifier.
    // seo-api, taric-classify, scan-receipt and six others dispatch this way, and reading only
    // the switch forms reported all of their real actions as fictional.
    for (const c of src.matchAll(/(?:ROUTES|HANDLERS|ACTIONS)\b[^=]*=\s*\{([\s\S]*?)\n\s*\}/g)) {
      for (const k of c[1].matchAll(/(?:^|,)\s*'?([A-Za-z][\w.-]*)'?\s*:\s*[A-Za-z_$][\w$.]*\s*(?:,|$)/gm)) {
        found.add(k[1]);
      }
    }
  }
  return found;
}

const entries: SpecEntry[] = JSON.parse(readFileSync(SPEC, 'utf8'));
const dispatching = entries.filter((e) => {
  if (NOT_AN_ACTION_DISPATCH[e.name]) return false;
  if (!existsSync(join(FUNCTIONS, e.name))) return false;
  const declared = (e.actions || []).map(specActionName).filter(Boolean);
  // REST-style entries document `GET /path` routes, not action names.
  return declared.length > 0 && !declared.some((n) => /[ /]/.test(n));
});

describe('edge action ↔ OpenAPI coverage', () => {
  it('finds action-dispatching functions to check (guards against a regex that matches nothing)', () => {
    expect(dispatching.length).toBeGreaterThan(20);
  });

  it('every action in the code is in the spec', () => {
    const gaps: string[] = [];
    for (const entry of dispatching) {
      const declared = new Set((entry.actions || []).map(specActionName));
      const missing = [...codeActions(entry.name)].filter((a) => !declared.has(a)).sort();
      if (missing.length) gaps.push(`${entry.name}: ${missing.join(', ')}`);
    }
    expect(
      gaps,
      'These actions are routable and undocumented — the public spec does not mention them, so the '
      + 'only way to find one is to read the source. Add each to scripts/edge-endpoints.json and run '
      + '`npm run openapi:edge`:\n  ' + gaps.join('\n  '),
    ).toEqual([]);
  });

  /** The two directions need DIFFERENT strictness, which is why they are not one test. */
  it('every action in the spec appears in the function that claims to route it', () => {
    const ghosts: string[] = [];
    for (const entry of dispatching) {
      const src = walk(join(FUNCTIONS, entry.name))
        .map((f) => blankComments(readFileSync(f, 'utf8')))
        .join('\n');
      const dflt = DEFAULT_ACTIONS[entry.name];
      // `const ROUTES = { pipeline: handlePipeline }` puts the action in a BARE key, so there is
      // no quoted literal to find. Those are already parsed precisely, so accept either.
      const parsed = codeActions(entry.name);
      const missing = (entry.actions || [])
        .map(specActionName)
        // A default action has no literal to find — being the fall-through IS its definition.
        .filter((a) => a && a !== dflt && !parsed.has(a))
        .filter((a) => !src.includes(`'${a}'`) && !src.includes(`"${a}"`) && !src.includes(`\`${a}\``))
        .sort();
      if (missing.length) ghosts.push(`${entry.name}: ${missing.join(', ')}`);
    }
    expect(
      ghosts,
      'The published spec advertises these actions and the code does not contain them anywhere. An '
      + 'integrator who believes the spec gets a 400. Delete the entry:\n  ' + ghosts.join('\n  '),
    ).toEqual([]);
  });

  it('every DEFAULT_ACTIONS exemption still names a documented action', () => {
    // A default action is exempt from the code check, so a rename would otherwise leave the
    // exemption silently covering nothing — the same shape as the dead FREE_ACTIONS entries.
    const stale: string[] = [];
    for (const [fn, action] of Object.entries(DEFAULT_ACTIONS)) {
      const entry = entries.find((e) => e.name === fn);
      if (!entry) { stale.push(`${fn} (no such function in the spec)`); continue; }
      const declared = new Set((entry.actions || []).map(specActionName));
      if (!declared.has(action)) stale.push(`${fn} → '${action}' is not in its spec entry`);
    }
    expect(stale, `stale exemptions: ${stale.join('; ')}`).toEqual([]);
  });
});
