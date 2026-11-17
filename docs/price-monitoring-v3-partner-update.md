# Price Monitoring API — v3 update for partners

**Released**: 2026-04-27
**Backwards compatibility**: Full. No partner integration changes are required.
**Action recommended**: Add the **SKU** to your `search_query` strings. See *§5* below.

---

## TL;DR

1. The classifier now keeps `family` rows (same brand+series, different SKU) instead of dropping them. They come back in a separate array and don't pollute charts or alerts.
2. New marketplace sources: `marketplace_skroutz`, `marketplace_bestprice`, `marketplace_shopflix` (Greece) and `idealo` (DACH/IT/UK/ES/FR).
3. New admin endpoint to manually promote a misclassified `family` row to `exact`/`variant` — sticky per URL.
4. ~60% cost reduction on stable refreshes via tier-skipping, model downgrades, classifier caching, and volatility-based cadence.
5. **Recommended**: include the SKU in your `search_query`. It's the single most impactful change you can make for marketplace recall.

---

## 1. New / changed response fields

### `match_kind` enum

| Value | Meaning | What to do with it |
|---|---|---|
| `exact` | Page is the asked product. | Show in main list. Include in price chart + median + alerts. |
| `variant` | Same model, different color / finish / size. `match_note` explains. | Show in main list. **Exclude from stats** (median, chart). |
| `family` *(new)* | Same brand + series, **different SKU**. | Show in a separate **"Similar products in this series"** collapsed section. **Inert**: do not include in chart, median, or alerts. |
| `unverifiable` | Page didn't load enough info to judge. | Show with a grey badge. Exclude from stats. |
| `mismatch` | Wrong product entirely. | Never reaches you — dropped server-side. |
| `null` | Row from before 2026-04-25 (no classifier yet). | Treat as `unverifiable`. |

### `source` enum (added values)

| Value | Source |
|---|---|
| `perplexity_web_search` | Existing — Perplexity Sonar discovery |
| `dataforseo_shopping` | Existing — Google Shopping merchant feed |
| `marketplace_skroutz` *(new)* | Skroutz product-page fanout (per-merchant offers from inside one Skroutz product page) |
| `marketplace_bestprice` *(new)* | Bestprice.gr product-page fanout |
| `marketplace_shopflix` *(new)* | Shopflix.gr search result |
| `idealo` *(new)* | Idealo.de / .it / .co.uk / .es / .fr search result. Module is opt-in per workspace. |

### Recommended response shape (split form)

We've added a **split** result form. Same data, but `family` rows are returned separately so your UI doesn't have to filter:

```json
{
  "results": [
    { "match_kind": "exact",   ... },
    { "match_kind": "variant", ... },
    { "match_kind": "unverifiable", ... }
  ],
  "family_results": [
    { "match_kind": "family", ... }
  ]
}
```

The legacy mixed-array form continues to work — `family` rows interleave by price. Migrate at your leisure.

---

## 2. New endpoints (admin / dashboard use)

These are session-JWT endpoints intended for human admin actions inside dashboards. Most partners won't call them programmatically.

### `POST /api/v1/price-monitoring/promote-family-row`

Manually flip a `family` (or `mismatch` / `unverifiable`) row back to `exact` or `variant`. The override is **sticky** — every future refresh of the same URL keeps the override until you demote it.

```http
POST /api/v1/price-monitoring/promote-family-row
Body: {
  "tracked_query_history_id": "uuid",   // OR competitor_source_id
  "override_kind": "exact",              // or "variant"
  "reason": "free-text explanation"
}
```

### `POST /api/v1/price-monitoring/demote-to-family`

Undo a prior promotion.

```http
POST /api/v1/price-monitoring/demote-to-family
Body: {
  "tracked_query_history_id": "uuid",
  "reason": "free-text explanation"
}
```

Both endpoints feed the few-shot classifier loop globally — corrections from one workspace help the classifier on all future queries.

---

## 3. Cost optimizations (transparent to you)

These changes engaged automatically; no client change required. Net effect: ~60% cost reduction on stable refreshes.

| Change | Effect |
|---|---|
| **Tier-skip** | Marketplace adapters (Skroutz/Bestprice/Shopflix/Idealo) only run on first refresh, admin force-refresh, or when the known retailer set is sparse. Stable tracked queries skip Tier 2 silently. |
| **Sonar model downgrade** | Cheaper `sonar` model on stable cron refreshes. `sonar-pro` retained for first refresh + force-refresh. |
| **Classifier verdict cache** | 7-day TTL per `(URL, facets-hash)`. Repeat retailers across daily refreshes hit ~95% cache rate, skipping Haiku entirely. |
| **Volatility cadence** | `next_check_at` is auto-extended to 48h / 72h after consecutive stable refreshes (≤2% move). Any ≥5% move snaps cadence back to 24h. |
| **Brand-level retailer cache** | First SKU in a brand discovers retailers; subsequent SKUs in the same brand inherit the retailer set. |
| **Recipe-driven httpx fallback** | Validated retailers can be re-scraped via cheap `httpx + selectolax` instead of Firecrawl. Recipes start unseeded; activation grows over time. |

---

## 4. Verified results — known-good / known-quirk matrix

