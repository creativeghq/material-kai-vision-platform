# Mention Monitoring API

Track product, brand, and keyword mentions across **news, blogs, RSS, YouTube, and LLM responses**. Cost-optimized multi-source pipeline with sentiment classification and weekly LLM visibility tracking.

**Host**: `https://v1api.materialshub.gr`

There are **two surfaces** with different auth:

| Surface | Path prefix | Auth | Used by |
|---|---|---|---|
| **Public Tracking API** | `/api/v1/mentions/track` | `Authorization: Bearer kai_*` (api_keys) | External integrations, partner projects |
| **Internal product/brand flow** | `/api/v1/mention-monitoring` | Session JWT (Supabase access token) | Material KAI web app |
| Cron | `/api/v1/mention-monitoring/cron-*` | `x-cron-secret` | Internal pg_cron jobs |

**Module gate**: All endpoints require the `mention-monitoring` module to be enabled. Alert dispatch additionally requires `mention-monitoring-notifications`.

If you're integrating from another project, **use the Public Tracking API** (section near the top of this doc). The internal endpoints are documented for reference only.

---

## Pipeline overview

```
discover (parallel)
  ├─ DataForSEO News API     ($0.0006/req, 100 results, ~6h freshness)
  ├─ Perplexity Sonar        ($0.005/sweep, recency-filtered)
  ├─ RSS feeds               (free, user-curated per subject)
  └─ YouTube Data API        (free, opt-in per subject)
  ↓
URL canonicalize + content-hash dedupe
  ↓
Apply exclusions + promoted-URL overrides
  ↓
Rule pre-filter (alias must appear) — drops obvious mismatches before Haiku
  ↓
Verdict cache lookup (7d TTL) — repeat URLs hit cache
  ↓
Haiku 4.5 batched classifier (≤50 candidates per call)
  → relevance ∈ {exact, tangential, mismatch, unverifiable}
  → sentiment ∈ {positive, neutral, negative}
  ↓
Drop relevance='mismatch'
Sanity check: sentiment outlier vs trailing 7d → flag is_anomaly
  ↓
Persist mention_history rows with refresh_run_id
Update tracked_mentions denormalized cache
Update volatility cadence (update_tracked_mention_cadence RPC)
  ↓
Detect alerts → dispatch via mention-monitoring-notifications module
```

## Cost discipline

The same playbook as price-monitoring v3:

- **Verdict cache (7d TTL)**: repeat URLs across daily refreshes hit ~95% cache rate on stable subjects.
- **Rule pre-filter**: deterministic alias-presence check eliminates ~60% of candidates before Haiku.
- **Tier-skip on Perplexity**: cheap `sonar` model on stable refreshes; `sonar-pro` only on first refresh / forced refresh.
- **Volatility cadence**: stable subjects stretch from 24h → 48h → 72h → 168h. Active subjects accelerate to 6h.
- **LLM probes**: weekly cadence, 4 templates × 4 cheap models (haiku, gpt-4o-mini, gemini-flash, sonar) = ~$0.008/subject/week.

Typical refresh cost on a stable subject: ~$0.005–0.010 per refresh (DataForSEO News + cached Sonar + free RSS).

---

## Public Tracking API — `/api/v1/mentions/track/*`

For partner integrations using an `api_keys` Bearer token (`kai_*` prefix). Mirrors the shape of the Price Tracking API at `/api/v1/prices/track/*`.

### Auth

```
Authorization: Bearer kai_<32-char-alphanumeric>
Content-Type: application/json
```

The key must be active and not expired. Each tracked subject is owned by the api_key that created it — partner A cannot read or modify partner B's subjects.

**Cascade**: deleting the api_key (or letting it expire) is permitted, but the row + all its mention history is dropped along with it (`ON DELETE CASCADE`).

### Endpoint inventory

