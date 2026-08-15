# Messaging API (WhatsApp via Zernio)

The Messaging API is a Supabase Edge Function that handles **WhatsApp** messaging using **Zernio** (the official WhatsApp Cloud API wrapper). SMS and the former Twilio integration were removed on 2026-06-08.

**Zernio Docs:** https://docs.zernio.com

---

## Model

Unlike a "from-number → to-number" SMS provider, Zernio WhatsApp follows Meta's Cloud API model:

- A **channel** is a connected Zernio WhatsApp **account** (a WABA phone number). `messaging_channels.zernio_account_id` holds the Zernio accountId; `config` holds `waba_id` / `phone_number_id` / `display_phone_number` / `profile_id`. `provider = 'zernio'`.
- **Cold / marketing sends require a Meta-approved template.** Freeform text only works inside the 24-hour customer-service window (i.e. after the contact messaged you). Campaigns map a `messaging_templates` row to a Meta template via `whatsapp_template_name` + `whatsapp_language_code`, with ordered body params derived from the template's `variables[]`.
- **Multi-tenancy** mirrors the social integration: one Zernio profile per workspace (`resolveWorkspaceProfile`), each connected WABA = an account under that profile.

### Sending requires Zernio's **Inbox add-on**
The per-recipient send path uses `/v1/inbox/conversations` (cold start with template) — these endpoints `403` without Zernio's Inbox add-on. The add-on is also what makes **two-way** (reply capture + agent reply) possible.

---

## Provider: Zernio

- Base URL: `https://zernio.com/api/v1`, Bearer auth with `ZERNIO_API_KEY` (env-first, `platform_secrets` fallback; legacy `LATE_API_KEY` honored).
- Shared client: [`supabase/functions/_shared/zernio.ts`](../../supabase/functions/_shared/zernio.ts) — `zernioApi`, `sendWhatsAppMessage`, `sendWhatsAppReply`, `resolveWorkspaceProfile`, `verifyZernioSignature`.

---

## Actions (`messaging-api`)

`POST` with `{ action, ... }`:

| Action | Purpose |
|---|---|
| `send` | Send to one/many recipients. Uses the channel's template (cold) or freeform `content` (in-window). With no template bound and a non-marketing `messageType`, falls back to **Meta Direct Send** (`category:'utility'`), which starts a conversation with no pre-approved template — Meta matches or auto-creates one. Marketing still requires its approved template. Logs to `messaging_logs`, debits `zernio-whatsapp` credits. |
| `send-bulk` | Same, for a `recipients[]` list with per-recipient `variables`. |
| `connect-whatsapp-oauth` | **The default connect path.** `{ workspaceId?, redirectUrl? }` → `GET /v1/connect/whatsapp?profileId=&redirect_url=` → `{ oauth_url }`. Send the operator there; Meta Embedded Signup handles WABA + number selection. `redirectUrl` MUST be same-origin (open-redirect guard, mirrors the social handler). |
| `connect-whatsapp-callback` | Finish the signup. Zernio returns the browser with `?connected=whatsapp&accountId=&profileId=&username=`; post `{ zernioAccountId }` here and the account is re-read from `GET /v1/accounts/{id}` (never trusted from the URL) and upserted as a channel. |
| `connect-whatsapp` | **Headless sibling** — for a caller that already holds Meta credentials: `{ accessToken, wabaId, phoneNumberId, displayName? }` → `POST /v1/connect/whatsapp/credentials`. Do not route a human through this; it means digging a permanent token out of Business Suite for something OAuth does in two clicks. |
| `webhook-status` / `register-webhook` | Read / create-or-repair the Zernio webhook pointing at `zernio-webhook-handler` (`GET|POST|PUT /v1/webhooks/settings`). **Nothing registered it before**, so the entire inbound path was unreachable by construction. Also re-enables a hook Zernio auto-disabled (it does so after 10 consecutive delivery failures) and re-subscribes when `ZERNIO_WEBHOOK_EVENTS` grows. Requires `ZERNIO_WEBHOOK_SECRET`. |
| `create-whatsapp-template` | Submit a template to Meta (`POST /v1/whatsapp/templates`). `libraryTemplateName` = one of Meta's pre-approved library templates, usable immediately; `components` = custom, review up to 24h. |
| `sync-channels` | Pull connected WhatsApp accounts from Zernio (`GET /v1/accounts?platform=whatsapp`) into `messaging_channels`. |
| `backfill-inbox` | Pull conversation history from Zernio into the inbox (`GET /v1/inbox/conversations` → `…/messages`). Webhooks are push-only with NO history and Zernio does not resend after a 200, so everything before the webhook was registered exists on the platform and nowhere here — and no local signal distinguishes that from an empty inbox. Each message is replayed through `zernio-webhook-handler` **signed with the real webhook secret**, not through a service-role bypass, so live and replay can never diverge into two importers. Scoped to the caller's own accounts; idempotent. |
| `channel-health` | Live token health from Zernio (`GET /v1/accounts/health`) — whether the token still WORKS, which `account-info` (what Meta thinks of the number) cannot answer. Filtered to the caller's own channels (Zernio's key is platform-wide) and mirrored onto `messaging_channels`, so a dead token stops showing a green badge whether or not anyone opens the panel. |
| `inbox-analytics` | Two-way volume + time-to-first-response (`GET /v1/analytics/inbox/{volume,response-time}`). `analytics` below reads `messaging_logs` — what WE sent — and cannot see a reply, so a 100%-delivered dashboard was compatible with nobody being answered. The two calls are `Promise.allSettled`: analytics is a stricter rate-limit bucket (~6 req/s) and one 429 must not blank the panel. |
| `whatsapp-templates` | List the WABA's Meta templates (`GET /v1/whatsapp/templates?accountId=`). |
| `channels` / `templates` / `logs` / `analytics` | DB reads (all filtered to `channel_type='whatsapp'`). |
| `account-info` | WhatsApp number health (quality rating + messaging tier) — replaces the old Twilio balance. |
| `get-settings` / `update-settings` | `messaging_settings` (provider pinned to `zernio`). |

