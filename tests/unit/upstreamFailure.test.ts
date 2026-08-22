import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ACCESS_DENIED_MESSAGE, ACTION_UNAVAILABLE_MESSAGE, UPSTREAM_UNAVAILABLE_MESSAGE,
  classifyDbFailure, describeDeniedObject, isUpstreamFailure, summariseUpstreamFailure,
} from '../../supabase/functions/_shared/upstream-failure.ts';

/**
 * "The database is down" must not be reported as "your request was bad".
 *
 * THE OUTAGE (2026-08-22, four hours). Every edge function reads the database like this:
 *
 *     if (error) throw new HttpError(400, error.message);     // 207 sites, 16 functions
 *
 * During the outage `error` was a Cloudflare **522 Connection timed out** page. Callers got
 * `400 Bad Request` with 2,916 bytes of HTML as the message, `api-logger` skipped Sentry
 * because 4xx are client errors by policy, and the `api_usage_logs` insert failed too because
 * it needs the same dead database. A total outage that looked like user error and paged nobody.
 *
 * The fix is a classifier applied once in the wrapper. What this file protects is its two
 * failure modes, which are NOT symmetric:
 *
 *   - reading a client error as an outage → a wrong status and a spurious Sentry event.
 *   - reading an outage as a client error → what happened above.
 *
 * So the client-error cases below are the real messages this platform produces, and the outage
 * cases are the real payloads it received.
 */

const API_LOGGER = join(process.cwd(), 'supabase/functions/_shared/api-logger.ts');

/** The genuine Cloudflare page, trimmed to the parts a matcher would see. */
const CLOUDFLARE_522 = `<!DOCTYPE html>
<html class="no-js" lang="en-US">
<head>
<title>supabase.co | 522: Connection timed out</title>
</head>
<body>
<h1><span class="inline-block">Connection timed out</span><span class="code-label">Error code 522</span></h1>
<p>The initial connection between Cloudflare's network and the origin web server timed out.</p>
</body>
</html>`;

describe('an outage is recognised as an outage', () => {
  it('the exact payload that broke this platform', () => {
    // What supabase-js handed the handler, verbatim from the 16:55:56 UTC edge log.
    expect(isUpstreamFailure({
      message: 'JSON could not be generated',
      code: '522',
      hint: 'Refer to full message for details',
      details: CLOUDFLARE_522,
    })).toBe(true);
  });

  it('a bare gateway page with no structure at all', () => {
    expect(isUpstreamFailure(CLOUDFLARE_522)).toBe(true);
  });

  it.each([
    ['fetch rejection', new TypeError('error sending request for url (https://x.supabase.co/rest/v1/products)')],
    ['deno fetch failed', new Error('fetch failed')],
    ['connection exception', { code: '08006', message: 'connection failure' }],
    ['out of connections', { code: '53300', message: 'sorry, too many clients already' }],
    ['admin shutdown', { code: '57P01', message: 'terminating connection due to administrator command' }],
    ['internal error', { code: 'XX000', message: 'internal error' }],
    ['recovering', { code: '57P03', message: 'the database system is starting up' }],
    ['bad gateway text', 'Request failed: 502 Bad Gateway'],
  ])('%s', (_label, input) => {
    expect(isUpstreamFailure(input)).toBe(true);
  });

  it('reads the failure off an Error that carries it as `cause`', () => {
    const err = new Error('Could not load the plan', { cause: { code: '522', message: 'JSON could not be generated' } });
    expect(isUpstreamFailure(err)).toBe(true);
  });
});

describe('a client error stays a client error', () => {
  it.each([
    ['unique violation', { code: '23505', message: 'duplicate key value violates unique constraint "profile_ambassadorships_user_brand_key"' }],
    // Not an OUTAGE — it is a missing GRANT, which the classifier below routes separately.
    ['missing grant', { code: '42501', message: 'permission denied for table products' }],
    ['no rows', { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }],
    ['bad uuid', { code: '22P02', message: 'invalid input syntax for type uuid: "null"' }],
    ['business rule', { code: 'P0001', message: 'quote 841c21cc is accepted — issue a revision instead of editing it' }],
    ['missing param', 'blueprint_id required'],
    ['bot check', 'Bot check failed. Please try again.'],
    ['not found', 'Starter blueprint not found'],
    ['validation', 'A name and either an email or a phone number are required'],
    ['nothing at all', null],
  ])('%s', (_label, input) => {
    expect(isUpstreamFailure(input)).toBe(false);
  });

  /**
   * A SQLSTATE the request caused wins over any text inside it. Without this, a constraint
   * violation quoting a user's value ("Connection timed out Ltd") would read as an outage.
   */
  it('a request-caused SQLSTATE beats text that looks like a transport failure', () => {
    expect(isUpstreamFailure({
      code: '23505',
      message: 'duplicate key value violates unique constraint — key (name)=(Connection timed out Ltd)',
    })).toBe(false);
  });
});

