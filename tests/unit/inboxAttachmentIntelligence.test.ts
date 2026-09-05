/**
 * Guard: a voice note is HEARD and a document is READ, on the way in, honestly.
 *
 * The defect this pins: 96 inbox messages carried attachments (77 documents or photos, one voice
 * note) and nothing read any of them. The assistant was told the customer "sent something with
 * no text" for a voice note and "CANNOT open" an emailed invoice; the invoice reached Expenses
 * only by a person re-keying it.
 *
 * The properties that make the fix a fix, each of which can rot silently:
 *
 *   1. BOTH inbound writers call the reader, and the WhatsApp one calls it BEFORE the agent
 *      hand-off — otherwise the assistant reads a thread with no transcript in it.
 *   2. The verdict is a FORCED tool call (invariant 9) and the prompts come from the database
 *      (no fallback string) — a free-form JSON classifier with a salvage parser is the shape
 *      the platform's rules exist to keep out.
 *   3. Credits are reserved BEFORE the upstream call (invariant 10), for both readers.
 *   4. Every outcome is a STATUS on the row — ok, failed, skipped — never a silent skip, and an
 *      out-of-enum kind is a failure to record, never coerced into a valid-looking value.
 *   5. The enum the tool offers IS the mirrored vocabulary, so the tag cannot show a kind the
 *      classifier cannot return.
 *   6. What the assistant is told comes from the same derivation that wrote the row.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import {
  INBOX_DOCUMENT_KINDS,
  INBOX_DOCUMENT_KIND_LABELS,
  INBOX_DOCUMENT_KINDS_BOOKABLE_AS_EXPENSE,
} from '../../src/modules/messaging/inboxDocumentKinds';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => stripComments(readFileSync(join(ROOT, rel), 'utf8'));

const MODULE = read('supabase/functions/_shared/inbox-attachment-intelligence.ts');
const ZERNIO = read('supabase/functions/zernio-webhook-handler/index.ts');
const EMAIL = read('supabase/functions/_shared/inbound-email.ts');
const INBOX_API = read('supabase/functions/inbox-api/index.ts');
const AI_CLIENT = read('supabase/functions/_shared/ai-client.ts');

describe('inbox attachment intelligence — both inbound paths read what arrived', () => {
  it('the WhatsApp webhook enriches the message AFTER it is filed and BEFORE the agent hand-off', () => {
    const insert = ZERNIO.indexOf("from('inbox_messages').insert({");
    const enrich = ZERNIO.indexOf('enrichInboundAttachments(supabase');
    const handoff = ZERNIO.indexOf("action: 'internal_agent_reply'");
    expect(insert).toBeGreaterThan(-1);
    expect(enrich).toBeGreaterThan(insert);
    expect(handoff).toBeGreaterThan(enrich);
  });

  it('the WhatsApp insert returns the new id, or the reader has nothing to patch', () => {
    // The insert used to be fire-and-check; the reader needs the row id back.
    expect(ZERNIO).toMatch(/inbox_messages'\)\.insert\(\{[\s\S]*?\}\)\.select\('id'\)\.single\(\)/);
  });

  it('a transcribed voice note becomes the notification body and the thread preview, not "[attachment]"', () => {
    expect(ZERNIO).toContain('body: spokenPreview ?? preview');
    expect(ZERNIO).toContain("update({ last_message_preview: spokenPreview })");
  });

  it('the email path enriches after its insert too, and does not lose the email on a failure', () => {
    const insert = EMAIL.indexOf("from('inbox_messages').insert({");
    const enrich = EMAIL.indexOf('enrichInboundAttachments(db');
    expect(insert).toBeGreaterThan(-1);
    expect(enrich).toBeGreaterThan(insert);
    // Best-effort: wrapped, so a reader fault cannot throw the email away after it was filed.
    const around = EMAIL.slice(enrich - 120, enrich);
    expect(around).toContain('try {');
  });
});

describe('inbox attachment intelligence — the verdict is forced, sourced and paid for', () => {
  it('classifies through a FORCED tool call, never free-form JSON', () => {
    expect(MODULE).toContain("tool_choice: { type: 'tool', name: CLASSIFY_TOOL.name }");
    expect(MODULE).not.toMatch(/JSON\.parse\(/);
  });

  it('loads BOTH prompts from the database and carries no fallback string', () => {
    expect(MODULE).toContain('getToolPrompt(db, TRANSCRIPTION_TASK)');
    expect(MODULE).toContain('getToolPrompt(db, CLASSIFICATION_TASK)');
    // A prompt written into this file would be the "invisible fallback" the prompt rule bans.
    expect(MODULE).not.toMatch(/const [A-Z_]*PROMPT\s*=\s*['"`]/);
  });

  it('reserves credits BEFORE each upstream call and settles against real usage', () => {
    const transcribeReserve = MODULE.indexOf('reserveCredits(db, ctx.userId, ctx.workspaceId, TRANSCRIPTION_CEILING');
    const transcribeCall = MODULE.indexOf('transcribeAudioWithGemini(bytes');
    const classifyReserve = MODULE.indexOf('reserveCredits(db, ctx.userId, ctx.workspaceId, CLASSIFICATION_CEILING');
    const classifyCall = MODULE.indexOf('callClaudeMessages({');
    expect(transcribeReserve).toBeGreaterThan(-1);
    expect(transcribeCall).toBeGreaterThan(transcribeReserve);
    expect(classifyReserve).toBeGreaterThan(-1);
    expect(classifyCall).toBeGreaterThan(classifyReserve);
    expect(MODULE).toContain('settleCredits(');
    // An unpriced model releases the reservation rather than charging a guess.
    expect(MODULE).toContain("reason: 'unpriced_model'");
  });

  it('records every outcome as a status, and refuses to coerce a bad verdict', () => {
    for (const status of ["status: 'ok'", "status: 'failed'", "status: 'skipped'"]) {
      expect(MODULE).toContain(status);
    }
    // Out-of-enum kind → failed with the kind in the error, never rounded to `other`.
    expect(MODULE).toContain('the model returned an unknown kind');
    // A confidence or a reason missing is not a verdict.
    expect(MODULE).toContain('without a confidence or a reason');
  });

  it("the tool's enum IS the mirrored vocabulary", () => {
    expect(MODULE).toContain("from './inboxDocumentKinds.generated.ts'");
    expect(MODULE).toContain('enum: [...INBOX_DOCUMENT_KINDS]');
    const generated = readFileSync(join(ROOT, 'supabase/functions/_shared/inboxDocumentKinds.generated.ts'), 'utf8');
    for (const kind of INBOX_DOCUMENT_KINDS) expect(generated).toContain(`'${kind}'`);
  });

  it('the audio call goes through the shared AI client, so the cost lands in ai_usage_logs', () => {
    expect(AI_CLIENT).toContain('export async function transcribeAudioWithGemini(');
    expect(AI_CLIENT).toMatch(/transcribeAudioWithGemini[\s\S]*?_logTrackedCall\(\{/);
    expect(MODULE).not.toContain('generativelanguage.googleapis.com');
    expect(MODULE).not.toContain('api.anthropic.com');
  });
});

describe('inbox attachment intelligence — the assistant is told what the row holds', () => {
  it('inbox-api builds the attachment line from the same module that wrote the verdict', () => {
    expect(INBOX_API).toContain("import { describeAttachmentForAssistant, enrichInboundAttachments } from '../_shared/inbox-attachment-intelligence.ts'");
    expect(INBOX_API).toContain('describeAttachmentForAssistant(a as Record<string, unknown>)');
    // The old hard-coded line is gone from inbox-api; the honest wording lives in the module.
    expect(INBOX_API).not.toContain("return ` [attached, and you CANNOT open it: ${names.join(', ')}]`");
    expect(MODULE).toContain('[attached, and you CANNOT open it:');
  });

  it('a transcribed voice note is quoted as their words; an unread one says it cannot be heard', () => {
    expect(MODULE).toContain('these ARE their words');
    expect(MODULE).toContain('[voice note you cannot hear');
  });

  it('the on-demand action is member-only and bills the member who asked', () => {
    const at = INBOX_API.indexOf("case 'enrich_attachments':");
    expect(at).toBeGreaterThan(-1);
    const body = INBOX_API.slice(at, at + 2500);
    expect(body).toContain('assertThreadVisible(access)');
    expect(body).toContain('if (!access.isMember)');
    expect(body).toContain('billedUserId: userId');
    // 404 on a message outside the thread — never a distinct status that confirms it exists.
    expect(body).toContain("throw new HttpError(404, 'Message not found')");
  });
});

describe('inbox document kinds — the vocabulary is complete on the client side', () => {
  it('every kind has a label, and every bookable kind is a kind', () => {
    for (const kind of INBOX_DOCUMENT_KINDS) expect(INBOX_DOCUMENT_KIND_LABELS[kind]).toBeTruthy();
    for (const kind of INBOX_DOCUMENT_KINDS_BOOKABLE_AS_EXPENSE) expect(INBOX_DOCUMENT_KINDS).toContain(kind);
  });

  it('only a cost is bookable as an expense — a quote or a price list is information', () => {
    expect(INBOX_DOCUMENT_KINDS_BOOKABLE_AS_EXPENSE).not.toContain('quote');
    expect(INBOX_DOCUMENT_KINDS_BOOKABLE_AS_EXPENSE).not.toContain('price_list');
    expect(INBOX_DOCUMENT_KINDS_BOOKABLE_AS_EXPENSE).toContain('invoice');
  });

  it('the inbox page links a bookable document to the expense form with the amount left EMPTY', () => {
    const page = read('src/pages/Inbox/InboxPage.tsx');
    expect(page).toContain('INBOX_DOCUMENT_KINDS_BOOKABLE_AS_EXPENSE.includes(d.kind)');
    // The document's total is gross and the form's amount is net; passing it would book the VAT
    // into the cost. The prefill names it in the description instead.
    const prefill = page.slice(page.indexOf('prefill={{ description'), page.indexOf('prefill={{ description') + 200);
    expect(prefill).not.toContain('amount:');
    expect(page).toContain('gross, VAT not split');
  });
});
