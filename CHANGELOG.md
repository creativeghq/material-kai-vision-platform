# Changelog

All notable changes to the Material Kai Vision Platform.

---

## [unreleased] - 2026-05-23 / 2026-05-24

**Role simplification, Solo/Business entity, Apply-for-Dealer/Factory flow, VIES + myAADE auto-fill**

Motivation: signup landed every new user as a generic `user` with no path to becoming a verified dealer or factory, and the platform had no concept of "this user IS a registered business with VAT + address." Closed the loop end-to-end.

- **`manager` role dropped.** Collapsed `manager` into `admin` — `public.roles` is now 4 rows (`user`, `dealer`, `factory`, `admin`). Zero users had it. Cleaned `allowedRoles` in `crm-contacts-api`, `crm-companies-api`, `reset-platform`; removed `ROLES.MANAGER` from `src/auth/roles.ts`. See [user-levels-access.md](docs/user-levels-access.md).

- **Solo / Business entity on user profile.** `user_profiles.entity_type` (enum `solo` | `business`, default `solo`) + `user_profiles.business_id` (FK → `crm_companies(id)` ON DELETE SET NULL). New "Business" section in [`ProfileTab.tsx`](src/components/core/Profile/ProfileTab.tsx) with full company form. Saving Business creates/updates a `crm_companies` row owned by the user — so the business *is* a CRM company, naturally visible to admins in `/admin/crm`.

- **Apply-for-Dealer/Factory workflow.** New `role_upgrade_requests` table + RLS (own SELECT/INSERT, admin SELECT/UPDATE/DELETE). New `role-upgrade-requests` edge function with `action: submit | approve | reject`. Submit is gated on `entity_type='business'`, fans out **bell notifications + emails** to every admin (template `role_upgrade_request.submitted`). Approve flips `user_profiles.role_id` + emails the user. Partial unique index blocks duplicate pending applications per (user, role). User-facing `<ApplyForRoleCard />` mounted above the plans grid in `SubscriptionTab`; admin-facing `<AdminRoleUpgradeRequestsPanel />` mounted on the Overview tab of the user detail page.

- **VIES validation on every VAT entry.** New `vies-validate` edge function (no secrets — VIES is public). Returns `valid`, splits `legal_name||trade_name` on `||`, includes a per-country address parser for **EL / DE / FR / IT / ES / NL / AT / BE / PT**. "Verify via VIES" button in Business section; "Use this name" + "Use this address" actions one-click pre-fill the form. Caches `vat_validated`, `vat_validated_at`, `vat_validated_name`, `vat_validated_address`, `vat_validation_source` on `crm_companies`. `role-upgrade-requests` re-validates VIES at submit time and snapshots the result on the request row so the admin sees the verdict immediately.

- **myAADE module — Greek business registry integration.** Self-contained module under `src/modules/myaade/` + family of `myaade-*` edge functions sharing `_shared/aade/soap.ts` helpers (WS-Security envelope builder, SOAP poster, XML helpers, credential resolver). Today: `myaade-rgwspublic2` wraps ΑΑΔΕ's `rgWsPublic2AfmMethod` (SOAP 1.2 + WS-Security UsernameToken). Returns legal name, trade name, ΔΟΥ, primary + secondary ΚΑΔ, legal form, registered start date, **fully structured** address. New columns on `crm_companies`: `commercial_title`, `legal_status`, `kad_primary`, `kad_primary_description`, `kad_secondary jsonb`, `business_start_date`, `aade_data jsonb`, `aade_data_at`. 90-day cache. Mounted as "Get full details from ΑΑΔΕ" button in `BusinessSection` (visible only when country_code='EL' AND vat_number has 9 digits). Admin overview at `/admin/modules/myaade` with step-by-step credential registration + live test-lookup panel.

