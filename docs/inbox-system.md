# Inbox System (Multi-tenant unified inbox)


## Channels

`inbox_channel` is `internal | whatsapp | email | social`. The send-router in `inbox-api`
branches on it: `internal` stores only, the other three store AND relay.

**`social` covers two different things and they relay to different Zernio endpoints**, keyed on
`thread.metadata.social_kind`:

| `social_kind` | What it is | Relay | Agent |
|---|---|---|---|
| `dm` | 1:1 DM on Instagram / Facebook / X / Bluesky / Reddit / Telegram | `POST /v1/inbox/conversations` | follows the workspace `inbox_agent.auto_respond`, like WhatsApp |
| `comments` | Comments under one of **our own** posts | `POST /v1/inbox/comments/{postId}` with the `commentId` of the message being answered | **never auto-answers**; account tools are withheld entirely |

Sending one down the other's path either publishes a private answer under a public post or drops
a public reply into a DM nobody is in — both succeed at the API layer, so the routing is explicit.

A comment reply MUST carry `commentId`. Without it the reply is a new top-level comment, which
does not notify the person who asked: answered, and never read.

**Social counterparties have no participant row.** They are a handle with neither phone nor
email and they never read this inbox, so minting a `crm_contacts` row per commenter would fill
the CRM with people nobody can contact again. Their identity lives on
`inbox_messages.metadata.author_handle`, the thread is matched on `metadata.external_key`, and
the agent's "is this a customer?" guard falls back to `metadata.direction === 'incoming'` —
without that fallback it rejected every social message and the agent could never answer one.

A comment thread is public, which changes what is safe to say: order confirmations are withheld
there, account tools are not passed to the model at all (refusing in the prompt is not enough
while the tool is still callable), and the composer says so before the operator types.

> Issue **#209**. Backend: [`supabase/functions/inbox-api/index.ts`](../supabase/functions/inbox-api/index.ts) (single action-router edge function).
> Multi-tenant: **tenant = workspace**. Every thread is bound to a `workspace_id`; access is derived from workspace membership / participation, never trusted from the request body.

The Inbox is the platform's unified customer-service surface. It brings **team-internal conversations**, **customer chats**, and **WhatsApp** (via [Zernio](social-media-system.md)) into one thread list, adds a **CRM/finance context rail** for the customer a member is talking to, and layers an **AI assistant takeover** that answers a customer's own account questions and auto-responds on inbound messages. It doubles as the messaging bridge for the [Surplus Marketplace](surplus-marketplace.md) (buyer↔seller inquiry threads).

Related docs: [CRM](crm-system.md) · [Finance](finance-system.md) · [Social publishing / Zernio](social-media-system.md) · [Flows / notifications](flows-notification-system.md) · [Surplus Marketplace](surplus-marketplace.md).

---

## 1. What it covers

- **Team-internal threads** (`thread_type='internal'`, `channel='internal'`) — private team DMs. Strictly participant-scoped; customers can never see them.
- **Customer threads** (`thread_type='customer'`) — a dealer/business talking to one of their customers. Channel is `internal` (in-app / tokenized) or `whatsapp`.
- **Upstream threads** (`thread_type='upstream'`) — a workspace talking to its parent/operator workspace.
- **AI assistant takeover** — an editable-persona agent that reads the thread's customer's OWN statement, open invoices (with pay links), quotes and projects, and replies — auto-engaged on inbound customer messages, credit-metered to the workspace.
- **CRM/finance context rail** — for members, the right rail shows the linked CRM contact + company, recent quotes, projects, lifetime value, open balance and open invoices.
- **Public customer surface** — a tokenized thread page at `/i/:token` that a non-account customer can read and reply on, with a "create an account" conversion handshake.
- **Marketplace inquiry bridge** — cross-tenant buyer→seller threads for the Surplus Marketplace.

---

## 2. Data model