Not configured → `503` with code `provider_not_configured` and settings path `/admin/modules/messaging/settings → Keys`.
That path only works because `ZERNIO_API_KEY` is resolved through `_shared/zernio.ts → ensureZernioSecrets()`
(env first, `platform_secrets` second). Reading `Deno.env.get('ZERNIO_API_KEY')` directly — which four
hand-rolled copies used to do — can never see an admin-saved value, because the env bootstrap is a no-op on
the edge runtime. Guarded by [tests/unit/zernioSecretResolution.test.ts](../../tests/unit/zernioSecretResolution.test.ts).

---

## Campaign processor (`messaging-processor`)

Cron (every minute). Starts due scheduled WhatsApp campaigns, then sends each pending recipient via `sendWhatsAppMessage` (template + ordered params). Outbound sends are logged to `messaging_logs` only — they **do not** create an inbox conversation. Delivery status flows in later via the webhook.

---

## Webhooks (`zernio-webhook-handler`)

There is **one** Zernio webhook endpoint for both social posts and WhatsApp messaging (the former Twilio `messaging-webhook` was deleted). Register it in Zernio subscribed to `post.*`, `account.*`, and `message.*`. Signed with `X-Zernio-Signature` (HMAC-SHA256 over the raw body, secret `ZERNIO_WEBHOOK_SECRET`).

| Event | Handling |
|---|---|
| `message.received` | Capture the WhatsApp reply into `messaging_conversations` + `messaging_conversation_messages`. **Assign on first reply** to the originating campaign owner. STOP/START keywords update `messaging_optouts`. Emits the `whatsapp.reply_received` flow event for notification. |
| `message.delivered` / `message.read` / `message.failed` | Update `messaging_logs` (by `provider_message_id` = wamid) + the campaign recipient + any agent-reply message. |

**Noise model:** only inbound replies surface a conversation; campaign sends never do.

---

## Tables

| Table | Notes |
|---|---|
| `messaging_channels` | `provider='zernio'`, `zernio_account_id`, `config.{waba_id,phone_number_id,display_phone_number,profile_id}` |
| `messaging_templates` | `whatsapp_template_name` + `whatsapp_language_code` bind to a Meta template; `variables[]` = ordered body params |
| `messaging_logs` | Outbound send/delivery log; `provider_message_id` = wamid |
| `messaging_conversations` | **New.** Inbound-reply threads (assign-on-reply). Unique `(channel_id, contact_phone)` |
| `messaging_conversation_messages` | **New.** Per-message rows in a conversation (incoming + agent outgoing) |
| `messaging_optouts` | STOP/START compliance (`channel_type` ∈ `whatsapp` / `all`) |
| `campaigns` / `messaging_campaign_recipients` | Campaign + per-recipient send state |

`messaging_conversations` + `messaging_conversation_messages` are in the `supabase_realtime` publication for the (fast-follow) live inbox UI.

---

## Secrets

| Key | Where |
|---|---|
| `ZERNIO_API_KEY` | `platform_secrets` (modules: `social-media` + `messaging`); env wins |
| `ZERNIO_WEBHOOK_SECRET` | same; verifies `X-Zernio-Signature` |
| `CRON_SECRET` | guards `messaging-processor` |

Manage at `/admin/modules/messaging/settings → Keys` or `/admin/modules/social-media → Settings`.

---

## Activate after deploy

1. `supabase functions deploy messaging-api messaging-processor zernio-webhook-handler`
2. Paste `ZERNIO_API_KEY` (+ `ZERNIO_WEBHOOK_SECRET`) if not already set for social.
3. Connect a WhatsApp number: Messaging → Channels → **Connect WhatsApp** (Meta access token + WABA ID + phone number ID), or **Sync from Zernio** if connected in the Zernio dashboard.
4. Register the webhook in Zernio (`.../functions/v1/zernio-webhook-handler`) with `message.*` events.
5. Create templates mapped to Meta-approved template names.

> **Requires Zernio's Inbox add-on** for per-recipient sends and reply capture.
