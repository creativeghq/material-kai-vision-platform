# Public Tools API

Unauthenticated lead-gen API that backs the `/tools` page. Lets any visitor type a product or brand name and receive live retailer prices + recent press mentions, with no signup required.

**Base URL:** `https://v1api.materialshub.gr`
**OpenAPI tag**: `Public Tools`
**Interactive docs**: `GET https://v1api.materialshub.gr/docs` — filter by tag
**Machine-readable spec**: `GET https://v1api.materialshub.gr/openapi.json`

All paths below are relative to this host (e.g. `POST /api/v1/public/price-scan` → `POST https://v1api.materialshub.gr/api/v1/public/price-scan`).

---

## Changelog

### v1.0 — 2026-05-23

- 🚀 **Initial release**. Three endpoints under `/api/v1/public`:
  - `GET /quota` — current quota status + Turnstile site key
  - `POST /price-scan` — stateless price discovery
  - `POST /mention-scan` — stateless mention discovery
- 🛡 **Cloudflare Turnstile** required on every scan endpoint.
- 📊 **2 total scans/day per IP** (combined across scan types).
- 💾 **24h result cache** keyed on `(query_hash, scan_type)` — identical queries serve instantly without burning quota or upstream credits.

---

## Authentication

**No authentication required.** All endpoints are public.

If an optional `Authorization: Bearer <jwt>` header IS supplied (Supabase session token), the quota is keyed on `user_id` instead of `ip_address`. This is useful behind shared IPs (offices, co-working spaces, mobile carriers) so users don't penalize each other.

```http
# Anonymous (quota keyed on IP)
POST /api/v1/public/price-scan
Content-Type: application/json

# Signed-in (quota keyed on user_id)
POST /api/v1/public/price-scan
Authorization: Bearer eyJhbGciOi...
Content-Type: application/json
```

---

## Bot defense — Cloudflare Turnstile

Every POST request must include a fresh Turnstile token in `turnstile_token`. Tokens are single-use; the frontend widget reissues a new one after each scan via `turnstile.reset()`.

**Server-side verification flow:**
1. Page loads → `GET /quota` returns `turnstile_site_key`.
2. Frontend renders the Turnstile widget with that site key + an `action` label (`price_scan` or `mention_scan`).
3. User completes the challenge → widget callback fires with a token.
4. Frontend includes the token in the scan POST body.
5. Backend POSTs `{secret, response, remoteip}` to `https://challenges.cloudflare.com/turnstile/v0/siteverify`.
6. Action label must match the one bound to the token (`expected_action` check). Mismatch → 400.

**Failure modes:**
- Missing or empty `turnstile_token` → `400 captcha verification failed: missing-input-response`
- `TURNSTILE_SECRET_KEY` not configured server-side → fail-closed `400 configuration_error`
- Token used twice → `400 captcha verification failed: timeout-or-duplicate`
- Network failure to Cloudflare → `400 captcha verification failed: network_error`

---

## Quota

**2 scans/day, combined across price + mention**, per IP (or per `user_id` when signed in).

- **Cache hits do NOT consume quota.** A repeat query within 24h is served from `public_lookup_cache` without touching upstream APIs or the quota counter.
- **Failed scans do NOT consume quota.** Captcha-failed, rate-limited, and errored attempts are logged but not counted toward the daily cap. Only `outcome='success'` rows in `public_lookup_log` count.
- **Reset window is rolling 24h**, not calendar-day. `reset_at` in the response = when the oldest successful scan in the trailing 24h window ages out.

When the limit is reached, all scan endpoints return `429 Too Many Requests` with:

```json
{
  "detail": {
    "message": "Daily scan quota reached.",
    "quota": {
      "used": 2,
      "remaining": 0,
      "limit": 2,
      "reset_at": "2026-05-24T14:23:01+00:00",
      "turnstile_site_key": "0x4AAAAAAA...",
      "is_authenticated": false
    }
  }
}
```

The frontend uses this to render the `UpsellCard` with "Create free account" + "See credit packs" CTAs.

---

## Endpoints

### `GET /api/v1/public/quota`

Returns current quota state. Cheap (single DB query). Called by the frontend on page load to render the widget and the quota chip.

**Response 200:**

```json
{
  "used": 1,
  "remaining": 1,
  "limit": 2,
  "reset_at": "2026-05-24T14:23:01+00:00",
  "turnstile_site_key": "0x4AAAAAAA-publicSiteKey",
  "is_authenticated": false
}
```

Note: `turnstile_site_key` is `null` until the operator configures it (see Configuration section below). The frontend renders a "Loading bot check…" placeholder when null, so the page is harmless before keys land.

