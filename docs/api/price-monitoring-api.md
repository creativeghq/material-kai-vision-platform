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
| `product_title` | string \| null | Exact product name on the retailer's page. Use as a subtitle to disambiguate multiple rows from the same retailer selling different variants. |
| `match_kind` | `"exact" \| "variant" \| "family" \| "unverifiable" \| null` | Product-identity verdict. `exact` = page confirmed to match the asked product. `variant` = same model, different color/finish/size (kept with a note, excluded from stats). `family` = **same brand+series, different SKU** (kept since 2026-04-27 — render under "Similar products in this series", do **not** include in chart/median/alerts). `unverifiable` = identity couldn't be judged from the page (kept, grey badge recommended). `mismatch` is dropped server-side, you'll never see it. `null` only on rows created before 2026-04-25. |
| `match_score` | int 0-100 \| null | Classifier confidence. 90+ exact, 70-89 variant, <50 mismatch. |
| `match_note` | string \| null | Human-readable facet diff, e.g. `"Color differs: asked BLACK MATT, page shows WHITE MATT"`. `null` for exact matches. |

### Rate limit

Default **60 requests/minute** per key. 429 response if exceeded, with `Retry-After: 60`.

### Billing

| Source | Cost per call |
|---|---|
| `firecrawl_url` | ~1 Firecrawl credit (≈ $0.01) |
| `claude_web_search` (Perplexity under the hood) | ~2 platform credits (≈ $0.02) |
| `dataforseo_shopping` | per-task DataForSEO Merchant cost, baked into the same call |
| `marketplace_skroutz` / `marketplace_bestprice` / `marketplace_shopflix` | ~1 Firecrawl credit each (≈ $0.01) when the Greek Marketplaces module is active and `country_code='GR'`. Returns 0 cost when off. |

Every call writes a row to `price_lookups` (tables in Supabase) with `api_key_id`, inputs, results, credits, latency. Use that for audit.

### Source values you may see on a hit

The `source` field on each retailer hit identifies which engine produced it. Treat this as an open enumeration — we add new sources without notice, all values are non-breaking strings:

| `source` | Where it comes from | When it appears |
|---|---|---|
| `firecrawl_url` | Direct page scrape via Firecrawl | When you submit a `url` to `/lookup`, or when we re-verify a discovered URL |
| `claude_web_search` | Perplexity Sonar-pro web search (legacy enum name, still used) | Default discovery for any query without a URL |
| `perplexity_web_search` | Same as above, future canonical name | Reserved — currently rows are still written as `claude_web_search` |
| `dataforseo_shopping` | DataForSEO Merchant (Google Shopping feed) | Runs in parallel with Perplexity on every discovery |
| `marketplace_skroutz` | Skroutz.gr (price-comparison aggregator) | Greek-market queries (`country_code='GR'`) when the platform's Greek Marketplaces module is enabled |
| `marketplace_bestprice` | Bestprice.gr (price-comparison aggregator) | Same condition as above |
| `marketplace_shopflix` | Shopflix.gr (3rd-party seller marketplace) | Same condition as above |

