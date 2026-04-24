# Price Monitoring Public API

External integration reference for the price lookup + price tracking endpoints.

**Base URL:** `https://v1api.materialshub.gr`

All paths below are relative to this host (e.g. `POST /api/v1/prices/track` → `POST https://v1api.materialshub.gr/api/v1/prices/track`).

---

## Authentication

Every request authenticates with a Bearer token from the `api_keys` table.

```http
Authorization: Bearer kai_<32-char-alphanumeric>
```

### How to get a key

1. Sign in at `/profile?tab=subscription`
2. Click **+ Generate Key**, name it (e.g. `price-integration-prod`)
3. Copy the value once — it's not shown in full again
4. Paste into your consumer project as `BEARER_TOKEN` or equivalent

### Key settings (per row in `api_keys`)

| Column | Default | Notes |
|---|---|---|
| `is_active` | `true` | Set to `false` via the Profile UI or `UPDATE` to revoke immediately |
| `rate_limit_override` | `null` (60 req/min) | Override to 1–600 per minute if you need higher throughput |
| `allowed_endpoints` | `null` (all) | Optional array of path prefixes to scope the key |
| `expires_at` | `null` (never) | Optional ISO timestamp |

### Revoking a key

Either set `is_active = false` (soft) or delete the row entirely (hard). **Deleting the row CASCADEs out every `tracked_queries` row + every `tracked_query_price_history` row that was created with that key.** This is by design — revoking a leaked key wipes the data it produced.

---

## Endpoints

| # | Method | Path | Purpose |
|---|---|---|---|
| 1 | `POST` | `/api/v1/prices/lookup` | Stateless one-shot price lookup (URL or search query) |
| 2 | `POST` | `/api/v1/prices/track` | Register a tracked query, get initial results |
| 3 | `GET` | `/api/v1/prices/track` | List all tracked queries owned by this key |
| 4 | `GET` | `/api/v1/prices/track/{id}` | Get one tracked query + latest results |
| 5 | `GET` | `/api/v1/prices/track/{id}/history` | Full price-point history |
| 6 | `PUT` | `/api/v1/prices/track/{id}` | Update cadence / country / preferred retailers |
| 7 | `POST` | `/api/v1/prices/track/{id}/refresh` | Force refresh now (bypasses cadence) |
| 8 | `DELETE` | `/api/v1/prices/track/{id}` | Stop tracking (soft delete — keeps history) |

---

## 1. Stateless lookup — `POST /api/v1/prices/lookup`

One-shot. Not stored as a tracked query. Two modes; pass exactly one of `url` or `search_query`.

### Mode A — URL (Firecrawl)

Scrape one specific product page.

```bash
curl -X POST https://v1api.materialshub.gr/api/v1/prices/lookup \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://youbath.gr/shop/keros-ferrara-beige-60x120/",
    "product_name": "Keros Ferrara Beige 60x120",
    "use_javascript_render": false
  }'
```

Response:
```json
{
  "success": true,
  "source": "firecrawl_url",
  "price": 25.0,
  "currency": "EUR",
  "availability": "out_of_stock",
  "shipping_cost": null,
  "product_name": "Keros Ferrara Beige 60×120 – Πλακάκι δαπέδου γρανίτη",
  "scraped_at": "2026-04-24T07:01:15.799Z",
  "credits_used": 1,
  "latency_ms": 5013,
  "results": null,
  "query": null
}
```

### Mode B — Search query (Perplexity Sonar)

Find retailers across the web. Up to 25 results, sorted cheapest first.

```bash
curl -X POST https://v1api.materialshub.gr/api/v1/prices/lookup \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "search_query": "Ferrara Beige Keros",
    "dimensions": "60x120",
    "country_code": "GR",
    "limit": 20
  }'
```

Response:
```json
{
  "success": true,
  "source": "claude_web_search",
  "query": "Ferrara Beige Keros",
  "results": [
    {
      "retailer_name": "leffetto.gr",
      "product_url": "https://leffetto.gr/product/ferrara-beige-60x120cm/",
      "price": 21.4,
      "currency": "EUR",
      "price_unit": "m2",
      "availability": "in_stock",
      "city": "Athens",
      "ships_from_abroad": false,
      "is_quote_only": false,
      "last_verified": "2026-04-24",
      "notes": null
    }
    // ... up to 20 more
  ],
  "summary": "Multiple Greek retailers offer the Ferrara Beige Keros 60x120 at competitive prices starting from €21.40/m²...",
  "credits_used": 2,
  "latency_ms": 6196,
  "scraped_at": "2026-04-24T07:02:45.100Z",
  "price": null,
  "currency": null
}
```

