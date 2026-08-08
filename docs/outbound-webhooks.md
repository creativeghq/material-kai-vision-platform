# Outbound tenant webhooks (#330)

A workspace registers an HTTPS endpoint, picks which events it wants, and the platform POSTs
signed JSON there when those events happen. **Profile → Webhooks.**

Only inbound provider webhooks (Stripe, Resend, Zernio, Revolut) existed before this; a tenant
running a real business had no way to get their own systems told that an invoice was issued or
an order shipped.

## Why it reuses the Flows event vocabulary

The events are the same `TriggerType` strings the Flows engine already fires. That was a
deliberate choice over a second event system: those events are already emitted at the right
moments, already carry a resolved `workspace_id`, and are already governed. A parallel
vocabulary would have meant a second set of emit points to keep in sync, and the two would
have drifted.

Tenants can only subscribe to the subset in
[`supabase/functions/_shared/webhook-events.ts`](../supabase/functions/_shared/webhook-events.ts),
filtered on two questions:

1. **Is it the tenant's own business fact?** "My invoice was issued" — yes. Role upgrades,
   module access and agent failures describe *our* operations, not theirs.
2. **Is one delivery per occurrence sane?** `email_opened` fires per recipient per open;
   subscribing an endpoint to it turns one campaign into thousands of signed POSTs and the first
   casualty is the tenant's own server.

`fiscal_credits_low` is excluded specifically — it is about the *operator's* provider credit
pool, not any tenant's business.

There is **no "all events" option**, on purpose. An endpoint that silently starts receiving
newly-added event types leaks data by default, so each type is an explicit opt-in.

## Flow of one event

```
emitFlowEvent(type, data)
      │
      ▼
flow-engine · handleTriggerEvent
      ├── enqueueTenantWebhooks()  ──► workspace_webhook_deliveries (status='pending')
      └── matching flows execute
                                          │
                                   (cron, every minute)
                                          ▼
                            workspace-webhook-dispatcher
                              SSRF guard → sign → POST → record
```

The enqueue happens **before** the flow lookup and its early return. That ordering is load-
bearing: most events match no flow, so enqueuing afterwards would have delivered nothing for
exactly the events tenants care about most, while every call still returned 200 — the silent-zero
shape [CLAUDE.md](../CLAUDE.md) exists to prevent.

Queueing rather than delivering inline is also deliberate. A tenant endpoint can be slow, down,
or hostile, and none of that may be allowed to slow or fail the business transaction that
emitted the event.

## Verifying a delivery (what to tell an integrator)

Each POST carries:

| Header | Meaning |
|---|---|
| `X-MaterialKai-Event` | the event type |
| `X-MaterialKai-Delivery` | delivery id (stable across retries — use it to dedupe) |
| `X-MaterialKai-Timestamp` | unix seconds |
| `X-MaterialKai-Signature` | `sha256=<hex>` |

Compute `HMAC-SHA256(secret, "<timestamp>.<raw body>")` and compare. **Reject anything whose
timestamp is more than a few minutes old** — the timestamp is inside the signed string precisely
so a captured delivery cannot be replayed later. Signing the body alone would leave replay wide
open.

Body shape is a stable envelope so adding fields to `data` does not break a tenant parser:

```json
{ "type": "invoice_issued", "workspace_id": "…", "data": { } }
```

## Security

- **SSRF.** The URL is tenant-supplied — the canonical hostile input. It passes the shared guard
  (`_shared/ssrf-guard.ts`) at **registration** *and again at delivery*, because DNS behind a
  stored hostname can be re-pointed at `169.254.169.254` long after the row was written.
  `redirect: 'error'` is set, since a public URL can 302 to a blocked address after the check.
  An SSRF rejection fails the delivery immediately rather than burning retries — retrying cannot
  make a blocked address safe.
- **The signing secret is unreadable.** `workspace_webhooks.secret` is column-level revoked from
  `authenticated` and `anon` (table `GRANT` dropped, allowed columns re-granted — a column-level
  `REVOKE` alone is a no-op against a table-level grant). It is returned exactly once, at create
  or rotate. Lost means rotate.
- **Tenancy.** Every `workspace_id` is reconciled against the caller's JWT. An endpoint belonging
  to another workspace returns **404, not 403**, so ids cannot be enumerated.
- **https only** for registration: the payload carries the tenant's business data, and a
  signature provides integrity, not confidentiality.

## Failure handling

- Backoff 1m → 5m → 25m → 2h → 6h (capped), hard cap **6 attempts** per delivery.
- **20 consecutive failures auto-disables the endpoint** with a `disabled_reason` the tenant sees.
  A dead endpoint must stop generating work rather than retrying until the table fills.
- Re-enabling clears the failure counter — otherwise it would disable again on the next failure.
- A delivery queued for an endpoint that is disabled or deleted before it goes out is recorded as
  `dropped`, not silently discarded: "nothing arrived" has to be explainable.

## Retention

`workspace_webhook_deliveries` is bronze. `prune_workspace_webhook_deliveries()` (cron
`workspace-webhook-deliveries-prune`, 03:25 daily) drops **terminal** rows older than 30 days and
never touches `pending`/`delivering` at any age — deleting an undelivered row would silently
discard a tenant's event.

## Adding a new subscribable event

1. The event must already exist in `TriggerType` and actually be emitted.
2. Add it to `SUBSCRIBABLE_EVENT_TYPES`.
3. [tests/unit/webhookEventVocabulary.test.ts](../tests/unit/webhookEventVocabulary.test.ts)
   enforces that every value is a real trigger type, has no duplicates, and that the
   operator-only / high-volume ones stay out. The two files live on opposite sides of the
   Deno/Vite boundary and cannot import each other, so that test is the only thing holding them
   together — a subscription to a misspelled event is accepted, listed in the tenant's dashboard,
   and never fires, which looks to them like a broken endpoint.

## Source map

| Concern | File |
|---|---|
| Subscription + delivery tables | `workspace_webhooks`, `workspace_webhook_deliveries` |
| Event fan-out | `supabase/functions/flow-engine/index.ts` → `enqueueTenantWebhooks` |
| Delivery | `supabase/functions/workspace-webhook-dispatcher/index.ts` |
| Management API | `supabase/functions/workspace-webhooks-api/index.ts` |
| Subscribable vocabulary | `supabase/functions/_shared/webhook-events.ts` |
| Client | `src/services/workspaceWebhooksService.ts` |
| UI | `src/components/core/Profile/WebhooksTab.tsx` |
