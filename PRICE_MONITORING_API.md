# Material KAI — Price Monitoring API Integration Guide

Public REST API for external projects. Authenticate with an API key, look up prices on demand, or register tracked queries and pull fresh prices on your own schedule.

---

## 1. Base URL & Auth

- **Base URL:** `https://v1api.materialshub.gr`
- **Auth:** `Authorization: Bearer <api_key>` on every request
- **Content-Type:** `application/json`
- **Get a key:** email `support@materialshub.gr`. Keys can be scoped to specific endpoints (`allowed_endpoints` allowlist with trailing-`*` wildcards) and have a per-key `rate_limit_override`.

### Rate limit
- **Default:** 60 req/min per key (sliding 60s window).
- **Cap:** 600 req/min.
- **On exceed:** `429 Too Many Requests` with `Retry-After: 60`.

### Common error codes
| Code | Meaning |
|---|---|
| 400 | Validation error (e.g. passing both `url` and `search_query` to `/lookup`) |
| 401 | Missing / invalid / expired API key |
| 403 | Endpoint not in `allowed_endpoints`, or you don't own the `tracking_id` |
| 404 | `tracking_id` not found |
| 429 | Rate limit exceeded |
| 500 | Upstream failure (Perplexity / Firecrawl / DataForSEO) |

### Billing
Every call is debited from the API key owner's workspace credits. `credits_used` and `latency_ms` are returned in every response.

- **1 platform credit = USD $0.0125**.
- Read-only endpoints (`GET` list / get / history, `DELETE`) are **free** — they only touch our database.
- Cost is determined by what each operation triggers downstream (Perplexity search, Firecrawl scrape, DataForSEO Merchant lookup, alert send). The `credits_used` returned by the API is the authoritative billed amount.

> **Warning:** Deleting your API key CASCADE-deletes every tracked query AND its full price history. There is no undo and no ownership transfer.

---

## 2. Pricing

All amounts shown are the final USD you pay per call.

### 2.1 Per-operation reference
| Operation | Typical credits | USD per call | Notes |
|---|---|---|---|
| `POST /lookup` — URL mode (Firecrawl) | ~1 | **~$0.013** | Single page scrape. JS render slightly higher. |
| `POST /lookup` — search mode, `verify_prices: false` | ~1–3 | **~$0.013 – $0.038** | Perplexity discovery + DataForSEO Merchant. |
| `POST /lookup` — search mode, `verify_prices: true` (default) | ~8–20 | **~$0.10 – $0.25** | Discovery + Firecrawl re-fetch of every URL returned. |
| `POST /prices/track` — create (runs first refresh) | ~8–20 | **~$0.10 – $0.25** | Same as a verified search lookup. |
| `POST /prices/track/{id}/refresh` | ~8–20 | **~$0.10 – $0.25** | One full discovery + verification cycle. |
| `GET` list / get one / history | 0 | **Free** | Database read only. |
| `PUT` update | 0 | **Free** | Settings change only. |
| `DELETE` (soft-delete) | 0 | **Free** | Marks inactive. |
| Bell alert delivery | 0 | **Free** | In-app notification. |
| Webhook alert delivery | 0 | **Free** | Per-tracked-query URL. |
| Email alert delivery | 1 | **$0.013 / email** | Per send. Insufficient credits → channel skipped silently. |

### 2.2 Worked monthly examples
Daily refreshes (`refresh_interval_hours: 24`) with `verify_prices: true` and ~10 retailers per product:

| Setup | Refreshes / month | Estimated monthly cost |
|---|---|---|
| 1 product, daily | 30 | **~$3.00 – $7.50** |
| 10 products, daily | 300 | **~$30 – $75** |
| 50 products, daily | 1,500 | **~$150 – $375** |
| 100 products, hourly (`refresh_interval_hours: 1`) | 72,000 | **~$7,200 – $18,000** |

Cheaper paths if cost matters:
- Set `verify_prices: false` → ~10× cheaper but prices may be stale or LLM-hallucinated.
- Set `refresh_interval_hours: 168` (weekly) → 7× fewer refreshes than daily.
- Pin `preferred_retailer_domains` to fewer stores → fewer URLs to verify.

### 2.3 What sets the price
The `credits_used` value scales with three knobs:
1. **`verify_prices`** — biggest lever. Verification costs ~1 credit per retailer hit.
2. **`limit`** (lookup search mode) — more retailers = more verification scrapes.
3. **Number of refreshes you trigger** — we never auto-refresh; you decide cadence.

> **Tip:** check `credits_used` in every response and compare to your budget. The number is computed at run time and reflects actual upstream usage (Perplexity tokens, Firecrawl pages, DataForSEO calls).

---

## 3. Two integration modes