| Field | Type | Notes |
|---|---|---|
| `url` | string (URL) | URL mode — mutually exclusive with `search_query` |
| `search_query` | string | Search mode — mutually exclusive with `url` |
| `dimensions` | string (optional) | Size spec, e.g. `"60x120"` or `"120 cm"`. Appended to the query |
| `country_code` | ISO-3166 α-2 (optional) | `GR`, `DE`, `GB`, etc. Biases Perplexity toward local retailers |
| `product_name` | string (optional) | Hint for URL mode to pick the main product on a multi-item page |
| `use_javascript_render` | boolean (default false) | URL mode only. Adds 3s wait + longer timeout. Costs ~2 extra credits |
| `limit` | int 1–25 (default 10) | Search mode only. Max retailers to return |
| `verify_prices` | boolean (default `true`) | Search mode only. When `true`, every hit is re-fetched via Firecrawl to confirm the price on the live page. Adds latency (~N × 1–3s parallel) and ~1 credit per hit, but eliminates LLM-hallucinated prices. Set `false` for speed-over-accuracy workloads. |

### Result fields (search mode)

Each entry in `results` now carries the verification + promo fields:

| Field | Type | Notes |
|---|---|---|
| `price` | number \| null | Current numeric price. When `verified: true` this is the price Firecrawl read from the live page. |
| `original_price` | number \| null | On-page "was" price if the retailer displays a promo (e.g. `€89` strikethrough → `€79`). `null` if no markdown is shown. Do NOT assume — only set when the retailer displays both values. |
| `currency` | string \| null | ISO 4217 currency code (`EUR`, `USD`, `GBP`, …). |
| `availability` | `in_stock` \| `out_of_stock` \| `limited` \| `unknown` | Out-of-stock listings **are included** as long as a numeric price is printed on the page. |
| `verified` | boolean | `true` if Firecrawl fetched the retailer URL and confirmed the price. `false` when verification was skipped or the page couldn't be re-fetched. Treat `verified: false` rows as indicative only. |
| `source` | `perplexity` \| `dataforseo` | Which engine surfaced this retailer. |
| `notes` | string \| null | Free-form. Includes discrepancy flags when Firecrawl's price differed by >20% from the LLM's snippet price (e.g. `"verify: was perplexity=€45.00, actual on page=€54.90"`). |
| `last_verified` | string (ISO date) | Date Firecrawl confirmed the price. `null` when `verified: false`. |
| `image_url`, `rating_value`, `rating_votes` | (DataForSEO only) | Thumbnail + merchant star rating from the Google Shopping feed. |

### Rate limit

Default **60 requests/minute** per key. 429 response if exceeded, with `Retry-After: 60`.

### Billing

| Source | Cost per call |
|---|---|
| `firecrawl_url` | ~1 Firecrawl credit (≈ $0.01) |
| `claude_web_search` (Perplexity under the hood) | ~2 platform credits (≈ $0.02) |

Every call writes a row to `price_lookups` (tables in Supabase) with `api_key_id`, inputs, results, credits, latency. Use that for audit.

---

## 2. Register a tracked query — `POST /api/v1/prices/track`

Register a product for ongoing price tracking. The first refresh runs **synchronously** and the response contains the initial results. Subsequent refreshes happen automatically on your `refresh_interval_hours` cadence via our cron.

```bash
curl -X POST https://v1api.materialshub.gr/api/v1/prices/track \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "search_query": "Ferrara Beige Keros",
    "dimensions": "60x120",
    "country_code": "GR",
    "manufacturer": "Keros Ceramica",
    "preferred_retailer_domains": ["youbath.gr", "fshome.gr"],
    "refresh_interval_hours": 12,
    "verify_prices": true
  }'
```