| # | Method | Path | Purpose |
|---|---|---|---|
| 1 | `POST` | `/api/v1/mentions/track` | Create tracked subject + first refresh |
| 2 | `GET` | `/api/v1/mentions/track` | List all subjects owned by your key |
| 3 | `GET` | `/api/v1/mentions/track/{id}` | Read one subject (config + cached snapshot) |
| 4 | `PUT` | `/api/v1/mentions/track/{id}` | Update aliases / sources / alert prefs / cadence |
| 5 | `DELETE` | `/api/v1/mentions/track/{id}` | Soft delete (deactivates, preserves history) |
| 6 | `POST` | `/api/v1/mentions/track/{id}/refresh` | Force refresh now (bypasses cadence) |
| 7 | `GET` | `/api/v1/mentions/track/{id}/feed` | Latest refresh-run rows |
| 8 | `GET` | `/api/v1/mentions/track/{id}/history` | Filterable history (sentiment, outlet_type, days) |
| 9 | `GET` | `/api/v1/mentions/track/{id}/summary` | Aggregate snapshot (total count, sentiment, outlets) |
| 10 | `GET` | `/api/v1/mentions/track/{id}/llm-visibility` | LLM probe snapshot (share-of-voice + rank + competitors) |
| 11 | `POST` | `/api/v1/mentions/track/{id}/probe-llm` | Fire a fresh LLM probe matrix |
| 12 | `POST` | `/api/v1/mentions/track/{id}/exclude` | Exclude a URL or domain from results |
| 13 | `POST` | `/api/v1/mentions/track/{id}/include` | Undo an exclusion |
| 14 | `GET` | `/api/v1/mentions/track/{id}/exclusions` | List exclusions for the subject |

### Quickstart

```bash
# 1. Create a tracked subject (brand example)
curl -X POST https://v1api.materialshub.gr/api/v1/mentions/track \
  -H "Authorization: Bearer kai_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "subject_type": "brand",
    "subject_label": "Flobali",
    "brand_name": "Flobali",
    "aliases": ["Flobali Tiles", "Flobali Hellas"],
    "sources_enabled": { "news": true, "blogs": true, "youtube": false, "rss": true, "llm": true },
    "language_codes": ["en", "el"],
    "country_codes": ["GR", "DE"],
    "refresh_interval_hours": 24,
    "alert_on_negative_sentiment": true,
    "alert_on_new_outlet": true,
    "alert_channels": ["webhook"],
    "alert_webhook_url": "https://your.domain/webhooks/material-kai-mentions"
  }'

# Response: { "success": true, "data": { "id": "uuid", ...row, "last_refresh": { ... } } }
```

```bash
# 2. List your subjects
curl https://v1api.materialshub.gr/api/v1/mentions/track \
  -H "Authorization: Bearer kai_YOUR_KEY"
```

```bash
# 3. Get a subject's latest mention feed
curl https://v1api.materialshub.gr/api/v1/mentions/track/{id}/feed?limit=50 \
  -H "Authorization: Bearer kai_YOUR_KEY"
```

```bash
# 4. Get filtered history (last 30 days, only negative sentiment, news only)
curl "https://v1api.materialshub.gr/api/v1/mentions/track/{id}/history?days=30&sentiment=negative&outlet_type=news&limit=100" \
  -H "Authorization: Bearer kai_YOUR_KEY"
```

```bash
# 5. Get a 30-day summary
curl https://v1api.materialshub.gr/api/v1/mentions/track/{id}/summary?days=30 \
  -H "Authorization: Bearer kai_YOUR_KEY"
```

```bash
# 6. Get LLM visibility snapshot (latest probe run)
curl https://v1api.materialshub.gr/api/v1/mentions/track/{id}/llm-visibility \
  -H "Authorization: Bearer kai_YOUR_KEY"
```

```bash
# 7. Force a refresh now (bypasses cadence)
curl -X POST https://v1api.materialshub.gr/api/v1/mentions/track/{id}/refresh \
  -H "Authorization: Bearer kai_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "force": true }'
```

### Refresh cadence (you control it)

Set `refresh_interval_hours` between **1 and 720** (1 hour to 30 days). The platform's own cron does NOT touch external-flow rows — refreshes happen only when YOU call `POST /{id}/refresh`. This is intentional: you pay per call and shouldn't be surprised by background charges.

Volatility cadence still adjusts `next_check_at` after each refresh you trigger, so you can use that field as a hint about when re-polling is worth the cost.

### Webhook alerts

Set `alert_webhook_url` to receive HTTP POST notifications. Payload shape:

```json
{
  "alert_type": "negative_sentiment",
  "title": "Negative mention from wirecutter.com",
  "body": "...",
  "tracked_mention_id": "uuid",
  "outlet_name": "Wirecutter",
  "outlet_domain": "wirecutter.com",
  "payload": { "url": "...", "title": "...", "sentiment_score": -0.6 },
  "fired_at": "2026-05-03T10:15:00Z"
}
```

Four alert types, each opt-in (`alert_on_*` flags):
- `mention_spike` — today's count ≥ 2× trailing 7d daily-average
- `negative_sentiment` — negative mention from a high-DA outlet
- `new_outlet` — first-ever mention from a new domain
- `llm_visibility_change` — average rank across LLM probes shifts ≥2 W/W

