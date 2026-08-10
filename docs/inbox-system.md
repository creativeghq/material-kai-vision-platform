# Inbox System (Multi-tenant unified inbox)

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

---

## 3. `inbox-api` — the action router

One `POST`-only, action-discriminated function (merge rule; precedent `moodboard-sheet-share`). It always uses the **service-role client** and derives identity itself. There are three request classes, resolved in [`handler()`](../supabase/functions/inbox-api/index.ts):

1. **Internal branch** — `action='internal_agent_reply'`, guarded by the service-role bearer (`Authorization: Bearer <SERVICE_ROLE_KEY>`). Used by `zernio-webhook-handler` after a WhatsApp inbound to let the agent reply. Never reachable externally.
2. **`token_claim`** — the post-signup conversion handshake. **Requires a JWT** and overrides any body `user_id` with the verified caller (pentest #250 C17 — previously it took `user_id` from the body on the unauthenticated path, allowing force-enrollment of an arbitrary victim).
3. **Token branch** — `token_get_thread`, `token_send_message` — unauthenticated customer, resolved purely by the capability token.
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

WhatsApp threads (`channel='whatsapp'`) store **and** relay through Zernio (Meta Cloud API). See [social-media-system.md](social-media-system.md) / [messaging-api.md](api/messaging-api.md) for the Zernio connection model.

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

## 8. Notifications

Delivery goes through the [Flows](flows-notification-system.md) engine, not hardcoded sends:

- `inbox.message_received` — bell (+ email, #224) to every **other** active participant with an account (members always; notes to members only; pure token customers get none). Carries `workspace_id` (#256) so tenant flows can scope to it, plus `action_url=/inbox?thread={id}`.
- `inbox.thread_assigned` — fired when a user is added to a thread or a WhatsApp thread is assigned to its owner.

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
markers, a customer picker, Approve / Dismiss. Approve is **hidden** for roles the RPC would refuse.
It is deliberately small — not a second order editor; per-line supplier, warehouse, customs and
dispatch stay on the real order, which it links to once one exists. The conversation list gains an
**Order** badge and an order filter, so a proposal is visible without opening the thread.