Four tables in `public` (all writes are performed by `inbox-api` under the service role; see [§6](#6-rls--tenancy)).

### `inbox_threads`
`id, workspace_id, thread_type, channel, subject, status, created_by, last_message_at, metadata, agent_id, agent_state, created_at, updated_at`

- `thread_type ∈ {internal, customer, upstream}`; `channel ∈ {internal, whatsapp, email}` (email added by #342).
- `status ∈ {open, snoozed, closed}` (bumped to `open` on every new message).
- `agent_state ∈ {off, suggesting, active, paused}` and `agent_id` drive the AI takeover ([§4](#4-ai-assistant-takeover-9)).
- `metadata` carries channel binding for WhatsApp (`zernio_account_id`, `zernio_conversation_id`, `channel_id`, `contact_phone`) and, for marketplace threads, `marketplace_listing_id` / `marketplace_inquiry_id` / `buyer_workspace_id`.
- `metadata.order_intake` holds an **order proposal** read out of the conversation (#342, [§11](#11-order-intake-342)). It is deliberately not a table and never an `orders` row until a member approves it. Any writer must read-modify-write this column — clobbering it drops the WhatsApp relay binding above.

### `inbox_participants`
`id, thread_id, participant_type, user_id, contact_id, agent_id, workspace_id, thread_role, added_by, joined_at, last_read_at, status, created_at, updated_at`

- `participant_type ∈ {member, customer, agent}`.
  - `member` — a business teammate (`user_id` + `workspace_id` set). Sees private notes.
  - `customer` — the end customer; either a CRM `contact_id` only (channel customer / WhatsApp, `user_id` NULL, never an app account) or a converted account (`user_id` set after `token_claim`). Note-blind.
  - `agent` — the AI assistant (`agent_id`, no `user_id`).
- `thread_role ∈ {owner, participant, agent}`.
- `status ∈ {active, removed, left}`. `last_read_at` drives unread state.

### `inbox_messages`
`id, thread_id, sender_participant_id, body, attachments, message_type, metadata, created_at, edited_at, deleted_at`

- `message_type ∈ {text, note, system, agent}`.
  - `text` — a normal message from a member or customer.
  - `note` — a **private** member-only note (never relayed to a channel, never shown to customers).
  - `system` — transcript event (e.g. "handed to the AI assistant").
  - `agent` — an AI-authored reply.
- `attachments` is a JSONB array of `{storage_bucket, storage_object_path, name, content_type, size}`; files land in the private `generation-images` bucket under `inbox/{threadId}/…` and are read via signed URLs.
- Inbound WhatsApp messages carry `metadata.direction='incoming'` + `metadata.wamid` (used for the 24h-window check and delivery-status updates).

### `inbox_thread_tokens`
`id, token, thread_id, contact_id, expires_at, claimed_by_user_id, created_by, created_at`

The capability token behind the public `/i/:token` page and the signup conversion handshake.

### `inbox_thread_token_challenges`
`id, token_id, code_hash, sent_to, expires_at, attempts, consumed_at, created_at`

**Possession of a share link is not identity** (#357 AE-12). The link authorises by possession, and
`token_send_message` posts as the contact the token is bound to — so a forwarded mail, a quoted
reply chain, a shared mailbox or a leaked archive handed whoever held it the ability to write into
a customer's conversation *as that customer*.

- **Reading stays link-only, deliberately.** The link is an invitation, and challenging someone before they can see the conversation they were invited to would make the feature useless. That read is bounded by the 30-day TTL and by the token dying on claim.
- **Writing costs a one-time code** sent to the address the link was issued for (`token_request_code` → `token_verify_code`), after which the browser holds a short-lived HMAC proof (`_shared/thread-sender-proof.ts`, 12h). A forwarded link carries no `localStorage`, which is the whole mechanism.
- The code is stored **hashed with its token**, so a leaked row is not a working code anywhere, and the row cascades away with the token.
- **The attempt is claimed before the comparison** — compare-and-set on `attempts`, the same shape as the campaign recipient claim (#357 AE-4). Read-then-write would let five parallel guesses each cost one attempt out of five.
- Requests are **rate-limited per token** (5/hour): an unthrottled code endpoint turns the customer's own inbox into the attack.
- **Fail closed on both edges** — no HMAC secret, or a token with no contact/email to verify against, refuses the write rather than waving it through.
- Guarded by [tests/unit/threadSenderProof.test.ts](../tests/unit/threadSenderProof.test.ts).

---

## 3. `inbox-api` — the action router

One `POST`-only, action-discriminated function (merge rule; precedent `moodboard-sheet-share`). It always uses the **service-role client** and derives identity itself. There are three request classes, resolved in [`handler()`](../supabase/functions/inbox-api/index.ts):

1. **Internal branch** — `action='internal_agent_reply'`, guarded by the service-role bearer (`Authorization: Bearer <SERVICE_ROLE_KEY>`). Used by `zernio-webhook-handler` after a WhatsApp inbound to let the agent reply. Never reachable externally.
2. **`token_claim`** — the post-signup conversion handshake. **Requires a JWT** and overrides any body `user_id` with the verified caller (pentest #250 C17 — previously it took `user_id` from the body on the unauthenticated path, allowing force-enrollment of an arbitrary victim).
3. **Token branch** — `token_get_thread`, `token_request_code`, `token_verify_code`, `token_send_message` — unauthenticated customer, resolved by the capability token. Reading is resolved purely by the token; **writing additionally requires a `sender_proof`** earned by a one-time code (see `inbox_thread_token_challenges`).
4. **JWT branch** — every member/operator/customer-account action, authenticated via `authenticate(req, { requireUser: true })`.

### JWT actions

| Action | Who | Purpose |
|---|---|---|
| `create_thread` | member / operator (client → customer thread) | Create a thread; creator becomes `owner` participant; optional initial participants (directional-ACL checked); auto-engages the AI on customer-initiated customer threads |
| `add_participant` / `remove_participant` | thread members | Add/remove a teammate or customer (directional add-rule enforced) |
| `send_message` | participants (members + customers) | Post a `text` or member-only `note`; relays to WhatsApp when in the 24h window; triggers agent reply / human-takeover pause |
| `mark_read` / `set_status` | participants / members | Update `last_read_at`; set `open/snoozed/closed` |
| `set_agent` | members | Hand a thread to / back from the AI (`off/suggesting/active`); writes a `system` transcript note |
| `get_agent_settings` / `set_agent_settings` | member reads / owner-admin writes | Per-workspace AI config (`workspaces.settings.inbox_agent`) |
| `list_threads` | member / operator | Thread list (see visibility rules below); operator `scope:'all'` spans every workspace |
| `get_thread` | participants (note-filtered for non-members) | Thread + participants + messages + WhatsApp window |
| `get_thread_context` | members / operator | CRM contact + company + quotes + projects + invoices + finance metrics for the rail |
| `create_marketplace_inquiry` / `accept_marketplace_inquiry` | business members | Surplus Marketplace buyer↔seller bridge ([§7](#7-marketplace-inquiry-bridge)) |

### Token actions (unauthenticated customer)

| Action | Purpose |
|---|---|
| `token_get_thread` | Read one thread (notes filtered out) + participants, given a valid, unexpired token |
| `token_send_message` | Post a customer reply on that thread; then triggers `maybeRunAgentReply` |
| `token_claim` (JWT-required) | A freshly-signed-up user adopts the token's thread, links the CRM contact to their account, and becomes a `client` member of the dealer workspace |

---

## 4. AI assistant takeover (§9)

Implemented in [`maybeRunAgentReply()`](../supabase/functions/inbox-api/index.ts). When a thread is `agent_state='active'` and the **most recent message is a fresh inbound `text` from a `customer` participant** (loop / human-takeover guard), the agent generates and posts an `agent` reply.

- **Auto-engagement.** On a **customer-initiated customer thread** (`create_thread`) and on a **new inbound WhatsApp thread** (in `zernio-webhook-handler`), the thread is set `agent_state='active'` with `agent_id='kai'` and an `agent` participant is added — unless the workspace opted out (`settings.inbox_agent.auto_respond === false`). A `system` message records that the assistant is responding.
- **Human takeover.** When a member sends a `text` reply on an `agent_state='active'` thread, `send_message` flips it to `paused` so the assistant stops talking over the human; the member re-enables it with the Bot toggle (`set_agent → 'active'`). Private notes do not pause it.
- **Billing.** Each reply costs `INBOX_AGENT_REPLY_COST = 1` credit, debited from the **workspace owner** via the `debit_credits` RPC with `p_workspace_id` (draws the workspace pool when funded, else the owner's personal balance). The debit happens **only once the agent has committed to replying**; on debit failure the thread is left for a human. No module gate — it works platform-wide out of the box.
- **Data-grounded, injection-proof tools.** When `settings.inbox_agent.allow_account_data !== false` and the thread's customer resolves to a CRM contact, [`buildCustomerSupportTools()`](../supabase/functions/inbox-api/index.ts) exposes three **read-only** tools whose scope `(workspace_id, contact_id)` is captured from the **thread**, never from tool arguments or the customer's message. The tools take no scoping parameters, so the customer cannot widen scope by prompt injection:
  - `get_account_statement` → aging buckets from `vw_customer_aging_buckets` (total outstanding, not-due / 0–30 / 31–90 / 90+, open-doc count, max days overdue).
  - `list_open_invoices` → unpaid `invoices` (number, amount due, due date, status) with a secure pay link (`/pay/{pay_token}`) when a valid token exists.
  - `list_quotes_and_projects` → the customer's recent `quotes` + `projects`.
- **Persona.** Loaded from the editable `prompts` row (`prompt_type='agent'`, `category='inbox'`) with an inline `FALLBACK_INBOX_PERSONA` — reply in the customer's language, never invent figures, and defer to a human for negotiation / discounts / refunds / account changes.
- **The reply is relayed to the channel** (WhatsApp) exactly like a member reply — see [§5](#5-whatsapp-channel).

### Per-workspace settings

Stored at `workspaces.settings.inbox_agent = { auto_respond, allow_account_data }` — **both default ON** (a workspace opts out by setting either to `false`). Read via `get_agent_settings` (any member); written via `set_agent_settings` (owner/admin only). The frontend surfaces both toggles in the `InboxAgentSettingsButton` popover on the conversation header.

---

## 5. WhatsApp channel

WhatsApp threads (`channel='whatsapp'`) store **and** relay through Zernio (Meta Cloud API). See [social-media-system.md](social-media-system.md) / [messaging-api.md](inbox-system.md) for the Zernio connection model.

- **Reply capture (inbound).** The shared [`zernio-webhook-handler`](../supabase/functions/zernio-webhook-handler/index.ts) handles `message.received`: it resolves the owning workspace from the receiving WABA account, matches-or-creates a CRM contact from the sender phone, finds-or-creates the `whatsapp` customer thread, and **assigns it on first reply** to the campaign owner (or workspace owner) as the `owner` member participant. STOP/START opt-out keywords are applied to `messaging_optouts`. Then it fires `inbox.message_received` to members and calls `inbox-api` `internal_agent_reply` so the AI can respond. `message.delivered|read|failed` update `messaging_logs` / delivery status by `wamid`.
- **Outbound relay.** In [`insertMessageAndNotify()`](../supabase/functions/inbox-api/index.ts), a `text`/`agent` message on a `whatsapp` thread is relayed via `sendWhatsAppReply({ accountId, conversationId, message })` using the `zernio_account_id` / `zernio_conversation_id` in thread metadata; the relay result is stored on the message. **Notes never leave the inbox.**
- **Meta 24-hour service window.** [`whatsappWindow()`](../supabase/functions/inbox-api/index.ts) reads the last inbound (`metadata.direction='incoming'`) message; freeform replies are allowed only within 24h of it. `send_message` returns **409** ("an approved template is required") when the window is closed (notes are exempt). `get_thread` returns the current `whatsapp_window` so the composer can disable itself.

> **Status note.** The inbound reply-capture path above is wired in `zernio-webhook-handler`. Per the project tracker (CLAUDE.md Inbox note), the full **WhatsApp cut-over** (template-driven re-engagement outside the 24h window, dedicated inbox reply box) is still being finished; treat template sending outside the window as out of scope of this surface today.

---

## 6. RLS & tenancy

**All directional access walls are enforced in `inbox-api` at thread-create / participant-add time — never at read time.** Because the function runs under the service role, RLS on the tables exists only to gate **direct client reads / realtime**; every write goes through the function.

- Only **SELECT** policies exist on `inbox_threads` / `inbox_messages` / `inbox_participants`. A row is visible when the caller `is_inbox_thread_participant`, `is_inbox_operator`, or `is_inbox_shared_workspace_member`. Private notes add a second condition: notes are visible only to operators, thread members, or shared-workspace members. There are **no** client INSERT/UPDATE/DELETE policies.
- **Directional add-rule** ([`assertCanAddParticipant()`](../supabase/functions/inbox-api/index.ts)):
  - **Operator** ↔ everyone.
  - **`client`** (converted end-customer) may only add a member of their own dealer/sales team — never other customers, never upstream ("a dealer with their customers, not their customers with other dealers").
  - **Business member** (`owner/admin/member/staff/sales`) may add an own-workspace member, or — on an `upstream` thread — a member of the parent workspace; may add a `customer` participant only on a `customer` thread and only a contact owned by the same workspace.
  - `agent` participants are added only by the takeover flow.
- **Shared team inbox.** `list_threads` returns (a) threads the caller explicitly participates in **and** (b) every `customer`/`upstream` thread in workspaces where the caller is a business member — so a teammate can jump into a shared customer conversation they were never added to (they become a real participant on first reply). `internal` threads are visible **only** to explicit participants.
- **404, not 403**, on a missing thread (`getThreadOrThrow`); ownership checks return 403 only where already inside an authorized context.

---

## 7. Marketplace inquiry bridge

Two JWT actions let the [Surplus Marketplace](surplus-marketplace.md) cross the tenant wall under the service role:

- **`create_marketplace_inquiry`** — a buyer (business member of `buyer_workspace_id`) inquires on an active `marketplace_listings` row. It writes a `marketplace_inquiries` row and opens a `customer` thread **in the seller's workspace**: the buyer joins as a note-blind `customer` participant, the seller's owner/admins as `member` participants (so they're notified), and posts the opening message.
- **`accept_marketplace_inquiry`** — the seller accepts; it find-or-creates a supplier in the buyer's workspace, materializes a **draft purchase order** (+ an `on_order` `stock_allocations` row when the inquiry carried a sourcing demand), decrements the listing, closes the inquiry, and posts an acceptance message back on the thread.

---

## 7b. Status — Open / Follow-up / Done

`inbox_threads.status` is `open | snoozed | closed`; the UI calls them **Open / Follow-up / Done**
in both the setter and the tabs. (It used to say "Snoozed / Closed" in the dropdown and
"Follow-up / Done" in the tabs beside it — one enum, two vocabularies, on one screen.)

### What moves a conversation between them

One implementation: the `inbox_message_moves_thread_state` trigger on `inbox_messages`. It used to
be written out three times — inbox-api's `insertMessageAndNotify`, the Zernio social-thread
refresh and the inbound-email handler — and all three said the same wrong thing, that any message
forces `open`.

| The message | What happens |
|---|---|
| A private **note**, or a **system** event | Nothing. A note is internal; a system event is not somebody talking. |
| From the **customer** | → **Open**, from any status, and any pending follow-up is **cancelled**. They replied; there is nothing left to chase. |
| From **us** (member or agent) | → **Open** only from **Done**. "We are talking again, so it is not finished." From Follow-up it changes nothing — we are still waiting on them, and the automatic chase must not cancel the state that scheduled it. |

A sender with no participant row at all (a social commenter, a DM handle) counts as the customer:
they are the other side by definition.

### Follow-up is a moment, and optionally a message

`follow_up_at` is when the conversation comes back to Open by itself. `follow_up_message`, if set,
is sent then — which is how "chase them if they have not replied in X days" is expressed: there is
no separate concept, because *the customer replying is what cancels it*, and that cancellation is
in the trigger above, so it works whatever channel they answer on.

- Set it with `set_follow_up` (`at` or `days`, plus `note` and `message`); `clear_follow_up` calls
  it off and returns the thread to Open.
- `inbox-follow-up-cron` runs every 5 minutes. `claim_due_inbox_follow_ups` stamps
  `follow_up_fired_at` **in the same statement that selects the row** — the send half cannot be
  rolled back, so a retry must not chase the same customer twice.
- The chase goes through inbox-api `internal_send_follow_up` (service-role only), i.e. the
  ordinary send path: same 24h window check, same channel relay. A cron that inserted into
  `inbox_messages` itself would produce a message the operator can see and the customer never got.
- The thread returns to Open **whether or not the message went**. A chase Meta refused needs
  somebody more than one that worked, not less — and `follow_up_fired_at` is already stamped, so
  leaving it parked would strand it having fired, never to fire again.

**On WhatsApp the automatic send usually cannot happen.** Meta accepts a freeform message only
inside 24 hours of the customer's last one, and a follow-up is normally days away. That is said at
the moment of scheduling (`set_follow_up` returns a `warning`, and the composer repeats it beside
the checkbox), and a refusal is recorded in `follow_up_error` and shown in the conversation —
never swallowed.

Guarded by [tests/unit/inboxFollowUp.test.ts](../tests/unit/inboxFollowUp.test.ts).

---

## 8. Notifications

Delivery goes through the [Flows](flows-notification-system.md) engine, not hardcoded sends:

- `inbox.message_received` — bell (+ email, #224) to every **other** active participant with an account (members always; notes to members only; pure token customers get none). Carries `workspace_id` (#256) so tenant flows can scope to it, plus `action_url=/inbox?thread={id}`.
- `inbox.thread_assigned` — fired when a user is added to a thread or a WhatsApp thread is assigned to its owner.
- `inbox.follow_up_due` — a scheduled follow-up came due. Fires whether the chase went out or
  not; `message_sent` and `error` on the payload separate the two, so "only tell me about the ones
  that failed" is a condition rather than a second trigger.
- `inbox.thread_labeled` — a label was **added** to a conversation (removals do not fire, and the
  event names only the labels that went on). Carries `label_names` / `all_label_names` as well as
  the ids: a flow condition is written by a person looking at their own labels, and a uuid in a
  condition field is a value nobody can author or read. The trigger has no config for the same
  reason — a fixed label list on it would be a second copy of `inbox_labels` that goes stale the
  first time somebody renames one.

### What labels are, and what they are not

Labels are **ours**. They live in `inbox_labels` / `inbox_thread_labels`, are created per workspace
by an owner or admin, and are readable by the agent (`manage_inbox` actions `labels` / `list` /
`label`, all of them BY NAME) and by flows through the trigger above.

They are **not** WhatsApp's labels, and cannot be. Measured 2026-09-01 against Zernio's own
`openapi.json`: the only path containing "label" in their entire API is `/v1/ads/labels`, which is
Meta Ads. There is no inbox or WhatsApp label endpoint to read, and the labels an operator makes in
the WhatsApp Business app are on that device. `/v1/inbox/conversations/labels` answers 400 rather
than 404 — that is `labels` being parsed as a `{conversationId}`, not a route.

The same probe settled the other provider question this feature ran into: Zernio's `DELETE
/v1/inbox/conversations/{id}/messages/{id}` documents its own platform support, and **WhatsApp is
listed as not supported (returns 400)**. So `delete_message` removes a message from this inbox and
says so; there is no unsend to offer.

---

## 9. Frontend

- **Route** `/inbox` → [`InboxPage`](../src/pages/Inbox/InboxPage.tsx), wrapped in `AuthGuard` + `CapabilityGuard capability="inbox.use"`. Three-pane desktop layout (Conversations · Conversation · Details rail); single-pane mobile drill-in with the rail in a bottom sheet.
  - **Members** get full controls (AI Bot toggle, agent settings, add teammate, status select, reply/private-note switch). **End-users** (`persona==='end_user'`) get a read/reply surface only.
  - **Channel filters** All / Internal / WhatsApp / Email, plus an **Order** filter (#342); operators get an "All workspaces" toggle (`scope:'all'`).
  - **Realtime**: members subscribe to `inbox_messages` inserts on the open thread + a `inbox_threads` list channel. The details rail is populated by `get_thread_context`.
  - Client service: [`inboxApi`](../src/services/inboxApi.ts).
- **Public route** `/i/:token` → [`PublicInboxThreadPage`](../src/pages/PublicInboxThreadPage.tsx). Minimal chrome, one thread, reply box + attachments. Anonymous customers can't use RLS realtime, so it **polls every 15s** via `token_get_thread`. A "Create account to continue" modal routes to signup carrying the token (`/auth?mode=signup&inbox_token=…&redirect=/inbox`); on return the app calls `token_claim` (a fallback in `InboxPage` also claims a token stashed in `localStorage` across the email-confirmation round trip).

---

## 10. Shipped vs pending

**Shipped:** the thread/message/participant/token backbone; directional ACL + shared team inbox; WhatsApp inbound reply-capture with assign-on-reply + 24h-window enforcement; the AI takeover (auto-engage, credit metering, data-grounded thread-scoped tools, human-takeover pause, editable persona); per-workspace `auto_respond` / `allow_account_data` settings **with the UI toggle**; the CRM/finance context rail; the public tokenized thread page + `token_claim` conversion; the marketplace inquiry bridge; Flows-based notifications.

**Pending (per CLAUDE.md tracker):** a dedicated agent-facing WhatsApp reply box. Template-driven re-engagement outside Meta's 24h window is no longer wholly pending — #342 built it for one concrete template (`order_confirmation`, §11); a general template picker in the composer is still a fast-follow. Everything documented above reflects the current code.

---

## 10a. Email channel (#342)

### One address per USER, not per workspace

`user_email_addresses` is 1:1 with `auth.users` (enforced by a UNIQUE column, not convention). Role
mailboxes (`sales@`, `info@`) and per-agent mailboxes are deliberately out — one person, one
address, and any agent can be pointed at it. `workspace_id` on the row decides which tenant the mail
files into, because a user can belong to several and threads, contacts and the credit debit are all
workspace-scoped.

Local parts must be **globally** unique, because every tenant shares one receiving domain. Non-Latin
names go through the platform's existing ELOT 743 / Transliteration Act mapper first —
`Γιάννης Παπαδόπουλος` → `giannis.papadopoulos@`, not `user4821@`.

**No suffixes of any kind.** On a collision the allocator writes nothing and returns
`conflict: 'taken'` with the handle it tried, and the user picks their own. `basilis.kanonidis2@` is
an address its owner has to spell out every time they say it aloud, handed to whichever of two
identical names signed up second; two people sharing a full name on one platform is rare enough to
be worth one question. A random suffix is rejected for the same reason — this is an address you
print on a business card, and what protects it is `setReject()` on unknown recipients, the DKIM gate
and per-sender limits, not obscurity.

A chosen handle goes through `validateChosenLocalPart` before it reaches the column, which refuses
`+` explicitly (it is the thread delimiter — a local part containing one would make every reply
resolve to a *different* mailbox), anything the column CHECK would reject, and the reserved
role names. `postmaster`/`abuse`/`security` belong to whoever runs the domain; `sales`/`support`/
`info` would let one workspace's user appear to speak for the platform.

Allocation is an explicit click (`get_my_email_address` with `allocate:true`), surfaced in the
Inbox settings popover along with a copy button and an "assistant answers email" toggle. It is never
a side effect of opening the Inbox.

### How a reply finds its thread

Outbound replies go out with `Reply-To: basilis+t.<threadId>@mail.…`. **The recipient address is
what threads a reply**, because it is the one field in the round trip that no intermediary rewrites
— a custom `Message-ID` header is a request an ESP may decline, and then the token we stored matches
nothing. Cloudflare's catch-all accepts any local part, so this needs no extra routing rule, and
`resolveRecipient` matches on the untagged base mailbox.

The full ladder is: **reply tag** → our own `Message-ID` token → a stored `Message-ID` from
`In-Reply-To`/`References` → subject+sender heuristic (fenced to `open` threads within 30 days) →
a new thread. Every step is workspace-checked; a tag is attacker-supplied like anything else.

### Sending

`insertMessageAndNotify` relays an `email` thread through `email-api` with
`emailType: 'agent_reply'`, threading headers, and **`requireWorkspaceSender` deliberately unset** —
an inbox reply is not a business document and must never borrow the finance sending identity. An
assistant-authored message additionally carries `Auto-Submitted: auto-replied` / `Precedence:
auto_reply` so two autoresponders cannot ping-pong; a finance send must **never** carry those, which
[tests/security/inbound-email-isolation.test.ts](../tests/security/inbound-email-isolation.test.ts)
enforces.

The send result is checked and a failure **throws** (502, "stored but NOT delivered"), for the same
reason the WhatsApp relay does: a stored message with a cleared composer and no delivery is
indistinguishable from success from the operator's side.

---

## 11. Order intake (#342)

An order that arrives as a **conversation** — over email or WhatsApp — becomes a real sales order
without anyone re-typing it.

### The proposal is not an order

Extraction writes a proposal to **`inbox_threads.metadata.order_intake`**, and **nothing exists in
`orders` until a member approves it**. That placement was measured, not assumed: `orders` is read by
71 SQL functions, 7 triggers and 11 TS files, ~30 of them set-scanning. A `status='proposed'` row
would need ~30 query edits and still leave four things a filter cannot fix — `tg_order_number` is
BEFORE INSERT so every AI proposal burns a customer-visible `ORD-YYYY-NNNN`,
`_notify_upstream_order_created` is AFTER INSERT, `dic_heal__finance_order_total_mismatch` would
rewrite the model's numbers on the nightly sweep, and `order_items` write RLS is owner/admin, which
makes "sales may approve" *harder*. One nullable `orders.source_thread_id` is the only schema change
to the orders model.

There is **one intake per thread**, by construction — it is a single jsonb key, so a follow-up
("and one box of the grey") amends the proposal under review instead of racing a second one. It
stores no money total; `_recompute_order_totals_core` is the authoritative number.

### The pipeline

`maybeRunOrderIntake` runs immediately **before** `maybeRunAgentReply` at all three places an
inbound customer message lands (`send_message`, `token_send_message`, `internal_agent_reply`), so
both channels are served from one chokepoint and neither webhook needed a change. Gated on
`workspaces.settings.order_intake.enabled` — **opt-in**, unlike the agent's opt-out, because
extraction spends credits on every inbound message.

[`_shared/order-intake/`](../supabase/functions/_shared/order-intake/): a Haiku classifier (free,
most mail is not an order) → schema-enforced extraction with the conversation fenced as DATA
(invariant 9) → catalog matching (MIVAA multi_vector → `ilike` fallback → **visual**, for "2 boxes
of this" plus a photo) → pricing via `get_product_price_for_workspace` and nothing else. The model
reads quantities and descriptions; it never supplies a price or a product id. Credits are debited
before the extraction call and refunded when it yields nothing.

`p_quantity` is deliberately **not** passed to the price resolver, so an intake line prices
identically to the same line typed into a quote. Passing it would make order intake the platform's
first caller to fire quantity breaks — an untested pricing path, on a money quantity.

### Approval

`create_order_from_thread_intake(thread_id)` — SECURITY DEFINER, callable by
**owner / admin / sales / sales_manager**. It is the one path that lets a `sales` member write to
`orders` (which `is_workspace_finance_manager` otherwise limits to owner/admin), and it is safe
because the privilege has **no reachable parameter**: `order_type` and `status` are literals, so it
can only ever produce a **draft sales order** ("Pre-order"). Stored jsonb is untrusted input, so
every column is written explicitly and every `product_id` is re-validated against the workspace
(a foreign one degrades to an ad-hoc line). Idempotent via `order_intake.order_id`.

> **Why the totals split.** SECURITY DEFINER changes the ROLE, not the JWT, so `auth.uid()` inside
> it is still the caller — and the public `recompute_order_totals` self-guards on
> `is_workspace_finance_manager`. Approval therefore raised `order not found` for exactly the sales
> roles it exists to empower, while working fine for an owner. The fix was **not** to recompute the
> money locally (that is a second derivation of a money quantity); the arithmetic moved into
> `_recompute_order_totals_core`, REVOKEd from clients, and the permission check stayed at the
> public entry point — the same shape `_deliver_order_line_core` already uses for the stock ledger.

### Telling the customer

`approve_intake` resolves a confirmation channel explicitly and **reports which one ran**: freeform
WhatsApp inside the 24h window → the approved `order_confirmation` template outside it → the email
thread → none. Both Zernio helpers resolve `{success:false}` rather than throwing, so the result is
checked; reporting "sent" for a message that never left is precisely the failure this path exists
to prevent. **Approval never rolls back because a message failed** — the order is the commitment,
the notification is best-effort and visible. The outcome is stored on the intake, and
`ops.silent_zero` probes for orders approved from the Inbox where nothing was ever confirmed.

### Surface

The details rail gains an **Order** panel above Customer value: proposed lines, needs-review
markers, a customer picker, **Edit lines**, Approve / Dismiss. Approve is **hidden** for roles the
RPC would refuse. It is deliberately small — not a second order editor; per-line supplier,
warehouse, customs and dispatch stay on the real order, which it links to once one exists. The
conversation list gains an **Order** badge and an order filter, so a proposal is visible without
opening the thread.

**Edit lines** is what makes the panel usable on a reading that is *mostly* right. Without it a
reviewer could only accept all of the model's lines or dismiss all of them, so one wrong line cost
four right ones — and `update_intake_items` / `search_intake_products` existed, complete and
routed, with nothing calling them. Each line takes a quantity, a catalog repoint (the same MIVAA →
ilike ladder the extractor ran, so the reviewer picks from the catalog the reading came from), an
optional price, and removal; a line the extractor missed can be added.

Two rules the editor obeys, both of which are invisible when broken:

- **A price the member did not type is never sent back.** Supplying `unit_price` is exactly what
  stamps `unit_price_source='manual'`, and a manual line stops re-pricing when the customer is
  assigned — the one thing assigning a customer is for. So the payload carries a price only for a
  field that was actually touched, and repointing a line clears it, because the point of repointing
  is to get *that* product's price for *this* customer.
- **`line_no` is the server's handle on the previous reading**, not a display position. An existing
  line keeps its original number through reordering and deletion; the server renumbers on save. A
  member-added line sends none, so it inherits nothing from a neighbour.

Reachability is guarded: [tests/unit/inboxApiReachability.test.ts](../tests/unit/inboxApiReachability.test.ts)
fails the build for any `inbox-api` action with no caller in `src/`.

---

## 12. Suggesting a product or a service from a conversation

A member types `/product` or `/service` in the composer (or presses the cart button next to the
paperclip). A picker searches the thread's workspace catalog by name or SKU — products, or
`products(item_type='service')` for services — and each pick becomes a **card** on the outgoing
message. Several cards go in one message, up to `INBOX_CARD_MAX` (10).

### The client sends ids; the card is resolved for the customer

`send_message` accepts `cards: [{ kind, product_id }]` from members only. `resolveInboxCards` in
`inbox-api` derives everything else for **this thread's customer**:

- the product must belong to the thread's workspace (a foreign id is not a card);
- the **price** comes from `get_product_price_for_workspace` through `resolveLinePrice` — the same
  resolver a quote line and an intake line use, for the contact and company on the thread — shown
  **gross** to a consumer and **net** to a VAT-registered buyer (the `derive_invoice_document_type`
  split). A member cannot type a price into a card; the list price in the picker is orientation;
- the **link** is the storefront (`/store/:slug?product=<id>`) when the product is
  `storefront_published`, the seller's public profile (`/u/:id`) for a listed service, and nothing
  otherwise — never an app route the customer cannot open.

The resolved cards are stored on the message (`inbox_messages.metadata.cards`) and rendered by
`InboxCatalogCards` in the member's transcript and on the customer's `/i/:token` page.

The card's `price_line` ("€54.50 / m² incl. VAT") is derived once at resolve time; every rendering
prints it. VAT is the product's own `mydata_vat_category` rate when set, the workspace default
otherwise — the rate the invoice will apply. **Who the customer is** comes from ONE derivation,
`_shared/inbox-customer-party.ts` (`threadCustomerParty`): the thread's customer contact, the
company the platform links them to, and `isBusiness` following the SQL predicate
`invoice_buyer_is_business`. The rail, the card resolver and agent-chat's account scope all read it.

### One shape, three renderings (`_shared/inbox-cards.ts`)

| Channel | What goes out |
|---|---|
| WhatsApp | Meta's interactive **`cta_url`** message, **one per card**: image header (or a text header when there is no image), body = the member's words + name + price, footer = SKU/unit, one link button. The words ride in the first card when they fit Meta's body cap and go out first as their own message when they do not — they are never cut. No public link → image with caption; no image either → plain text. All are session messages, gated by the same 24h-window check as any reply. Meta's media carousel is deliberately not used: Zernio accepts it, but whether Meta delivers it as a session message could not be verified, and its failure would arrive asynchronously. |
| Email | The member's words, then an HTML **table** (thumbnail · name · description · SKU · price · button), every field through the canonical `escapeHtml`, `href`/`src` through the `safeUrl` allowlist, plus a text alternative listing the same cards. |
| Social DM / comment | The cards as text lines under the message, fitted to the 1,000-character DM cap: the words are never cut, cards that do not fit are counted ("…and 3 more"). |

**Several WhatsApp sends for one stored message** (anti-regression rule 4): `relayWhatsAppLegs`
records each leg as it completes (`metadata.relay_legs`, `wamids`; `wamid` stays the first id),
stops at the first failure, and the error names WHICH part did not go. The composer mints a
`client_token` once per send and keeps it across a failure; a retry with the same token finds the
stored message and **resumes the missing legs** — nothing already delivered is sent twice. A
delivery receipt or an outbound echo for any leg matches the row (`apply_inbox_delivery_receipt`
and the webhook's `findInboxMessageByProviderId` both read `wamids`).

Guarded by [tests/unit/inboxCatalogCards.test.ts](../tests/unit/inboxCatalogCards.test.ts).

### Order status, on the rail and for the assistant

`get_thread_context` returns the customer's recent **sales orders** (number, status, ledger-derived
payment status and outstanding from `get_order_settlements`), shown as an *Orders* section on the
Customer profile rail with a link to the order. The customer-audience assistant has a fourth
account tool, `list_orders`. Both read `_shared/customer-orders.ts` — one query, contact OR
company — so the assistant cannot deny an order the rail beside it shows.

### Steering "Draft with AI", and asking JARVIS about a conversation

*Draft with AI* opens a small popover: an optional instruction ("offer the oak decking, say it
ships Monday") goes to agent-chat as `operator_instruction`, appended **after** the customer-data
fence and labelled as the operator's words; the fence neutralises its own markers inside customer
text so the block cannot be forged from the other side. The *Ask JARVIS* button in the thread
header opens the Agent Hub with a prompt naming the thread by id (never its subject — on an email
thread that is the customer's text); `manage_inbox action:"read"` calls `get_thread` with
`peek: true` — no read stamp, no read receipt to the customer, the newest 40 messages — and returns
the same transcript the assistant's own replies are built from, wrapped as untrusted data together
with the subject, plus the orders/quotes/invoices context the rail shows.
