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
// The download itself moved to _shared/inbox-media.ts so messaging-api's repair action and the
// webhook handler share ONE implementation. Assertions follow it there.
const inboxMedia = readFileSync(join(ROOT, 'supabase', 'functions', '_shared', 'inbox-media.ts'), 'utf8');
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
    expect(inboxMedia).toMatch(/storage_object_path: path/);
    expect(inboxMedia).toMatch(/\.upload\(path, got\.bytes/);
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

  it('identifies the counterparty from conversation.participantId', () => {
    // Per Zernio's OpenAPI spec there is NO `recipient` field on the message object — the earlier
    // version reached for `msg.recipient` / `msg.to`, neither of which exists. The counterparty is
    // `conversation.participantId`, and it is correct on BOTH directions, so there is one rule
    // rather than a direction-dependent guess. The sender on our own message is our own WABA
    // number; resolving on it opens a thread with ourselves.
    expect(hook).toMatch(/contactPhoneOf\(\{ id: convParticipantId \}\)/);
    expect(
      /contactPhoneOf\(msg\.recipient\)/.test(stripComments(hook)),
      'reaching for msg.recipient again — that field does not exist on the payload',
    ).toBe(false);
  });

  it('never renames the thread to the OPERATOR', () => {
    // `msg.sender.name` on a message.sent echo is the BUSINESS, and the resolver takes the name it
    // is handed — so filing an echo relabelled a conversation with Drosopoulos as "Basilis
    // Kanonidis", the person answering it. `conversation.participantName` is the counterparty on
    // both directions; the sender fallback is refused outright on an echo, because there is no
    // circumstance in which our own name is the thread's name.
    expect(hook).toMatch(/const contactName = convParticipantName/);
    expect(hook).toMatch(/isOutgoingEcho \? null : \(msg\.sender\?\.name/);
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
  it('FETCHES the photo from the conversations list rather than waiting to be pushed one', () => {
    // The whole reason every thread showed coloured initials: `conversation.participantPicture` is
    // OPTIONAL on a webhook — measured absent on four consecutive real `message.received` payloads
    // — and reading it there was the only place we ever looked. It is a documented field on
    // `GET /v1/inbox/conversations`, so the fix is to go and ask, exactly like inbound media,
    // which works for precisely that reason.
    expect(stripComments(messagingApi)).toMatch(/\/inbox\/conversations\?/);
    expect(stripComments(messagingApi)).toMatch(/participantPicture/);
    expect(stripComments(messagingApi)).toMatch(/storeParticipantPicture\(/);
    // The webhook still uses one when a payload happens to carry it — free, and it means a new
    // conversation has its photo immediately rather than at the next sync.
    expect(hook).toMatch(/convParticipantPicture/);
    expect(hook).toMatch(/storeParticipantPicture/);
    // The old hunt stays deleted: three endpoints tried for a counterparty profile, settling for a
    // Zernio CRM row whose `name` was the phone number.
    expect(
      /fetchWhatsAppProfile|number-info/.test(stripComments(hook) + stripComments(zernioClient)),
      'the profile lookup hunt is back — the photo has one source, the conversations list',
    ).toBe(false);
  });

  it('matches a conversation to OUR thread by id, never by guessing at the phone', () => {
    // Every thread carries the `zernio_conversation_id` it mirrors, so the join is exact. A
    // digits-of-the-phone match would silently attach one person's photo to another's thread when
    // two numbers differ only by a country prefix.
    expect(stripComments(messagingApi)).toMatch(/zernio_conversation_id/);
  });

  it('reports what it found in parts, so a zero is diagnosable', () => {
    // "Synced 0" is three different problems wearing one hat: the listing failed, the platform
    // withholds photos, or we already hold them all. This is the silent-zero shape the platform
    // keeps paying for, so each count is returned separately.
    const api = stripComments(messagingApi);
    expect(api).toMatch(/with_picture/);
    expect(api).toMatch(/own_avatar/);
    expect(api).toMatch(/conversations === 0/);
  });

  it('uses the WhatsApp Business photo for our own side instead of asking for an upload', () => {
    // The operator already has a photo — the one their customers see beside every message. A
    // member with no `user_profiles.avatar_url` falls back to the number's business profile
    // rather than rendering initials next to a prompt to upload a second copy of it.
    expect(stripComments(inboxPage)).toMatch(/prof\?\.avatar_url \?\? channelAvatarUrl/);
    // And it is the STORED object, not the provider link, for the same expiry reason as any
    // other avatar here.
    expect(stripComments(messagingApi)).toMatch(/avatar_path: path/);
  });

  it('stores the logo as an object, never as the provider url', () => {
    // A provider image url expires; a contact card whose photo becomes a broken square is worse
    // than one that never had a photo.
    expect(inboxMedia).toMatch(/avatar_path/);
    // Matches the local name loosely on purpose. The claim is "the BYTES are uploaded", and pinning
    // the exact identifier made this fail when the fetch moved behind the SSRF guard and `bytes`
    // became `img.bytes` — a test that breaks on a rename it does not care about teaches people to
    // edit the assertion rather than read it.
    expect(inboxMedia).toMatch(/\.upload\(path, (?:img\.)?bytes/);
  });

  it('fetches the avatar through the SSRF guard', () => {
    // `avatarUrl` arrives inside a provider API response, so this runtime did not choose it —
    // invariant 7. A bare fetch() there follows redirects into link-local space and reads an
    // unbounded body. Semgrep caught this one on main (`no-unguarded-download-of-user-url`);
    // the rule only fires on the raw-fetch shape, so this pins the fix from the other direction.
    expect(inboxMedia).toMatch(/fetchImageGuardedOrNull\(pictureUrl\)/);
    expect(inboxMedia).not.toMatch(/await fetch\(pictureUrl\)/);
  });

  it('merges thread metadata instead of overwriting it', () => {
    // PostgREST .update({metadata}) is a whole-column assignment. Writing the profile that way
    // would delete zernio_conversation_id and contact_phone — the thread's identity. This file
    // already learned that on the delivery-receipt path.
    expect(inboxMedia).toMatch(/inbox_thread_merge_metadata/);
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
    expect(inboxMedia).toMatch(/export function normalizeMediaType/);
    expect(inboxMedia).toMatch(/image: 'image\/jpeg'/);
  });

  it('holds the bytes rather than the provider link', () => {
    // The inline url is `https://zernio.com/api/v1/whatsapp/media/…` — an API endpoint needing the
    // bearer key. A browser gets a broken image, and it expires besides.
    expect(zernioClient).toMatch(/export async function fetchZernioMediaUrl/);
    expect(inboxMedia).toMatch(/export async function materialiseInlineAttachments/);
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
    expect(inboxMedia).toMatch(/fetch_failed: true/);
    // The card also covers the row that holds a provider link and was never fetched at all —
    // rendering that as an <img> is what produced a broken-image icon in the thread.
    expect(inboxPage).toMatch(/not downloaded yet/);
    expect(inboxPage).toMatch(/repairAttachments\(\{ messageId \}\)/);
  });

  it('repairs a message left holding an unopenable link', () => {
    // The first two real photos were filed with the provider url. Repairing only the
    // never-found case would have left them broken permanently.
    expect(hook).toMatch(/hasUnfetchedLink/);
  });
});

describe('message.sent is how the operator’s reply reaches us', () => {
  it('files a message.sent, not just a campaign-log row', () => {
    // Verified in the live webhook log: a reply typed in WhatsApp Web arrives as `message.sent`,
    // NOT as `message.received` with a direction. The echo handling added to the inbound path
    // therefore never ran for the case it was written for, and two live threads sat at
    // `outgoing: 0` while the operator was looking at their own replies on WhatsApp.
    const sentBranch = hook.slice(hook.indexOf("if (event === 'message.sent')"));
    expect(sentBranch.slice(0, 1800)).toMatch(/handleInboundMessage\(supabase, echo\)/);
    expect(sentBranch.slice(0, 1800)).toMatch(/direction: 'outgoing'/);
  });

  it('routes it through the SAME handler rather than a second filing path', () => {
    // Two importers that drift is the failure this codebase keeps paying for; the wamid dedupe
    // is also what stops a platform-sent message being filed twice, and it only lives on the one
    // path.
    expect(hook).toMatch(/const echo = \{/);
    expect(hook).toMatch(/\.\.\.payload,/);
  });

  it('finds the counterparty from the conversation when the echo names no recipient', () => {
    // A message.sent payload is about the message, not about who it went to. Dropping it for
    // "no resolvable recipient" is the same silence in a different costume.
    expect(hook).toMatch(/isOutgoingEcho && msg\.conversationId/);
    expect(hook).toMatch(/metadata->>zernio_conversation_id/);
  });
});

// The "profile lookup asks the right endpoint" block lived here. It pinned the ordering and
// argument handling of a three-endpoint hunt for a counterparty profile. Zernio's OpenAPI spec
// says the profile is in every inbox webhook (`conversation.participantPicture` /
// `participantName`), so the hunt is gone — and a guard describing how to do it correctly
// would only keep the idea alive. The "reads the profile off the WEBHOOK" case above fails
// if any of it comes back.

describe('a reaction belongs ON a message', () => {
  it('finds the reacted-to message by reaction.platformMessageId', () => {
    // A reaction payload has NO `message` object — its required fields are id, event, reaction,
    // conversation, account, timestamp. The handler read `payload.message`, got `{}`, produced no
    // id candidates and returned null every single time. No reaction has ever attached to
    // anything, silently.
    expect(hook).toMatch(/reaction\.platformMessageId/);
    expect(
      /const msg = payload\.message \|\| \{\};[\s\S]{0,300}?findInboxMessageByProviderId\(supabase, msg\)[\s\S]{0,200}?reactions/
        .test(stripComments(hook)),
      'handleReaction reads payload.message again — that object does not exist on a reaction',
    ).toBe(false);
  });

  it('trusts reaction.action rather than inferring removal from an empty emoji', () => {
    // WhatsApp reports an empty emoji on removal because Meta does not say which one went.
    // Inferring from emptiness conflates "removed" with "sent nothing".
    expect(hook).toMatch(/reaction\.action === 'removed'/);
  });

  it('drops the placeholder message a reaction arrives alongside', () => {
    // Reacting on the phone produces BOTH reaction.received AND a message.sent whose whole text is
    // "[reaction]". Filing the second puts a message in the thread reading "[reaction]", attached
    // to nothing — which is exactly what the operator saw.
    expect(hook).toMatch(/export function isReactionPlaceholder/);
    expect(hook).toMatch(/reaction placeholder \(handled by reaction\.received\)/);
  });

  it('merges the metadata instead of read-modify-writing it', () => {
    // The old handler read the row, spread its metadata and wrote it back. A delivery receipt
    // landing in between is lost — rare, silent, and a valid row either way.
    expect(hook).toMatch(/inbox_message_merge_metadata/);
  });

  it('renders the emoji on the message', () => {
    // Stored correctly and never shown is the same outcome as not stored.
    expect(inboxPage).toMatch(/meta\.reactions/);
    expect(inboxPage).toMatch(/reactions\.length > 0/);
  });
});

describe('the counterparty face is drawn the same way everywhere', () => {
  it('resolves the avatar in ONE component', () => {
    // The inbox draws this face in five places — conversation list, conversation header, message
    // bubbles, profile drawer, details rail — and the first version of the stored-picture work
    // wired exactly one of them. So the picture could be fetched, stored and signed correctly and
    // the operator would still see initials in the list, which is the only place they look before
    // opening anything.
    expect(inboxPage).toMatch(/const ThreadAvatar/);
    // No second signer: a bespoke createSignedUrl effect beside it is how the five drift apart.
    const signers = inboxPage.match(/signInboxAttachment\(\{ storage_bucket: /g) ?? [];
    expect(
      signers.length,
      'more than one place signs the avatar — fold it onto ThreadAvatar',
    ).toBeLessThanOrEqual(1);
  });

  it('uses it in the list, the header and the rail, not just the drawer', () => {
    const uses = inboxPage.match(/<ThreadAvatar/g) ?? [];
    expect(uses.length, 'a place that draws the counterparty is back on a bare AvatarFallback')
      .toBeGreaterThanOrEqual(4);
  });

  it('logs what the conversation object actually contains', () => {
    // The payload log truncated at 200 characters, which cut off before `conversation` on every
    // inbox event — the one object needed to settle whether a WhatsApp participant picture exists.
    // Reasoning from the schema got it wrong in both directions; the field is OPTIONAL, so only
    // looking at a real payload answers it.
    expect(hook).toMatch(/conversation keys:/);
    expect(hook).toMatch(/participantPicture: \$\{c\?\.participantPicture \? 'present' : 'absent'\}/);
  });
});