| Mode | Endpoint | Use when |
|---|---|---|
| **One-shot lookup** | `POST /api/v1/prices/lookup` | You need a price now, no ongoing monitoring. Stateless. |
| **Continuous tracking** | `POST /api/v1/prices/track` (+ siblings) | You want the same product re-checked over time. Returns a `tracking_id`. |

> Tracking does **not** auto-refresh on our cron. You control cadence by calling `POST /{tracking_id}/refresh`. (2026-04-25 policy: unsolicited refreshes would surprise per-call billing.)

---

## 4. `POST /api/v1/prices/lookup` — one-shot price

> **Cost:** ~$0.013 (URL mode) · ~$0.013 – $0.038 (search, no verify) · ~$0.10 – $0.25 (search + verify, default).

Pass **exactly one** of `url` OR `search_query`.

### Mode A — scrape a specific URL (Firecrawl)
```http
POST /api/v1/prices/lookup
Authorization: Bearer YOUR_KEY
Content-Type: application/json

{
  "url": "https://example.gr/products/oak-flooring-120x60",
  "product_name": "Oak Flooring",
  "use_javascript_render": false
}
```

### Mode B — search the web (Perplexity Sonar-pro + Firecrawl verification)
```http
POST /api/v1/prices/lookup
Authorization: Bearer YOUR_KEY
Content-Type: application/json

{
  "search_query": "ORABELLA PRECIOSA 10202 Modern Chrome Single Lever Basin Mixer",
  "dimensions": "120x60 cm",
  "country_code": "GR",
  "limit": 10,
  "verify_prices": true
}
```

### Request fields
| Field | Type | Default | Notes |
|---|---|---|---|
| `url` | string (URL) | — | Mode A only. Page to scrape. |
| `use_javascript_render` | bool | `false` | Mode A only. SPA sites; costs more. |
| `search_query` | string | — | Mode B only. Recommended format: `{ProductName} {Model/Series} {SKU}`. |
| `dimensions` | string | — | Mode B only. Appended to query, e.g. `60x60 cm`. |
| `country_code` | string | — | Mode B only. ISO-3166 alpha-2 (`GR`, `DE`, `GB`, `US`...). Biases results, doesn't restrict. |
| `limit` | int | `10` | Mode B only. 1-25. Higher captures more Google Shopping merchants. |
| `verify_prices` | bool | `true` | Mode B only. Re-fetch each URL via Firecrawl to confirm price from the live page. |
| `product_name` | string | — | Optional hint for the extractor. |

### Response (unified shape)
```json
{
  "success": true,
  "source": "firecrawl_url",
  "credits_used": 3,
  "latency_ms": 5421,
  "scraped_at": "2026-04-26T10:30:00Z",

  "price": 89.50,
  "currency": "EUR",
  "availability": "in_stock",
  "shipping_cost": "Free over €50",
  "product_name": "ORABELLA PRECIOSA 10202",

  "query": null,
  "summary": null,
  "results": null
}
```

- **`source: "firecrawl_url"`** → read flat fields (`price`, `currency`, `availability`, `shipping_cost`, `product_name`).
- **`source: "claude_web_search"`** → flat fields are null; read `results` array (see §6) plus `summary` (2-3 sentence Perplexity overview).

### When to pick which mode
- **You have a URL** → Mode A. Single Firecrawl scrape, ~$0.001, ~3-5s.
- **Need market discovery** → Mode B. Perplexity + DataForSEO discovery + Firecrawl verification. ~$0.02-0.05, ~5-15s, typically 6-15 retailers.
- **Always include the SKU** in `search_query`. The identity classifier uses it to drop sibling SKUs (e.g. shower outlets when you asked for the basin mixer).

---

## 5. `POST /api/v1/prices/track` — register a tracked query

> **Cost:** ~$0.10 – $0.25 (first refresh runs synchronously, same as a verified search lookup).

Creates a tracked query and **runs the first refresh synchronously** so you get initial results in the response.

### Request
```http
POST /api/v1/prices/track
Authorization: Bearer YOUR_KEY
Content-Type: application/json

{
  "search_query": "ORABELLA PRECIOSA 10202 Single Lever Basin Mixer",
  "dimensions": null,
  "country_code": "GR",
  "manufacturer": "Orabella",
  "preferred_retailer_domains": ["youbath.gr", "fshome.gr"],
  "refresh_interval_hours": 24,
  "verify_prices": true,

  "alert_channels": ["bell", "email", "webhook"],
  "alert_on_price_drop": true,
  "alert_on_new_retailer": false,
  "alert_on_promo": true,
  "alert_webhook_url": "https://your-app.com/webhooks/price-alerts"
}
```