**You don't need to opt in to the new marketplace sources** — when the module is on, your `country_code='GR'` queries automatically receive the extra hits in the same `hits[]` array. If you want to filter or weight the marketplace sources differently in your UI, switch on the `source` field. Otherwise no change is required.

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
| `search_query` | string, required | **RECOMMENDED format**: `{ProductName} {Model/Series} {SKU}` concatenated, e.g. `"ORABELLA PRECIOSA 10202 Modern Chrome Single Lever Basin Mixer"`. The SKU is the strongest identity disambiguator — when present, our classifier drops sibling SKUs in the same series. Brand/series-only queries still work but return wider sets and may include sibling-SKU rows flagged as `family` (dropped) or `variant` (kept, excluded from price stats). |
| `dimensions` | string (optional) | Size spec |
| `country_code` | ISO-3166 α-2 (optional) | Biases Perplexity toward local retailers |
| `manufacturer` | string (optional) | Disambiguates generic product names |
| `preferred_retailer_domains` | string[] (optional, max 10) | Forces Perplexity to probe these domains too. Closes retailer-coverage gaps |
| `refresh_interval_hours` | int 1–720, default 24 | How often our cron re-runs the query. 1h minimum, 30d maximum |
| `verify_prices` | boolean (default `true`) | Persists on the tracked query row. Every refresh (initial + cron) will re-fetch each retailer URL via Firecrawl to confirm the price on the live page. Set to `false` if you value refresh speed / cost over accuracy. Can be toggled later via `PUT`. |
| `alert_channels` | string[] (optional) | Delivery channels for price alerts on this query. Allowed values: `bell`, `email`, `webhook`. Default `['bell']` for external API consumers. Bell + webhook are free; email costs 1 credit per send. |
| `alert_on_price_drop` | boolean (default `false`) | Fire an alert when the trailing 7-day median drops ≥10% week-over-week (per retailer). |
| `alert_on_new_retailer` | boolean (default `false`) | Fire an alert when discovery surfaces a retailer domain we have never tracked for this query. |
| `alert_on_promo` | boolean (default `false`) | Fire an alert when `original_price` becomes non-null on a row that previously had it null. |
| `alert_webhook_url` | string (optional, requires `webhook` in `alert_channels`) | Per-tracked-query webhook destination. Receives `POST` with JSON `{alert_type, title, body, retailer_name, retailer_domain, payload, fired_at}`. Idempotency window: 24h dedupe per (alert_type, retailer_domain). |

**Caveat**: the initial POST blocks for ~15–30 seconds while Perplexity runs (or ~30–60 seconds when `verify_prices: true`, because Firecrawl verifies each hit in parallel). If your integration needs a non-blocking path, create the tracked query with `refresh_interval_hours: 1`, ignore the initial results, and `GET` a minute later.

### Result row fields (added 2026-04-26)

Every result row now carries identity-classification and sanity-band fields. Non-null even on legacy rows after the next refresh.

| Field | Type | Meaning |
|---|---|---|
| `match_kind` | `'exact' \| 'variant' \| 'unverifiable' \| null` | Identity verdict from our classifier. `family` and `mismatch` rows are dropped before they reach you. |
| `match_score` | int 0–100 | Confidence of the verdict. Treat ≥90 as `exact`-grade, 70–89 as `variant`. |
| `match_note` | string \| null | One-line human-readable explanation when `match_kind` ≠ `exact`. |
| `product_title` | string \| null | The exact product name as shown on the retailer page. Use to disambiguate multiple rows from the same retailer (different colors / sizes). |
| `is_anomaly` | boolean | `true` when the reading was outside the 7-day rolling-median sanity band (>3× or <0.33× the median for the same retailer). The price is still surfaced for transparency, but it is not used to compute medians until reviewed. |
| `anomaly_reason` | string \| null | When `is_anomaly=true`, a one-line explanation. |
| `rolling_median_at_check` | number \| null | The trailing 7-day median we compared against. |
| `verified` | boolean | `true` when Firecrawl confirmed the price on the live retailer page. Pure-Perplexity / pure-DataForSEO rows surface as `false`. |

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

**Q: I'm seeing new `marketplace_skroutz` / `marketplace_bestprice` / `marketplace_shopflix` source values on my Greek queries — what changed?**
A: Greek-market queries (`country_code='GR'`) now also pull the cheapest available offer from Skroutz, Bestprice, and Shopflix when the platform's Greek Marketplaces module is enabled. **No request change required on your side** — the new hits show up in the same `hits[]` array. They use the existing `PriceHit` schema with the new `source` values listed in the table above. `marketplace_skroutz` returns an aggregator URL (skroutz.gr product page) where users can see every merchant; the other two return a direct merchant URL on bestprice.gr / shopflix.gr. Treat them as additional discovery — same `verified: false` semantics as Perplexity hits, same Firecrawl re-verification flow if `verify_prices: true`.

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

