import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const read = (p: string) => stripComments(readFileSync(join(process.cwd(), p), 'utf8'));
const API = read('supabase/functions/inbox-api/index.ts');
const send = API.slice(API.indexOf("case 'send_whatsapp_template'"), API.indexOf("case 'compose_email'"));

describe('the Inbox can send an approved WhatsApp template', () => {
  it('is a member action on a WhatsApp thread, with an approved template of that workspace', () => {
    expect(send).toContain('access.isMember');
    expect(send).toContain('resolveSendableTemplate(db, workspaceId,');
    expect(send).toContain("isWorkspaceEntitled(db, workspaceId, 'messaging')");
  });

  it('checks the opt-out list, then debits, then sends, and refunds a failed send', () => {
    const optOut = send.indexOf('whyNotSendable(');
    const debit = send.indexOf('debitExternalServiceCredits(');
    const provider = send.indexOf('sendWhatsAppMessage(');
    expect(optOut).toBeGreaterThan(-1);
    expect(optOut).toBeLessThan(debit);
    expect(debit).toBeLessThan(provider);
    expect(send.slice(provider)).toContain('refundWhatsAppCredits(');
  });

  it('refuses an unfilled variable instead of sending a blank', () => {
    expect(send).toMatch(/Fill in "\$\{name\}" before sending/);
  });

  it('stores the provider id so the webhook echo matches this row', () => {
    expect(send).toMatch(/wamid: sent\.messageId/);
  });
});

describe('template sending has one implementation', () => {
  it('messaging-api, messaging-processor and inbox-api import it rather than keep a copy', () => {
    for (const fn of ['messaging-api', 'messaging-processor', 'inbox-api']) {
      const src = read(`supabase/functions/${fn}/index.ts`);
      expect(src, fn).toContain("from '../_shared/whatsapp-templates.ts'");
      expect(src, fn).not.toMatch(/function (renderTemplate|orderedTemplateParams|whyNotSendable|resolveSendableTemplate)\(/);
    }
  });
});