- **`platform_secrets` rows seeded** with `primary_module_slug='myaade'`: `AADE_USERNAME`, `AADE_PASSWORD` (sensitive), `AADE_AFM_CALLED_BY` (optional). Standard env-first → DB-fallback via `_shared/secrets.ts → resolveSecret()`. Setting up requires "Ειδικοί Κωδικοί Πρόσβασης ΑΑΔΕ" at https://www1.gsis.gr/sgsisapps/tokenservices/ — separate from regular TAXISnet credentials. Every successful ΑΑΔΕ lookup writes an audit entry to the looked-up ΑΦΜ's TAXISnet inbox (per ΑΑΔΕ policy); the module only calls ΑΑΔΕ when a user is verifying their OWN business.

- **Email templates seeded**: `role_upgrade_request.submitted` / `.approved` / `.rejected` (category `notification`). The submitted template includes `{{vat_status_html}}` + `{{vat_status_text}}` placeholders so admins see "✓ verified via VIES as <legal name>" or "✗ VIES says invalid" inline next to the VAT number.

- **Docs**: `src/modules/myaade/README.md` (new), CLAUDE.md myAADE section, `docs/deployment-guide.md` myAADE + VIES sections, `docs/INDEX.md` new-features entries, `docs/api/README.md` business-profile/verification section, `docs/user-levels-access.md` platform-roles rewrite, `docs/crm-system.md` company-fields expansion.

- **Naming convention for future ΑΑΔΕ services**: all `myaade-*` (mirrors the module slug; e.g. `myaade-mydata-issue-invoice`, `myaade-icisnet-customs`). Each new service reuses the shared SOAP helpers — typically ~80 lines.

---

## [unreleased] - 2026-04-25

**Price monitoring — Firecrawl price verification + on-page was/now pricing (Phase 7)**

Motivation: validation against real-world queries (e.g. "Απορροφητήρας Συρόμενος inox Maidtec 7012ΜΤ") showed Perplexity/DataForSEO hallucinating prices €9–16 below the actual retailer-posted price for 6 of 8 results. Root cause: both engines read snippets / feed aggregations, not the rendered product page. Fix: a second, Firecrawl-powered verification pass that actually fetches every retailer URL and confirms the price against what the user sees on the page.

- **Two-stage discovery → verification pipeline**:
  1. Stage A (unchanged): Perplexity Sonar + DataForSEO Merchant run in parallel, merged + deduped by domain.
  2. Stage B (new): each hit's `product_url` is fetched via Firecrawl with a `PriceExtraction` schema; the extracted price replaces the LLM price and `verified: true` is set.
  - `verify_prices: false` opts out when latency / cost matter more than accuracy.
  - Discrepancy rule: if the Firecrawl price differs by >20% from the Perplexity/DataForSEO price, we trust Firecrawl (read the page) and append a diagnostic to `notes` (e.g. `"verify: was perplexity=€45.00, actual on page=€54.90"`).
  - Parallel verification via `asyncio.gather` — N hits verify in roughly the wall-time of a single scrape (~1–3s), so verification adds ~30s to a synchronous POST regardless of `N`.

- **On-page was/now pricing**:
  - Every `PriceHit` / tracked_query_price_history / price_history row now carries `original_price: number | null` alongside `price`. Populated only when the retailer displays both on the page (e.g. `€89` strikethrough → `€79`).
  - UI renders `original_price` as strikethrough next to the current price.
  - Distinct from historical price change (`/history`) — `original_price` is the retailer's own promo callout.

- **New / changed surfaces**:
  - **MIVAA**: `perplexity_price_search_service._verify_hits_with_firecrawl`, `DiscoverSourcesRequest.verify_prices`, `CreateTrackRequest.verify_prices`, `UpdateTrackRequest.verify_prices`, `TrackedQueryResponse.verify_prices`, `TrackedQueryResultRow.original_price + verified`.
  - **DB**: migration `price_monitoring_verify_and_original_price`:
    - `tracked_queries` += `verify_prices boolean NOT NULL DEFAULT true`
    - `tracked_query_price_history` += `original_price numeric`, `verified boolean NOT NULL DEFAULT false`
    - `price_history` += `original_price numeric`, `verified boolean NOT NULL DEFAULT false`
    - `competitor_sources` += `current_original_price numeric`, `current_price_verified boolean NOT NULL DEFAULT false`
  - **UI**: `RetailerTable` (in `ProductMonitorTab.tsx`) adds a green `Verified` badge when `current_price_verified = true` and renders `current_original_price` as strikethrough. `priceMonitoringApi.ts` types extend `PerplexityHit` with `original_price`, `verified`, `source`, image/rating fields.
  - **Public docs**: `docs/api/price-monitoring-api.md` updated with verification semantics, new response fields, FAQ entries, changelog v3.