Tested end-to-end against `ORABELLA PRECIOSA 10356 (basin faucet)` on 2026-04-27.

| Scenario | Outcome |
|---|---|
| ✅ `search_query` includes SKU + brand + model | All adapters find the right SKU page. Skroutz fans out 2 merchants. Bestprice fans out multi-merchant. Family rows (10259/10159 spouts) returned in `family_results`. |
| ✅ Greek script (`ORABELLA PRECIOSA Μπαταρία Νιπτήρα 10356`) | Best recall. Perplexity + DataForSEO + marketplaces all return the right product. |
| ✅ Greeklish script (`ORABELLA PRECIOSA Mpataria Niptiros 10356`) | Works. Marginally lower ranking, fully usable. |
| ⚠️ `search_query` brand+model only (no SKU) | DataForSEO + Perplexity work fine. Marketplaces return cheapest item in the line (a wrong-product-type accessory like a spout) which gets filtered out — you'll see fewer marketplace rows. |
| ⚠️ `Νυπτήρα` typo (Υ instead of Ι) in Greek | Pipeline tolerates it via SKU anchoring, but recall is lower than the correct `Νιπτήρα` (Ι). |
| ⚠️ Shopflix without SKU | Their fuzzy search prioritises digit matches; without SKU+brand+model anchors they may return unrelated products. Our plausibility filter rejects these → zero false positives but Shopflix often returns no rows for SKU-less queries. |
| ❌ `{BRAND} {SKU}` (no model) on Bestprice | Bestprice returns zero. Their search needs `{BRAND} {MODEL} {SKU}`. Our adapters now build this automatically when `search_query` carries all three. |
| ✅ Same retailer appearing twice in results | This is normal — once from `dataforseo_shopping` (Google Shopping feed entry, has rating + image), once from `perplexity_web_search` (real retailer page, may have on-page promo `original_price`). UI tip: render one row per retailer domain and surface both data points. |

---

## 5. ⚠️ Recommended request change — **send the SKU**

The single highest-impact thing partners can do: include the SKU in the `search_query` string.

### Why it matters

Marketplace search engines (Skroutz / Bestprice / Shopflix) sort results by price-asc. For a brand+model query like `"ORABELLA PRECIOSA"`, the cheapest item in that brand line is usually a small accessory (a €50 spout/εκροή) — **not** the basin faucet you actually want. With a SKU, our marketplace adapters build a tight `"{BRAND} {MODEL} {SKU}"` query that lands directly on the right product page.

### Recommended `search_query` format

```
{Brand} {Model/Series} {SKU} [optional finish/colour]
```

### Examples

```
✅  "ORABELLA PRECIOSA 10356 Brushed Nickel"
✅  "MAIDTEC 7012MT Stainless Steel"
✅  "Ferrara Beige Keros 60x120"

⚠️  "ORABELLA PRECIOSA"                    ← works for Perplexity + DataForSEO,
                                               marketplaces will mostly miss
⚠️  "ORABELLA PRECIOSA Μπαταρία Νιπτήρα"  ← same — no SKU disambiguation
```

### What changes when you add the SKU

| Without SKU | With SKU |
|---|---|
| Marketplaces return the cheapest item in the brand line, often an accessory | Marketplaces return the exact product page |
| Many `family` rows (sibling SKUs) | Few/no `family` rows |
| Filter drops most marketplace results as wrong-product-type | All marketplace results pass the filter |
| Classifier has nothing to anchor against | Classifier marks the right SKU `exact`, sibling SKUs `family` |

### Migration tips

- If your catalog has structured SKU fields, concatenate `{brand} {model} {sku}` as the `search_query`.
- If you don't have a SKU, send brand+model+colour — but expect fewer marketplace rows.
- You can update existing `tracked_queries` via `PUT /api/v1/prices/track/{id}` with a new `search_query`. The next refresh will use the new query and re-extract facets (no extra cost — facet extraction is a one-shot Haiku call).

---

## 6. Migration checklist

| Item | Required? | Action |
|---|---|---|
| Add `family` to your `match_kind` switch/render logic | Recommended | Render under "Similar products in this series" or hide; never include in chart/median |
| Read the new `marketplace_*` and `idealo` source values | Recommended | Add labels in your retailer-source badge map |
| Migrate to the split `{ results, family_results }` response | Optional | Cleaner UI — but the legacy mixed array still works |
| Re-format `search_query` to include SKU | **Strongly recommended** | See §5 |
| Subscribe to the new sticky-promotion endpoints | Optional | Only needed if you expose admin-correction tooling |
| Update existing tracked queries with SKU-bearing `search_query` | Optional | One `PUT` per tracked query; next refresh picks it up |

---

## 7. Need help?

- Live API base: `https://v1api.materialshub.gr`
- Full reference: [`price-monitoring-api.md`](price-monitoring-api.md)
- Auth: `Authorization: Bearer <api_key>`
- Source values reference: see *Result row fields* in the full reference.

If you hit a row that's mis-classified (e.g. `family` when it should be `exact`), flag it via the promote/demote endpoints. The corrections feed the classifier globally, so corrections from your workspace help the next refresh of every workspace.