**201 Created:**
```json
{
  "tracking_id": "220f05d1-eca7-45e6-af9c-d2ca1370fb2d",
  "search_query": "Ferrara Beige Keros",
  "dimensions": "60x120",
  "country_code": "GR",
  "manufacturer": "Keros Ceramica",
  "preferred_retailer_domains": ["youbath.gr", "fshome.gr"],
  "refresh_interval_hours": 12,
  "verify_prices": true,
  "last_refreshed_at": "2026-04-24T07:01:15.799Z",
  "last_error": null,
  "is_active": true,
  "total_credits_used": 14,
  "created_at": "2026-04-24T07:01:04.300Z",
  "results": [
    {
      "retailer_name": "leffetto.gr",
      "product_url": "https://leffetto.gr/product/ferrara-beige-60x120cm/",
      "price": 21.4,
      "original_price": null,
      "currency": "EUR",
      "price_unit": "m2",
      "availability": "in_stock",
      "city": "Athens",
      "ships_from_abroad": false,
      "verified": true,
      "notes": null,
      "scraped_at": "2026-04-24T07:01:15.799Z"
    },
    {
      "retailer_name": "youbath.gr",
      "product_url": "https://youbath.gr/shop/keros-ferrara-beige-60x120/",
      "price": 25.0,
      "original_price": 32.0,
      "currency": "EUR",
      "price_unit": "m2",
      "availability": "out_of_stock",
      "city": null,
      "ships_from_abroad": false,
      "verified": true,
      "notes": "verify: was perplexity=€28.50, actual on page=€25.00",
      "scraped_at": "2026-04-24T07:01:15.799Z"
    }
    // …
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `search_query` | string, required | Product name, e.g. `"Ferrara Beige Keros"` |
| `dimensions` | string (optional) | Size spec |
| `country_code` | ISO-3166 α-2 (optional) | Biases Perplexity toward local retailers |
| `manufacturer` | string (optional) | Disambiguates generic product names |
| `preferred_retailer_domains` | string[] (optional, max 10) | Forces Perplexity to probe these domains too. Closes retailer-coverage gaps |
| `refresh_interval_hours` | int 1–720, default 24 | How often our cron re-runs the query. 1h minimum, 30d maximum |
| `verify_prices` | boolean (default `true`) | Persists on the tracked query row. Every refresh (initial + cron) will re-fetch each retailer URL via Firecrawl to confirm the price on the live page. Set to `false` if you value refresh speed / cost over accuracy. Can be toggled later via `PUT`. |

**Caveat**: the initial POST blocks for ~15–30 seconds while Perplexity runs (or ~30–60 seconds when `verify_prices: true`, because Firecrawl verifies each hit in parallel). If your integration needs a non-blocking path, create the tracked query with `refresh_interval_hours: 1`, ignore the initial results, and `GET` a minute later.

---

## 3. List tracked queries — `GET /api/v1/prices/track`

```bash
curl https://v1api.materialshub.gr/api/v1/prices/track \
  -H "Authorization: Bearer $KEY"
```

Optional query params: `include_inactive=true` (default false), `limit=100` (max 500).

Returns an array of tracked queries **owned by the key in the request**. Other keys' queries are invisible.

---

## 4. Get one tracked query — `GET /api/v1/prices/track/{tracking_id}`

```bash
curl https://v1api.materialshub.gr/api/v1/prices/track/220f05d1-eca7-45e6-af9c-d2ca1370fb2d \
  -H "Authorization: Bearer $KEY"
```

Returns the tracked query row + the **latest refresh's retailer results** (cheapest first).

- `404` if `tracking_id` doesn't exist
- `403` if the key doesn't own it

---

## 5. Full history — `GET /api/v1/prices/track/{tracking_id}/history`

```bash
curl "https://v1api.materialshub.gr/api/v1/prices/track/$TID/history?limit=200" \
  -H "Authorization: Bearer $KEY"
```

Returns an array of every retailer-price-point captured across all refresh runs, newest first. Useful for charting price drift over time.

Each entry:
```json
{
  "scraped_at": "2026-04-24T07:01:15.799Z",
  "refresh_run_id": "7b9f...",
  "retailer_name": "leffetto.gr",
  "product_url": "https://leffetto.gr/product/ferrara-beige-60x120cm/",
  "price": 21.4,
  "original_price": null,
  "verified": true,
  "currency": "EUR",
  "price_unit": "m2",
  "availability": "in_stock",
  "city": "Athens"
}
```

`original_price` and `verified` are populated on refreshes run after 2026-04-25 (the verification release). Older history rows have `original_price: null` and `verified: false` — that doesn't mean the price was wrong at the time, just that verification wasn't available yet.

---

## 6. Update — `PUT /api/v1/prices/track/{tracking_id}`

Change cadence, country, or preferred retailers. All fields optional; only the ones you send are updated.

```bash
curl -X PUT https://v1api.materialshub.gr/api/v1/prices/track/$TID \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_interval_hours": 6,
    "preferred_retailer_domains": ["youbath.gr", "fshome.gr", "artiles.gr"],
    "verify_prices": false
  }'