describe('what the client and the log are told', () => {
  it('the client never receives the upstream body', () => {
    expect(UPSTREAM_UNAVAILABLE_MESSAGE).not.toMatch(/</);
    expect(UPSTREAM_UNAVAILABLE_MESSAGE.length).toBeLessThan(120);
  });

  it('an HTML error page is summarised to its title, not dumped', () => {
    const summary = summariseUpstreamFailure(CLOUDFLARE_522);
    expect(summary).toContain('522');
    expect(summary).not.toMatch(/</);
    expect(summary.length).toBeLessThanOrEqual(201);
  });

  it('a plain message survives intact', () => {
    expect(summariseUpstreamFailure('connection failure')).toBe('connection failure');
    expect(summariseUpstreamFailure(null)).toMatch(/no message/);
  });
});

describe('"permission denied" is two different events', () => {
  /**
   * Both of these are SQLSTATE 42501 and both were returning 400. One is the caller asking for
   * something that is not theirs; the other is a feature that is dead for everybody because
   * nobody ran a GRANT. `permission denied for function is_workspace_member` appeared in the
   * logs during the outage window, indistinguishable from a typo in a request body.
   */
  it('a policy refusing the write is the caller\'s own doing', () => {
    expect(classifyDbFailure({
      code: '42501',
      message: 'new row violates row-level security policy for table "orders"',
    })).toBe('rls_denied');
  });

  it.each([
    ['function', 'permission denied for function is_workspace_member', 'function is_workspace_member'],
    ['table', 'permission denied for table products', 'table products'],
    ['schema', 'permission denied for schema vecs', 'schema vecs'],
    ['quoted view', 'permission denied for view "finance.order_payment_status_drift"', 'view finance.order_payment_status_drift'],
  ])('a missing GRANT on a %s is ours, and names the object', (_label, message, target) => {
    expect(classifyDbFailure({ code: '42501', message })).toBe('grant_missing');
    expect(describeDeniedObject(message)).toBe(target);
  });

  it('leaves every ordinary failure exactly as the handler said', () => {
    expect(classifyDbFailure('blueprint_id required')).toBe('client');
    expect(classifyDbFailure({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe('client');
    expect(classifyDbFailure({ code: 'P0001', message: 'not authorized for workspace 37ca563f' })).toBe('client');
  });

  it('an outage still outranks both', () => {
    expect(classifyDbFailure(CLOUDFLARE_522)).toBe('upstream');
  });

  it('neither response body repeats what the database said', () => {
    // The raw texts name a table, a function, a policy. The caller needs none of that.
    for (const msg of [ACCESS_DENIED_MESSAGE, ACTION_UNAVAILABLE_MESSAGE]) {
      expect(msg).not.toMatch(/permission|policy|table|function|schema|grant/i);
      expect(msg.length).toBeLessThan(120);
    }
  });
});

describe('the wrapper still applies it', () => {
  const src = readFileSync(API_LOGGER, 'utf8');

  /**
   * The classifier is worthless unless the one place that uses it keeps using it. This is the
   * whole fix: 207 call sites are left saying 400, and the wrapper corrects them.
   */
  it('api-logger routes each kind to the status it deserves', () => {
    expect(src).toMatch(/classifyDbFailure\(/);
    expect(src).toMatch(/statusCode\s*<\s*500/);
    expect(src).toMatch(/failure === 'upstream'[\s\S]{0,400}statusCode = 503/);
    expect(src).toMatch(/failure === 'grant_missing'[\s\S]{0,500}statusCode = 500/);
    expect(src).toMatch(/failure === 'rls_denied'[\s\S]{0,500}statusCode = 403/);
  });

  /**
   * Sentry is only reached by a 5xx whose message does not read like a client complaint. The
   * rewritten message has to clear that filter, or the outage is silent again for a new reason
   * — so this asserts against the ACTUAL regex in the file rather than a copy of it.
   */
  it('the rewritten message is not swallowed by the client-error filter', () => {
    const literal = src.match(/const CLIENT_ERROR_RE\s*=\s*\n?\s*\/(.+)\/([gimsuy]*);/);
    expect(literal, 'CLIENT_ERROR_RE not found in api-logger.ts').toBeTruthy();
    const clientErrorRe = new RegExp(literal![1], literal![2]);

    // Both of the messages the wrapper writes for a REPORTED failure. The GRANT one is the
    // delicate case: CLIENT_ERROR_RE contains "permission denied", which is exactly the phrase
    // Postgres used, so the wrapper must not repeat it.
    const reported = [
      `upstream data service unavailable — ${summariseUpstreamFailure(CLOUDFLARE_522)}`,
      `database GRANT missing — the calling role cannot use ${describeDeniedObject('permission denied for function is_workspace_member')}`,
    ];
    for (const message of reported) {
      expect(clientErrorRe.test(message), `"${message}" would be kept out of Sentry`).toBe(false);
    }
  });
});
