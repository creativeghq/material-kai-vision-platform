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
const zernioClient = readFileSync(join(ROOT, 'supabase', 'functions', '_shared', 'zernio.ts'), 'utf8');
const inboxApiSrc = readFileSync(join(ROOT, 'supabase', 'functions', 'inbox-api', 'index.ts'), 'utf8');

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

  it('treats the channel placeholder as an absence, not as text', () => {
    // The first version of the unresolved check asked `!msg.text`. Zernio substitutes
    // `[Unsupported message]` for media it does not hand over — a TRUTHY string — so the
    // diagnostic written to catch exactly this sat silent through five of them, from the first
    // import at 04:20 to 08:27 the same day. A placeholder is the absence of the message wearing
    // text's clothes.
    expect(hook).toMatch(/export function isMediaPlaceholder/);
    expect(hook).toMatch(/'unsupported message'/);
    expect(
      /!msg\.text && inboundAttachments\.length === 0/.test(stripComments(hook)),
      'the unresolved check reads msg.text as truthy again — a placeholder body will pass as content',
    ).toBe(false);
    // Exact bracketed names only. A customer writing "[urgent]" is sending a message.
    expect(hook).toMatch(/startsWith\('\['\)/);
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

describe('the file is fetched, not waited for', () => {
  it('calls the endpoint that actually serves an attachment', () => {
    // Zernio addresses attachments at
    // /inbox/conversations/{id}/messages/{messageId}/attachments/{index}, separately from the
    // message. Reading the webhook payload alone was never going to produce a file, which is why
    // 36 inbound messages yielded zero. "WhatsApp does not give us attachments" was never true —
    // we had not asked.
    expect(zernioClient).toMatch(/export async function fetchZernioAttachment/);
    expect(zernioClient).toMatch(/\/attachments\//);
    expect(hook).toMatch(/fetchAndStoreInboundAttachments/);
  });

  it('stores the BYTES, never the vendor url', () => {
    // Storage convention #7: a link that expires is not an attachment. Both response shapes end
    // as bytes — the JSON one is followed here rather than persisted.
    expect(zernioClient).toMatch(/bytes: Uint8Array/);
    expect(hook).toMatch(/storage_object_path: path/);
    expect(hook).toMatch(/\.upload\(path, got\.bytes/);
  });

  it('repairs a message whose file was never retrieved, instead of skipping it', () => {
    // The dedupe guard would otherwise refuse every attempt to go back for the five
    // `[Unsupported message]` rows already in the inbox — they would stay unreadable forever.
    expect(hook).toMatch(/attachment_unresolved === true/);
    expect(hook).toMatch(/attachment_recovered: true/);
  });

  it('only reaches for a file when the message looks like it has one', () => {
    // One wasted round trip per plain text message would be a real cost on a busy number.
    // Inline media first (the shape real payloads use); the per-index endpoint only as a fallback.
    expect(hook).toMatch(/if \(inboundAttachments\.length\) \{/);
    expect(hook).toMatch(/\} else if \(!msg\.text \|\| isMediaPlaceholder\(msg\.text\)\) \{/);
  });
});

describe('one person, one contact, one thread', () => {
  it('resolves contact and thread atomically rather than check-then-insert', () => {
    // 2026-08-24: two messages ~90ms apart produced two CRM contacts (69ms apart) and two threads
    // (1.06s apart) for one person, because every resolve was a SELECT followed by an INSERT with
    // a gap. Both webhooks returned 200 and both threads looked normal.
    expect(hook).toMatch(/whatsapp_resolve_contact_and_thread/);
    expect(
      /matchOrCreateContact/.test(stripComments(hook)),
      'the old select-then-insert contact resolver is back — the duplicate race with it',
    ).toBe(false);
  });

  it('leaves the agent decision to the caller, which knows if this is an import', () => {
    // The resolver always creates a thread with the assistant OFF. That is the safe direction if
    // the arming block below it ever stops running.
    expect(hook).toMatch(/r\.thread_created && await shouldAutoEngageAgent/);
  });
});

describe('a coexistence number shows the WHOLE conversation', () => {
  it('files the operator’s own message instead of dropping it', () => {
    // Verified against the operator's phone on 2026-08-24: their 10:51 "Hello, Good Morning" and
    // their 11:21 "Can you do a small follow for me, with your sales manager?" existed on
    // WhatsApp and in no thread of ours. Every echo hit `return` on the direction guard, so the
    // Inbox showed the customer's half and called it the conversation.
    expect(hook).toMatch(/isOutgoingEcho/);
    expect(
      /if \(msg\.direction && msg\.direction !== 'incoming'\) \{\s*return/.test(stripComments(hook)),
      'outgoing echoes are dropped again — the inbox goes back to showing half the conversation',
    ).toBe(false);
  });

  it('identifies the conversation by the RECIPIENT on an echo', () => {
    // The sender on our own message is our own WABA number. Resolving on it would open a thread
    // with ourselves and mint a CRM contact for the company's own line.
    expect(hook).toMatch(/isOutgoingEcho\s*\?\s*\(contactPhoneOf\(msg\.recipient\)/);
  });

  it('never reads STOP out of our own words', () => {
    // Consent is the customer's to withdraw. An operator writing "STOP by the showroom tomorrow"
    // must not opt their own customer out of every future message.
    expect(hook).toMatch(/const text = isOutgoingEcho \? '' :/);
  });

  it('does not notify or wake the agent for our own message', () => {
    expect(hook).toMatch(/outgoing echo filed/);
    const echoReturn = hook.indexOf('outgoing echo filed');
    const agentCall = hook.indexOf("action: 'internal_agent_reply'");
    expect(echoReturn).toBeGreaterThan(-1);
    expect(echoReturn < agentCall, 'the agent can now answer the operator’s own message').toBe(true);
  });
});

describe('one press, one message', () => {
  it('guards the send against re-entry', () => {
    // "Thank you very much, appreciated it a lot." went to the customer TWICE, 1.2s apart, two
    // distinct wamids, both delivered and read. The button was disabled while in flight; the
    // textarea's Enter handler was not, and `send` itself only checked there was something to
    // send. A ref, not the `sending` state — the state read from that closure is stale, which is
    // exactly what let the second call through.
    expect(inboxPage).toMatch(/sendInFlight/);
    expect(inboxPage).toMatch(/if \(sendInFlight\.current\) return;/);
    expect(inboxPage).toMatch(/sendInFlight\.current = false;/);
    // And the keyboard path, which was the one with no guard at all.
    expect(inboxPage).toMatch(/!waBlocked && !sending\) send\(\)/);
  });
});

describe('the CRM is not filled in behind your back', () => {
  it('the resolver links an existing contact and creates none', () => {
    // The webhook used to create one for every unknown number that wrote in, which is how the CRM
    // got records named after a phone number. Recognition is free to automate; creation is a
    // decision, and it now lives behind a button in the drawer.
    // The webhook must not write to crm_contacts at all any more — that is the property, and it
    // is checkable directly rather than by inference.
    expect(
      /from\('crm_contacts'\)[\s\S]{0,120}?\.insert\(/.test(stripComments(hook)),
      'the webhook creates CRM contacts again — a message arriving is not a decision to keep somebody',
    ).toBe(false);
    expect(inboxApiSrc).toMatch(/case 'create_contact_from_thread'/);
  });

  it('the drawer action is a real call, not a link out to the CRM list', () => {
    expect(inboxPage).toMatch(/createContactFromThread/);
    expect(inboxPage).toMatch(/Add .* to CRM|to CRM/);
  });

  it('refuses to make a second record for a number already on file', () => {
    // The whole reason it moved behind a button is to stop duplicating people, so the button
    // itself must not duplicate them either.
    expect(inboxApiSrc).toMatch(/already linked/);
    expect(inboxApiSrc).toMatch(/crm_contacts'\)\s*[\s\S]{0,200}?\.or\(`phone\.eq/);
  });
});

describe('the WhatsApp profile is fetched and shown', () => {
  it('asks WhatsApp who they are', () => {
    // A business account publishes a trading name, category, description, address, email, site,
    // hours and a logo. None of it reached the platform because nothing had ever asked for it —
    // which is not the same as WhatsApp withholding it.
    expect(zernioClient).toMatch(/export async function fetchWhatsAppProfile/);
    expect(zernioClient).toMatch(/number-info/);
    expect(hook).toMatch(/refreshWhatsAppProfile/);
  });

  it('stores the logo as an object, never as the provider url', () => {
    // A provider image url expires; a contact card whose photo becomes a broken square is worse
    // than one that never had a photo.
    expect(hook).toMatch(/avatar_path/);
    // Matches the local name loosely on purpose. The claim is "the BYTES are uploaded", and pinning
    // the exact identifier made this fail when the fetch moved behind the SSRF guard and `bytes`
    // became `img.bytes` — a test that breaks on a rename it does not care about teaches people to
    // edit the assertion rather than read it.
    expect(hook).toMatch(/\.upload\(path, (?:img\.)?bytes/);
  });

  it('fetches the avatar through the SSRF guard', () => {
    // `avatarUrl` arrives inside a provider API response, so this runtime did not choose it —
    // invariant 7. A bare fetch() there follows redirects into link-local space and reads an
    // unbounded body. Semgrep caught this one on main (`no-unguarded-download-of-user-url`);
    // the rule only fires on the raw-fetch shape, so this pins the fix from the other direction.
    expect(hook).toMatch(/fetchImageGuardedOrNull\(profile\.avatarUrl\)/);
    expect(hook).not.toMatch(/await fetch\(profile\.avatarUrl\)/);
  });

  it('merges thread metadata instead of overwriting it', () => {
    // PostgREST .update({metadata}) is a whole-column assignment. Writing the profile that way
    // would delete zernio_conversation_id and contact_phone — the thread's identity. This file
    // already learned that on the delivery-receipt path.
    expect(hook).toMatch(/inbox_thread_merge_metadata/);
  });

  it('renders only what came back', () => {
    // An empty row reads as "this business has no address", not as "not provided".
    expect(inboxPage).toMatch(/wa_profile/);
    expect(inboxPage).toMatch(/AvatarImage/);
    expect(inboxPage).toMatch(/wa_profile_checked_at/);
  });
});

describe('a photo renders as a photo, and opens in place', () => {
  it('accepts a BARE media family, not just a MIME type', () => {
    // The real payload carries `content_type: "image"` — no slash. Every renderer tested
    // `startsWith('image/')`, so two real photos came out as a paperclip labelled "attachment".
    expect(inboxPage).toMatch(/ct\.includes\('\/'\) \? ct\.split\('\/'\)\[0\] : ct/);
    expect(hook).toMatch(/export function normalizeMediaType/);
    expect(hook).toMatch(/image: 'image\/jpeg'/);
  });

  it('holds the bytes rather than the provider link', () => {
    // The inline url is `https://zernio.com/api/v1/whatsapp/media/…` — an API endpoint needing the
    // bearer key. A browser gets a broken image, and it expires besides.
    expect(zernioClient).toMatch(/export async function fetchZernioMediaUrl/);
    expect(hook).toMatch(/materialiseInlineAttachments/);
    expect(zernioClient).toMatch(/hostname\.endsWith\('zernio\.com'\)/);
    // Guarded, with the bearer passed THROUGH it — needing a header is not a reason to
    // fetch a provider URL raw (invariant 7).
    expect(zernioClient).toMatch(/fetchBinaryGuarded\(url, \{/);
  });

  it('opens full view in place instead of a new tab', () => {
    // Reviewing a conversation should not cost you the conversation.
    expect(inboxPage).toMatch(/const AttachmentLightbox/);
    expect(inboxPage).toMatch(/kind="image"/);
    expect(inboxPage).toMatch(/kind="pdf"/);
    // `contain`: a cropped photo of a damaged tile is a photo of the wrong bit.
    expect(inboxPage).toMatch(/object-contain/);
  });

  it('says so when a file could not be downloaded', () => {
    // A link that goes nowhere is worse than an honest failure.
    expect(hook).toMatch(/fetch_failed: true/);
    expect(inboxPage).toMatch(/could not be downloaded/);
  });

  it('repairs a message left holding an unopenable link', () => {
    // The first two real photos were filed with the provider url. Repairing only the
    // never-found case would have left them broken permanently.
    expect(hook).toMatch(/hasUnfetchedLink/);
  });
});