```

Accepted fields: `refresh_interval_hours`, `country_code`, `preferred_retailer_domains`, `dimensions`, `manufacturer`, `verify_prices`. All optional — only fields present in the body are updated.

Returns the full tracked-query row post-update.

---

## 7. Force refresh — `POST /api/v1/prices/track/{tracking_id}/refresh`

Run Perplexity *now*, regardless of when the last refresh happened.

```bash
curl -X POST https://v1api.materialshub.gr/api/v1/prices/track/$TID/refresh \
  -H "Authorization: Bearer $KEY"
```

Response:
```json
{
  "tracking_id": "220f05d1-eca7-45e6-af9c-d2ca1370fb2d",
  "status": "refreshed",
  "credits_used": 2,
  "latency_ms": 5192,
  "results": [ /* retailer rows */ ],
  "summary": "Multiple Greek retailers offer…"
}
```

`status` values: `refreshed` | `throttled` | `inactive` | `error` | `not_found`. `force` always wins unless the tracking is inactive.

Respects per-key rate limits. Use sparingly — normal cadence is always cheaper.

---

## 8. Stop tracking — `DELETE /api/v1/prices/track/{tracking_id}`

```bash
curl -X DELETE https://v1api.materialshub.gr/api/v1/prices/track/$TID \
  -H "Authorization: Bearer $KEY"
```

```json
{ "success": true, "tracking_id": "220f05d1-…", "is_active": false }
```

**Soft delete**. Row + history preserved; cron stops refreshing. To permanently wipe, delete the `api_keys` row that created it — CASCADEs everything.

---

## Error codes

| Status | Meaning | Common causes |
|---|---|---|
| `400` | Bad request | Both `url` and `search_query` on `/lookup`, or neither. `refresh_interval_hours` out of range (1–720). |
| `401` | Unauthorized | Missing / empty / expired / revoked Bearer token |
| `403` | Forbidden | Key exists but `allowed_endpoints` doesn't include `/api/v1/prices/lookup` or `/track`. Or `tracking_id` owned by a different key. |
| `404` | Not found | `tracking_id` doesn't exist |
| `429` | Rate limited | Exceeded `rate_limit_override` (default 60/min). Respect `Retry-After: 60` |
| `500` | Upstream failure | Perplexity API down, Firecrawl timeout, DB unavailable. Safe to retry after backoff |

Every error returns JSON:
```json
{ "detail": "Human-readable reason" }
```

---

## Integration recipes

### TypeScript / Node (fetch)

```ts
const BASE = process.env.PRICE_API_BASE_URL!;
const KEY  = process.env.PRICE_API_KEY!;

async function track(searchQuery: string, opts: { country_code?: string; dimensions?: string; refresh_interval_hours?: number } = {}) {
  const res = await fetch(`${BASE}/api/v1/prices/track`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ search_query: searchQuery, ...opts }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

// Usage
const tracked = await track('Ferrara Beige Keros', {
  dimensions: '60x120', country_code: 'GR', refresh_interval_hours: 12,
});
console.log(`Got ${tracked.results.length} initial retailers`);
```

### Python (httpx)

```python
import httpx, os

BASE = os.environ["PRICE_API_BASE_URL"]
KEY  = os.environ["PRICE_API_KEY"]

async def track(search_query: str, **opts):
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{BASE}/api/v1/prices/track",
            headers={"Authorization": f"Bearer {KEY}"},
            json={"search_query": search_query, **opts},
        )
        resp.raise_for_status()
        return resp.json()

tracked = await track("Ferrara Beige Keros", dimensions="60x120", country_code="GR")
```

### curl quickstart

```bash
export KEY=kai_your_key_here
export BASE=https://your-mivaa-host

# 1. Register + get initial results
curl -sX POST "$BASE/api/v1/prices/track" \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"search_query":"Ferrara Beige Keros","dimensions":"60x120","country_code":"GR","refresh_interval_hours":12}' | jq .

# 2. Check results later (no cost — just DB read)
curl -s "$BASE/api/v1/prices/track/$TID" -H "Authorization: Bearer $KEY" | jq .results

# 3. Full history for charting
curl -s "$BASE/api/v1/prices/track/$TID/history?limit=500" -H "Authorization: Bearer $KEY" | jq .

