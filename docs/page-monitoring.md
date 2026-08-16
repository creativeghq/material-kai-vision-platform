# Page Monitoring

> Change detection on pages that are **not** product pages — supplier terms, regulatory
> notices, partner API docs, competitor pages. Issue #331, split out of #234.

## Why this is not price monitoring

[Price monitoring](price-monitoring-system.md) is **discovery + identity + re-check**: it finds
who sells a product, verifies each page is really that SKU, and tracks the price over time. #234
concluded that half of it cannot be delegated to Firecrawl Monitoring, because Firecrawl can
report "this field changed €25 → €30" but cannot tell you the page is now a *different product*.

None of that applies here:

| | Price monitoring | Page monitoring |
|---|---|---|
| Which URLs | discovered (Perplexity + DataForSEO + marketplaces) | the operator names one |
| Identity risk | a retailer URL can silently swap SKU → Haiku classifier | a T&C page cannot become a different page |
| Cadence | volatility-based, 24h → 48h → 72h | fixed schedule, operator's choice |
| Output | a price series, medians, anomaly bands | a diff |
| Who owns the schedule | us | Firecrawl |

So the argument that killed delegation for prices is the argument **for** it here. Building
scheduling + snapshotting + diffing + a change judge ourselves, for a feature with no existing
machinery to reuse, would be rebuilding a product we already pay for.

## Shape

```
operator adds a URL
   └─> page-watches (edge)  ── creates ──>  Firecrawl monitor  (one monitor per watch)
                                                   │
                                          schedule fires
                                                   │
                                      monitor.page / monitor.check.completed
                                                   ▼
                                        page-watch-webhook (edge)
                                            │            │
                              page_watch_changes    page_watches.cache_status
                                            │
                                   emitFlowEvent('page_watch_changed')
                                            │
                                   seeded locked default flow → notification
```

**One Firecrawl monitor per watch, one URL per monitor.** Firecrawl allows 1–50 targets, but
bundling would mean a shared schedule, a shared goal, and a webhook payload we would have to fan
back out by URL. One-to-one keeps `firecrawl_monitor_id` a key the webhook can resolve a tenant
from — which is what the tenancy check depends on.

## The Firecrawl contract, as verified against the live API

Everything below was checked against `api.firecrawl.dev` on **2026-08-16**, because the
first cut of this feature was written from the docs and shipped behind a module that was
off — so nothing ever called it, and it was broken in three places at once. Change any of
this only after re-checking it the same way; [tests/unit/pageWatchWebhook.test.ts](../tests/unit/pageWatchWebhook.test.ts)
pins each one.

| | What works | What the docs suggest, and why it fails |
|---|---|---|
| Webhook config | **top-level** `webhook: { url, headers, metadata, events }` | the Monitoring page shows it under `notification`. That returns `400 Unrecognized key in body`, so **every** create failed. `notification` carries email only. |
| Update | `PATCH /v2/monitor/{id}`, **partial body accepted** | `PUT` is not a route at all — "Cannot PUT". |
| Pause / resume | `status: 'paused' \| 'active'` | there is no `enabled` key; sending one fails the whole PATCH. |
| Schedule | `schedule: { cron, timezone }` | `schedule.text` takes only a narrow set of phrases. `every day at 09:00` is accepted, `every Monday at 08:00` is `Unsupported schedule text` — so we send cron and offer a fixed list of cadences. |
| Judge | supplying `goal` is enough | `judgeEnabled` comes back `true` on its own. |
| `markdown` in `formats` | not required here | change-tracking docs say it is; the monitor supplies it, and diffs work without it. |
| Delete | `DELETE /v2/monitor/{id}` → `{"success":true}` | as documented. |
| Rate limit | **~3 monitor-API calls per minute** | undocumented. Adding several watches in quick succession 429s; `create` says so and the row stays repairable — pressing **Resume** relinks it. |

**A baseline check runs shortly after a monitor is created** (about a minute), not at the
next scheduled slot. It arrives as `status: "new"` with no diff, so the first notification
a watch produces says *"Now watching X"* rather than pretending something changed.

