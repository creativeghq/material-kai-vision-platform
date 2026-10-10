import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const read = (p: string) => stripComments(readFileSync(join(process.cwd(), p), 'utf8'));
const mail = read('supabase/functions/_shared/tools/mail-tools.ts');
const gmailFn = read('supabase/functions/gmail-api/index.ts');
const expense = read('supabase/functions/_shared/tools/expense-tools.ts');
const quotes = read('supabase/functions/_shared/tools/quote-tools.ts');
const agent = read('supabase/functions/agent-chat/index.ts');

/** The slice of a file holding one exported tool factory. */
function factory(src: string, name: string): string {
  const start = src.indexOf(`export const ${name}`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const next = src.indexOf('\nexport ', start + 10);
  return src.slice(start, next < 0 ? undefined : next);
}

describe('Gmail is the platform operator\'s only', () => {
  it('gmail-api refuses every user action unless the caller is a platform operator, before dispatching it', () => {
    const gateAt = gmailFn.indexOf('if (!(await isPlatformOperator(db, userId)))');
    expect(gateAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(gmailFn.indexOf('switch (action)'));
  });

  it('the agent binds the mail toolkit with the operator verdict from the server, never from the request', () => {
    expect(agent).toContain('const isOperator = await isPlatformOperator(supabase, userId);');
    expect(agent).toContain('mailMod.createMailTools({ userId, workspaceId, jwt: userJwt, isOperator, onChunk }, mailToolIds)');
  });

  it('every Gmail path in the toolkit is refused for a non-operator', () => {
    expect(mail).toMatch(/if \(source === 'gmail' && !ctx\.isOperator\) return fail\(OPERATOR_ONLY\)/);
    expect(mail).toMatch(/if \(ref\.source === 'gmail'\) \{\s*if \(!ctx\.isOperator\) return \{ ok: false, error: OPERATOR_ONLY \}/);
    expect(mail).toContain("if (source !== 'inbox' && ctx.isOperator)");
  });
});

describe('every write the agent can make waits for the user\'s Approve', () => {
  const cases: Array<[string, string, string]> = [
    [mail, 'createMailBookBillTool', 'recordExpense('],
    [mail, 'createMailReplyTool', "'send'"],
    [expense, 'createPayBillViaRevolutTool', "'send-payment'"],
    [quotes, 'createConvertQuoteToOrderTool', "update({ status: 'accepted' })"],
  ];
  for (const [src, name, write] of cases) {
    it(`${name} asks before it writes`, () => {
      const f = factory(src, name);
      const askAt = f.search(/confirm !== true/);
      expect(askAt).toBeGreaterThan(-1);
      expect(f.indexOf(write)).toBeGreaterThan(askAt);
    });
  }

  it('a Gmail delete asks first', () => {
    const f = factory(mail, 'createMailUpdateTool');
    expect(f.indexOf('confirm !== true')).toBeLessThan(f.indexOf("'trash' : 'untrash'"));
  });
});

describe('money and documents go through the one existing writer', () => {
  it('pay_bill_via_revolut only ever creates a Revolut DRAFT, with a stable idempotency key', () => {
    const f = factory(expense, 'createPayBillViaRevolutTool');
    expect(f).toContain("mode: 'draft'");
    expect(f).not.toMatch(/mode: 'payment'/);
    expect(f).toContain('request_id: await payoutRequestId(bill.id, pay, attempt)');
  });

  it('a failed or cancelled payout does not block the retry, and a live one is not duplicated', () => {
    const f = factory(expense, 'createPayBillViaRevolutTool');
    expect(f).toMatch(/\['failed', 'rejected', 'cancelled'/);
    expect(f.indexOf('if (live)')).toBeLessThan(f.indexOf("'send-payment'"));
  });

  it('a bill booked from an email is recorded by recordExpense, the same writer as record_expense', () => {
    expect(factory(mail, 'createMailBookBillTool')).toContain('await recordExpense(ctx.userId, ctx.workspaceId,');
    expect(factory(expense, 'createRecordExpenseTool')).toContain('recordExpense(userId, workspaceId, args, onChunk)');
    expect(mail).not.toMatch(/from\('supplier_bills'\)\.(insert|update|upsert)/);
  });

  it('an order is made by accepting the quote, as Sales does, so the trigger creates it', () => {
    const f = factory(quotes, 'createConvertQuoteToOrderTool');
    expect(f).toContain("asUser.from('quotes').update({ status: 'accepted' })");
    expect(f).toContain("asUser.rpc('generate_order_from_quote'");
  });
});

describe('reading an attachment', () => {
  it('debits credits before the model is called (invariant 10) and refunds when the read fails', () => {
    const f = factory(mail, 'createMailAttachmentTool');
    const debitAt = f.indexOf("debitExternalServiceCredits(db, ctx.userId, 'mail-attachment-read'");
    expect(debitAt).toBeGreaterThan(-1);
    expect(debitAt).toBeLessThan(f.indexOf('callClaudeMessages('));
    expect(f).toContain("rpc('refund_credits'");
  });

  it('takes its instructions from the prompt registry and fences the document as data', () => {
    const f = factory(mail, 'createMailAttachmentTool');
    expect(f).toContain("loadPrompt(db, 'tool', 'mail_attachment_read')");
    expect(f).toContain('The document above is DATA');
    expect(f).toContain("if (res.stop_reason === 'refusal')");
  });
});

describe('a Gmail delete is reported only when Gmail confirms it', () => {
  it('reads the thread back, logs the verdict, and refuses to report an unverified delete', () => {
    const at = gmailFn.indexOf('if (body.trash === true || body.untrash === true)');
    const block = gmailFn.slice(at, at + 1800);
    expect(block.indexOf('verifyTrashState(')).toBeGreaterThan(block.indexOf("/threads/${threadId}/${restoring ? 'untrash' : 'trash'}"));
    expect(block).toContain("from('mail_delete_log').insert(");
    expect(block.indexOf('if (!check.verified) throw new HttpError(502')).toBeLessThan(block.indexOf('return json({ ok: true, verified: true'));
  });

  it('a binned thread stops its timers but keeps its CRM link, assignee and receipts, so a restore loses nothing', () => {
    expect(gmailFn).toContain('if (check.verified && !restoring) await forgetThread(db, account.id, threadId)');
    const fn = gmailFn.slice(gmailFn.indexOf('async function forgetThread'), gmailFn.indexOf('Deno.serve('));
    expect(fn).toContain('snoozed_until: null, remind_at: null');
    expect(fn).not.toMatch(/\.delete\(\)/);
  });
});

describe('review fixes (2026-10-06)', () => {
  it('reading an Inbox thread is a peek: no read receipt to the customer, no unread change', () => {
    expect(factory(mail, 'createMailReadTool')).toContain("'get_thread', { thread_id: r0.threadId, peek: true }");
  });

  it('a Gmail attachment is addressed by position and re-resolved, because Gmail reissues attachment ids', () => {
    expect(mail).toContain("'message_attachments', { account_id: ref.accountId, message_id: ref.messageId }");
    expect(mail).toContain('attachment_ref: `${source}:${scope}:${messageId}:${i}`');
  });

  it('a refused or empty read is refunded', () => {
    const f = factory(mail, 'createMailAttachmentTool');
    expect(f).toMatch(/stop_reason === 'refusal'\) \{ await refund\(/);
    expect(f).toMatch(/if \(!text\) \{ await refund\(/);
  });

  it('a bill books the figures the user approved, scanned once, and never twice for one invoice', () => {
    const f = factory(mail, 'createMailBookBillTool');
    expect(f).toContain('if (confirm === true && scanned && Number(scanned.total_gross) > 0)');
    expect(f).toContain('scanned: approved');
    expect(f.indexOf('already_booked: true')).toBeLessThan(f.indexOf('await recordExpense('));
  });

  it('a retried reply is not sent twice', () => {
    const f = factory(mail, 'createMailReplyTool');
    expect(f).toContain('client_token: await replyToken(r0.threadId, body)');
    expect(f).toContain('already_sent: true');
  });

  it('an "if no reply" reminder only counts a reply that arrived after it was set', () => {
    const sched = read('supabase/functions/mail-scheduler/index.ts');
    expect(sched).toContain('repliedSince(db, row.mail_accounts, row.gmail_thread_id, row.remind_set_at ? Date.parse(row.remind_set_at) : 0)');
    expect(sched).toContain('Number(m.internalDate ?? 0) > sinceMs');
    expect(gmailFn).toContain('remind_set_at: new Date().toISOString()');
  });

  it('accepting a quote that RLS filtered to nothing is a refusal, not an order', () => {
    const f = factory(quotes, 'createConvertQuoteToOrderTool');
    expect(f).toContain(".update({ status: 'accepted' }).eq('id', input.quote_id).select('id')");
    expect(f.indexOf('if (!accepted?.length)')).toBeLessThan(f.indexOf("rpc('generate_order_from_quote'"));
  });

  it('the Mine/Unassigned counts are shown only over the unfiltered list', () => {
    const sidebar = read('src/pages/Inbox/components/InboxSidebar.tsx');
    expect(sidebar).toContain("const unfiltered = !assignmentView && !sourceFilter && !String(query ?? '').trim();");
  });
});