# 4. Adjust cadence later
curl -sX PUT "$BASE/api/v1/prices/track/$TID" \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"refresh_interval_hours":6}' | jq .

# 5. Stop tracking
curl -sX DELETE "$BASE/api/v1/prices/track/$TID" -H "Authorization: Bearer $KEY"
```

---

## FAQ

**Q: What does "quote-only" mean and why do those rows never appear?**
A: When a retailer page shows "Price on request" / "Contact for quote" with no visible number, we skip it. If a retailer publishes €25/m² but the item is out of stock, we include it with `availability: "out_of_stock"`. That's a deliberate filter — quote-only rows are noise for price comparison.

**Q: Does `preferred_retailer_domains` force those exact domains into the results?**
A: It passes them as Perplexity's `search_domain_filter`, which forces Perplexity to probe those sites. It doesn't guarantee they'll appear in the final list — if the retailer's page for the product doesn't rank or doesn't have a visible price, Perplexity may still exclude it. Best used when you *know* a specific retailer carries the product and want to pin them.

**Q: Can I get alerts when a price drops?**
A: Not in this API. Alerts are part of the internal platform's price-monitoring feature for logged-in users. For your external project, poll `GET /api/v1/prices/track/{id}/history` and compute deltas on your side.

**Q: How is this billed?**
A: Each Perplexity refresh logs to `ai_usage_logs` with `api_provider: "perplexity"` tagged to your `workspace_id`. Each Firecrawl scrape similarly logged as `operation_type: "scrape"`. Check your platform's usage dashboard for spend.

**Q: What does `verified: true` actually mean — and why would I turn it off?**
A: When `verify_prices` is `true` (default), we take each retailer URL the LLM / Shopping feed surfaced and actually fetch it through Firecrawl to read the price off the rendered page. This is the single biggest accuracy improvement in the system — LLMs will occasionally hallucinate a lower price from stale training data or misread a related-product price. The cost: **~3× total credits per refresh** (1 Perplexity + ~N Firecrawl scrapes, where N is the number of hits) and **~30s extra latency on the synchronous POST**. Turn it off if you need the cheaper/faster path and can tolerate stale prices — e.g. rough market-coverage surveys where exact figures don't matter.

**Q: What's `original_price` and when should I display it?**
A: It's the retailer's own "was" price shown next to a promo (e.g. `€89` strikethrough, `€79` current). Only populated when the retailer prints both values on the page. Display it as strikethrough next to `price` to communicate the discount. Never infer it from price history — that's tracked separately in `/history`.

**Q: When `verified: false` what does that mean exactly?**
A: Either (a) `verify_prices` was `false` on the request, (b) Firecrawl couldn't fetch the page (timeout, bot-detection, 404), or (c) the page loaded but no price could be extracted from it. In all three cases we leave the LLM/shopping-feed price in place and flag it so you can treat it as indicative rather than authoritative.

**Q: The `source` field in lookup responses says `claude_web_search` — didn't you switch to Perplexity?**
A: `source` is an enum value in the DB (`competitor_source_type`) that predates the Perplexity migration. Under the hood it's Perplexity; we kept the enum value stable to avoid breaking existing consumers. A future version may add `perplexity_web_search` as the canonical name and migrate — we'll deprecate with notice.

---

## Server-side env vars reference (for ops)

These are the env vars the MIVAA backend needs set via **GitHub Secrets → `deploy.yml` → systemd `Environment=`**. No `.env` file involvement on the server — purely systemd-injected. Code reads them via `pydantic-settings` in `app/config.py`, which falls back to hardcoded defaults for any var not set.

### Price engine

| Env var | Code default | Set in Secrets? |
|---|---|---|
| `PERPLEXITY_API_KEY` | none | **Required** (primary discovery engine) |
| `FIRECRAWL_API_KEY` | none | **Required** for URL-mode lookup + Custom Monitoring |
| `DATAFORSEO_BASE64` | empty | Either this **or** the login+password pair below |
| `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` | empty | Either this pair or `DATAFORSEO_BASE64` |
| `CRON_SECRET` | none | **Required** (validates `x-cron-secret` on the cron-refresh endpoint) |

### SLIG (SigLIP2 visual embeddings — separate feature, same deploy pipeline)

Only one of these is actually required — the rest have sensible defaults that match your current endpoint.

| Env var | Code default | Set in Secrets? |
|---|---|---|
| `SLIG_ENDPOINT_TOKEN` | `""` | **Required** — without it, SLIG requests get 401 |
| `SLIG_ENDPOINT_URL` | `https://f4kbl5do4tz6svct.us-east-1.aws.endpoints.huggingface.cloud` | Optional — override only if endpoint changes |
| `SLIG_ENDPOINT_NAME` | `mh-slig` | Optional |
| `SLIG_NAMESPACE` | `basiliskan` | Optional |
| `SLIG_MODEL_NAME` | `basiliskan/siglip2` | Optional (logs + validation only) |
| `SLIG_EMBEDDING_DIMENSION` | `768` | Optional |
| `SLIG_ENABLED` | `true` | Optional — set `false` to bypass SLIG entirely |
| `SLIG_TIMEOUT` | `300` | Optional |
| `SLIG_MAX_RETRIES` | `3` | Optional |
| `SLIG_RETRY_DELAY` | `2` | Optional |

