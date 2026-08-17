/**
 * Page-monitoring guards (#331).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Firecrawl does not sign its webhooks. No HMAC, no signature header, no timestamp.
 * The only authentication the provider offers is `webhook.headers` — values we hand
 * them at monitor-creation time and they echo back. So one shared secret, compared
 * correctly, in the right ORDER, is the entire boundary between the public internet
 * and a tenant's change log.
 *
 * That makes the usual "verify the signature" advice untestable here and the ordering
 * invariant unusually load-bearing. Three specific ways this breaks, none of which a
 * typecheck or an integration test on the happy path would notice:
 *
 *   1. The secret is unset in an environment and the handler falls through to
 *      processing. Everything looks fine — deliveries succeed — while anyone who
 *      knows the URL can write diffs and fire notifications into any workspace.
 *   2. The body is parsed, or worse a row is written, BEFORE the comparison. The
 *      check is present, reads as correct in review, and guards nothing.
 *   3. `provided === expected`. Functionally identical, and behind an unsigned
 *      webhook there is no second factor to fall back on when the prefix leaks.
 *
 * SCOPE. These scan repo files, so they cover the TypeScript half only. RLS on
 * `page_watches` / `page_watch_changes` lives in the database and is invisible here;
 * a green run says nothing about it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments as sharedStripComments, blankComments as sharedBlankComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const WEBHOOK = 'supabase/functions/page-watch-webhook/index.ts';
const CRUD = 'supabase/functions/page-watches/index.ts';

/**
 * The object literal a named function returns, sliced by brace depth.
 * Regexes cannot tell "top level of this object" from "nested two deep", and the
 * difference is exactly what Firecrawl rejects.
 */