### Request fields
| Field | Type | Default | Notes |
|---|---|---|---|
| `search_query` | string | required | Recommended: `{ProductName} {Model/Series} {SKU}`. |
| `dimensions` | string | — | Appended to query. |
| `country_code` | string | — | ISO-3166 alpha-2. Omit for global. |
| `manufacturer` | string | — | Disambiguates generic names. |
| `preferred_retailer_domains` | string[] | — | Up to 10. Used as Perplexity `search_domain_filter` (pins discovery to these domains). |
| `refresh_interval_hours` | int | `24` | 1-720 (30 days max). Cron-related metadata only — refreshes are caller-driven. |
| `verify_prices` | bool | `true` | Re-fetch every URL via Firecrawl on every refresh. |
| `alert_channels` | string[] | `["bell"]` | `bell` (free), `email` (1 credit/send), `webhook` (free). |
| `alert_on_price_drop` | bool | `false` | Trailing 7d median drops ≥10% W/W per retailer. |
| `alert_on_new_retailer` | bool | `false` | A retailer domain we've never tracked appears. |
| `alert_on_promo` | bool | `false` | `original_price` becomes non-null. |
| `alert_webhook_url` | string (URL) | — | Required if `webhook` is in `alert_channels`. |

### Response (`201 Created`)
```json
{
  "tracking_id": "8f3c1b2e-...-uuid",
  "search_query": "ORABELLA PRECIOSA 10202 ...",
  "country_code": "GR",
  "refresh_interval_hours": 24,
  "verify_prices": true,
  "last_refreshed_at": "2026-04-26T10:30:00Z",
  "is_active": true,
  "total_credits_used": 12,
  "created_at": "2026-04-26T10:29:55Z",
  "alert_channels": ["bell", "email"],
  "alert_on_price_drop": true,
  "alert_on_new_retailer": false,
  "alert_on_promo": true,
  "results": [ /* PriceHit array — see §6 */ ]
}
```

---

## 6. Tracked-query lifecycle

All endpoints require ownership — only the API key that created the `tracking_id` may read or modify it.

| Method | Path | Cost | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/prices/track?include_inactive=false&limit=100` | Free | List queries owned by your key |
| `GET` | `/api/v1/prices/track/{tracking_id}` | Free | One query + latest results |
| `GET` | `/api/v1/prices/track/{tracking_id}/history?limit=500` | Free | Full price-history rows |
| `PUT` | `/api/v1/prices/track/{tracking_id}` | Free | Partial update (cadence / country / domains / alerts) |
| `POST` | `/api/v1/prices/track/{tracking_id}/refresh` | ~$0.10 – $0.25 | Force refresh now |
| `DELETE` | `/api/v1/prices/track/{tracking_id}` | Free | Soft-delete (history preserved). To hard-delete, delete the api_key. |

### `RefreshResponse`
```json
{
  "tracking_id": "uuid",
  "status": "refreshed",
  "credits_used": 8,
  "latency_ms": 9420,
  "results": [ /* PriceHit array */ ],
  "summary": "Closest retailer is youbath.gr at €82...",
  "throttle_until": null,
  "error": null
}
```

`status` ∈ `refreshed` | `throttled` | `inactive` | `error`.

### `PUT` body (all fields optional)
```json
{
  "refresh_interval_hours": 48,
  "country_code": "DE",
  "preferred_retailer_domains": ["idealo.de"],
  "dimensions": null,
  "manufacturer": null,
  "verify_prices": true,
  "alert_channels": ["webhook"],
  "alert_on_price_drop": true,
  "alert_on_new_retailer": false,
  "alert_on_promo": false,
  "alert_webhook_url": "https://..."
}
```

---

## 7. The `PriceHit` row

Returned in every `results` array (lookup mode B, create, refresh, history).

```json
{
  "retailer_name": "YouBath.gr",
  "product_url": "https://youbath.gr/products/orabella-10202",
  "price": 82.00,
  "original_price": 105.00,
  "currency": "EUR",
  "price_unit": "per piece",
  "availability": "in_stock",
  "city": "Athens",
  "ships_from_abroad": false,
  "verified": true,
  "notes": "Free shipping over €50",
  "scraped_at": "2026-04-26T10:30:00Z",
  "product_title": "ORABELLA PRECIOSA Single Lever Basin Mixer",
  "source": "perplexity",

  "match_kind": "exact",
  "match_score": 95,
  "match_note": null,

  "is_anomaly": false,
  "anomaly_reason": null,
  "rolling_median_at_check": 84.50
}
```

### Key field semantics
- **`verified: true`** — Firecrawl confirmed the price from live HTML, not just an LLM snippet.
- **`original_price`** — on-page "was" price (only set when the retailer displays both was/now).
- **`availability`** — `in_stock` | `out_of_stock` | `unknown`. Out-of-stock rows are still included with the posted price.
- **`source`** — `perplexity` (web search) or `dataforseo` (Google Shopping merchant feed).
- **`product_title`** — exact title from the retailer page. Disambiguates multiple variant rows from the same retailer.
- **`match_kind`** — identity classifier verdict (see §7).
- **`is_anomaly`** — sanity band (see §7).

---

## 8. Identity matching, sanity bands, and alerts

### Identity classifier (`match_kind`)
Every hit is classified against your query:

| Value | Meaning | Reaches you? |
|---|---|---|
| `exact` | Same SKU, same variant | Yes — counts toward stats |
| `variant` | Same family, different color/finish — `match_note` explains | Yes — flagged, excluded from stats |
| `unverifiable` | Page lacked enough info to confirm | Yes — flagged |
| `family` | Sibling SKU (same series, different product) | Dropped before response |
| `mismatch` | Wrong product entirely | Dropped before response |

### Sanity band
Every reading is checked against the trailing 7-day median for `(product, retailer)`. Outside `[median × 0.33, median × 3.0]` ⇒ `is_anomaly: true` with `anomaly_reason` populated. Anomalies do **not** overwrite the cached current price. Min 3 prior samples to fire.

### Alerts (opt-in per tracked query)
- `price_drop` — trailing 7d median drops ≥10% week-over-week.
- `new_retailer` — a domain we've never tracked appears.
- `promo_started` — `original_price` becomes non-null.
- `anomaly_detected` — always fires (not opt-in).

24h dedupe per `(alert_type, retailer_domain)`.

| Channel | Cost per send |
|---|---|
| `bell` (in-app) | Free |
| `webhook` | Free |
| `email` | **$0.013** |

Insufficient credits → channel skipped silently and recorded in `price_alert_log.channels_skipped`.

### Webhook payload
If you set `alert_channels: ["webhook"]` + `alert_webhook_url`, we POST:
```json
{
  "alert_type": "price_drop",
  "title": "Price drop on YouBath.gr",
  "body": "ORABELLA PRECIOSA dropped 18% (€105 → €82)",
  "retailer_name": "YouBath.gr",
  "retailer_domain": "youbath.gr",
  "payload": { /* raw alert context */ },
  "fired_at": "2026-04-26T10:30:00Z"
}
```

---

## 9. End-to-end examples

### Example A — quick price lookup by URL (curl)
```bash
curl -X POST https://v1api.materialshub.gr/api/v1/prices/lookup \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://youbath.gr/products/orabella-10202",
    "product_name": "ORABELLA PRECIOSA"
  }'
