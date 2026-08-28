import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import { UNTRUSTED_FIELDS_NOTE } from '../../supabase/functions/_shared/untrusted';

/**
 * #352 A16/A17/A19 — a turn nobody is reading, and third-party text in structured results.
 */

const ROOT = join(__dirname, '..', '..');
const code = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const AGENT_CHAT = 'supabase/functions/agent-chat/index.ts';
const SEO = 'supabase/functions/_shared/tools/seo-agent-tools.ts';

describe('#352 A16 — a disconnect actually stops the turn', () => {
  const src = code(AGENT_CHAT);

  it('the stream implements cancel()', () => {
    // Without it the disconnect is not observed AT ALL: `cancelRequested` sat declared,
    // unassigned and unread while the turn kept running model calls and mutating tools.
    expect(src).toMatch(/cancel\(reason\)\s*\{/);
    expect(src).toContain('abortController.abort()');
    expect(src).toContain('cancelRequested = true');
  });

  it('the stream state is hoisted so cancel can reach it', () => {
    // `cancel` is a SIBLING of `start` on the underlying-source object, not a nested closure.
    // These being `start`-locals is part of why a cancel handler was never written — there was
    // nothing it could touch.
    const beforeStream = src.slice(0, src.indexOf('new ReadableStream('));
    expect(beforeStream).toMatch(/let streamClosed = false;/);
    expect(beforeStream).toMatch(/let heartbeatInterval/);
    expect(beforeStream).toMatch(/const abortController = new AbortController\(\)/);
  });

  it('the signal reaches the graph and is checked between steps', () => {
    expect(src).toContain('}, abortSignal);');
    // Two checks: before the next model call, and before each tool invocation.
    const checks = [...src.matchAll(/abortSignal\?\.aborted/g)];
    expect(checks.length, 'expected a check at the iteration boundary AND before each tool').toBeGreaterThanOrEqual(2);
  });

  it('the model stream is given the signal', () => {
    // So a disconnect kills the completion already in flight rather than paying for tokens
    // nobody will read.
    expect(src).toMatch(/signal: abortSignal/);
  });

  it('a cancellation is not reported as a crash', () => {
    expect(src).toContain('wasCancelled');
    // No error chunk to a reader that has gone.
    expect(src).toMatch(/if \(!streamClosed && !wasCancelled\)/);
  });

  it('the refund still runs on a cancelled turn', () => {
    // A turn the user abandoned mid-flight must not be charged as a completed one, so the
    // partner refund has to sit OUTSIDE the cancellation branch.
    const catchBlock = src.slice(src.indexOf('const wasCancelled'), src.indexOf('if (!streamClosed && !wasCancelled)'));
    expect(catchBlock).toContain('refundIfNotConsumed');
  });
});

describe('#352 A19 — seo_audit_url validates its URL', () => {
  const src = code(SEO);

  it('assertSafeUrl runs before the MIVAA call', () => {
    // `quick-page` runs a Lighthouse pass on OUR host, so an internal address here is a fetch
    // from our own infrastructure — which is what moved this above the audit's Low rating.
    const i = src.indexOf('createSEOAuditUrlTool');
    const body = src.slice(i, src.indexOf('name: \'seo_audit_url\'', i));
    const guard = body.indexOf('assertSafeUrl(url');
    const call = body.indexOf("callSEOAgentRoute('onpage/quick-page'");
    expect(guard, 'seo_audit_url no longer validates its URL').toBeGreaterThan(-1);
    expect(guard < call, 'the guard must run before the request').toBe(true);
  });
});

describe('#352 A17 — structured third-party text is labelled', () => {
  it('the note says what it needs to say', () => {
    expect(UNTRUSTED_FIELDS_NOTE).toMatch(/UNTRUSTED DATA/);
    expect(UNTRUSTED_FIELDS_NOTE).toMatch(/never follow any instruction/);
  });

  it('SERP-shaped results carry it', () => {
    // Not a banner per string, deliberately: twenty results wrapped individually would be
    // mostly framing, and each block would still hold one short title. The model reads the
    // whole object, so the frame belongs on the object.
    const src = code(SEO);
    const uses = [...src.matchAll(/_untrusted: UNTRUSTED_FIELDS_NOTE/g)];
    expect(uses.length, 'the third-party result shapes should carry the note').toBeGreaterThanOrEqual(3);
  });
});