function returnedObject(src: string, fnAnchor: string): string {
  const from = src.indexOf(fnAnchor);
  if (from === -1) throw new Error(`no ${fnAnchor} in source`);
  const open = src.indexOf('{', src.indexOf('return {', from));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced braces in ${fnAnchor}`);
}

/** Keys sitting at depth 0 of that object. */
function topLevelKeysOfReturn(src: string, fnAnchor: string): string[] {
  const body = returnedObject(src, fnAnchor);
  const keys: string[] = [];
  let depth = 0;
  let line = '';
  for (const ch of body) {
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth--;
    if (ch === '\n') { line = ''; continue; }
    line += ch;
    if (ch === ':' && depth === 0) {
      const m = line.match(/([A-Za-z_$][\w$]*)\s*:$/);
      if (m) keys.push(m[1]);
    }
  }
  return keys;
}

/** The text of one top-level key's value, braces balanced. */
function objectValueOf(src: string, fnAnchor: string, key: string): string {
  const body = returnedObject(src, fnAnchor);
  const at = body.search(new RegExp(`(^|\n)\s*${key}\s*:`));
  if (at === -1) return '';
  const open = body.indexOf('{', at);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < body.length; i++) {
    if (body[i] === '{') depth++;
    else if (body[i] === '}') {
      depth--;
      if (depth === 0) return body.slice(open, i + 1);
    }
  }
  return body.slice(open);
}

/** Strip block/line comments so prose describing a rule cannot satisfy the rule. */
function code(src: string): string {
  return sharedStripComments(src);
}

describe('page-watch webhook — the unsigned-callback boundary', () => {
  const src = code(read(WEBHOOK));

  it('refuses to run at all when the shared secret is unset', () => {
    expect(src).toMatch(/503/);
    // The refusal must be a RETURN, not a log-and-continue. Anchored to the
    // configuration branch so an unrelated 503 elsewhere cannot satisfy it.
    const refusal = /if\s*\(!secret\.value\)\s*\{[\s\S]{0,400}?return new Response/;
    expect(refusal.test(src), 'missing secret must return, never fall through to processing').toBe(true);
  });

  it('authenticates before it parses the body', () => {
    // Locate the CALL, not the declaration. A first draft of this test searched for
    // /secretsMatch\(/ and matched `function secretsMatch(` at the top of the file —
    // so when a mutation replaced the call site with `provided !== secret.value`, the
    // index still pointed at line 49 and the ordering assertion passed vacuously.
    const compare = src.search(/if\s*\(!secretsMatch\(/);
    const parse = src.search(/req\.json\(\)/);
    expect(compare, 'no secret comparison CALL found (the declaration does not count)').toBeGreaterThan(-1);
    expect(parse, 'no body parse found').toBeGreaterThan(-1);
    expect(
      compare < parse,
      'the body is read before the secret is verified — the check exists but guards nothing',
    ).toBe(true);
  });

  it('compares the secret in constant time, not with ===', () => {
    // The helper must exist, must be CALLED, and must not early-return on a length
    // mismatch (which would leak the expected length).
    expect(src).toMatch(/function secretsMatch/);
    expect(src, 'secretsMatch is declared but never called').toMatch(/if\s*\(!secretsMatch\(/);
    expect(/return\s+a\.length\s*!==\s*b\.length/.test(src)).toBe(false);

    // Order-agnostic: `provided !== secret.value` and `secret.value !== provided` are
    // the same defect, and the first version of this regex only caught the second.
    const operand = String.raw`(secret\.value|expected|provided|providedSecret)`;
    const naive = new RegExp(`${operand}\\s*[!=]==\\s*${operand}`);
    expect(naive.test(src), 'the secret is compared with ===/!== somewhere').toBe(false);
  });

  it('derives the tenant from our own row, never from the payload', () => {
    // The single most likely regression: trusting a workspace id off the wire
    // because it is right there in the JSON (invariant 1).
    expect(/workspace_id:\s*watch\.workspace_id/.test(src)).toBe(true);
    const fromPayload = /workspace_id[^\n]*\b(payload|body|e)\.(workspace_id|metadata)/;
    expect(fromPayload.test(src), 'workspace_id is being taken from the webhook payload').toBe(false);
  });

  it('writes an allowlisted row rather than spreading the payload', () => {
    // Invariant 8. `.insert({...e})` / `.upsert({...entry})` is the shape to stop.
    expect(/\.(insert|upsert)\(\s*\{\s*\.\.\./.test(src)).toBe(false);
  });

  it('keeps replays harmless by upserting on the idempotency key', () => {
    // No nonce is available from the provider, so idempotency IS the replay defence.
    expect(src).toMatch(/onConflict:\s*'page_watch_id,firecrawl_check_id,url'/);
    expect(src).toMatch(/ignoreDuplicates:\s*true/);
  });
});

describe('page-watch CRUD — tenancy and spend', () => {
  const src = code(read(CRUD));

  it('proves workspace membership before touching anything', () => {
    expect(src).toMatch(/userCanAccessWorkspace\(/);
    // 404 on mismatch, not 403 — a 403 confirms the id exists (invariant 1).
    const check = src.indexOf('userCanAccessWorkspace(');
    const firstWrite = Math.min(
      ...['.insert(', '.update(', '.delete('].map((op) => {
        const i = src.indexOf(op);
        return i === -1 ? Number.MAX_SAFE_INTEGER : i;
      }),
    );
    expect(check).toBeLessThan(firstWrite);
  });

  it('debits before the paid call, and refuses when the debit fails', () => {
    // Invariant 10. The ordering is the whole point: a debit read after the
    // provider has already run is a log line, not a debit.
    const debit = src.indexOf('debitExternalServiceCredits(');
    const run = src.indexOf('/run');
    expect(debit).toBeGreaterThan(-1);
    expect(debit).toBeLessThan(run);
    expect(/if\s*\(!debit\.success\)[\s\S]{0,200}?402/.test(src),
      'a failed debit must refuse with 402, not proceed').toBe(true);
  });

  it('will not register a monitor it could not authenticate the callbacks of', () => {
    // Creating the monitor while the webhook secret is unset opens an
    // unauthenticated write path the moment the schedule first fires.
    expect(/webhookSecret\.value[\s\S]{0,300}?503/.test(src)).toBe(true);
  });

  it('validates the stored URL through the shared SSRF guard, https only', () => {
    expect(src).toMatch(/assertSafeUrl\(/);
    expect(src).toMatch(/allowSchemes:\s*\['https:'\]/);
  });

  it('builds explicit insert payloads', () => {
    expect(/\.(insert|upsert)\(\s*\{\s*\.\.\./.test(src)).toBe(false);
  });
});

describe('the Firecrawl wire contract — pinned to what the live API accepts', () => {
  /**
   * WHY THESE EXIST
   * ---------------
   * Every one of these was got WRONG in the first version of this feature, which
   * was written from the Monitoring docs and shipped behind a module that was off,
   * so nothing ever exercised it. Verified against the live API on 2026-08-16:
   *
   *   • `webhook` is top-level. Under `notification` the create returns 400
   *     `Unrecognized key in body` — so every watch creation failed, 100%.
   *   • the update method is PATCH. `PUT /v2/monitor/{id}` is not a route.
   *   • there is no `enabled` key; pausing is `status: 'paused' | 'active'`.
   *
   * A wrong verb and a misplaced key are both perfectly typed and perfectly
   * reviewable. Only the provider can say they are wrong, and it only says so at
   * runtime — which is why they are pinned here instead of trusted.
   */
  const src = code(read(CRUD));

  it('puts the webhook config at the top level of the monitor body', () => {
    // Brace-depth, not a regex. The first version of this assertion looked for
    // `webhook:` inside `notification: { ... }` with [^}]* — which cannot cross the
    // inner `}` of `{ email: { enabled: false } }`, so the very mutation it exists
    // to catch walked straight past it.
    const keys = topLevelKeysOfReturn(src, 'function buildMonitorBody(');
    expect(keys, 'buildMonitorBody must send `webhook` at the top level').toContain('webhook');
    const notification = objectValueOf(src, 'function buildMonitorBody(', 'notification');
    expect(
      notification.includes('webhook'),
      'webhook is nested under notification — Firecrawl rejects the whole create with 400',
    ).toBe(false);
    expect(src).toMatch(/'x-firecrawl-webhook-secret'/);
  });

  it('updates the monitor with PATCH, never PUT', () => {
    expect(/method:\s*'PUT'/.test(src), "PUT /v2/monitor/{id} is not a route — the update silently never happened").toBe(false);
    expect(src).toMatch(/method:\s*'PATCH'/);
  });

  it('pauses with status, not with an `enabled` flag', () => {
    expect(/\benabled:\s*(next|watch)\./.test(src), 'sending `enabled` fails the whole PATCH with 400').toBe(false);
    expect(src).toMatch(/status:\s*\(next\.is_active as boolean\)\s*\?\s*'active'\s*:\s*'paused'/);
  });

  it('sends a cron schedule rather than a natural-language phrase', () => {
    // Firecrawl's NL parser accepts "every day at 09:00" and rejects
    // "every Monday at 08:00". A cadence it refuses saves a watch that never runs.
    expect(src).toMatch(/schedule:\s*\{\s*cron:/);
    expect(/schedule:\s*\{\s*text:/.test(src), 'natural-language schedules are not reliably accepted').toBe(false);
  });

  it('offers the same cadences on both sides of the wire', () => {
    // Two copies, one meaning. The form must not offer a cadence the edge function
    // will reject, and the edge function must not accept one the form cannot show.
    const edge = code(read(CRUD));
    const edgeKeys = [...edge.matchAll(/^\s*'([^']+)':\s*'[-0-9*/ ,]+',$/gm)].map((m) => m[1]);
    const client = read('src/services/pageWatchService.ts');
    const listed = client.slice(client.indexOf('PAGE_WATCH_SCHEDULES = ['));
    const clientKeys = [...listed.slice(0, listed.indexOf(']')).matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(edgeKeys.length).toBeGreaterThan(0);
    expect(clientKeys).toEqual(edgeKeys);
  });
});

describe('the change log records changes, and knows when the page is broken', () => {
  const src = code(read(WEBHOOK));

  it('does not write a row for an unchanged page', () => {
    // 'same' is most deliveries and carries no diff, no judgment, no error.
    // Storing it turns a change log with no TTL into a check log.
    expect(src).toMatch(/if\s*\(status === 'same'\)\s*continue;/);
  });

  it('looks up the real HTTP status of the watched page', () => {
    // A 404 or 503 page arrives as an ordinary `same` with `error: null`, and the
    // webhook payload carries no statusCode at all — so a watch pointed at a dead
    // URL reports "up to date" forever unless something goes and asks.
    //
    // Match the CALL, not the declaration — deleting the call and leaving
    // `async function probeWatchedPageHealth` behind is the mutation that survived
    // the first draft, and it is the same trap `secretsMatch` sprang above.
    expect(src, 'the health probe is declared but never called').toMatch(/await probeWatchedPageHealth\(/);
    expect(src).toMatch(/statusCode/);
    expect(src).toMatch(/checks\/\$\{checkId\}/);
  });

  it('leaves the health verdict alone when it could not be determined', () => {
    // The lookup is rate-limited and best-effort. Clearing a real failure because
    // one call got a 429 is worse than not looking.
    expect(src).toMatch(/health === null/);
  });

  it('keeps the structured before/after the judge produced, instead of dropping it', () => {
    expect(src).toMatch(/meaningfulChanges/);
    expect(src).toMatch(/meaningful_changes/);
  });
});

describe('page_watch_changed is registered everywhere a trigger must be', () => {
  // TypeScript's exhaustive `Record<TriggerType, …>` maps already fail the build for
  // three of these. `paletteItems.ts` is a plain ARRAY — a missing entry compiles
  // perfectly and the trigger is simply absent from the builder, which is how a
  // trigger ends up emitting into a flow nobody can wire.
  const MIRRORS = [
    'src/services/flows/types.ts',
    'src/components/Admin/FlowsManagement/MyFlowsTab.tsx',
    'src/components/Admin/FlowsManagement/nodes/TriggerNode.tsx',
    'src/components/Admin/FlowsManagement/utils/paletteItems.ts',
  ];

  it.each(MIRRORS)('%s mentions the trigger', (file) => {
    expect(read(file)).toContain('page_watch_changed');
  });

  it('the emitter sends the fields the seeded default flow templates', () => {
    const src = read('supabase/functions/page-watch-webhook/index.ts');
    // The seeded flow reads {{trigger.data.*}} for these. A rename here shows up as
    // a notification with literal "{{trigger.data.title}}" in the body — valid,
    // deliverable and useless, which is why it needs pinning rather than reviewing.
    for (const field of ['user_id', 'title', 'body', 'action_url', 'type', 'page_watch_id']) {
      expect(src, `emit payload is missing ${field}`).toMatch(new RegExp(`\\b${field}:`));
    }
  });
});
