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

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const WEBHOOK = 'supabase/functions/page-watch-webhook/index.ts';
const CRUD = 'supabase/functions/page-watches/index.ts';

/** Strip block/line comments so prose describing a rule cannot satisfy the rule. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
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
