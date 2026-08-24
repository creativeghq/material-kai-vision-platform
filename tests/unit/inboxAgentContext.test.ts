/**
 * The assistant knows who it is speaking FOR, and can tell its speakers apart.
 *
 * ── What went wrong ─────────────────────────────────────────────────────────────────────────
 * 2026-08-24, a WhatsApp thread with a supplier. Asked `your email address, please`, the Inbox
 * assistant replied: *"I'm sorry, but I don't have an email address to share here."*
 *
 * It was telling the truth about its own context. The entire description of the business it was
 * answering for was `Business: ${workspaces.name}` — which on that workspace reads **"Default
 * Workspace"**. One table over sat the trading name (MATERIALS BANK ΕΕ), the VAT number
 * (EL802349569), the street, the city, the ΚΑΔ profession, and an active workspace mailbox
 * (`user_email_addresses`) whose replies file straight back onto the Inbox thread. The assistant
 * could quote an invoice balance to the cent and could not name its own company.
 *
 * Nothing failed. Every call succeeded, the reply was polite and grammatical, and a refusal is a
 * valid string — so no typecheck, no integrity probe and no health signal could see it. The only
 * detector was a human reading the thread.
 *
 * Two more of the same shape were in the same function:
 *   - every transcript line was labelled `Customer/Team`, because a member's reply carries
 *     `message_type='text'` exactly like the customer's. The model could not tell what the customer
 *     had asked from what a colleague had already promised.
 *   - `m.body || '[attachment]'` only mentioned an attachment when the body was EMPTY, so an email
 *     carrying an invoice PDF *and* a covering sentence rendered as the sentence alone.
 *
 * ── Why a source-scan test ──────────────────────────────────────────────────────────────────
 * The failure is an ABSENCE in a prompt. There is no return value to assert on and no row to
 * check: the code was already correct in every mechanical sense. So this test pins the presence of
 * the context block and the reachability ladder, and fails when either is deleted or when a second
 * hand-rolled reader of `finance_settings.business_*` reappears next to the derivation.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

/**
 * The same file with its prose removed.
 *
 * Every "this must NOT appear" assertion below names the OLD code it is banning — and this repo
 * documents a fix by quoting the defect it replaced, so the banned string is guaranteed to appear
 * in the comment that explains why it is banned. Scanning the raw file therefore fails on a
 * CORRECT fix, which is the most annoying possible false positive: it punishes writing down what
 * happened.
 *
 * `stripComments` is the shared scanner, never a local pair of regexes — see
 * `tests/helpers/stripComments.ts` for the ten hand-rolled copies it replaced, and for the
 * `/api/rag/*` case that made thirty of them silently delete the code they were guarding.
 */
const code = (p: string) => stripComments(read(p));

/**
 * The text between two markers. `indexOf(fn)` alone runs to the end of a 3,000-line file, which
 * turns "this must not appear in the transcript builder" into "must not appear anywhere below it"
 * — and it does appear below it, legitimately: `insertMessageAndNotify` builds a notification
 * preview the same way, where hiding nothing and saying "[attachment]" is the right answer.
 */
const between = (src: string, from: string, to: string): string => {
  const start = src.indexOf(from);
  expect(start, `marker not found: ${from}`).toBeGreaterThan(-1);
  const end = src.indexOf(to, start + from.length);
  expect(end, `marker not found: ${to}`).toBeGreaterThan(-1);
  return src.slice(start, end);
};

const IDENTITY = 'supabase/functions/_shared/business-identity.ts';
const INBOX = 'supabase/functions/inbox-api/index.ts';
const AGENT_CHAT = 'supabase/functions/agent-chat/index.ts';