<details>
<summary><b>2026-04-27 (v5)</b> — <b>Family-kept policy + Greek marketplaces (Skroutz / Bestprice / Shopflix) + manual promotion + cost overhaul.</b> Click to expand.</summary>

#### What's new

- **`match_kind` enum extended.** Was `"exact" | "variant" | "unverifiable" | null`. Now also includes `"family"`. Same-brand-and-series rows where the SKU differs are no longer dropped — they come back to you as `family` so you can render them under a *Similar products in this series* section. They're inert downstream (excluded from price-drop / new-retailer / promo / anomaly alerts and from rolling-median stats).
- **Three new `source` values.** `tracked_query_price_history.source` (and `competitor_sources.source_type`) can now be `"marketplace_skroutz"`, `"marketplace_bestprice"`, `"marketplace_shopflix"` in addition to `"perplexity_web_search"` and `"dataforseo_shopping"`. Rows from these sources are first-party retailer data (post-fanout from the marketplace's product page).
- **Idealo source value.** `competitor_source_type` enum gained `"idealo"` for DACH/IT/UK/ES/FR refreshes. Module is opt-in per workspace.
- **Manual promotion endpoints (admin-only, session JWT).**
  - `POST /api/v1/price-monitoring/promote-family-row` — flip a row's `match_kind` from `family`/`mismatch`/`unverifiable` to `exact` or `variant`. Sticky: every future refresh of the same URL keeps the override until you demote it. Body: `{competitor_source_id?, tracked_query_history_id?, override_kind: "exact"|"variant", reason?}`.
  - `POST /api/v1/price-monitoring/demote-to-family` — undo a prior promotion.
  - Both endpoints write to `match_corrections`, so the few-shot classifier loop learns from the correction globally.
- **API response split (recommended).** New `latest_results_split()` returns `{ "results": [...], "family_results": [...] }` instead of one mixed array. Existing `latest_results()` still works for back-compat (family rows interleaved by price). UI consumers should prefer the split form. Same approach is recommended on your side: render the `family_results` section collapsed by default, no chart contribution.
- **Source-label fix.** Before this release, every non-DataForSEO hit was forced to `"perplexity_web_search"` on persist — marketplace hits were invisible by source filter. Now `source` reflects the real adapter that produced the row. **Backwards-compatible**: rows persisted before today still have the old label; new rows have the correct one.
- **Cost optimizations (~60% cut on stable refreshes).**
  - Tier-skip: marketplace adapters only run on first refresh / admin force-refresh / when known retailer set is sparse.
  - Sonar model downgrade: `sonar` (cheaper) on stable cron refreshes, `sonar-pro` on first refresh + admin force-refresh.
  - Classifier verdict cache (7-day TTL per URL+facets-hash) — repeat retailers across daily refreshes are ~95% cache hits.
  - Volatility-based cadence: `tracked_queries.next_check_at` is auto-extended to 48h / 72h after consecutive stable refreshes (≤2% move). Any ≥5% move snaps cadence back to 24h. **No client change required** — the cron picks it up automatically.
  - Brand-level retailer cache: when one SKU in a brand has been discovered, future SKUs in the same brand seed `known_retailer_domains` from the cached set.
  - Recipe-driven httpx fallback: validated retailers can be re-scraped via cheap `httpx + selectolax` instead of Firecrawl. Recipes start unseeded; activation grows over time.

#### ⚠️ Recommended request change for partners — **send the SKU**

The single most impactful thing you can do: include the SKU in the `search_query` string. Without it, marketplace search engines (Skroutz / Bestprice / Shopflix) sort by price-asc and return the cheapest item in the brand line, which is usually a wrong-product accessory like a spout/εκροή — those rows then get correctly filtered out as wrong-product-type, and you get fewer marketplace results.

**Recommended format** — `"{Brand} {Model/Series} {SKU}"` (with optional finish/colour after):
```
✅  "ORABELLA PRECIOSA 10356 Brushed Nickel"
✅  "MAIDTEC 7012MT Stainless Steel"
✅  "Ferrara Beige Keros 60x120"

⚠️  "ORABELLA PRECIOSA"                  ← works, but marketplaces will mostly miss
⚠️  "ORABELLA PRECIOSA Μπαταρία Νιπτήρα" ← works, no SKU disambiguation
```

When `search_query` carries a SKU, our facet extractor populates `sku_tokens=["10356"]` and the marketplace adapters build a tight `"{BRAND} {MODEL} {SKU}"` query that finds the right product page directly (validated end-to-end against ORABELLA PRECIOSA 10356 — Skroutz + Bestprice both land at €155, the actual basin-faucet price).

Note: the `Νυπτήρα` (with **Υ**, upsilon) typo we sometimes see should be `Νιπτήρα` (with **Ι**, iota). The pipeline tolerates the typo via SKU anchoring, but the right Greek spelling improves recall.

#### Verified results table (✅ good / ⚠️ caveat / ❌ won't work)

| Scenario | Result | Notes |
|---|---|---|
| `search_query` includes SKU | ✅ | All applicable marketplaces find the exact SKU page. Rows tagged `exact`. Same-series different-SKU rows tagged `family` and returned in `family_results`. |
| `search_query` is brand+model only (no SKU) | ⚠️ | DataForSEO + Perplexity work fine. Marketplaces often return wrong-product-type rows (spouts) that get filtered out — you'll see fewer marketplace rows. |
| `search_query` in Greek script | ✅ | Best recall. Perplexity + DataForSEO both index Greek pages directly. |
| `search_query` in Greeklish (`Mpataria Niptiros`) | ✅ | Works. Marginally lower ranking on Greek-locale results vs native Greek. |
| Shopflix specifically | ⚠️ | Their fuzzy search prioritises numeric token matches, so without a brand+model+SKU triplet they often return unrelated products that share the digit (a phone case with `10356` in its slug, etc.). Our plausibility filter rejects these — net result: zero false positives, but Shopflix may yield no rows when their catalog doesn't carry that SKU. |
| Bestprice with `{BRAND} {SKU}` only | ❌ | Returns zero. Their search needs `{BRAND} {MODEL} {SKU}` (validated). Our adapters now build this automatically. |
| `casasolutionsgekas.com` appearing twice in results | ✅ | One row from `dataforseo_shopping` (Google Shopping feed entry), one from `perplexity_web_search` (real retailer page with the on-page promo `original_price`). Both are correct and useful — the DataForSEO row gives you the verified feed price + image + rating; the Perplexity row gives you the on-page was/now price (`original_price` populated). UI tip: render one row per retailer-domain and surface both data points. |

#### What stays the same

- Endpoint URLs, auth (api_keys Bearer), request bodies — **fully back-compat**. No partner integrations need to change.
- `latest_results()` still returns the mixed array if you don't migrate to the split form.
- Existing rows with `match_kind = null` keep working — clients that don't read it are unaffected.

</details>

- **2026-04-25 (v4)** — **Product-identity verification + DataForSEO merchant fixes + `product_title`.**
  - Every retailer row now carries `match_kind` (`"exact" | "variant" | "unverifiable" | null`), `match_score` (0-100), `match_note` (e.g. *"Color differs: asked BLACK MATT, page shows WHITE MATT"*). Rows the classifier flagged as `mismatch` or `family` (wrong product, even if same brand) are dropped before the response leaves the server.
  - Every retailer row also carries `product_title` — the exact product name as shown on the retailer page. Use as a subtitle when rendering, especially when a retailer appears multiple times for different variants.
  - Behavioral change: DataForSEO merchant coverage ~8× higher — a dedupe bug was collapsing every Google Shopping merchant to a single `google.gr` domain row. Fixed. DataForSEO fetch depth also bumped to ≥30.
  - Behavioral change: wrong-product rows are now dropped server-side. Clients will see FEWER rows but every row is correct.
  - Behavioral change: variants stay in the list with their `match_note`, but `/market-check` statistics (`stats.min`, `stats.median`, `stats.max`) exclude them.
  - Historical rows pre-dating this release have `match_kind: null`, `product_title: null`. Both are additive-safe — clients that don't read them keep working.
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