24h dedupe per `(alert_type, tracked_mention_id, outlet_domain)`.

### Error codes

| Code | Meaning |
|---|---|
| `400` | Bad request (missing field, invalid value) |
| `401` | Missing or invalid `Authorization: Bearer kai_*` |
| `403` | Your API key does not own this `tracking_id` |
| `404` | `tracking_id` not found |
| `429` | Rate limit exceeded (default 60 req/min, configurable per key) |
| `500` | Internal error |

---

## Endpoints — internal flow (product-scoped)

All require session JWT. The internal flow auto-resolves the catalog product into a `tracked_mentions` row with `api_key_id IS NULL` and `product_id NOT NULL`.

### `POST /products/{product_id}/track`

Enroll a catalog product in mention monitoring. Idempotent — re-calling returns the existing row + a fresh refresh.

**Body** (all fields optional):

```json
{
  "aliases": ["Flobali", "Flobali Tiles", "FB-7012MT"],
  "sources_enabled": { "news": true, "blogs": true, "youtube": false, "rss": true, "llm": true },
  "language_codes": ["en", "el"],
  "country_codes": ["GR", "DE"],
  "alert_on_spike": true,
  "alert_on_negative_sentiment": true,
  "alert_on_new_outlet": false,
  "alert_on_llm_visibility_change": true,
  "alert_channels": ["bell", "email"],
  "alert_webhook_url": null,
  "run_first_refresh": true
}
```

**Response**: `TrackedMention` row.

### `DELETE /products/{product_id}/track`

Soft-delete: deactivates the row but preserves history.

### `GET /products/{product_id}`

Read the `TrackedMention` row including denormalized snapshot (`current_mention_count_7d`, `current_sentiment_avg`, `current_top_outlets`).

### `POST /products/{product_id}/refresh`

Body: `{ "force": false }`. Admin-only when `force=true` (bypasses volatility cadence).

**Response**: `RefreshOutcome`:
```json
{
  "status": "refreshed",
  "credits_used": 3,
  "hits_count": 24,
  "refresh_run_id": "uuid",
  "by_source": { "dataforseo_news": 12, "perplexity_sonar": 6, "rss": 2 },
  "errors": {},
  "results": [/* MentionRow[] */],
  "sentiment_avg": 0.18,
  "top_outlets": [["wirecutter.com", 4], ["dezeen.com", 3]]
}
```

### `GET /products/{product_id}/feed?limit=100`

Latest refresh run as a row list. For continuous browsing across runs, use `/history`.

### `GET /products/{product_id}/history?days=30&sentiment=negative&outlet_type=news&limit=200`

Filterable history. `sentiment` and `outlet_type` are optional.

### `GET /products/{product_id}/summary?days=30`

Aggregated snapshot: total count, sentiment breakdown, top outlets.

### `GET /products/{product_id}/llm-visibility`

Most recent LLM probe snapshot:

```json
{
  "present": true,
  "probe_run_id": "uuid",
  "total_probes": 16,
  "share_of_voice": 0.5,
  "avg_position": 3.2,
  "per_model": {
    "claude-haiku-4-5": { "probes": 4, "mentioned": 3, "positions": [2, 5, 1] },
    "gpt-4o-mini": { "probes": 4, "mentioned": 2, "positions": [4, 6] }
  },
  "top_competitors": [["Brand A", 12], ["Brand B", 8]]
}
```

### `POST /products/{product_id}/probe-llm`

Admin only. Body: `{ "models": ["claude-haiku-4-5", "gpt-4o-mini"] }` (optional — defaults to all enabled).

Fires a fresh probe matrix. Cost: ~$0.008 per full run.

**Response**:
```json
{
  "status": "completed",
  "probe_run_id": "uuid",
  "probe_count": 16,
  "models": ["claude-haiku-4-5", "gpt-4o-mini", "gemini-2.0-flash", "sonar"],
  "total_cost_usd": 0.008
}
```

---

## Endpoints — subject-scoped (brand / keyword + admin lookups)

### `POST /track`

Create a tracked subject without binding to a catalog product. Used for brand/keyword tracking.

**Body**:

```json
{
  "subject_type": "brand",
  "subject_label": "Flobali",
  "brand_name": "Flobali",
  "aliases": ["Flobali Tiles", "Flobali Hellas"],
  "sources_enabled": { "news": true, "blogs": true, "rss": true, "llm": true },
  "language_codes": ["en", "el"],
  "country_codes": ["GR"],
  "refresh_interval_hours": 24,
  "alert_on_spike": true,
  "alert_on_negative_sentiment": true,
  "run_first_refresh": true
}
```