describe('business identity reaches the model that speaks for the business', () => {
  it('derives the identity in SQL and does not re-pick finance_settings columns in TypeScript', () => {
    const src = code(IDENTITY);

    // TWO SQL derivations, deliberately separate. `workspace_invoicing_identity` answers "what
    // goes on the invoice" and feeds the myDATA envelope; `workspace_customer_contact` answers
    // "how does a customer reach us". Folding them together would change what reaches AADE, and a
    // TypeScript reader of `finance_settings.*` would be a third answer to "who are we" —
    // CLAUDE.md's one-derivation rule, over the exact column set that is transmitted to AADE.
    expect(src).toContain('workspace_invoicing_identity');
    expect(src).toContain('workspace_customer_contact');
    expect(src).not.toMatch(/from\(\s*['"]finance_settings['"]\s*\)/);
    expect(src).not.toMatch(/business_(name|vat|email|phone|address|city)/);
    expect(src).not.toMatch(/contact_(email|phone|hours|title)/);
  });

  it('walks a reachability ladder for the contact address, most deliberate first', () => {
    const src = read(IDENTITY);

    // Blank on the invoice means nobody typed it into Profile → Business. It does NOT mean the
    // business is unreachable — which is the inference that produced the refusal.
    const rungs = [
      'workspace_customer_contact', // contact_email → business_email, decided in SQL
      'workspace_email_config',     // reply_to / from_email — where we already ask people to answer
      'user_email_addresses',       // the workspace mailbox: files replies back onto the thread
      'workspace_phone_numbers',    // the connected WhatsApp line is a real published number
    ];
    for (const rung of rungs) expect(src).toContain(rung);

    // Which of the two columns answered has to survive the read. The billing inbox standing in for
    // a support address is a real thing to know about, not an implementation detail.
    expect(src).toContain('email_is_billing');

    // The mailbox rung must skip agent-owned addresses: handing a supplier a robot's drop box as
    // "our email" routes their invoice to an automation instead of to a person.
    expect(src).toMatch(/is\(\s*['"]agent_ref['"]\s*,\s*null\s*\)/);

    // Ladder ORDER is the whole contract — `business_email` is an operator's explicit choice and
    // must be consulted before anything inferred.
    const src2 = src.slice(src.indexOf('export async function resolveBusinessIdentity'));
    expect(src2.indexOf('workspace_customer_contact'))
      .toBeLessThan(src2.indexOf('workspace_email_config'));
    expect(src2.indexOf('workspace_email_config'))
      .toBeLessThan(src2.indexOf('user_email_addresses'));
  });

  it('records which rung answered, and warns when it is the account login address', () => {
    const src = read(IDENTITY);

    // The last rung is a CREDENTIAL standing in for a business address. It is included because
    // "I don't have an email" while the platform knows one measured worse — but "we are quoting
    // somebody's personal address at suppliers" must never be a thing nobody noticed.
    expect(src).toContain('emailSource');
    expect(src).toContain("'owner_account'");
    expect(src).toMatch(/console\.warn\([^)]*business-identity/);

    // The account address is genuinely last: every rung above it is under the operator's control.
    const body = src.slice(src.indexOf('export async function resolveBusinessIdentity'));
    expect(body.indexOf('user_email_addresses')).toBeLessThan(body.indexOf('workspace_members'));
  });

  it('omits an unknown field instead of emitting a placeholder for it', () => {
    const src = read(IDENTITY);
    const fmt = src.slice(src.indexOf('export function formatBusinessIdentityForPrompt'));

    // `Email: unknown` in a system prompt is an invitation to invent one. An absent line leaves
    // the persona's escalation rule ("a team member will follow up") as the only answer available,
    // which is correct — and was the one right part of the original reply.
    expect(fmt).not.toMatch(/unknown|not set|n\/a|none/i);
    for (const field of ['id.email', 'id.phone', 'id.website', 'id.hours', 'id.address', 'id.vatNumber']) {
      expect(fmt).toContain(`if (${field})`);
    }

    // The block has to say these are OURS to share. Told only that account data is confidential,
    // a support persona generalises the rule to its own company's phone number.
    expect(fmt).toMatch(/OUR BUSINESS/);
    expect(fmt).toMatch(/OUR OWN details/);
  });

  it('is wired into both surfaces that speak as the business', () => {
    for (const path of [INBOX, AGENT_CHAT]) {
      const src = read(path);
      expect(src, `${path} must resolve the business identity`).toContain('resolveBusinessIdentity');
      expect(src, `${path} must inject it into the system prompt`)
        .toContain('formatBusinessIdentityForPrompt');
    }
  });

  it('withholds the identity block on a PUBLIC thread', () => {
    // The guard moved with the logic: the Inbox no longer builds its own prompt, so the decision
    // now lives where the prompt is assembled — agent-chat, keyed on the thread's own channel and
    // social_kind rather than on anything a caller passed.
    //
    // It matters because the block ends with "share any of the above when asked" while the
    // public-thread guardrail says never post a phone number or an email under our own post.
    // Handing the model both and hoping it picks the second is a coin flip, not a rule — the same
    // reason the account tools are withheld outright there rather than refused in prose.
    const src = code(AGENT_CHAT);
    expect(src).toMatch(/if \(workspaceId && !\(forCustomer && customerPublicThread\)\)/);
    expect(src).toMatch(/customerPublicThread = t\.channel === 'social'/);
  });
});

describe('the transcript names its speakers and its attachments', () => {
  it('separates the customer from our own team', () => {
    const src = code(INBOX);

    // A member's reply is `message_type='text'`, identical to the customer's — so message_type
    // alone cannot label a speaker, and the single label `Customer/Team` merged them.
    expect(src).not.toContain('Customer/Team');
    const fn = between(src, 'async function buildTranscript', 'async function buildAgentDraft');
    expect(fn).toContain('participant_type');
    expect(fn).toContain("'Customer'");
    expect(fn).toContain("'Our team'");
  });

  it('names an attachment even when the message also carried text', () => {
    const src = code(INBOX);
    const fn = between(src, 'async function buildTranscript', 'async function buildAgentDraft');

    // The bug was `m.body || '[attachment]'` — an OR, so the attachment vanished the moment there
    // was a covering sentence. Naming the file does not let the model read it; it lets the model
    // say what arrived instead of reading as though nothing had.
    //
    // Scoped to the transcript builder, NOT the whole file: `insertMessageAndNotify` uses the same
    // `body || '[attachment]'` shape for a NOTIFICATION preview, where it is correct — a push
    // notification saying "[attachment]" is fine, a model prompt hiding one is not.
    expect(fn).not.toMatch(/\|\| '\[attachment\]'/);
    expect(fn).toContain('attachments');
    expect(fn).toMatch(/name \|\| a\.filename/);
  });

  it('rewrites a provider placeholder so the model does not quote it as the customer', () => {
    const src = read(INBOX);

    // Zernio delivers a WhatsApp document we never downloaded as the literal body
    // `[Unsupported message]`. Left alone the model treats that phrase as the customer's words:
    // in the thread that prompted this it apologised for "the format", was told "This is the
    // invoice you asked", and apologised again — three turns arguing with a placeholder.
    expect(src).toContain('PROVIDER_PLACEHOLDER_BODIES');
    expect(src).toContain('[unsupported message]');
    const fn = between(src, 'async function buildTranscript', 'async function buildAgentDraft');
    expect(fn).toMatch(/NOT their/);
  });
});