### The webhook payload, captured from a real delivery

```jsonc
// monitor.page
{ "success": true, "type": "monitor.page", "id": "<checkId>", "webhookId": "…",
  "metadata": { "watch_id": "…" },          // whatever we set at creation
  "data": [{
    "monitorId": "…", "checkId": "…", "url": "…",
    "status": "new" | "changed" | "same" | "removed" | "error",
    "previousScrapeId": "…", "currentScrapeId": "…", "error": null,
    "isMeaningful": true,
    "judgment": { "meaningful": true, "confidence": "high", "reason": "…",
                  "meaningfulChanges": [{ "type": "changed", "before": "…", "after": "…", "reason": "…" }] },
    "diff": { "text": "--- previous.md
+++ current.md
@@ …" }
  }] }
```

Two absences shape the handler:

- **No `statusCode`.** See below — this is the feature's silent-zero hazard.
- **No `diff.json` in git-diff mode.** The structured half of a change is
  `judgment.meaningfulChanges`, which we store in `page_watch_changes.diff_json` under
  `meaningful_changes` and render as `before → after` above the unified diff. Without
  that the column could never be non-null, since JSON mode is deliberately unused.

## A watch pointed at a dead page looks perfectly healthy

**This is the one failure mode that will actually happen.** A supplier redesigns their site,
the terms page starts 404ing, and Firecrawl scrapes the *error page*: check one says `new`,
every check after says `same`, `error` is `null`, and the table says "up to date" forever.
Verified against a live 404 and a live 503 — neither carried a single distinguishing field
in the webhook payload.

`statusCode` exists only on the check-detail endpoint, so `monitor.check.completed` spends
one extra API call (no credits) on `GET /v2/monitor/{id}/checks/{checkId}` and marks the
watch `cache_status = 'failed'` with *"The page returns HTTP 404 …"* when any page in the
check came back ≥ 400. It is best-effort: the lookup shares that ~3/min budget, and a
lookup that could not be made **leaves the previous verdict alone** rather than clearing a
real failure with a guess.

`monitor.check.completed` also fails the watch when `summary.error > 0`, which covers the
different case where the fetch itself broke.

## `same` is not recorded

Most deliveries are `same` and they carry nothing — no diff, no judgment, no error. Writing
them would make `page_watch_changes` (which has no TTL, by design) one empty row per watch
per day and bury real changes in the operator's history. That a check ran is already on the
watch: `last_check_at`, `last_check_status`, `cache_status`.

## Tables

`page_watches` — the subject. Workspace-scoped, RLS on. Carries the URL, category
(`supplier_terms` / `regulatory` / `partner_docs` / `competitor` / `other`), the natural-language
`goal`, the schedule, and `firecrawl_monitor_id`. `cache_status` (`pending` / `ok` / `failed`)
distinguishes "checked, nothing changed" from "the check itself broke" — the same distinction the
PDF pipeline learned to record the hard way.

`page_watch_changes` — the durable change log. Firecrawl retains checks for 30 days by default;
"what did this supplier's payment terms say last quarter" is a business question, not telemetry,
so we keep our own copy. No TTL by design. Members can only ever `acknowledge` a row — there is
no INSERT policy, so change rows can originate solely from the webhook.

## Security

**Firecrawl does not sign its webhooks.** No HMAC, no signature header, no timestamp. The only
authentication the provider offers is `webhook.headers` — values we set at monitor-creation time
and they echo back. That makes three things load-bearing:

1. **Fail closed.** `FIRECRAWL_WEBHOOK_SECRET` unset → 503, never "process it anyway". `page-watches`
   also refuses to *create* a monitor while the secret is unset, rather than registering one whose
   callbacks could not be authenticated.
2. **Constant-time comparison.** With no HMAC behind it, a `===` that leaks the secret's prefix
   leaks the whole boundary.
3. **Order.** The secret is verified before the body is even parsed. A check placed after the
   parse reads as correct in review and guards nothing.