```

### Example B — register a tracked query (Node.js / fetch)
```js
const res = await fetch("https://v1api.materialshub.gr/api/v1/prices/track", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.MKAI_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    search_query: "ORABELLA PRECIOSA 10202 Single Lever Basin Mixer",
    country_code: "GR",
    refresh_interval_hours: 24,
    verify_prices: true,
    alert_channels: ["webhook"],
    alert_on_price_drop: true,
    alert_webhook_url: "https://your-app.com/webhooks/prices",
  }),
});
const { tracking_id, results } = await res.json();
```

### Example C — poll history (Python / httpx)
```python
import httpx, os

key = os.environ["MKAI_API_KEY"]
tid = "8f3c1b2e-...-uuid"

with httpx.Client(base_url="https://v1api.materialshub.gr",
                  headers={"Authorization": f"Bearer {key}"}) as client:
    history = client.get(f"/api/v1/prices/track/{tid}/history?limit=200").json()
    for row in history:
        if row["match_kind"] == "exact" and not row["is_anomaly"]:
            print(row["scraped_at"], row["retailer_name"], row["price"], row["currency"])
```

### Example D — force a refresh
```bash
curl -X POST https://v1api.materialshub.gr/api/v1/prices/track/$TID/refresh \
  -H "Authorization: Bearer YOUR_KEY"
```

---

## 10. Best practices

1. **Put the SKU in `search_query`.** Best disambiguator we have.
2. **Set `country_code`.** Improves retailer relevance dramatically.
3. **Use `preferred_retailer_domains`** if you only care about specific stores.
4. **Filter `match_kind == "exact"`** when computing min/median/max. Variants and unverifiable rows skew stats.
5. **Drop `is_anomaly: true`** rows from analytics dashboards (keep them for audit).
6. **Treat `verified: false` rows as indicative**, not authoritative — verification was skipped (`verify_prices: false`) or Firecrawl couldn't confirm.
7. **Pace your `/refresh` calls.** Each one costs credits and ~5-15s of latency. Daily is plenty for most products.
8. **Back up your `tracking_id`s.** Deleting the API key wipes them all.
9. **Set webhook URLs as HTTPS** with a fast 200 response — we don't retry failed deliveries.

---

## 11. Support
- Issues / API key requests: `support@materialshub.gr`
- Endpoint reference (this doc lives in repo at): `PRICE_MONITORING_API.md`
