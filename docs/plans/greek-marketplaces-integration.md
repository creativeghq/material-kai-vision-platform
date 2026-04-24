# Price monitoring: integrate Skroutz + Bestdeals + Shopflix as always-on discovery sources

> **Status**: Draft plan — ready to paste into a GitHub issue or pick up directly.
> **Source**: Session of 2026-04-25, follow-up to Phase 7 verification release.
> **Repo**: `creativeghq/material-kai-vision-platform`

---

## Why

The Perplexity + DataForSEO + Firecrawl pipeline now produces **accurate prices** (verified against the retailer's live page), but retail URL quality is still uneven for Greek-market products. Validation on `Απορροφητήρας Συρόμενος inox Maidtec 7012ΜΤ` (2026-04-25) showed:

- **Elektrostore24** — URL pointed to a Google Shopping SERP (`google.gr/search?ibp=oshop&...`), not a retailer product page.
- **Toolsat** — retailer name said "Toolsat" but URL pointed to `bestprice.gr/item/...`. Firecrawl verified the aggregator's price (€79), which is correct for that page but wrong for "Toolsat."
- Previous run had two retailers returning **homepage URLs** because Perplexity knew they stocked the product but didn't have the deep link.

Root cause: Perplexity reads snippets (which often cite aggregators) and DataForSEO returns Google Shopping comparison links by design. Neither is a first-party retailer index.

**Skroutz, Bestdeals, and Shopflix fix this at the source** — they either *are* the first-party merchant index (Skroutz) or they're individual marketplace retailers we can query directly.

---

## Proposed architecture

New file `mivaa-pdf-extractor/app/services/integrations/greek_marketplaces_service.py` exposing:

```python
class GreekMarketplacesService:
    async def search(self, query: str, country_code: str) -> List[PriceHit]:
        if country_code != "GR":
            return []  # self-gated — Greek market only
        results = await asyncio.gather(
            self._skroutz(query),
            self._bestdeals(query),
            self._shopflix(query),
            return_exceptions=True,
        )
        return [hit for sub in results if isinstance(sub, list) for hit in sub]
```

Wired into `perplexity_price_search_service.search_prices()` as a **third parallel discovery source** alongside Perplexity + DataForSEO. Merge + dedup-by-domain logic stays unchanged.

---

## Per-source adapter strategy

| Source | Integration | Why | Incremental cost |
|---|---|---|---|
| **Skroutz** | Official API (`developer.skroutz.gr/api/v3`) | Free public API, OAuth2. `/search.json → /products/:id/skus → /skus/:id/shops.json` returns authoritative merchant list per SKU with direct URLs | 0 credits (rate-limited 100/min) |
| **Bestdeals.gr** | Firecrawl scrape of `bestdeals.gr/search?q=...` | No public API | 1 Firecrawl credit per query |
| **Shopflix.gr** | Firecrawl scrape of `shopflix.gr/search?search=...` | No public API — marketplace of 3rd-party sellers | 1 Firecrawl credit per query |

Each adapter returns `List[PriceHit]` with `source = "skroutz" | "bestdeals" | "shopflix"`. For Skroutz specifically, one query can produce N hits (one per merchant selling that SKU).

### Skroutz flow (the big unlock)

1. `GET https://api.skroutz.gr/search.json?q=<product>` (OAuth Bearer) → pick top product match
2. `GET /products/:id/skus.json` → pick top SKU
3. `GET /skus/:sku_id/shops.json` → **authoritative retailer list** — returns every Greek retailer selling that SKU with direct URL, price, shipping, availability
4. Each shop row → one `PriceHit(source="skroutz", retailer_name=shop.name, product_url=shop.url, price=shop.price, …)`
5. URLs are merchant-reviewed by Skroutz → deep-linkable, no aggregator muddle. Firecrawl verification becomes a sanity check.

Expected yield for Maidtec: 8-15 clean retailer rows with verified direct URLs — replaces most of what Perplexity is currently guessing at.

### Bestdeals + Shopflix

Single-retailer scrapes. One scrape per query → one `PriceHit` each (or zero if no match). Shared extraction schema:

```python
class MarketplaceProduct(BaseModel):
    found: bool
    product_url: Optional[str]
    price: Optional[str]
    original_price: Optional[str]
    availability: Optional[str]
```

---

## Schema changes

1. Extend `competitor_source_type` enum:
   ```sql
   ALTER TYPE competitor_source_type
     ADD VALUE 'marketplace_skroutz',
     ADD VALUE 'marketplace_bestdeals',
     ADD VALUE 'marketplace_shopflix';
   ```
2. Widen `PriceHit.source` literal to include the three new values (`perplexity_price_search_service.py`).
3. Skroutz merchant rating + review count fit into existing `competitor_sources.current_metadata jsonb` (same shape as DataForSEO ratings).

---

## UI changes

`src/components/business/price-monitoring/ProductMonitorTab.tsx` — lean toward a new **"Marketplaces"** section next to "Merchants," since Skroutz/Bestdeals/Shopflix form their own visual bucket (Greek price-comparison heavyweights). Alternative: fold into "Discovered retailers" with a small marketplace badge per row.

---

## Secrets required

Add to GitHub → Settings → Secrets (before Phase 1 ships):

- `SKROUTZ_CLIENT_ID`
- `SKROUTZ_CLIENT_SECRET`
- (optional) `SKROUTZ_BASE_URL` — defaults to `https://api.skroutz.gr`

Register the Skroutz app at https://developer.skroutz.gr/oauth/applications — server-to-server OAuth2 client-credentials flow, no user redirect.

No new secrets for Bestdeals / Shopflix — reuses existing `FIRECRAWL_API_KEY`.

---

## Rate limits / throttle

- **Skroutz**: 100 req/min per OAuth app. Three calls per discovery (search → skus → shops) → ~33 discoveries/min ceiling. Cron batch should cap at 20/min to leave headroom. Exponential backoff on 429.
- **Bestdeals / Shopflix via Firecrawl**: same cost/semantics as any other scrape; no special handling needed.

---

## Phased rollout

### Phase 1 — Skroutz only (~½ day)

Fixes ~70% of the "wrong URL" problem because Skroutz has first-party retailer data. Ship behind the GR country gate. Instrument credits saved vs Perplexity-only baseline.

**Blocking prerequisite**: register the OAuth app and drop both secrets into the repo.

### Phase 2 — Bestdeals + Shopflix (~½ day)

Thin Firecrawl adapters, ~30 lines each. No new secrets.

### Phase 3 — URL hygiene post-filter (optional)

Drop Perplexity hits whose host is `bestprice.gr`, `google.gr/search`, or a bare domain root **when** a Skroutz/merchant row for the same product already exists. Keeps the list clean without losing coverage.

---

## Expected net effect per Greek product discovery

- **+2 Firecrawl credits** (Bestdeals + Shopflix scrapes)
- **+3 Skroutz API calls** (free)
- **+8 to +15 extra clean retailer rows** with first-party direct URLs
- **Fewer "wrong product" UI complaints** — Skroutz's merchant feed is authoritative

---

## References

- Session that surfaced this: Phase 7 verification release (2026-04-25)
- `CLAUDE.md` → "Price Monitoring" section
- `CHANGELOG.md` → `[unreleased]` 2026-04-25
- Engine entry point: `mivaa-pdf-extractor/app/services/integrations/perplexity_price_search_service.py::search_prices()`
- Source-type enum: earlier migration `add_competitor_source_type_values_perplexity_dataforseo`
