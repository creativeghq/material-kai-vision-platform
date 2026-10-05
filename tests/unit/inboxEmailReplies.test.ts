import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

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
