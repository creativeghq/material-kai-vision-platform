/**
 * The Inbox does not deliver whatever it is told to, wherever it is told to (#359 CM-6/7/8).
 *
 * Three findings that are moderate alone and a closed loop together:
 *
 *   CM-6 `create_thread` wrote `metadata: payload.metadata ?? {}` — the request body, verbatim,
 *        into the column the relay reads to decide where a message goes. `email_from` is the
 *        recipient and `email_to` is the mailbox we send FROM, so a caller could have the platform
 *        deliver arbitrary text to an arbitrary address from the tenant's own verified sender.
 *   CM-7 An already-stored attachment reference passed through untouched, so any private object
 *        the service role could reach — a payslip, a contract, another customer's invoice — could
 *        be attached and relayed out.
 *   CM-8 The sentiment classifier fenced the transcript with a bare `<conversation>` tag, which is
 *        something a message can contain and thereby close.
 *
 * Combined with the model-settable `confirm` on `manage_inbox` (#352), the loop closes: an
 * attacker emails you, the agent reads it, and the agent mails whoever the injected text names,
 * with whatever file it names attached.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const raw = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const api = stripComments(raw('supabase/functions/inbox-api/index.ts'));

describe('#359 CM-6 — routing identity is server-derived, never a request field', () => {
  it('create_thread allowlists metadata instead of spreading the body', () => {
    expect(api).toMatch(/metadata: pickClientThreadMetadata\(payload\.metadata\)/);
    expect(api, 'the request body is written straight into thread metadata again')
      .not.toMatch(/metadata: payload\.metadata \?\? \{\}/);
  });

  it('every key the relay reads is absent from the allowlist', () => {
    // The allowlist and the relay's reads are two lists that must not overlap. Asserting the
    // OVERLAP rather than the contents means a new routing key added to the relay is caught even
    // if nobody remembers this test exists.
    const allowMatch = api.match(/CLIENT_SETTABLE_THREAD_METADATA = \[([^\]]*)\]/);
    expect(allowMatch, 'the allowlist was renamed or removed').toBeTruthy();
    const allowed = [...allowMatch![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(allowed.length).toBeGreaterThan(0);

    const routingMatch = api.match(/ROUTING_THREAD_METADATA = \[([^\]]*)\]/);
    expect(routingMatch).toBeTruthy();
    const routing = [...routingMatch![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(routing).toContain('email_from');
    expect(routing).toContain('email_to');
    expect(routing).toContain('contact_phone');

    for (const key of routing) {
      expect(allowed, `${key} is client-settable — that is the open relay`).not.toContain(key);
    }
  });

  it('the picker copies named keys rather than filtering a spread', () => {
    // `{ ...src, email_from: undefined }` leaves the key present with an undefined value, which
    // some writers happily persist. Building a fresh object from a fixed list cannot do that.
    const fn = api.slice(api.indexOf('function pickClientThreadMetadata'), api.indexOf('async function handleJwtAction'));
    expect(fn).toMatch(/for \(const key of CLIENT_SETTABLE_THREAD_METADATA\)/);
    expect(fn, 'the picker spreads the caller object').not.toMatch(/\.\.\.src/);
  });

  it('an array or a string does not slip through as metadata', () => {
    const fn = api.slice(api.indexOf('function pickClientThreadMetadata'), api.indexOf('async function handleJwtAction'));
    expect(fn).toMatch(/Array\.isArray\(raw\)/);
    expect(fn).toMatch(/typeof raw !== 'object'/);
  });
});

describe('#359 CM-7 — an attachment reference is one of this conversation own files', () => {
  const fn = api.slice(api.indexOf('async function uploadAttachment'), api.indexOf('async function normalizeAttachments'));

  it('the bucket AND the thread prefix are both checked', () => {
    // The prefix alone would still allow another conversation's attachments — a cross-customer
    // disclosure inside one tenant, which is the harder one to notice.
    expect(fn).toMatch(/bucket !== ATTACHMENT_BUCKET/);
    expect(fn).toMatch(/!path\.startsWith\(`inbox\/\$\{threadId\}\/`\)/);
  });

  it('a reference that fails the check is refused, not silently re-uploaded', () => {
    expect(fn).toMatch(/throw new HttpError\(400,/);
  });

  it('the pass-through is gone', () => {
    expect(fn, 'any stored reference passes through again')
      .not.toMatch(/storage_bucket: att\.storage_bucket \|\| ATTACHMENT_BUCKET,\n\s+storage_object_path: att\.storage_object_path,/);
  });

  it('the check precedes the return, so nothing is returned unchecked', () => {
    const guard = fn.indexOf('throw new HttpError(400,');
    const ret = fn.indexOf('return {');
    expect(guard).toBeGreaterThan(-1);
    expect(ret).toBeGreaterThan(-1);
    expect(guard < ret, 'the reference is returned before it is checked').toBe(true);
  });
});

describe('#359 CM-8 — the classifier reads customer text as data', () => {
  it('the transcript goes through the canonical fence', () => {
    // A bare `<conversation>` tag is something a message can contain and thereby close, after
    // which the rest of the customer's text reads as instructions to the classifier.
    expect(api).toMatch(/wrapUntrusted\('customer conversation', transcript\)/);
    expect(api, 'the closeable bare tag is back').not.toMatch(/<conversation>\\n\$\{transcript\}/);
  });

  it('it still forces a tool call, so the verdict cannot be free-form', () => {
    // Invariant 9's other half: a verdict that drives a stored field and a UI state arrives as a
    // validated tool call, never as JSON with a salvage parser behind it.
    expect(api).toMatch(/tool_choice: \{ type: 'tool', name: TOOL\.name \}/);
  });

  it('the reading passed to the agent is labelled as derived from the customer', () => {
    // `summary` / `reply_guidance` are free text produced from customer-authored input, so a
    // steered classifier is a way to put words in the operator's mouth. agent-chat fences the
    // whole string, which contains it — the label is so a reader of the prompt can see why.
    expect(api).toMatch(/conversation_reading note="derived from the customer/);
  });

  it('the customer-facing agent turn is still fenced upstream', () => {
    // The fence that matters most lives in agent-chat, keyed on the audience. If that ever stops
    // being applied, every finding above becomes reachable again.
    const chat = stripComments(raw('supabase/functions/agent-chat/index.ts'));
    expect(chat).toMatch(/userInput = fenceCustomerMessage\(String\(userInput\)\)/);
  });
});