### `GET / PUT / DELETE /track/{tracked_mention_id}`

Read / update / deactivate the row.

### `POST /track/{tracked_mention_id}/refresh`

Same as `/products/{id}/refresh` but for arbitrary subjects.

### `GET /track/{tracked_mention_id}/feed | history | summary | llm-visibility`

Same shapes as the product-scoped endpoints.

### `POST /track/{tracked_mention_id}/probe-llm`

Admin only. Fires a probe matrix.

### `POST /track/{tracked_mention_id}/exclude` / `/include`

Body: `{ "url": "https://...", "domain": "spammer.com", "reason": "..." }`. Either `url` or `domain` is required.

### `GET /track/{tracked_mention_id}/exclusions`

List exclusions for the subject.

### `POST /track/{tracked_mention_id}/promote`

Admin only. Body: `{ "url": "...", "override_relevance": "exact", "reason": "..." }`. Sticky override that survives future refreshes.

### `GET /track/{tracked_mention_id}/share-of-voice?days=30`

Aggregate competitor mention counts across all LLM probes for the subject.

```json
{
  "tracked_mention_id": "uuid",
  "competitor_mentions": [
    { "name": "Brand A", "count": 24 },
    { "name": "Brand B", "count": 12 }
  ]
}
```

---

## Cross-flow endpoints

### `POST /classifier-correction`

Body:
```json
{
  "mention_history_id": "uuid",
  "corrected_relevance": "mismatch",
  "corrected_sentiment": null,
  "correction_note": "wrong product family"
}
```

The most-recent corrections are prepended as few-shot examples to subsequent Haiku classifier calls.

### `POST /cron-refresh` — `x-cron-secret` only

Cron-target batch refresh. Calls `get_internal_tracked_mentions_due()` and runs `refresh()` on each due subject. Used by `mention-monitoring-cron` edge function.

### `POST /cron-probe-llm` — `x-cron-secret` only

Daily cron target. Calls `get_tracked_mentions_due_for_llm_probe()` and runs the LLM probe matrix on each subject whose last probe is older than 7 days.

---

## Data shapes

### `TrackedMention`