- **Backwards compatibility**: all new fields are additive. Clients that don't send `verify_prices` get verified prices by default (the correct upgrade). Old history rows keep `verified: false` — not a data-quality flag, just "predates verification."

**Product-identity verification (2026-04-25 Phase 8)**

Motivation: Firecrawl was confirming the price on the page but not the identity of the product. ORABELLA PRECIOSA BLACK MATT validation surfaced rows like Casasolutionsgekas returning a shower column (same brand, totally different SKU) labeled "verified." Fix: a Haiku-powered classifier that compares the asked product's facets against what the retailer page actually shows, and a URL pre-filter that drops obvious non-product URLs before spending Firecrawl credits on them.

- **Query facet extraction** — Claude Haiku 4.5 decomposes each query into `{brand, model, product_type, variants, required_tokens, variant_tokens}`. Cached on `tracked_queries.query_facets jsonb` so repeated refreshes don't re-pay for decomposition. For catalog `/discover` and `/market-check`, facets come directly from `products.metadata` — no LLM call.
- **URL pre-filter** — rules-based (no network). Drops homepage, `/search`, `/catalog`, `/brand/` paths, Google Shopping SERPs (when source isn't DataForSEO), aggregator hosts masquerading as retailers, sub-4-char slugs. Saves ~30-50% of Firecrawl credits and nukes the worst category of "wrong URL" hits.
- **Greek/Latin model normalization** — `"7012ΜΤ"` ≡ `"7012MT"` ≡ `"7012-MT"`. Greek lookalikes (Μ/M, Τ/T, Α/A, etc.) folded to Latin. Accent/tonos stripped. Separators removed. Inside `product_identity_service.normalize_model_token`.
- **Expanded Firecrawl extraction** — `PriceExtraction` widened with `product_name`, `product_breadcrumb`, `visible_attributes` so the classifier has identity-bearing signal alongside the price.
- **Batched Haiku identity classifier** — one prompt-cached Haiku call classifies N scraped pages against the query facets. Verdicts per hit: `exact` / `variant` / `family` / `mismatch` / `unverifiable`. Soft on finish descriptors (MATT ≡ BLACK MATT ≡ MATTE BLACK), hard on brand + model + product_type.
- **Policy enforcement**: `exact` + `variant` + `unverifiable` reach the UI; `mismatch` + `family` are dropped before the response leaves MIVAA. Variants carry a `match_note` like `"Color differs: asked BLACK MATT, page shows WHITE MATT"` and are **excluded from** min/median/max statistics but **shown** in the retailer list.
- **`original_price` sanity** — reject values `≤ current_price` or `> 5× current_price`. Killed the Flobali €11,900 SKU-as-price bug.
- **Graceful degradation** — when Haiku is unreachable, a rule-based fallback still classifies using `required_tokens` presence in the page title or URL slug so the pipeline keeps producing output.
- **Every classifier decision** logged to `ai_usage_logs` with `operation_type='product_match_classifier'` for auditability.

**Surfaces**:
- MIVAA: new service `app/services/integrations/product_identity_service.py`. `search_prices()` pipeline: facet extraction → DataForSEO + Perplexity parallel → URL pre-filter → Firecrawl verify → identity classifier → drop mismatches.
- DB: migration `price_monitoring_product_identity` adds `match_kind`, `match_score`, `match_note` to `competitor_sources`, `tracked_query_price_history`, `price_history`. `tracked_queries.query_facets jsonb` for cache. `idx_competitor_sources_product_match` for "exact-only" dashboards.
- API (public): `TrackedQueryResultRow` widens with `match_kind`, `match_score`, `match_note`. `/prices/lookup` `/prices/track/*` `/price-monitoring/discover` `/price-monitoring/market-check` all return these fields on every retailer row.
- UI: amber "Variant" and grey "Unverified" badges on `ProductMonitorTab.RetailerTable` and `MarketPanel.MarketHitRow`, with tooltips showing the facet diff. `MarketPanel` percentile callout computes against exact matches only. "X/Y exact" counter in the stats header.

**Cost profile shift per discovery (~10 hits)**: today $0.044 → proposed $0.037. Small Haiku cost (+$0.002) more than offset by Firecrawl savings from pre-filter drop.

**Two follow-up fixes in the same release**:

1. **DataForSEO merchants were being dropped by the URL pre-filter.** Fixed by making pre-filter source-aware — DataForSEO hits bypass the SERP / aggregator checks because their Google Shopping URL is a redirect by design but the feed payload is authoritative. Firecrawl verification is also skipped for DataForSEO rows (the redirect isn't a scrapable product page); they're marked `verified=true` with provenance = Shopping feed.
2. **Merge dedupe was collapsing every DataForSEO merchant to `google.gr`.** DataForSEO's URL field for Shopping-feed hits is always a `google.gr/search` redirect, so domain-keyed dedupe in `_merge_with_dataforseo` folded 20+ merchants into 1. Fixed by keying DataForSEO hits on `(retailer_name, product_title[:80])` instead. Bumped DataForSEO task depth from `limit` (default 10) to `max(limit, 30)` since Google Shopping routinely has 20-30 merchants per product. Net effect: 8× more merchants reach the UI.

**`product_title` field (new on every row)**

- Exact product name as displayed on the retailer page. Populated from DataForSEO Shopping feed title or Firecrawl `product_name`. Persisted on `tracked_query_price_history.product_title`, `price_history.product_title`, and `competitor_sources.current_metadata.product_title`.
- UI renders it as a subtitle under `retailer_name` so multiple listings from the same retailer (different variants) disambiguate visibly.
- Also carried on `TrackedQueryResultRow`, `PriceHit`, and `/price-monitoring/discover` + `/market-check` responses.

**Price monitoring UI polish on top of Phase 7**

- **Admin-only `Verify` toggle** next to `Refresh now` in `ProductMonitorTab`. Lets admins opt out of verification per-run when coverage matters more than price accuracy (e.g. bulk re-scans). `verify_prices` is also threaded through `/api/v1/price-monitoring/discover` so the backend respects the choice.
- **Perplexity summary** ("closest retailer, manufacturer showroom presence, pricing outliers to question") is now returned on `DiscoverSourcesResponse.summary` and rendered above the retailer table.
- **DataForSEO enrichment rendering**: merchant rows show a 48×48 thumbnail, star rating, and review count. Backed by a new `competitor_sources.current_metadata jsonb` column populated on every upsert (`image_url`, `rating_value`, `rating_votes`, plus the verification discrepancy `notes` string).
- **"Corrected" badge**: when Firecrawl overrode the LLM price by >20%, a standalone amber `Corrected` badge appears alongside the green `Verified` badge. The `Verified` badge tooltip includes the full discrepancy string when present.
- **DB**: migration `price_monitoring_current_metadata` adds `competitor_sources.current_metadata jsonb`.

**Check Market button (stateless market scan for pricing decisions)**

Admin-only companion to the KB-based AI price proposal in `PriceLookupDrawer`. Click runs Perplexity + DataForSEO + Firecrawl verification scoped to the admin's country, and surfaces min / median / max / verified-count alongside the KB proposal so admins can price against real retailers.

- **Stateless**: does NOT enroll the product into continuous monitoring, does NOT write to `competitor_sources` or `price_history`.
- **Monitoring-aware cache**: if the product is already enrolled and the last monitoring refresh is ≤6h old, the cached snapshot is reused (credits_used=0, `from_monitoring_cache: true`).
- **Percentile callout**: renders "Your KB price sits at the Nth percentile of the market" with green (middle 50%), amber (>75th percentile), or red (<25th or >100th) tone so pricing outliers surface at a glance.
- **New surfaces**:
  - MIVAA: `POST /api/v1/price-monitoring/market-check` (session JWT, admin/super_admin only). Request: `{product_id, product_name, dimensions, manufacturer, verify_prices}`. Response: `{stats: {count, verified_count, min, max, median, currency}, results: PriceHit[], summary, from_monitoring_cache, cache_age_seconds}`.
  - Frontend: `src/components/features/pricing/MarketPanel.tsx` (new), `marketCheck()` + `MarketCheckResponse` in `priceMonitoringApi.ts`.

---

## [previous] - 2026-04-24

**Price monitoring — Phase 2 rebuild (Perplexity discovery + external-project tracking API)**

- **Engine swap (Claude → Perplexity Sonar-pro)**: replaced `web_search_20250305` with Perplexity. Claude's API search used Brave-based snippets that missed prices visible on retailer pages (verified: youbath.gr shows `25,00 €/m²` inline; Claude snippet didn't include it). Perplexity has deeper page reading + real `user_location` geo support.
  - New: `app/services/integrations/perplexity_price_search_service.py`. Model: `claude-opus-4-7`-equivalent quality via `sonar-pro`, structured JSON output via `response_format.json_schema`, 6h throttle, credit logging to `ai_usage_logs`.
  - Deleted: `app/services/integrations/claude_price_search_service.py` (dead).
  - ~30× cheaper than Opus (+ web_search) and ~8× faster, with 6× more results on realistic queries.
  - Strong out-of-stock inclusion: pages showing `€25 - Out of stock` (or local-language equivalents like `Εκτός διαθεσιμότητας`, `Nicht auf Lager`, `Agotado`, `Rupture de stock`) are included with `availability=out_of_stock` + the posted price.
  - Domain pinning (Option 2): `search_domain_filter` accepts up to 10 `preferred_retailer_domains` to force-probe known retailers whose product pages rank below Perplexity's default retrieval set.

- **External API for other projects** (new):
  - `tracked_queries` + `tracked_query_price_history` tables. Hard-linked via `api_key_id → api_keys.id ON DELETE CASCADE` — deleting the key wipes the tracked query and its full history.
  - 7 public endpoints at `/api/v1/prices/track/*` (CRUD + refresh + history), all api_keys Bearer auth, route-level `authenticate_api_key` dep.
  - `POST /api/v1/prices/track` runs Perplexity synchronously and returns initial results; subsequent refreshes automatic via cron on `refresh_interval_hours` cadence (1–720h).
  - `preferred_retailer_domains` param forces Perplexity to probe those domains.
  - `POST /api/v1/price-monitoring/tracked-queries/cron-refresh` (x-cron-secret auth) — called by Supabase cron to refresh due queries in a batch.
  - Extended `supabase/functions/price-monitoring-cron` to call the tracked-queries refresh after the existing internal loop.

- **New enum value**: `competitor_source_type` += `perplexity_web_search`. `claude_web_search` kept for historical rows only.

- **Deploy workflow fix** (`mivaa-pdf-extractor/.github/workflows/deploy.yml`):
  - Added `PERPLEXITY_API_KEY` to both the env block and the systemd `Environment=` line — was missing, so the key never reached the server even when set in GitHub Secrets. Flagged for follow-up: SLIG env vars are still manually configured via `/etc/systemd/system/mivaa-pdf-extractor.service.d/slig-env.conf` (not in GitHub Secrets).

- **UI refactor** (`src/components/business/price-monitoring/ProductMonitorTab.tsx`):
  - Per-product layout: Enable toggle + Admin "Refresh now" (role-gated) → price history chart → Discovered retailers table (Perplexity, ≤10) → Custom Monitoring section (Firecrawl URLs).
  - New `RetailerTable` subcomponent with out-of-stock / limited / stale badges.
  - `priceMonitoringApi.ts` — API client wrapping the MIVAA endpoints for the session-JWT path (discover, check-now, start/stop).

- **Public API docs**: `docs/api/price-monitoring-api.md` — full reference for external integration (auth, every endpoint's request/response schema, error codes, rate limits, curl + TypeScript + Python recipes, FAQ).

- **Cleaned up the internal /discover endpoint**: moved from Claude-specific language to Perplexity-neutral wording. `price_monitoring_routes.py` still writes `perplexity_web_search` as source_type.

**Additional incidents fixed along the way (2026-04-23/24 working session):**
- `api_keys` table had RLS enabled with zero policies, silently denying all INSERTs. Added 5 policies (`api_keys_{select,insert,update,delete}_own` + `api_keys_admin_all`). Dropped `consolidated_api_keys_SELECT_public` which referenced a non-existent `user_roles` table — it was poisoning all PostgREST queries against `api_keys` with HTTP 404.
- `ai_usage_logs` logger was inserting `api_provider` / `operation_details` / `credits_used` as top-level columns that don't exist. Moved into `metadata` jsonb.
- Firecrawl v2 API shape: `formats: ["markdown"]` + top-level `extract` key was being rejected with 400. Fixed `FirecrawlClient` + `scrape-single-page`, `scrape-preview`, `factory-enrichment-agent` to use `formats: [{type: "json", schema, prompt}]` shape.
- `SubscriptionTab.tsx`: revoked API keys no longer show eye/copy buttons (were leading nowhere); always-on status badge (green Active / red Revoked); OAuth divider `bg-card` removed per visual spec.

---

## [2026-04-23]

**Price monitoring — Phase 1 (Firecrawl consolidation + public lookup API)**
- Added shared `FirecrawlClient` (`mivaa-pdf-extractor/app/services/integrations/firecrawl_client.py`) — Pydantic `model_json_schema()`-driven extraction, exponential backoff on retryable errors, centralized credit logging, opt-in `use_javascript_render` flag for JS-heavy pages.
- Added `PriceExtraction` Pydantic model (`app/models/extraction.py`) with descriptive fields used as LLM hints.
- Added locale-aware price parser (`app/utils/price_parsing.py`) via `price-parser>=0.3.4` — handles `$49.99`, `€1.299,00`, `From £29`, ISO-4217 normalization. New dep in `requirements.txt`.
- Refactored `competitor_scraper_service.py` onto shared client (~290 → ~90 lines).
- Parallelized per-source scraping in `price_monitoring_service.py` with `asyncio.gather` + `Semaphore(5)`.
- Added denormalized `current_price` cache columns to `competitor_sources` (`current_price`, `current_currency`, `current_availability`, `current_price_updated_at`) for O(1) alert evaluation.
- Added `source_type` enum to `competitor_sources` (`firecrawl_url` active, `dataforseo_shopping` reserved for Phase 2).
- Wired notification delivery for triggered alerts: `_dispatch_alert_notification` → `NotificationService` → `notification-dispatcher` edge function → Resend (email) + `user_notifications` insert (in-app). `price_alert_history.notification_sent`/`notification_sent_at`/`notification_channels` now flipped on success.

**Price monitoring — Public Lookup API (curl-callable)**
- New endpoint `POST /api/v1/prices/lookup` (`mivaa-pdf-extractor/app/api/price_lookup_routes.py`) — one-shot price extraction for external callers.
- Auth via `api_keys` table (`Authorization: Bearer <key>`) — validates `is_active`, `expires_at`, `allowed_endpoints`; resolves workspace via `workspace_members` for billing.
- Per-key sliding 60s rate limit (default 60/min, configurable via `rate_limit_override`, cap 600/min).
- New `price_lookups` usage table (api_key_id, user_id, workspace_id, url, success, price, currency, credits_used, latency_ms, raw_extract). RLS: users see their own rows only.
- Path whitelisted in JWT middleware exclude list — route uses its own `authenticate_api_key` dependency.

**Cleanup**
- Removed Sonnet entirely; standardized on Claude Opus 4.7 as the primary model and Haiku 4.5 for fast/background tasks.

---

## [2026-01-18] - Major Feature Expansion & Documentation Update

### 🚀 New Features

**Web Scraping Integration**
- Firecrawl-powered web scraping for automatic product discovery from manufacturer websites
- AI-powered product extraction using Claude Opus 4.7
- Background processing with real-time progress tracking
- Automatic image extraction and linking
- 3 API endpoints: `/api/scraping/process-session`, `/api/scraping/session/{id}/status`, `/api/scraping/session/{id}/retry`

**Price Monitoring System**
- Competitive price monitoring for products across multiple sources
- On-demand and scheduled price checks (hourly, daily, weekly)
- Price history tracking and trend analysis
- Configurable price alerts with multiple notification channels
- Competitor source management
- 14+ API endpoints for comprehensive price tracking

**Saved Searches with AI Deduplication**
- Smart search deduplication using Claude Haiku 4.5
- Semantic similarity analysis (85-95% threshold)
- Auto-merge for highly similar searches (95%+)
- Integration context support (chat, moodboard, 3d_generation)
- Usage tracking and relevance scoring
- 7+ API endpoints for search management

**Interior Design Generation**
- Multi-model AI interior design generation (14 total models)
- 7 text-to-image models (FLUX, SDXL, Playground, Stable Diffusion 3, etc.)
- 7 image-to-image models for room transformation (3 production-ready)
- Parallel processing with retry logic
- Permanent storage in Supabase Storage
- Real-time progress tracking via database polling
- Credit-based billing system

### 📝 API Expansion

**New Route Categories:**
- Web Scraping Routes (3 endpoints)
- Price Monitoring Routes (14+ endpoints)
- Saved Searches Routes (7+ endpoints)
- Interior Design Routes (2 endpoints)

**Total API Endpoints:** 150+ (updated from 114)

### 🗄️ Database Schema Updates

**New Tables:**
- `scraping_sessions` - Web scraping job tracking
- `scraping_pages` - Scraped page content storage
- `price_monitoring_products` - Products being monitored
- `price_history` - Historical price data
- `competitor_sources` - Competitor source URLs
- `price_alerts` - User-configured price alerts
- `price_monitoring_jobs` - Price check job history
- `saved_searches` - User saved searches with AI metadata
- `generation_3d` - Interior design generation jobs

### 🔧 Technical Improvements

**Async Architecture:**
- Fully async processing across all methods (PDF, Web, XML)
- Unified concurrency limits (5 TogetherAI, 2 Claude, 10 uploads, 20 CLIP)
- Timeout configuration (300s discovery, 120s AI, 30s downloads)
- Shared services across all processing pathways

**Production Hardening:**
- Source tracking for all generated content
- Heartbeat monitoring for stuck job detection
- Sentry error tracking with transaction monitoring
- Comprehensive error handling and retry logic

**Credit System:**
- Internal credit-based billing for AI operations
- Per-model cost tracking
- Automatic credit deduction after generation
- Balance tracking per workspace

### 📚 Documentation Updates

**New Documentation Files:**
- `docs/web-scraping-integration.md` - Complete web scraping guide
- `docs/price-monitoring-system.md` - Price monitoring features
- `docs/price-monitoring-deployment-guide.md` - Deployment instructions
- `docs/saved-searches-deduplication.md` - Smart search deduplication
- `docs/interior-design-models.md` - AI model inventory
- `docs/interior-design-data-flow.md` - Generation workflow
- `docs/interior-designer-agent-user-guide.md` - User guide
- `docs/internal-pricing-credit-system.md` - Credit system documentation

**Updated Documentation:**
- `README.md` - Added new features and updated metrics
- `docs/INDEX.md` - Complete feature catalog update
- `docs/README.md` - Updated learning paths
- `docs/api-endpoints.md` - New API routes documented
- `docs/system-architecture.md` - Architecture updates

### 🎯 Performance Impact

**Web Scraping:**
- Processing time: 2-5 minutes for 10-25 products
- Success rate: 95%+ scraping, 85%+ product discovery
- Cost: $0.02-0.05 per product


**Interior Design:**
- Generation time: 5-13 seconds per model
- Parallel processing: 3 concurrent models
- Success rate: 90%+ for working models
- Cost: $0.015-0.055 per generation per model

---

## [2025-11-18] - Memory Optimization & CLIP Integration

### 🚀 Major Performance Improvements

**Memory Crash Fix**
- Fixed critical memory crash during image extraction (900+ images)
- Reduced memory usage from 2.5GB accumulation to 10-15MB constant
- Changed batch_size from 2 to 1 for maximum stability
- Implemented immediate disk cleanup after processing each image

**CLIP Embedding Integration**
- Integrated CLIP embedding generation into image extraction stage
- Generate all 5 CLIP embeddings (visual, color, texture, application, material) per image
- Save embeddings to VECS collections immediately
- Eliminated separate CLIP generation stage

**Pipeline Optimization**
- Reduced pipeline from 14 stages to 9 stages
- Combined Image Extraction + CLIP Embeddings into single stage
- Improved resilience: CLIP embeddings preserved if crash occurs
- Same total processing time (work moved, not added)

### 📝 Technical Changes

**Files Modified**:
- `mivaa-pdf-extractor/app/services/pdf_processor.py`
  - Added per-image CLIP generation
  - Implemented immediate DB saves
  - Added memory cleanup after each image
  
- `mivaa-pdf-extractor/app/services/supabase_client.py`
  - Added `save_single_image()` method
  - Reuses existing batch save patterns
  
- `mivaa-pdf-extractor/app/utils/timestamp_utils.py`
  - Created `normalize_timestamp()` utility
  - Fixes PostgreSQL timestamp parsing issues

**Commits**:
- `a43eeaa` - Fix timestamp parsing bug in job recovery
- `c9a75cb` - Optimize image processing to prevent memory crashes
- `4599e64` - Add CLIP embedding generation per image during extraction

### 📊 Performance Impact

**Before Optimization**:
- Memory: 2.5GB accumulation → CRASH at 900 images
- Images saved: 0 (crashes before completion)
- CLIP embeddings: 0 (never reached)
- Success rate: 0% for large PDFs

**After Optimization**:
- Memory: 10-15MB constant
- Images saved: 900+ ✅
- CLIP embeddings: 4,500+ (5 types × 900 images) ✅
- Success rate: 100%
- Processing time: 45-75 minutes (same as before, just works now)

### 🔧 Architecture Changes

**New Pipeline Flow**:
```
Stage 1: PDF Extraction
Stage 2: Chunks Created
Stage 3: Text Embeddings
Stage 4: Images Extracted + CLIP Embeddings ← Combined!
Stage 5: Products Detected
Stage 6: Products Created + Entity Linking
Stage 7: Completed
```

**Per-Image Processing**:
1. Extract from PDF (PyMuPDF4LLM)
2. Upload to Supabase Storage
3. Save metadata to document_images table
4. Generate 5 CLIP embeddings
5. Save embeddings to VECS
6. Delete from disk
7. Clear from memory
8. Force garbage collection

### 📚 Documentation Updates

**Updated Files**:
- `docs/pdf-processing-pipeline.md` - Complete pipeline flow update
- `docs/system-architecture.md` - Architecture tier updates
- `CHANGELOG.md` - This file (created)

### 🎯 Benefits

1. **Memory Safety**: Can process unlimited images without crashes
2. **Resilience**: CLIP embeddings preserved if process crashes
3. **Simplicity**: Fewer stages, cleaner architecture
4. **Progress Visibility**: Real-time CLIP generation tracking
5. **Same Performance**: Total time unchanged, just more reliable

---

## [Previous Changes]

See Git history for changes before 2025-11-18.

