# Surplus Marketplace (#219)

A **0%-commission, last-stock marketplace** that lets one tenant list surplus warehouse stock and lets **any business tenant** browse it under **Discover → Marketplace**. Buyers inquire through a bridged inbox thread (no cross-tenant account sharing). This is the platform's **first read-across-workspaces RLS surface** — it is deliberately self-contained and gated.

> Not to be confused with the workspace-hierarchy **resale** marketplace (`marketplace_price_resolver` / `marketplace_commission_ledger` / `ws_marketplace_node_model`, ~2026-06-06), which is the reseller-pricing pyramid. This doc is the surplus / last-stock marketplace only (`marketplace_listings` & friends, ~2026-06-18).

---

## Tables

**`marketplace_listings`** — a surplus listing.
- `id`, `workspace_id` (seller), `warehouse_item_id` (FK → `warehouse_items`, the source stock), `product_id` (nullable catalog link).
- `status` — `'active'` is the browseable state; `withdraw_listing` / `mark_listing_sold` / the expiry cron move it out of `active`.
- Content: `title`, `description`, `price`, `currency`, `qty_listed`, `qty_remaining`, `unit`, `condition` (`'new' | 'open_box' | 'remnant' | 'lot'`), `delivery_option` (`'pickup' | 'ship' | 'both'`), `batch_lot`.
- Location: `location_city`, `location_region`, `country_code`.
- Discovery: `material_category`, `specs` (jsonb), `image_urls` (text[]), `view_count`, `seller_name`.
- `commission_pct` — **0 for surplus** (the column exists, but surplus listings carry no commission; the whole margin stays between buyer and seller).
- Lifecycle: `created_by`, `expires_at`, `created_at`, `updated_at`.

**`marketplace_inquiries`** — a buyer's inquiry on a listing.
- `id`, `listing_id` (FK), `buyer_workspace_id`, `buyer_user_id`, `buyer_name`.
- `status` (`'open'` on create), `qty_wanted`, `message`.
- `inbox_thread_id` (FK → `inbox_threads`) — set when the bridge creates the thread.

**`marketplace_want_lists`** — saved buyer alerts.
- `id`, `user_id`, `workspace_id` (buyer), `label`.
- Filters: `material_category`, `keyword`, `max_price`, `location_city` (at least one of category/keyword must be set).
- `is_active`, `last_notified_at`, `created_at`.

## RPCs

- `create_marketplace_listing(p_warehouse_item_id, p_price, p_qty, …optional title/description/condition/location/delivery/expiry/material_category/specs/image_urls)` → listing id. Reserves `p_qty` from the warehouse item, inserts the `active` listing, and fires the want-match check.
- `withdraw_listing(p_id)` → releases the reserved stock and moves the listing out of `active`.
- `mark_listing_sold(p_id, p_qty?)` → decrements `qty_remaining` (records a warehouse stock movement); closes the listing when fully sold.
- `increment_listing_view(p_id)` → bumps `view_count` (called when a buyer opens the detail modal).
- `marketplace_price_comps(p_material_category, p_unit, p_exclude_workspace?)` → `{ n, min_price, median_price, max_price }` over other tenants' active listings, to suggest a market price at listing time.

## Cross-tenant RLS

`marketplace_listings` is readable across workspaces: **SELECT** is gated on `is_business_user()` (and `status='active'`), **not** on workspace membership — that is what makes the listings browseable platform-wide. Writes (create/withdraw/mark-sold) stay scoped to the **owning** workspace. `marketplace_inquiries` is visible to the buyer's workspace and the listing's seller workspace; the inquiry insert is brokered by the service-role inbox bridge (below), and self-inquiry (buyer workspace == seller workspace) is rejected.

## Inquiry bridge (`inbox-api` → `create_marketplace_inquiry`)

A buyer inquiry never adds the buyer to the seller's workspace. The `inbox-api` action `create_marketplace_inquiry` runs under service role and atomically:

1. Verifies the buyer is a business member of `buyer_workspace_id` and the listing is `active` with `qty_remaining > 0` (rejects self-inquiry).
2. Inserts a `marketplace_inquiries` row (`status='open'`).
3. Creates an `inbox_threads` row **in the seller's workspace** (`thread_type='customer'`, metadata carries `marketplace_listing_id` / `marketplace_inquiry_id` / `buyer_workspace_id`).
4. Adds the buyer as a customer participant and the seller's owners/admins as member participants.
5. Posts the buyer's opening message and links the thread back onto the inquiry (`inbox_thread_id`).

Both parties then converse in the seller's shared Inbox (see [api/messaging-api.md](./api/messaging-api.md) and the `inbox-api` entry in [public/api/openapi-edge.json](../public/api/openapi-edge.json)). The frontend navigates the buyer to `/inbox?thread={thread_id}`.

## Notifications & lifecycle automation

- **Want-match** — a DB trigger on new `active` listings checks every active `marketplace_want_lists` row (cross-tenant fan-out) and emits the `marketplace_want_match` flow event (vars: `listing_id`, `listing_title`, `want_list_id`, `want_list_label`) for matching buyers. Delivered through the Flows engine (bell/email per the seeded flow).
- **Low-stock notify** — a trigger emits a flow event (bell + inbox email payload) when listed stock runs low.
- **Expiry cron** — a scheduled job moves listings past `expires_at` out of `active`.

(All notification paths go through Flows — see [flows-notification-system.md](./flows-notification-system.md). Triggers/flows are seeded via MCP migrations.)

## Frontend

- Route **`/discover`** ([src/App.tsx](../src/App.tsx)) behind `CapabilityGuard capability="marketplace.browse"` (granted to owner/staff/sales).
- [src/pages/DiscoverPage.tsx](../src/pages/DiscoverPage.tsx) — Discover hub; the **Marketplace** tab renders [src/components/features/discover/MarketplaceTab.tsx](../src/components/features/discover/MarketplaceTab.tsx) (search, material-category filter, listing grid, detail modal with the "Contact seller" inquiry form, and want-list create/manage). The **Products** tab shows a "Surplus €X" badge when a product has an active listing.
- Listing is created from inventory: **Finance → Warehouse → "Store"** opens `ListToMarketplaceDialog` ([src/modules/finance/components/WarehousePanel.tsx](../src/modules/finance/components/WarehousePanel.tsx)), which auto-fills from product metadata and shows `marketplace_price_comps` before publishing.
- Service: [src/services/marketplaceService.ts](../src/services/marketplaceService.ts) — `browse`, `createListing`, `createInquiry`, `incrementView`, `withdraw`, `markSold`, `priceComps`, `listWantLists`, `createWantList`, `deleteWantList`, `surplusByProduct`, `buildAutofill`.

## End-to-end

```
Seller: Warehouse → Store → ListToMarketplaceDialog → create_marketplace_listing (reserves stock, status=active)
            └→ want-match trigger → marketplace_want_match flow → matching buyers notified
Buyer:  Discover → Marketplace → open listing (increment_listing_view) → Contact seller
            └→ inbox-api create_marketplace_inquiry → inquiry + bridged inbox thread in seller's workspace
Both:   converse in /inbox
Seller: mark_listing_sold (decrement + stock movement) | withdraw_listing (release stock)
Cron:   expires_at passed → listing leaves active
```

## Activation

Enable the marketplace capability for the relevant roles. The tables, RPCs, RLS, triggers, expiry cron, and seeded want-match/low-stock flows are applied via MCP migrations; the inquiry bridge ships in `inbox-api`.