---

### `POST /api/v1/public/price-scan`

One-shot price discovery. Calls Perplexity Sonar + DataForSEO Shopping + Firecrawl verification (same engine as the authenticated `/market-check` endpoint, minus persistence).

**Request body:**

```json
{
  "turnstile_token": "0.abc...",
  "product_name": "Hansgrohe Talis E single-lever basin mixer",
  "manufacturer": "Hansgrohe",
  "dimensions": null,
  "country_code": "DE"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `turnstile_token` | string | ✅ | Fresh Cloudflare Turnstile token. Single-use. Bound to `action: 'price_scan'`. |
| `product_name` | string (2–200 chars) | ✅ | Free-form query. The backend prepends `manufacturer` if it's not already in the query. |
| `manufacturer` | string (≤120) | optional | Helps disambiguation; passed as `manufacturer_hint` to Perplexity. |
| `dimensions` | string (≤80) | optional | Appended to the search query. |
| `country_code` | ISO 2-letter | optional | Biases retailer geography in Perplexity `user_location`. |

**Response 200:**

```json
{
  "success": true,
  "query": "Hansgrohe Talis E single-lever basin mixer",
  "country_code": "DE",
  "results": [
    {
      "retailer_name": "Hansgrohe Onlineshop",
      "product_url": "https://www.hansgrohe.de/produkte/talis-e-71710000",
      "price": 189.00,
      "original_price": null,
      "currency": "EUR",
      "availability": "in_stock",
      "verified": true,
      "source": "perplexity",
      "product_title": "Talis E Single-Lever Basin Mixer 110",
      "match_kind": "exact"
    }
  ],
  "stats": {
    "count": 7,
    "verified_count": 5,
    "min": 159.00,
    "max": 215.50,
    "median": 189.00,
    "currency": "EUR"
  },
  "summary": null,
  "from_cache": false,
  "quota": {
    "used": 1,
    "remaining": 1,
    "limit": 2,
    "reset_at": "2026-05-24T14:23:01+00:00",
    "turnstile_site_key": "0x4AAAAAAA...",
    "is_authenticated": false
  }
}
```

**Response fields:**
- `from_cache` — `true` if served from the 24h cache (didn't consume quota; didn't spend upstream credits).
- `stats` — aggregate of `results[]` with a non-null price.
- `quota` — post-scan quota state (so the frontend doesn't need a separate `/quota` round trip).

**Error responses:**
- `400` — Captcha verification failed (see `detail` for the Cloudflare error code).
- `400` — Validation error (product name too short, etc.).
- `429` — Quota exceeded. Response body includes the full quota object.
- `502` — Upstream (Perplexity/DataForSEO/Firecrawl) failed. Try again in a few minutes.

---

### `POST /api/v1/public/mention-scan`

One-shot mention discovery. Calls DataForSEO News + Perplexity Sonar (web mode) and returns recent mentions + top outlets. **Deterministic facet build** — no Anthropic / Haiku call on the public path, so the public surface stays cheap and independent of Anthropic key availability.

**Request body:**

```json
{
  "turnstile_token": "0.abc...",
  "subject_label": "Geberit AquaClean Mera",
  "aliases": ["AquaClean Mera", "Mera Comfort"],
  "country_code": "CH"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `turnstile_token` | string | ✅ | Bound to `action: 'mention_scan'`. |
| `subject_label` | string (2–200 chars) | ✅ | Brand or product name to monitor. |
| `aliases` | string[] (≤10 items) | optional | Alternative spellings or local-language versions. Used as additional `must_have_tokens` for matching. |
| `country_code` | ISO 2-letter | optional | Restricts news geography. |

**Response 200:**

```json
{
  "success": true,
  "subject_label": "Geberit AquaClean Mera",
  "country_code": "CH",
  "results": [
    {
      "url": "https://www.architonic.com/en/product/geberit-aquaclean-mera/...",
      "title": "Geberit AquaClean Mera 2026 launch",
      "excerpt": "Geberit announced the next generation of its premium shower toilet…",
      "outlet_domain": "architonic.com",
      "outlet_name": "Architonic",
      "published_at": "2026-05-12T08:14:00+00:00",
      "source": "dataforseo_news",
      "language_code": "en",
      "country_code": "CH"
    }
  ],
  "total_results": 8,
  "top_outlets": [
    { "domain": "architonic.com", "count": 3 },
    { "domain": "designboom.com", "count": 2 }
  ],
  "from_cache": false,
  "quota": { "used": 2, "remaining": 0, "limit": 2, "reset_at": "...", "turnstile_site_key": "...", "is_authenticated": false }
}
```

**Error responses:** Same shape as `/price-scan`.

---

## Caching behaviour

Every scan request computes a `query_hash = sha1(scan_type | normalized_query | country_code)` where `normalized_query` is the lowercase / whitespace-collapsed input.

- **Cache write** happens on every successful upstream scan.
- **Cache TTL** is 24 hours.
- **Cache hit** returns `from_cache: true` and serves the previous response verbatim (with refreshed `quota` field).
- **Cache hits do NOT count toward quota**. This means a public scraper hammering the same query gets one upstream call per 24h, no matter how many requests they fire.

The `public_lookup_cache.hit_count` column is bumped on every hit for cost-savings analytics.

---

## Rate-limit handling

When `quota.remaining === 0`:

1. Server returns `429` with the `detail.quota` object embedded.
2. Frontend displays the `UpsellCard` with two CTAs:
   - **Create free account** → `/auth?mode=signup` (path to higher quota on the authenticated tier — implementation pending).
   - **See credit packs** → `/auth?mode=signup&redirect=/billing` (path to paid credits — `/billing` page pending).
3. After signup + redirect, signed-in users hit the same endpoints with `Authorization: Bearer <jwt>`. The quota is now keyed on `user_id` and (in v1.0) inherits the same 2/day cap. Authenticated higher quotas / credit-debit beyond 2/day is a tracked follow-up.

---

## Configuration

### Cloudflare Turnstile keys

Both keys live in the `platform_secrets` table as **platform-wide** entries (no `primary_module_slug`) and surface in the admin UI at **`/admin/operations → Keys`**.

| Key | Sensitive | Where used | Source priority |
|---|---|---|---|
| `TURNSTILE_SITE_KEY` | ❌ public | Returned by `GET /quota` → frontend widget | env-first / DB-fallback |
| `TURNSTILE_SECRET_KEY` | ✅ secret | Server-side `siteverify` call | env-first / DB-fallback |

**Where to deploy them:**

1. **MIVAA env (preferred, production)** — add to `mivaa-pdf-extractor/.github/workflows/deploy.yml` `Environment=` lines on the systemd unit. Same pattern as `PERPLEXITY_API_KEY`, `FIRECRAWL_API_KEY`, `DATAFORSEO_BASE64`. Env always wins over DB. Takes effect on next deploy.

2. **`/admin/operations → Keys`** — paste values into the secrets manager UI. The Python backend's `platform_secret_resolver.py` reads the DB row with a 30s cache, so changes take effect within 30 seconds without a redeploy. Use this for emergency rotation when a redeploy isn't immediately practical.

Both keys are consumed exclusively by the **Python MIVAA backend**, not by Supabase edge functions. The Turnstile widget script is loaded directly from `https://challenges.cloudflare.com/turnstile/v0/api.js` on the frontend; the `siteverify` call is made server-side by [turnstile_verifier.py](../mivaa-pdf-extractor/app/services/integrations/turnstile_verifier.py).

**To obtain the keys:**

1. Visit https://dash.cloudflare.com/?to=/:account/turnstile (free tier — 1M verifications/month).
2. Click **Add Site**. Pick **Managed** mode (invisible challenges on most traffic, checkbox on suspicious).
3. Add the production domain(s) (e.g. `app.materialshub.gr`).
4. Copy the **Site Key** → `TURNSTILE_SITE_KEY`.
5. Copy the **Secret Key** → `TURNSTILE_SECRET_KEY`.

**Until both keys are set:**
- `GET /quota` returns `turnstile_site_key: null`.
- The frontend renders a "Loading bot check…" placeholder and the scan button stays disabled.
- All scan endpoints fail closed with `400 configuration_error`.

The page is harmless before keys land. Set them, redeploy (or wait 30s for DB fallback), and the widget appears.

---

## Data model

### `public_lookup_log` (analytics + quota source)

One row per scan attempt — cache hit or miss, success or failure.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `scan_type` | text | `'price'` or `'mention'` |
| `ip_address` | inet | Resolved from `cf-connecting-ip` → `x-forwarded-for` → `request.client.host` |
| `user_id` | uuid | Set when Bearer JWT was provided + validated |
| `query_hash` | text | sha1 stable hash |
| `query_text` | text | Truncated to 500 chars |
| `cache_hit` | bool | `true` if served from cache |
| `upstream_cost_usd` | numeric(10,6) | Sum of upstream API costs (Perplexity + DataForSEO + Firecrawl + Haiku) |
| `latency_ms` | int | End-to-end wall time |
| `outcome` | text | `'success'` / `'failed'` / `'rate_limited'` / `'captcha_failed'` |
| `error_message` | text | Truncated to 500 chars |
| `user_agent` | text | Truncated to 500 chars |
| `created_at` | timestamptz | default now() |

**Indexes:**
- `(ip_address, created_at desc)` partial WHERE `ip_address IS NOT NULL` — quota query
- `(user_id, created_at desc)` partial WHERE `user_id IS NOT NULL` — quota query for signed-in users
- `(created_at desc)` — general analytics

**RLS:**
- Read: admin / super_admin only.
- Write: service role only (no client-direct writes).

### `public_lookup_cache` (24h result cache)

| Column | Type | Notes |
|---|---|---|
| `query_hash` | text | PK part 1 |
| `scan_type` | text | PK part 2 |
| `result` | jsonb | Cached response payload (minus `quota` field) |
| `hit_count` | int | Bumped on every cache hit |
| `created_at` | timestamptz | When the cache was first written |
| `expires_at` | timestamptz | `created_at + 24h` |

**Cleanup:** pg_cron `public-lookup-cleanup-daily` runs daily at 04:15 UTC and deletes `WHERE expires_at < now()` plus log rows older than 30d.

---

## Cost model

Per-scan upstream COGS (typical):

| Upstream | Price scan | Mention scan |
|---|---|---|
| Perplexity Sonar | ~$0.005 | ~$0.005 |
| DataForSEO Merchant / News | ~$0.0006 | ~$0.0006 |
| Firecrawl verification (5–10 URLs) | ~$0.005–$0.015 | n/a |
| Haiku classification | n/a (skipped on public path) | n/a (skipped on public path) |
| **Total per scan** | **~$0.010–$0.020** | **~$0.005–$0.010** |

Worst-case ceiling per IP per year: `2 scans/day × 365 days × $0.020 = ~$15/IP/year`. Realistically much lower because most queries are repeats hitting the 24h cache.

The visitor pays nothing on the free tier. Authenticated users who exceed 2/day pay credits (implementation pending — see follow-ups).

---

## Implementation files

- **Route**: [`mivaa-pdf-extractor/app/api/public_tools_routes.py`](../mivaa-pdf-extractor/app/api/public_tools_routes.py)
- **Quota + cache service**: [`mivaa-pdf-extractor/app/services/integrations/public_lookup_service.py`](../mivaa-pdf-extractor/app/services/integrations/public_lookup_service.py)
- **Turnstile verifier**: [`mivaa-pdf-extractor/app/services/integrations/turnstile_verifier.py`](../mivaa-pdf-extractor/app/services/integrations/turnstile_verifier.py)
- **Env-first / DB-fallback secret resolver**: [`mivaa-pdf-extractor/app/services/integrations/platform_secret_resolver.py`](../mivaa-pdf-extractor/app/services/integrations/platform_secret_resolver.py)
- **Frontend service**: [`src/services/publicToolsService.ts`](../src/services/publicToolsService.ts)
- **Frontend pages**: [`src/pages/Tools/ToolsHubPage.tsx`](../src/pages/Tools/ToolsHubPage.tsx) (the hub), [`PriceScanPage.tsx`](../src/pages/Tools/PriceScanPage.tsx), [`MentionScanPage.tsx`](../src/pages/Tools/MentionScanPage.tsx). The single `PublicToolsPage.tsx` this doc originally named was split into one page per tool.
- **Turnstile widget**: [`src/components/features/turnstile/TurnstileWidget.tsx`](../src/components/features/turnstile/TurnstileWidget.tsx)
- **Route registration**: [`src/App.tsx`](../src/App.tsx) — outside `<AuthGuard>`

---

## Follow-ups (not shipped in v1.0)

1. **`/billing` credit-packs page**. The upsell links there but the page doesn't exist yet. Stripe checkout + credit balance display.
2. **Higher authenticated quota + credit-debit beyond free tier**. Signed-in users currently inherit the same 2/day cap. Should become "X free / day on signup, then N credits per scan".
3. **Per-IP analytics page under `/admin/operations`**. Data is in `public_lookup_log` (scan volume, cost per IP, cache hit rate). UI pending.
4. **Admin cache invalidation tool**. Operator-driven flush by query or by `scan_type` when a query goes stale before the 24h TTL (e.g. a retailer relaunches with new pricing).
5. **Vision-attached scans**. Today the scan is text-only. Could accept a product image (multipart upload) → call MIVAA's visual search to identify the product → run the price/mention scan on the identified label. Higher conversion potential as a lead-gen demo.
