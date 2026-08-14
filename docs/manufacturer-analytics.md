# Manufacturer Analytics

How product-engagement events are recorded, and where the resulting analytics are read.

Rewritten for issue #350. The previous version documented a `MyFactoryTab` dashboard that no longer
exists, a `tier` prop that gated panels that were deleted, and an RLS shape ("all authenticated
users can read") that was never applied.

---

## The event bus

**Table:** `manufacturer_analytics_events`

Two independent producers write to it, and they never see each other:

| Producer | Events | Auth |
|---|---|---|
| [manufacturerAnalyticsService.ts](../src/services/manufacturerAnalyticsService.ts) | `product_view`, `product_save`, `product_quote`, `product_compare`, `product_search_impression`, `product_search_click` | the signed-in user |
| [products-3d-api](../supabase/functions/products-3d-api/index.ts) (`EMBED_EVENT_TYPES`) | `embed_view`, `embed_model_load`, `embed_ar_launch`, `embed_add_to_cart`, `embed_configure`, `embed_plan_room` | service role, per embed key |

`event_type` is CHECK-constrained to the union of both lists. **Adding an event to either producer
without a migration means every one of those events is rejected at insert and reads as zero
forever** — [tests/unit/manufacturerEventContract.test.ts](../tests/unit/manufacturerEventContract.test.ts)
fails the build instead. Keep the producer, the CHECK, and that test's `DB_EVENT_TYPES` in step.

Every declared product event has a live call site, and the guard test asserts it:
`product_view` ([ProductCard](../src/components/features/products/ProductCard.tsx), on 50% visibility),
`product_save` ([AddToMoodboardButton](../src/components/business/moodboard/AddToMoodboardButton.tsx)),
`product_quote` ([AddToQuoteButton](../src/modules/quotes/components/AddToQuoteButton.tsx)),
`product_compare` ([MaterialComparePage](../src/pages/MaterialComparePage.tsx), once a shortlist of
2–4 actually loads), and `product_search_impression` / `product_search_click`
([UnifiedSearchInterface](../src/components/features/search/UnifiedSearchInterface.tsx)).

**An impression is not a view.** `product_view` fires when a catalog card scrolls into sight;
`product_search_impression` means the product was shown inside a *ranked result set*, and carries
the query and its rank. Only what actually renders counts — impressions key off the post-filtered
results, deduped per search, so narrowing a filter does not re-count.

> The search surface is real, but it was invisible for a while. `multi_vector` returns
> **product-shaped** rows (`{id: <product_id>, product_name, description, metadata, score}`), and
> the frontend was mapping `id` from `result.chunk_id` — a field that payload never carries. Every
> result arrived with an undefined id, rendered untitled, and its click matched no product. Fixed
> in #350; `SearchResult` in [unifiedSearchService.ts](../src/services/unifiedSearchService.ts) now
> declares chunk-shaped fields optional so the compiler refuses that mistake.

The service batches: flush every 5s or at 20 events, fire-and-forget, and it never blocks the UI.
A batch rejected for a permanent reason (bad `event_type`, RLS refusal, dangling `product_id`) is
reported and dropped rather than re-queued — retrying it every 5s until the 200-event cap silently
eats the queue is how a broken contract turns into a console line nobody reads.

### Tenancy

`workspace_id` is **derived from the product** by a `BEFORE INSERT` trigger
(`stamp_manufacturer_event_workspace`), never sent by the client. A caller that could assert its own
`workspace_id` could attribute engagement to a tenant it does not belong to (security invariant 1).
The service-role embed path keeps the binding it already scoped its product against.

`user_id` must equal `auth.uid()`, so **anonymous engagement is not recorded** — `track()` drops it
at the door rather than queueing an insert the policy will refuse.

### Reading it

**Go through a `SECURITY DEFINER` RPC — never read the table directly.** There is exactly one SELECT
policy and it is workspace-scoped, so a direct read returns only what the caller's own workspace
generated. That is precisely the bug the old geo panel had: it read the table directly and could
only ever have shown a supplier their own browsing.

`company_market_analytics(p_company_id, p_days)` is the read path. It is tenancy-guarded by
`assert_workspace_member`, joins events to products via `brand_company_id`, and returns
`product_count`, per-type `totals`, `geo`, and `top_products`.

---

## Where the analytics are read

| Question | Surface |
|---|---|
| How is *this supplier* doing? | CRM company → **Market** tab ([CompanyMarketTab](../src/modules/crm/components/market/CompanyMarketTab.tsx)), companies flagged `is_supplier` |
| What is *the market* doing? | **Market Trends** (`/market-trends`, workspace admins) |

A product counts towards a supplier once `products.brand_company_id` points at that company —
stamped on import by `resolve_brand_company`, or claimed via the **Factory Link** pin on the
company's Details tab (`claim_brand_for_company`). The free-text `products.metadata.factory_name` is
**not** a join key for analytics; it is only the raw maker string the pin resolves from.

---

## Removed, and why

- **`/factory-analytics` + `MyFactoryTab`** — keyed supplier identity off
  `user_profiles.factory_verified`, which no account holds, so the nav tile rendered for nobody and
  the products join used the free-text maker name that nothing writes.
- **"Competitive Positioning"** — computed `rank = ourSaves >= avgSaves ? ceil(total * 0.3) :
  ceil(total * 0.6)`. Two possible values, presented as a rank out of N with a progress bar.
- **Follower / hire-request / profile-view / preferred-by metrics** — they describe a platform user.
  A CRM company record has none, so they are not shown rather than shown as zero.
- **The `tier` prop** (`free | pro | enterprise`) — it gated panels that no longer exist. There is
  no tier gate on the Market tab.
