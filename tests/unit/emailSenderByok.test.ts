import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

/**
 * A tenant never sends on the operator's credentials (#357 AE-1).
 *
 * CLAUDE.md states it for the whole BYOK set: "a tenant NEVER falls back to the operator's
 * master credentials." `resolveWorkspaceEmailSender` did exactly that — a workspace with
 * incomplete BYOK sent through the operator's Resend account and domain, and the only thing in
 * the way was an OPT-IN `requireWorkspaceSender` flag most callers never passed.
 *
 * The exposure is shared, which is what makes a silent fallback the wrong default: every
 * tenant's bounces, complaints and spam reports land on the operator's sending domain and
 * degrade deliverability for everyone else on it.
 */

const ROOT = join(__dirname, '..', '..');
const code = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const SENDER = 'supabase/functions/_shared/email-sender.ts';
const EMAIL_API = 'supabase/functions/email-api/index.ts';
const FLOW = 'supabase/functions/flow-engine/index.ts';

describe('#357 AE-1 — the resolver refuses rather than falling back', () => {
  const src = code(SENDER);

  it('there is an `unconfigured` outcome, and it carries a reason', () => {
    // Returning the platform key with `source: 'platform'` was the bug: indistinguishable, to
    // every caller, from a legitimate system send.
    expect(src).toMatch(/source: 'workspace' \| 'platform' \| 'unconfigured'/);
    expect(src).toContain("source: 'unconfigured'");
    expect(src).toContain('reason:');
  });

  it('a tenant with no BYOK gets no key at all', () => {
    const block = src.slice(src.indexOf("source: 'unconfigured'") - 400, src.indexOf("source: 'unconfigured'") + 200);
    expect(block).toMatch(/apiKey: ''/);
  });

  it('the root exemption lives HERE, and is checked before falling back', () => {
    // The operator's own root workspace legitimately uses the platform key — it IS the platform.
    // The check must come before the platform return, or the refusal never happens.
    const rootAt = src.indexOf("select('is_root')");
    const platformAt = src.lastIndexOf("source: 'platform'");
    expect(rootAt, 'the resolver no longer distinguishes the root workspace').toBeGreaterThan(-1);
    expect(rootAt < platformAt).toBe(true);
  });

  it('a send with NO workspace still uses the platform sender', () => {
    // System sends — alerts, platform notifications — carry no workspace and are not tenant
    // mail. Refusing them would take the platform's own email down.
    //
    // The property: the refusal sits INSIDE an `if (workspaceId)`, so a call without one falls
    // through to the platform return. Anchored on the refusal itself rather than on a comment,
    // since this source is read with comments stripped.
    const refusal = src.indexOf("source: 'unconfigured'");
    const guardBefore = src.lastIndexOf('if (workspaceId)', refusal);
    const platformReturn = src.lastIndexOf("source: 'platform'");
    expect(refusal, 'no refusal branch').toBeGreaterThan(-1);
    expect(guardBefore, 'the refusal is not guarded by `if (workspaceId)`').toBeGreaterThan(-1);
    expect(guardBefore < refusal).toBe(true);
    expect(refusal < platformReturn, 'the platform return must remain reachable').toBe(true);
  });
});

describe('#357 AE-1 — every caller reads the one answer', () => {
  it('email-api gates on `unconfigured`, for every send', () => {
    const src = code(EMAIL_API);
    expect(src).toContain("sender.source === 'unconfigured'");
    expect(src).toContain('workspace_sender_required');
  });

  it('no file re-derives "does this workspace have BYOK"', () => {
    // Three copies existed: the resolver, email-api's `requireWorkspaceSender` gate, and
    // flow-engine's `workspaceHasByok` — whose own comment said it "mirrors" the resolver,
    // which is the word that precedes a drift. A divergent copy here decides whether a tenant's
    // mail goes out on the tenant's domain or the operator's.
    const dir = join(ROOT, 'supabase/functions');
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; }
        if (!e.name.endsWith('.ts')) continue;
        const rel = p.slice(ROOT.length + 1).split('\\').join('/');
        if (rel === SENDER) continue;
        const src = stripComments(readFileSync(p, 'utf8'));
        // The tell: reading the BYOK config columns directly instead of asking the resolver.
        if (/from\('workspace_email_config'\)[\s\S]{0,200}resend_api_key/.test(src)) offenders.push(rel);
      }
    };
    walk(dir);
    expect(
      offenders,
      'these re-read workspace_email_config to decide the sender — call '
        + 'resolveWorkspaceEmailSender instead: ' + offenders.join(', '),
    ).toEqual([]);
  });

  it('flow-engine asks the resolver', () => {
    const src = code(FLOW);
    expect(src).toContain('resolveWorkspaceEmailSender');
    expect(src).toMatch(/sender\.source === 'workspace'/);
  });
});