```ts
{
  id: string;
  api_key_id: string | null;        // XOR with product_id/brand_name
  product_id: string | null;
  brand_name: string | null;
  user_id: string | null;
  subject_type: 'product' | 'brand' | 'keyword';
  subject_label: string;
  aliases: string[];
  sources_enabled: Record<string, boolean>;
  source_config: Record<string, unknown>;  // { rss_feeds: [], probe_template_overrides: {} }
  language_codes: string[];
  country_codes: string[];
  subject_facets: Record<string, unknown> | null;  // cached Haiku facet decomposition
  refresh_interval_hours: number;
  velocity_score: number | null;
  consecutive_stable_refreshes: number;
  next_check_at: string | null;
  last_refreshed_at: string | null;
  total_credits_used: number;
  // Denormalized snapshot
  current_mention_count_7d: number;
  current_mention_count_30d: number;
  current_sentiment_avg: number | null;       // -1..1
  current_share_of_voice: number | null;
  current_top_outlets: Array<{ domain: string; count: number }> | null;
  current_metadata: Record<string, unknown> | null;
  current_snapshot_at: string | null;
  // Alerts
  alert_on_spike: boolean;
  alert_on_negative_sentiment: boolean;
  alert_on_new_outlet: boolean;
  alert_on_llm_visibility_change: boolean;
  alert_channels: string[];
  alert_webhook_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

### `MentionRow` (`mention_history`)

```ts
{
  id: string;
  tracked_mention_id: string;
  refresh_run_id: string;
  url: string;
  canonical_url: string | null;
  outlet_domain: string | null;
  outlet_name: string | null;
  outlet_type: 'news' | 'blog' | 'youtube' | 'forum' | 'llm' | 'rss' | 'aggregator' | 'other';
  title: string | null;
  excerpt: string | null;
  body_md: string | null;             // truncated 2KB
  language_code: string | null;
  country_code: string | null;
  author: string | null;
  published_at: string | null;
  discovered_at: string;
  // Classification
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  sentiment_score: number | null;     // -1..1
  relevance: 'exact' | 'tangential' | 'mismatch' | 'unverifiable' | null;
  relevance_score: number | null;
  match_note: string | null;
  // Engagement (when source provides)
  engagement: { upvotes?: number; comments?: number; views?: number } | null;
  // Sanity flags
  is_anomaly: boolean;
  anomaly_reason: string | null;
  manual_override: boolean;
  // Provenance
  source: 'dataforseo_news' | 'perplexity_sonar' | 'rss' | 'youtube';
  classifier_cached: boolean;
}
```

---

## Alerts

Four types, opt-in per tracked subject:

| Type | Detector |
|---|---|
| `mention_spike` | today's count ≥ 2× trailing 7d daily-average baseline (min baseline 1.0) |
| `negative_sentiment` | new mention with `sentiment='negative'` from outlet with `domain_authority ≥ 30` |
| `new_outlet` | first-ever mention from a domain |
| `llm_visibility_change` | average position across LLM probes shifts by ≥2 ranks W/W |

**Channels** (CHANNEL_CREDIT_COST):
- `bell`    → 0 cr (writes to `user_notifications`)
- `email`   → 1 cr (Resend via `email-api` edge function; templates seeded)
- `webhook` → 0 cr (per-subject `alert_webhook_url`)

**Dedupe**: 24h per `(alert_type, tracked_mention_id, outlet_domain)`.

**Webhook payload**:
```json
{
  "alert_type": "negative_sentiment",
  "title": "Negative mention from wirecutter.com",
  "body": "...",
  "product_id": "uuid|null",
  "tracked_mention_id": "uuid",
  "outlet_name": "Wirecutter",
  "outlet_domain": "wirecutter.com",
  "payload": { "url": "...", "title": "...", "sentiment_score": -0.6 },
  "fired_at": "2026-05-03T10:15:00Z"
}
```

---

## Required environment

On the MIVAA backend (systemd unit / Docker env):

| Var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Haiku classifier + facet decomposition + LLM probe |
| `PERPLEXITY_API_KEY` | Sonar / sonar-pro discovery |
| `DATAFORSEO_BASE64` (or `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD`) | News API |
| `YOUTUBE_DATA_API_KEY` | YouTube discovery (opt-in per subject) |
| `OPENAI_API_KEY` | gpt-4o-mini probe |
| `GEMINI_API_KEY` | gemini-2.0-flash probe |
| `CRON_SECRET` | shared with price-monitoring-cron; validates `x-cron-secret` header |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | bell + email + RPCs |

On Supabase Edge Function env:
- `PYTHON_BACKEND_URL` (e.g. `https://v1api.materialshub.gr`)
- `CRON_SECRET` (matches MIVAA's value)

---

## Cron schedule

| Job | Schedule (UTC) | Purpose |
|---|---|---|
| `mention-monitoring-refresh-hourly` | `30 * * * *` | Iterate due internal subjects, run discovery + classify + persist + alerts |
| `llm-mention-probe-daily` | `0 3 * * *` | Pick subjects whose last probe is >7d old, fire probe matrix |
| `mention-classifier-cache-prune` | `0 4 * * *` | Delete expired verdict-cache rows |

---

## Tables (post 2026-05-03)

- `tracked_mentions` — subject (XOR `api_key_id` / `product_id` / `brand_name`)
- `mention_history` — append-only rows per refresh
- `llm_mention_probes` — per-(template × model) probe attempts
- `mention_outlets` — outlet reputation cache (domain authority, type, country)
- `mention_classifier_verdict_cache` — 7d TTL cache keyed on content_hash + facets_hash
- `mention_promoted_urls` — sticky admin overrides
- `mention_excluded_urls` — per-subject URL/domain exclusions
- `mention_match_corrections` — classifier feedback loop (few-shot)
- `mention_alert_log` — alert audit + dedupe

## RPCs

- `get_internal_tracked_mentions_due(p_limit)`
- `get_tracked_mentions_due_for_llm_probe(p_limit, p_min_age_days)`
- `update_tracked_mention_cadence(p_tracked_mention_id, p_velocity_pct_change)`
- `append_mention_alert_log(...)`

---

## Out of scope for v1

- **Twitter/X**: too expensive ($200/mo for 10k tweets, basic tier).
- **TikTok**: ToS-hostile, no stable API.
- **Instagram / Facebook (mentions of you on others' pages)**: no public search.
- **YouTube transcripts**: opt-in per subject in v2 (multiplies cost significantly).
- **Auto-extracted color palettes from mention images**: deferred to v2.

## v2 follow-ups

- Curated outlet seed list with hand-rated domain authority.
- Self-healing extraction recipes for forum scrapes (mirrors `retailer_extraction_recipes`).
- Per-subject competitor co-mention graph view.
