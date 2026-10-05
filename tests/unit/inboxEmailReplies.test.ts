import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import { emailReplyRecipients, splitAddresses } from '@/pages/Inbox/emailRecipients';

const API = stripComments(readFileSync(join(process.cwd(), 'supabase/functions/inbox-api/index.ts'), 'utf8'));
const emailBranch = (() => {
  const start = API.indexOf("thread.channel === 'email' && (messageType === 'text' || messageType === 'agent')");
  expect(start, 'the email relay branch moved — re-anchor this slice').toBeGreaterThan(-1);
  return API.slice(start, API.indexOf("delivery_status: sendErr ? 'relay_failed' : 'sent'", start));
})();

describe('an email reply carries what the member attached', () => {
  it('relays an attachment-only reply instead of skipping it', () => {
    expect(emailBranch).toMatch(/attachments\.length > 0/);
  });

  it('sends the stored files to email-api', () => {
    expect(emailBranch).toContain('emailAttachmentsFor(db, attachments)');
    expect(emailBranch).toMatch(/attachments: emailAttachments/);
  });

  it('refuses rather than send a reply short of a file', () => {
    const helper = API.slice(API.indexOf('async function emailAttachmentsFor'), API.indexOf('async function insertMessageAndNotify'));
    expect(helper).toContain('could not be read to attach');
    expect(helper).toContain('EMAIL_ATTACHMENT_LIMIT_BYTES');
  });
});

describe('an email reply can copy people in', () => {
  it('sends the cleaned CC/BCC lists to email-api and records them', () => {
    expect(emailBranch).toContain('cleanEmailCopies(opts.emailCopies, [toAddress, ourMailbox])');
    expect(emailBranch).toMatch(/cc: copies\.cc/);
    expect(emailBranch).toMatch(/bcc: copies\.bcc/);
  });

  it('refuses a malformed address before the message is stored', () => {
    const handler = API.slice(API.indexOf("case 'send_message'"), API.indexOf('insertMessageAndNotify(db, {', API.indexOf("case 'send_message'")));
    expect(handler).toContain('cleanEmailCopies({ cc: payload.email_cc, bcc: payload.email_bcc }, [])');
  });

  it('answers the Reply-To the customer asked for, not only the From', () => {
    expect(emailBranch).toMatch(/inboundMeta\.email_reply_to/);
  });
});

describe('emailReplyRecipients', () => {
  const thread = { email_to: 'basil@mail.materialshub.gr', email_from: 'old@keros.com' };
  const inbound = (metadata: Record<string, unknown>) => ({ metadata: { direction: 'incoming', ...metadata } });

  it('replies to Reply-To, and reply-all adds everyone else on the last email except us', () => {
    const r = emailReplyRecipients([
      inbound({ email_from: 'maria@keros.com', email_reply_to: ['orders@keros.com'],
        email_to_all: ['basil@mail.materialshub.gr', 'Nikos@Keros.com'], email_cc: ['basil+t.123@mail.materialshub.gr', 'acc@keros.com'] }),
      { metadata: { direction: 'outgoing' } },
    ], thread);
    expect(r.to).toBe('orders@keros.com');
    expect(r.replyAllCc).toEqual(['nikos@keros.com', 'acc@keros.com']);
  });

  it('falls back to the sender, then the thread', () => {
    expect(emailReplyRecipients([inbound({ email_from: 'maria@keros.com' })], thread).to).toBe('maria@keros.com');
    expect(emailReplyRecipients([], thread).to).toBe('old@keros.com');
  });

  it('splits what the member typed', () => {
    expect(splitAddresses(' a@x.gr, b@y.com;c@z.it  ')).toEqual(['a@x.gr', 'b@y.com', 'c@z.it']);
  });
});

describe('a member can start an email conversation from the Inbox', () => {
  const compose = API.slice(API.indexOf("case 'compose_email'"), API.indexOf("case 'create_share_link'"));

  it('is a business member sending from their own active mailbox', () => {
    expect(compose).toContain('BUSINESS_ROLES.has(callerRole)');
    expect(compose).toMatch(/\.from\('user_email_addresses'\)[\s\S]*\.eq\('user_id', userId\)/);
    expect(compose).toContain('!box.is_active');
  });

  it('validates every address before anything is stored', () => {
    const firstInsert = compose.indexOf(".from('inbox_threads').insert");
    expect(compose.indexOf('EMAIL_ADDRESS.test(to)')).toBeLessThan(firstInsert);
    expect(compose.indexOf('cleanEmailCopies(')).toBeLessThan(firstInsert);
  });

  it('keeps a thread whose send failed, and says so instead of a bare 502', () => {
    expect(compose).toMatch(/delivery_error: e\.message/);
  });

  it('does not prefix a first email with Re:', () => {
    expect(emailBranch).toMatch(/!lastInbound \|\| \/\^re:\/i\.test\(subjectBase\)/);
  });
});
