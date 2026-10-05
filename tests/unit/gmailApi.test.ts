import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const src = stripComments(readFileSync(join(process.cwd(), 'supabase/functions/gmail-api/index.ts'), 'utf8'));
const client = stripComments(readFileSync(join(process.cwd(), 'supabase/functions/_shared/gmail-client.ts'), 'utf8'));
const cases = src.split(/\n\s+case '/).slice(1);
const action = (name: string) => cases.find((c) => c.startsWith(`${name}'`)) ?? '';

describe('gmail-api — a mailbox is its owner\'s alone', () => {
  it('every action on an account loads it through the ownership check', () => {
    for (const name of ['disconnect', 'labels', 'threads', 'thread', 'attachment', 'modify', 'send', 'schedule', 'snoozed', 'thread_meta', 'link_contact', 'create_contact', 'snooze', 'assign', 'members', 'share']) {
      expect(action(name), name).toContain('await accountFor(db, userId,');
    }
    const owner = src.slice(src.indexOf('async function accountFor'), src.indexOf('async function accessTokenFor'));
    expect(owner).toContain('if (data.user_id === userId) return data as Account;');
    expect(owner).toContain("throw new HttpError(404, 'Mailbox not found')");
  });

  it('keeps the refresh token in Vault, never in a column', () => {
    expect(src).toContain("rpc('mail_account_store_refresh_token'");
    expect(src).toContain("rpc('mail_account_refresh_token'");
    expect(src).not.toMatch(/refresh_token:\s*tok\.refresh_token/);
  });

  it('trusts the callback only with a signed, fresh state, and needs gmail.modify', () => {
    const cb = src.slice(src.indexOf("req.method === 'GET'"), src.indexOf("req.method !== 'POST'"));
    expect(cb.indexOf('verifyOAuthState(')).toBeLessThan(cb.indexOf('exchangeGoogleCode('));
    expect(cb).toContain("return back('invalid_state')");
    expect(cb).toContain("return back('scope_missing')");
  });

  it('marks a revoked grant for reconnection instead of failing silently', () => {
    expect(client).toContain("status: 'needs_reauth'");
  });

  it('sends through Gmail and never trusts a reply target from another thread', () => {
    expect(action('send')).toContain('sendPreparedGmail(db, account, prepareGmailSend(body))');
    expect(client).toContain("'/messages/send'");
    expect(client).toContain('orig.threadId !== p.thread_id');
    expect(client).toContain('renderEmailMarkup(p.text, escapeHtml)');
  });
});

describe('the Gmail view shows received mail only through the sanitising frame', () => {
  const view = stripComments(readFileSync(join(process.cwd(), 'src/pages/Inbox/gmail/GmailThreadView.tsx'), 'utf8'));
  const inbox = stripComments(readFileSync(join(process.cwd(), 'src/pages/Inbox/gmail/GmailInbox.tsx'), 'utf8'));
  it('renders m.html with EmailHtmlView and never injects it', () => {
    expect(view).toMatch(/<EmailHtmlView html=\{m\.html\}/);
    expect(view + inbox).not.toContain('dangerouslySetInnerHTML');
  });
});

describe('a shared mailbox is opened deliberately, and only its owner changes who has it', () => {
  it('settings and disconnect are owner-only; a member is let in only when the box is shared', () => {
    for (const name of ['disconnect', 'members', 'share']) {
      expect(action(name), name).toMatch(/accountFor\(db, userId, String\(body\.account_id \?\? ''\), true\)/);
    }
    const owner = src.slice(src.indexOf('async function accountFor'), src.indexOf('const GMAIL_ID'));
    expect(owner).toContain('!ownerOnly && data.is_shared');
  });

  it('shares only with active members of the mailbox workspace', () => {
    expect(action('share')).toContain("m.status === 'active'");
  });

  it('a CRM contact is reused by email before one is created', () => {
    const create = action('create_contact');
    expect(create.indexOf(".ilike('email'")).toBeLessThan(create.indexOf(".insert({"));
  });
});

describe('mail-scheduler claims before it acts', () => {
  const sched = stripComments(readFileSync(join(process.cwd(), 'supabase/functions/mail-scheduler/index.ts'), 'utf8'));
  it('moves a send pending → sending before sending it', () => {
    const deliver = sched.slice(sched.indexOf('async function deliverScheduled'), sched.indexOf('async function failStalled'));
    expect(deliver.indexOf(".update({ status: 'sending'")).toBeLessThan(deliver.indexOf('sendPreparedGmail('));
    expect(deliver).toContain(".eq('status', 'pending')");
  });

  it('clears a snooze only where it still holds the value read', () => {
    expect(sched).toContain(".eq('snoozed_until', row.snoozed_until)");
  });

  it('never resends a send that stalled; it says it may have gone', () => {
    const stall = sched.slice(sched.indexOf('async function failStalled'), sched.indexOf('Deno.serve'));
    expect(stall).toContain("status: 'failed'");
    expect(stall).not.toContain('sendPreparedGmail');
  });

  it('is gated to the cron', () => {
    expect(sched).toContain('if (!isCronAuthorized(req))');
  });
});

describe('Gmail rules run through Flows, and personal mail never reaches a workspace flow', () => {
  const sched = stripComments(readFileSync(join(process.cwd(), 'supabase/functions/mail-scheduler/index.ts'), 'utf8'));
  const engine = stripComments(readFileSync(join(process.cwd(), 'supabase/functions/flow-engine/index.ts'), 'utf8'));
  it('emits mail.received only for shared mailboxes, stamped with their workspace', () => {
    const sync = sched.slice(sched.indexOf('async function syncHistory'), sched.indexOf('async function stampSync'));
    expect(sync).toContain(".eq('is_shared', true)");
    expect(sync).toContain("emitFlowEvent('mail.received'");
    expect(sync).toContain('workspace_id: account.workspace_id');
  });

  it('the gmail_modify action refuses anything but an active shared mailbox of the flow workspace', () => {
    const handler = engine.slice(engine.indexOf("case 'gmail_modify'"), engine.indexOf("case 'create_task'"));
    expect(handler).toContain('a.workspace_id !== scope.workspaceId || !a.is_shared');
    expect(handler).toContain('scope.isGlobal');
  });

  it('the internal modify path is service-role only and also refuses a personal mailbox', () => {
    const internal = src.slice(src.indexOf('if (isServiceRoleRequest(req))'), src.indexOf('const auth = await authenticate'));
    expect(internal).toContain('!acct.is_shared');
  });
});

describe('JARVIS on a Gmail thread treats the mail as data', () => {
  const once = stripComments(readFileSync(join(process.cwd(), 'supabase/functions/_shared/agent-chat-once.ts'), 'utf8'));
  it('runs as the customer audience, so the text is fenced and the tools clamped', () => {
    expect(once).toContain("audience: 'customer'");
    expect(action('assist')).toContain('runAgentTurn(');
  });

  it('takes its instructions from the prompt registry, not from code', () => {
    expect(action('assist')).toContain("loadPrompt(db, 'tool', mode === 'summary' ? 'gmail_thread_summary' : 'gmail_reply_draft')");
  });

  it('is billed to the person asking, and says so when they cannot pay', () => {
    expect(action('assist')).toContain('workspaceId: account.workspace_id, userId');
    expect(action('assist')).toContain('turn.status === 402');
  });
});