### Deployment pattern

```
GitHub Secrets (Settings → Secrets and variables → Actions)
    ↓
.github/workflows/deploy.yml  (adds Environment=KEY=${{ secrets.KEY }} to the systemd unit)
    ↓
/etc/systemd/system/mivaa-pdf-extractor.service  (rewritten on each deploy)
    ↓
os.environ  (injected by systemd at service start)
    ↓
pydantic-settings in app/config.py reads it, falls back to defaults if absent
```

**To add a new secret:** add it to GitHub Secrets, add one `Environment=KEY=${{ secrets.KEY }}` line in `deploy.yml`, redeploy. Nothing else — no `.env` files, no manual drop-ins on the server.

### Legacy drop-in to remove

After the next successful deploy, the legacy `/etc/systemd/system/mivaa-pdf-extractor.service.d/slig-env.conf` file can be deleted — its contents are now pushed through `deploy.yml`. Cleanup:

```bash
sudo rm /etc/systemd/system/mivaa-pdf-extractor.service.d/slig-env.conf
sudo systemctl daemon-reload && sudo systemctl restart mivaa-pdf-extractor.service
```

**Note on two drifts between the legacy `.conf` and the code defaults** (worth knowing before you remove the file):
- `SLIG_MODEL_NAME`: `.conf` says `basiliskan/slig`, code default is `basiliskan/siglip2`. Used for logs + validation only — harmless either way, but if your observability was indexed on `basiliskan/slig`, set the Secret to preserve it.
- `SLIG_TIMEOUT`: `.conf` says `60`, code default is `300`. The 300s default is actually *preferred* (prevents HF endpoint re-warmup during long jobs). Recommend going with the code default unless you have a reason.

---

## Changelog

- **2026-04-25 (v3)** — **Firecrawl price verification + on-page was/now pricing.**
  - New request param `verify_prices` (default `true`) on `/prices/lookup` (search mode), `POST /prices/track`, and `PUT /prices/track/{id}`. When true, every retailer hit is re-fetched via Firecrawl and the price on the live page replaces the LLM/Shopping-feed price.
  - New response fields on every retailer row: `verified: bool`, `original_price: number | null`, `source: "perplexity" | "dataforseo"`. Image + rating fields (`image_url`, `rating_value`, `rating_votes`) also surface on DataForSEO hits.
  - `GET /prices/track/{id}/history` now includes `original_price` and `verified` on each row.
  - `TrackedQueryResponse` now includes `verify_prices` so clients can read the current setting.
  - `notes` field may include discrepancy tags like `"verify: was perplexity=€45.00, actual on page=€54.90"` when Firecrawl disagreed with the LLM by >20%.
  - Billing: verification adds ~1 credit per hit and ~30s latency on synchronous POST. Set `verify_prices: false` to opt out for speed/cost-sensitive workloads.
  - **Backwards compatible.** All new fields are additive. Omitting `verify_prices` defaults to `true`, matching the improved-accuracy behavior.
- **2026-04-24 (v2)** — Added DataForSEO Merchant as a second parallel discovery source alongside Perplexity. One `/prices/lookup` (search_query mode) or `/prices/track` call now returns both sources merged, deduped by domain, tagged per-hit with `source: "perplexity" | "dataforseo"`. Supports `DATAFORSEO_BASE64` env var in addition to `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD`.
- **2026-04-24** — Initial external API release. `/prices/lookup` (URL + search query modes), `/prices/track/*` CRUD + refresh + history, Perplexity Sonar-pro engine, api_keys Bearer auth, preferred-domain pinning, hourly cron refresh.
