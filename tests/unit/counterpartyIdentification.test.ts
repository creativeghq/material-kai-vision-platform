/**
 * Guards for "find the business behind a conversation".
 *
 * Every rule here failed silently in review: a wrong transcript still returns a confident
 * business, a paid search still returns the right answer, and a verdict of "person" is a valid
 * verdict. Nothing about the feature LOOKS broken when these regress.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const DIALOG = 'src/components/business/crm/IdentifyBusinessDialog.tsx';
const PANEL = 'src/pages/Inbox/InboxPage.tsx';
const ENRICH = 'supabase/functions/company-enrich/index.ts';
const PARTY = 'supabase/functions/_shared/inbox-customer-party.ts';

describe('the research is fed what the COUNTERPARTY said', () => {
  it('the transcript is filtered to incoming messages', () => {
    const src = stripComments(read(PANEL));
    const transcript = src.slice(src.indexOf('const transcript ='), src.indexOf('const transcript =') + 400);
    expect(transcript, 'the transcript sent for identification is not direction-filtered — our own '
      + 'replies get fenced as the other party\'s words, and their domains become OUR domain')
      .toContain("=== 'incoming'");
  });
});

describe('the free answer is asked for first', () => {
  it('the number is looked up in the CRM before any paid research', () => {
    const src = stripComments(read(DIALOG));
    const known = src.indexOf('lookupKnownNumber()');
    const paid = src.indexOf('identifyCounterparty(');
    expect(known, 'lookupKnownNumber is gone').toBeGreaterThan(-1);
    expect(paid, 'identifyCounterparty is gone').toBeGreaterThan(-1);
    // ORDER, because a check after the spend is not a check.
    expect(known, 'the paid identification runs before the free CRM lookup, so a number already '
      + 'on file is researched again and billed for').toBeLessThan(paid);
  });

  it('a hit returns without reaching the paid call', () => {
    const src = stripComments(read(DIALOG));
    const block = src.slice(src.indexOf('const known = await lookupKnownNumber()'));
    const untilPaid = block.slice(0, block.indexOf('identifyCounterparty('));
    expect(untilPaid, 'the known-number branch falls through to the paid research instead of returning')
      .toMatch(/\breturn\b/);
  });
});

/**
 * The web-research call inside `identifyViaWebSearch`, and nothing else.
 *
 * `enrichViaWebSearch` sits ABOVE it in the same file with a byte-identical opening line, so
 * anchoring on that line alone silently reads the wrong function — which is how the first
 * version of these two guards passed while the fence was removed.
 */
function identifyResearchCall(src: string): string {
  const fn = src.slice(src.indexOf('async function identifyViaWebSearch'));
  expect(fn, 'identifyViaWebSearch is gone').not.toBe('');
  const call = fn.slice(fn.indexOf('const research = await anthropic({'));
  return call.slice(0, call.indexOf('});'));
}

describe('a verdict that drives a CRM write is constrained by the server', () => {
  it('the identification forces its tool and keeps no salvage parser', () => {
    const src = stripComments(read(ENRICH));
    expect(src, 'the identification is not a forced tool call (security invariant 9)')
      .toContain("tool_choice: { type: 'tool', name: 'record_counterparty_identity' }");
    expect(src, 'a JSON salvage parser reappeared — an unparseable reply is a FAILED '
      + 'identification, never a parse target').not.toMatch(/extractJson|JSON\.parse\(\s*researchText/);
  });

  // Both of these read the CALL SITE, not the file. Asserting the helper merely exists passed
  // with the fence removed from the message — a guard that cannot fail is decorative.
  it('the untrusted transcript is fenced as DATA where it is sent', () => {
    const src = stripComments(read(ENRICH));
    const content = identifyResearchCall(src);
    expect(content, 'the conversation excerpt reaches the model unfenced (security invariant 9) — '
      + 'the fenceTranscript helper existing elsewhere in the file is not the same thing')
      .toContain('fenceTranscript(seed.transcript)');
    expect(content, 'the raw transcript is interpolated alongside the fenced one')
      .not.toMatch(/\$\{seed\.transcript\}/);
  });

  it('the prompt comes from the database with no fallback', () => {
    const src = stripComments(read(ENRICH));
    expect(src, 'the identification prompt is not loaded from the database')
      .toContain("loadPrompt(admin, 'research', 'counterparty_identity')");
    // Where the prompt is USED, not where it is loaded: the fallback that matters is the one
    // that quietly substitutes a constant when the row is missing, and it lives at the use.
    const content = identifyResearchCall(src);
    expect(content, 'a hardcoded fallback prompt appeared — a fallback is invisible when it '
      + 'fires, so an admin edit would save and change nothing forever')
      .toMatch(/\$\{instruction\}/);
    expect(content, 'the loaded prompt is defaulted at the point of use')
      .not.toMatch(/instruction\s*(\?\?|\|\|)/);
  });

  it('an unreachable provider is UNKNOWN, never "not a business"', () => {
    const src = stripComments(read(ENRICH));
    const fail = src.slice(src.indexOf('if (!result)'), src.indexOf('if (!result)') + 200);
    expect(fail, 'a failed identification is reported as a verdict about the counterparty rather '
      + 'than as "we could not ask"').toContain("verdict: 'unknown'");
  });
});

describe('the company on a thread is the one somebody FILED', () => {
  it('the explicit link outranks the inferred quote history', () => {
    const src = stripComments(read(PARTY));
    const linked = src.indexOf('linkedCompanyId');
    const fromLink = src.indexOf("from('crm_company_contacts')");
    const fromQuote = src.indexOf("from('quotes')");
    expect(linked, 'the participant company is no longer read').toBeGreaterThan(-1);
    expect(fromLink, 'crm_company_contacts is no longer consulted, so a company somebody recorded '
      + 'is invisible until it has a quote — and isBusiness drives net-vs-gross pricing')
      .toBeGreaterThan(-1);
    const coalesce = src.slice(src.indexOf('const companyId ='), src.indexOf('const companyId =') + 400);
    expect(coalesce.indexOf('linkedCompanyId'), 'the inferred company outranks the filed one')
      .toBeLessThan(coalesce.indexOf('customer_company_id'));
    expect(fromQuote).toBeGreaterThan(-1);
  });

  it('a company with no contact is still a party', () => {
    const src = stripComments(read(PARTY));
    const guard = src.slice(src.indexOf('if (!contactId)'), src.indexOf('if (!contactId)') + 300);
    expect(guard, 'a business line with no named person returns NOBODY again, so the company just '
      + 'filed against the thread does not show').toContain('linkedCompanyId');
  });

  it('partyFilter omits a half it does not have', () => {
    const src = stripComments(read(PARTY));
    const fn = src.slice(src.indexOf('export function partyFilter'));
    expect(fn.slice(0, 400), 'partyFilter emits a literal contact clause for a contact-less party; '
      + 'PostgREST matches the string "null" against nothing and silently empties the result')
      .toContain('if (party.contactId)');
  });
});
