/**
 * Guard: a file the customer sent must arrive, and a message the customer never got must say so.
 *
 * Two independent silent-zeros found together on 2026-08-24, on the first connected WhatsApp
 * number. Both had the same shape — a number sitting at zero forever while every health signal
 * stayed green.
 *
 *  1. **36 inbound messages, 0 attachments stored.** The insert read `msg.attachments ?? []`,
 *     one guessed field name. Files were definitely arriving — the assistant's own replies in
 *     those threads say "Sorry, I can't open PDFs or attachments here" — and every one was
 *     discarded. Two of the messages had no text either, so they rendered as an empty bubble:
 *     the customer sent a document and the operator saw nothing at all. Zernio addresses
 *     attachments at `/inbox/conversations/{id}/messages/{messageId}/attachments/{index}`, so the
 *     inline shape was never something to assume in the first place.
 *
 *  2. **27 outbound messages, 27 accepted by Meta, 23 reported FAILED, 0 recording why.** The
 *     relay worked perfectly; Meta refused delivery and said why; `apply_inbox_delivery_receipt`
 *     had no parameter to carry the reason, and the UI showed no delivery state at all. So 85% of
 *     replies never reached the customer and the operator saw 27 ordinary sent bubbles. "We are
 *     not sending messages to WhatsApp" was the only conclusion available from the screen.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const hook = readFileSync(join(ROOT, 'supabase', 'functions', 'zernio-webhook-handler', 'index.ts'), 'utf8');
const messagingApi = readFileSync(join(ROOT, 'supabase', 'functions', 'messaging-api', 'index.ts'), 'utf8');
const inboxPage = readFileSync(join(ROOT, 'src', 'pages', 'Inbox', 'InboxPage.tsx'), 'utf8');

describe('inbound attachments are not guessed at by field name', () => {
  it('normalises through one function rather than reading a single key', () => {
    expect(hook).toMatch(/export function normalizeInboundAttachments/);
    // The `?? []` form is the bug verbatim: one key, and a miss is indistinguishable from the
    // customer having sent nothing.
    expect(
      /attachments:\s*msg\.attachments\s*\?\?\s*\[\]/.test(stripComments(hook)),
      'an insert reads msg.attachments directly again — media under any other key is discarded',
    ).toBe(false);
  });

  it('accepts the plural, singular and flattened spellings', () => {
    const fn = stripComments(hook).slice(stripComments(hook).indexOf('normalizeInboundAttachments'));
    // Array-valued and object-valued container keys, which it iterates by name.
    for (const key of ['attachments', 'media', 'files', 'documents', 'attachment', 'document', 'image', 'video']) {
      expect(fn.includes(`'${key}'`), `the normaliser no longer looks for "${key}"`).toBe(true);
    }
    // The fully flattened case — a url sitting directly on the message with no container at all.
    expect(fn, 'the flattened `msg.mediaUrl` case is gone').toMatch(/msg\.mediaUrl/);
    // The url/name/type aliases are the other half — an entry it finds but cannot address is
    // still a lost file.
    for (const alias of ['mediaUrl', 'fileUrl', 'filename', 'mimeType']) {
      expect(fn.includes(alias), `the "${alias}" alias is gone`).toBe(true);
    }
  });

  it('is used by BOTH inbound paths, WhatsApp and social', () => {
    // An Instagram DM is likelier to be a photo than a sentence, so the social path is the worst
    // one to leave on the old assumption.
    const calls = stripComments(hook).match(/normalizeInboundAttachments\(msg\)/g) ?? [];
    expect(calls.length, 'only one inbound path normalises its attachments').toBeGreaterThanOrEqual(2);
  });

  it('forwards media through the back-fill instead of pre-picking one key', () => {
    // The replay resolved `m.attachments` itself, BEFORE the handler's normaliser could look at
    // anything — so the handler correctly reported no attachment on a payload the replay had
    // already stripped. Whatever Zernio calls it has to survive the hop.
    expect(messagingApi).toMatch(/mediaPassthrough/);
    expect(
      /attachments:\s*m\.attachments\s*\?\?\s*\[\]/.test(stripComments(messagingApi)),
      'the back-fill picks a single media key again, ahead of the normaliser',
    ).toBe(false);
  });

  it('marks a message it could not read, rather than filing a blank one', () => {
    // WhatsApp does not send empty messages. No text and no recognised attachment means we
    // failed to read a file, and that must be recoverable from the row — with the payload's own
    // key names, so the shape we are missing is knowable from the next real message.
    expect(hook).toMatch(/attachment_unresolved: true/);
    expect(hook).toMatch(/provider_keys: Object\.keys\(msg\)/);
  });
});

describe('a message the customer never received says so', () => {
  it('carries Meta’s reason into the receipt', () => {
    // The reason was already being read for `messaging_logs` and dropped for the inbox — so a
    // CAMPAIGN send recorded why it failed and a CONVERSATION, where somebody is waiting for an
    // answer, did not.
    expect(hook).toMatch(/p_error_code:/);
    expect(hook).toMatch(/p_error_message:/);
  });

  it('renders delivery state on our own messages', () => {
    expect(inboxPage).toMatch(/const DeliveryState/);
    expect(inboxPage).toMatch(/Not delivered/);
    // Loud, and on the failure path specifically: a failed send that looks identical to a
    // successful one is the whole defect.
    expect(inboxPage).toMatch(/delivery_error_message/);
    expect(inboxPage).toMatch(/<DeliveryState meta=\{meta\} \/>/);
  });

  it('renders an attachment as the thing it is', () => {
    // Every attachment used to be one paperclip link, so reviewing a conversation meant opening
    // each file in a new tab to find out what it was.
    expect(inboxPage).toMatch(/const AttachmentView/);
    for (const kind of ['image', 'video', 'audio', 'pdf']) {
      expect(inboxPage.includes(`'${kind}'`), `AttachmentView no longer handles ${kind}`).toBe(true);
    }
    expect(inboxPage).toMatch(/<img/);
    expect(inboxPage).toMatch(/<video/);
    expect(inboxPage).toMatch(/<audio/);
  });
});
