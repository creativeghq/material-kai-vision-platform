/**
 * Acceptance guard — issue #342 §6.
 *
 * Two separate walls, both of which are prose in a README today and would otherwise survive only
 * as long as the next person reads it:
 *
 * 1. **The Cloudflare Email Worker resolves no tenancy.** It lives outside this repo's
 *    enforcement — no semgrep ruleset, no `check_security_invariants()`, no `deno check`, no
 *    review path — so a tenancy decision that drifts into it is invisible to every other gate we
 *    have. It must never look up a workspace, a user's address row or a thread, and it must never
 *    hold a database credential.
 *
 * 2. **An agent/inbox reply never borrows the finance sending identity, and no finance send ever
 *    looks like an autoresponder.** `Auto-Submitted: auto-replied` on a real invoice makes a
 *    customer's mail client treat it as a bounce; `requireWorkspaceSender: true` on an agent reply
 *    would send a stranger's conversation from the tenant's verified finance domain.
 *
 * Source-level and hermetic: greps the shipped files, no network, no database.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/** Every .ts file under a directory, skipping vendored deps. */
function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkTs(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

const ROOT = process.cwd();
const WORKER_SRC = join(ROOT, 'cloudflare/email-worker/src/index.ts');
const WEBHOOKS_SRC = join(ROOT, 'supabase/functions/email-webhooks/index.ts');
const INBOUND_SHARED = join(ROOT, 'supabase/functions/_shared/inbound-email.ts');

/** Business-document senders. Every one of these must stay pinned to the tenant's own sender. */
const FINANCE_SENDERS = [
  'supabase/functions/finance-send-invoice-email/index.ts',
  'supabase/functions/finance-send-statement/index.ts',
  'supabase/functions/send-quote-email/index.ts',
  'supabase/functions/generate-purchase-sheet-pdf/index.ts',
  'supabase/functions/catalog-send-to-customers/index.ts',
  'supabase/functions/campaign-processor/index.ts',
];

/** Drop comments so a file that DOCUMENTS a forbidden term does not satisfy a grep for it. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('#342 the Cloudflare Email Worker resolves no tenancy', () => {
  const code = stripComments(readFileSync(WORKER_SRC, 'utf8'));

  it('never mentions workspace_id', () => {
    expect(code).not.toMatch(/workspace_id/);
  });

  it('never looks up an address row, a thread, or a contact', () => {
    expect(code).not.toMatch(/user_email_addresses/);
    expect(code).not.toMatch(/inbox_threads|inbox_messages|inbox_participants/);
    expect(code).not.toMatch(/crm_contacts/);
  });

  it('holds no database credential and constructs no Supabase client', () => {
    expect(code).not.toMatch(/SERVICE_ROLE/i);
    expect(code).not.toMatch(/createClient/);
    // It uploads through a signed URL the edge function mints, never a keyed storage call.
    expect(code).toMatch(/upload_url/);
  });

  it('asks the edge function whether to accept, rather than deciding', () => {
    expect(code).toMatch(/inbound_begin/);
    expect(code).toMatch(/setReject/);
  });

  it('rejects rather than silently dropping when the platform is unreachable', () => {
    // A dropped message is a lost customer order that nobody finds out about. Every failure
    // path must end in setReject so the sending server retries.
    const rejects = (code.match(/setReject/g) || []).length;
    expect(rejects).toBeGreaterThanOrEqual(5);
  });
});

describe('#342 inbound mail fails closed', () => {
  const src = readFileSync(WEBHOOKS_SRC, 'utf8');

  it('refuses to process when the shared secret is unset', () => {
    expect(src).toMatch(/INBOUND_WEBHOOK_SECRET/);
    // 503 on an unset secret — never a fall-through to unauthenticated processing.
    expect(src).toMatch(/INBOUND_WEBHOOK_SECRET[\s\S]{0,400}?503/);
  });

  it('verifies the secret in constant time before parsing the body', () => {
    const secretCheck = src.indexOf('timingSafeEqualStr(suppliedSecret');
    const bodyParse = src.indexOf('await req.json()');
    expect(secretCheck).toBeGreaterThan(-1);
    expect(bodyParse).toBeGreaterThan(-1);
    expect(secretCheck).toBeLessThan(bodyParse);
  });

  it('derives the workspace from the recipient address, never from the payload', () => {
    expect(src).toMatch(/resolveRecipient\(db, envelope\.to\)/);
    // The tenant must not be readable out of the request body under any key.
    expect(src).not.toMatch(/payload\.workspace_id/);
  });

  it('dedupes on Message-ID so a retry cannot double-post', () => {
    expect(src).toMatch(/alreadyProcessed/);
  });
});

describe('#342 the auth gate is DKIM-based, because forwarding breaks SPF', () => {
  const src = readFileSync(WEBHOOKS_SRC, 'utf8');
  const shared = readFileSync(INBOUND_SHARED, 'utf8');

  it('does not quarantine on SPF failure alone', () => {
    // "Use my own address" is a forwarding flow: the forwarding host becomes the envelope
    // sender, so legitimate forwarded mail fails SPF every time. Quarantining on it would
    // silently swallow exactly the customers who followed our own setup instructions.
    expect(src).not.toMatch(/auth\.spf\s*===\s*'fail'/);
    expect(src).toMatch(/auth\.dmarc === 'fail' && auth\.dkim !== 'pass'/);
  });

  it('reads the verdicts out of the Authentication-Results header', () => {
    // The header is read where the message is parsed (the webhook), and interpreted in the
    // shared module. Both halves must exist or the gate is inert.
    expect(src).toMatch(/parseAuthResults\(parsed\.headers\.get\('authentication-results'\)\)/);
    expect(shared).toMatch(/export function parseAuthResults/);
  });
});

describe('#342 inbound HTML is never trusted markup', () => {
  // Strip comments: this module DOCUMENTS the rule, and the prose would satisfy a naive grep.
  const shared = stripComments(readFileSync(INBOUND_SHARED, 'utf8'));

  it('stores the HTML body without rendering it server-side', () => {
    expect(shared).toMatch(/email_html/);
    expect(shared).not.toMatch(/dangerouslySetInnerHTML/);
  });

  it('persists attachments as a bucket + path pair, never a signed URL', () => {
    expect(shared).toMatch(/storage_object_path/);
    // A persisted signed URL expires; re-deriving on read is free (pipeline convention 7).
    expect(shared).not.toMatch(/createSignedUrl/);
  });
});

describe('#342 sending identity stays separated from the reply path', () => {
  it('every business-document sender still pins requireWorkspaceSender: true', () => {
    for (const rel of FINANCE_SENDERS) {
      const p = join(ROOT, rel);
      if (!existsSync(p)) throw new Error(`${rel} moved — update this guard, do not delete it`);
      expect(readFileSync(p, 'utf8'), rel).toMatch(/requireWorkspaceSender:\s*true/);
    }
  });

  it('no finance sender marks its mail as auto-replied', () => {
    // A mail client that sees Auto-Submitted / Precedence on an invoice can treat it as an
    // autoresponder bounce and never show it to the customer.
    for (const rel of FINANCE_SENDERS) {
      const p = join(ROOT, rel);
      if (!existsSync(p)) continue;
      const src = readFileSync(p, 'utf8');
      expect(src, rel).not.toMatch(/Auto-Submitted/i);
      expect(src, rel).not.toMatch(/Precedence['"]?\s*:/i);
    }
  });

  it("only the inbound path may declare the email_type 'agent_reply'", () => {
    // Matches the DECLARATION, not the substring: `internal_agent_reply` (the inbox-api action
    // name) and `inbox_agent_reply` (the credit operation type) are unrelated and legitimate.
    const DECLARES_AGENT_REPLY = /\b(email_?[Tt]ype)\s*:\s*['"]agent_reply['"]/;
    const allowed = new Set([
      'supabase/functions/email-webhooks/index.ts',
      'supabase/functions/inbox-api/index.ts',
      'supabase/functions/email-api/index.ts',
      'supabase/functions/_shared/inbound-email.ts',
    ]);
    const offenders: string[] = [];
    for (const file of walkTs(join(ROOT, 'supabase/functions'))) {
      const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
      if (allowed.has(rel)) continue;
      if (DECLARES_AGENT_REPLY.test(readFileSync(file, 'utf8'))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});

describe('#342 the assistant answers only when the owner asked it to', () => {
  const src = stripComments(readFileSync(WEBHOOKS_SRC, 'utf8'));

  // This one shipped inert. `auto_reply_enabled` was selected in resolveRecipient and declared on
  // the ResolvedAddress interface, so every reader assumed it was load-bearing — and the gate was
  // `!automated && !platformSender`, which never mentions it. The toggle in the Inbox changed
  // nothing, and since the column DEFAULTS to false, the shipped behaviour was the opposite of the
  // schema's intent: a brand-new address auto-replied to strangers, unattended, on credit.
  //
  // A column that is fetched but never read is invisible to typecheck (the value is used — it is
  // assigned to a field), invisible to lint, and invisible to any integrity probe, because the
  // stored data is perfectly correct. Only a source-level assertion sees it.
  it('reads auto_reply_enabled in the decision, not merely into a variable', () => {
    const gate = src.match(/const\s+autoReplyAllowed\s*=\s*([^;]+);/);
    expect(gate, 'the autoReplyAllowed gate has been renamed or removed').toBeTruthy();
    expect(
      gate![1],
      'auto_reply_enabled is not part of the auto-reply decision — the Inbox toggle is dead again',
    ).toMatch(/auto_reply_enabled/);
  });

  it('still suppresses loops and automated senders', () => {
    const gate = src.match(/const\s+autoReplyAllowed\s*=\s*([^;]+);/)![1];
    // Both must survive alongside the toggle: two of our own addresses with auto-reply on is an
    // infinite exchange, and answering a bounce or a mailing list is the classic mail storm.
    expect(gate, 'the automated-sender suppression was dropped').toMatch(/automated/);
    expect(gate, 'the loop guard against our own addresses was dropped').toMatch(/platformSender/);
  });

  it('resolves only active addresses, so a disabled mailbox accepts nothing', () => {
    const shared = stripComments(readFileSync(INBOUND_SHARED, 'utf8'));
    expect(shared).toMatch(/\.eq\(\s*['"]is_active['"]\s*,\s*true\s*\)/);
  });
});
