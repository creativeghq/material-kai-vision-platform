/** The assistant knows who it is speaking FOR, and can tell its speakers apart. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

/** The same file with its prose removed. */
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
    // The naming moved into the module that WRITES the verdicts on an attachment
    // (`_shared/inbox-attachment-intelligence.ts`), so a transcribed voice note is quoted and a
    // classified document is named for what it is — one derivation for the row and the prompt.
    // The honest wording for an unread file still exists, there.
    expect(fn).toContain('describeAttachmentForAssistant(');
    const shared = read('supabase/functions/_shared/inbox-attachment-intelligence.ts');
    expect(shared).toContain('[attached, and you CANNOT open it:');
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