Replay is possible in principle — the provider gives us no nonce. It is made harmless by the
unique index on `(page_watch_id, firecrawl_check_id, url)`: a replayed delivery conflicts and
writes nothing, so no duplicate row and no duplicate notification.

Tenancy: the webhook resolves `workspace_id` from `page_watches` by `firecrawl_monitor_id`, never
from the payload. `page-watches` verifies the caller's membership of the supplied `workspace_id`
before any read or write and returns 404 (not 403) on mismatch.

Guarded by [tests/unit/pageWatchWebhook.test.ts](../tests/unit/pageWatchWebhook.test.ts). The
ordering and constant-time assertions were mutation-tested: the first draft passed against a
naive-`===` mutation because its regex assumed one operand order, and passed against an
early-body-parse mutation because it matched `function secretsMatch(` — the declaration — instead
of the call. Both are fixed; both mutations now fail the suite.

## The judge is advisory

Supplying a `goal` turns on Firecrawl's meaningful-change judge, which labels each diff with a
verdict, a confidence and a reason (+1 credit per changed page). We **store and display** that
verdict; we never let it suppress a change. Invariant 9 requires an Anthropic `tools=[...]`
classifier for a verdict that drives a write, and Firecrawl's judge is not one. Every change is
recorded and shown either way; the verdict is an annotation next to the diff.

## Cost

1 Firecrawl credit per page per check, +1 per changed page when the judge runs. Metered through
the `page-monitoring` module (disabled by default). The manual "check now" action debits before
the upstream call and refuses with 402 if the debit fails.

**Scheduled checks are not per-request**, so they carry no per-call debit — the ongoing cost is
the module's. Watch this if the feature grows: a daily watch is ~30 credits/month, and the bill
scales with the number of watches, not with usage.

## Surfaces

| | |
|---|---|
| UI | [src/pages/PageWatchesPage.tsx](../src/pages/PageWatchesPage.tsx) at `/monitoring/pages` |
| Client | [src/services/pageWatchService.ts](../src/services/pageWatchService.ts) |
| CRUD | `supabase/functions/page-watches` |
| Webhook | `supabase/functions/page-watch-webhook` |
| Flow trigger | `page_watch_changed` + seeded locked default flow, area `page_watch_changed` |
| Module | `page-monitoring` (off by default) |
| Secrets | `FIRECRAWL_API_KEY`, `FIRECRAWL_WEBHOOK_SECRET` |

## Setup

1. Enable the `page-monitoring` module in `/admin/modules`.
2. Set `FIRECRAWL_WEBHOOK_SECRET` (any long random string) via env or `/admin/operations → Keys`.
   Until it is set, adding a watch fails with a 503 that says so.
3. `FIRECRAWL_API_KEY` is already required by price monitoring; page monitoring reuses it.

Cadences are a fixed list — hourly, every 6 hours, daily at 09:00, Mondays at 09:00, the
1st of the month at 09:00 — held in `SCHEDULE_CRON` (edge) and `PAGE_WATCH_SCHEDULES`
(client) and pinned equal by the guard test. Add one by adding it to both.

## Known gaps

- **No backfill of an existing monitor.** If a monitor is created upstream by hand, nothing here
  adopts it. Watches are created through `page-watches` or not at all.
- **`monitor.page` handles one entry at a time**, resolving the watch per entry. Fine at
  one-URL-per-monitor; if monitors ever carry multiple targets, batch the lookup.
- **No JSON-mode extraction.** Diffs are markdown/git-diff only. A page with a stable schema worth
  extracting into fields (a published price list, say) would want `changeTracking` in JSON mode
  and a per-field diff — deliberately not built, because the pages this feature targets have no
  such schema.
- **The dead-page health lookup is best-effort.** It shares Firecrawl's ~3 calls/minute budget,
  so a burst of watches finishing in the same minute will leave some health verdicts unrefreshed
  until the next check. Batch it, or move it to a sweep, if watch counts grow.
- **No retry queue for a rate-limited create.** The watch is saved and marked failed with a
  message; pressing Resume relinks it. Nothing retries on its own.
